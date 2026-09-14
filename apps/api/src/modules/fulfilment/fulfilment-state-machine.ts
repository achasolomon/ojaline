import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException, Inject } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { OutboxService } from '../outbox/outbox.service.js';
import type { AuthUser } from '../auth/auth.service.js';

type FulfilmentAction = 'CONTINUE' | 'CANCEL' | 'REPLACE_SELLER';
type LineStatus = 'PENDING' | 'PAID' | 'ACCEPTED' | 'DISPATCHED' | 'DELIVERED' | 'REFUNDED' | 'CANCELLED' | 'REPLACED';

export interface LineFailure {
  line_id: string;
  reason: string;
}

export interface BuyerDecision {
  order_id: string;
  action: FulfilmentAction;
  line_ids: string[];
}

@Injectable()
export class FulfilmentStateMachine {
  private readonly logger = new Logger(FulfilmentStateMachine.name);

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async recordLineFailure(failure: LineFailure): Promise<void> {
    await this.pool.query(
      `UPDATE orders.order_lines
       SET status = 'CANCELLED', updated_at = now()
       WHERE id = $1 AND status != 'CANCELLED'`,
      [failure.line_id],
    );

    await this.pool.query(
      `UPDATE orders.orders
       SET status = 'PARTIALLY_DISPATCHED',
           decision_deadline_at = now() + interval '24 hours',
           updated_at = now()
       WHERE id = (SELECT order_id FROM orders.order_lines WHERE id = $1)
         AND status NOT IN ('CANCELLED', 'PARTIALLY_REFUNDED')`,
      [failure.line_id],
    );

    this.logger.log({ lineId: failure.line_id, reason: failure.reason }, 'line failure recorded');
  }

  /* ── Seller fulfilment actions ─────────────────────────────────────── */

  /**
   * Seller accepts a paid line: PAID → ACCEPTED. Works while the order is
   * PAID or PARTIALLY_DISPATCHED (a sibling line may have failed already).
   */
  async acceptLine(orderId: string, lineId: string, actor?: AuthUser): Promise<{
    order_id: string;
    line_id: string;
    status: 'ACCEPTED';
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const line = await this.assertSellerLineOwned(client, orderId, lineId, actor);
      if (line.line_status !== 'PAID') {
        throw new BadRequestException(`line ${lineId} is in status ${line.line_status}, expected PAID`);
      }
      if (!['PAID', 'PARTIALLY_DISPATCHED'].includes(line.order_status)) {
        throw new BadRequestException(`order ${orderId} is in status ${line.order_status}, cannot accept lines`);
      }
      await client.query(
        `UPDATE orders.order_lines SET status = 'ACCEPTED', accepted_at = now(), updated_at = now() WHERE id = $1`,
        [lineId],
      );
      await this.outbox.enqueue(client, 'order.line_status_changed', orderId, {
        order_id: orderId,
        line_id: lineId,
        status: 'ACCEPTED',
      });
      await client.query('COMMIT');
      return { order_id: orderId, line_id: lineId, status: 'ACCEPTED' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Seller dispatches a line: PAID/ACCEPTED → DISPATCHED with tracking info.
   * The order rolls PAID → DISPATCHED once no line is awaiting dispatch.
   */
  async dispatchLine(
    orderId: string,
    lineId: string,
    actor?: AuthUser,
    input: { tracking_ref?: string } = {},
  ): Promise<{
    order_id: string;
    line_id: string;
    status: 'DISPATCHED';
    order_status: string;
    tracking_ref: string | null;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const line = await this.assertSellerLineOwned(client, orderId, lineId, actor);
      if (!['PAID', 'ACCEPTED'].includes(line.line_status)) {
        throw new BadRequestException(`line ${lineId} is in status ${line.line_status}, expected PAID or ACCEPTED`);
      }
      if (!['PAID', 'PARTIALLY_DISPATCHED'].includes(line.order_status)) {
        throw new BadRequestException(`order ${orderId} is in status ${line.order_status}, cannot dispatch lines`);
      }

      const trackingRef = input.tracking_ref?.trim() || null;
      await client.query(
        `UPDATE orders.order_lines
            SET status = 'DISPATCHED', dispatched_at = now(), tracking_ref = $2, updated_at = now()
          WHERE id = $1`,
        [lineId, trackingRef],
      );

      const pending = await client.query<{ n: string }>(
        `SELECT count(*)::int AS n FROM orders.order_lines
          WHERE order_id = $1 AND status IN ('PAID', 'ACCEPTED', 'PENDING')`,
        [orderId],
      );
      const nextOrderStatus = Number(pending.rows[0].n) === 0 ? 'DISPATCHED' : 'PARTIALLY_DISPATCHED';

      await client.query(
        `UPDATE orders.orders
            SET status = $1, updated_at = now()
          WHERE id = $2 AND status IN ('PAID', 'PARTIALLY_DISPATCHED')`,
        [nextOrderStatus, orderId],
      );

      await this.outbox.enqueue(client, 'order.line_status_changed', orderId, {
        order_id: orderId,
        line_id: lineId,
        status: 'DISPATCHED',
      });

      await client.query('COMMIT');
      return {
        order_id: orderId,
        line_id: lineId,
        status: 'DISPATCHED',
        order_status: nextOrderStatus,
        tracking_ref: trackingRef,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Seller declines a line it cannot fulfil: PAID/ACCEPTED → CANCELLED.
   * Mirrors recordLineFailure (order → PARTIALLY_DISPATCHED + 24h buyer
   * decision deadline) and frees the reserved stock for the declined line.
   */
  async declineLine(
    orderId: string,
    lineId: string,
    actor?: AuthUser,
    input: { reason?: string } = {},
  ): Promise<{
    order_id: string;
    line_id: string;
    status: 'CANCELLED';
    order_status: string;
    decision_deadline_at: Date | null;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const line = await this.assertSellerLineOwned(client, orderId, lineId, actor);
      if (!['PAID', 'ACCEPTED'].includes(line.line_status)) {
        throw new BadRequestException(`line ${lineId} is in status ${line.line_status}, expected PAID or ACCEPTED`);
      }

      await client.query(
        `UPDATE orders.order_lines
            SET status = 'CANCELLED', decline_reason = $2, updated_at = now()
          WHERE id = $1`,
        [lineId, input.reason?.trim() || null],
      );

      const deadline = await client.query<{ decision_deadline_at: Date }>(
        `UPDATE orders.orders
            SET status = 'PARTIALLY_DISPATCHED',
                decision_deadline_at = now() + interval '24 hours',
                updated_at = now()
          WHERE id = $1
            AND status NOT IN ('CANCELLED', 'PARTIALLY_REFUNDED')
          RETURNING decision_deadline_at`,
        [orderId],
      );

      await client.query(
        `UPDATE orders.stock_holds
            SET status = 'RELEASED'
          WHERE order_id = $1 AND offer_id = $2 AND status IN ('CONVERTED', 'ACTIVE')`,
        [orderId, line.offer_id],
      );
      await client.query(
        `UPDATE catalog.offers
            SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at = now()
          WHERE id = $2`,
        [line.qty, line.offer_id],
      );

      await this.outbox.enqueue(client, 'order.line_status_changed', orderId, {
        order_id: orderId,
        line_id: lineId,
        status: 'CANCELLED',
      });

      await client.query('COMMIT');
      return {
        order_id: orderId,
        line_id: lineId,
        status: 'CANCELLED',
        order_status: 'PARTIALLY_DISPATCHED',
        decision_deadline_at: deadline.rowCount === 0 ? null : deadline.rows[0].decision_deadline_at,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async assertSellerLineOwned(
    client: PoolClient,
    orderId: string,
    lineId: string,
    actor?: AuthUser,
  ): Promise<{
    line_seller_id: string;
    line_status: string;
    order_status: string;
    offer_id: string;
    qty: number;
  }> {
    if (!actor) throw new UnauthorizedException('Authentication required');
    const res = await client.query<{
      line_seller_id: string;
      line_status: string;
      order_status: string;
      offer_id: string;
      qty: number;
    }>(
      `SELECT ol.seller_id AS line_seller_id, ol.status AS line_status,
              o.status AS order_status, ol.offer_id, ol.qty
         FROM orders.order_lines ol
         JOIN orders.orders o ON o.id = ol.order_id
        WHERE ol.id = $1 AND ol.order_id = $2
        FOR UPDATE OF ol`,
      [lineId, orderId],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException(`line ${lineId} not found on order ${orderId}`);
    }
    const row = res.rows[0];
    const isOps = actor.roles.some((r) => r === 'OPS' || r === 'AGENT');
    if (actor.id !== row.line_seller_id && !isOps) {
      throw new ForbiddenException('This order line belongs to another seller');
    }
    return row;
  }

  async handleBuyerDecision(decision: BuyerDecision): Promise<{
    order_id: string;
    order_status: string;
    affected_lines: string[];
    action: FulfilmentAction;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const orderResult = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM orders.orders WHERE id = $1 FOR UPDATE`,
        [decision.order_id],
      );

      if (orderResult.rowCount === 0) {
        throw new NotFoundException(`order ${decision.order_id} not found`);
      }

      const order = orderResult.rows[0];
      if (!['PAID', 'PARTIALLY_DISPATCHED', 'DISPATCHED'].includes(order.status)) {
        throw new BadRequestException(
          `order ${order.id} is in status ${order.status}, cannot accept buyer decision`,
        );
      }

      const lines = await client.query<{ id: string; status: string; offer_id: string; seller_id: string; qty: number }>(
        `SELECT id, status, offer_id, seller_id, qty
         FROM orders.order_lines
         WHERE id = ANY($1)`,
        [decision.line_ids],
      );

      if (lines.rowCount === 0) {
        throw new BadRequestException('no valid lines found for the given IDs');
      }

      let computedOrderStatus: string = order.status;

      switch (decision.action) {
        case 'CONTINUE': {
          for (const line of lines.rows) {
            await client.query(
              `UPDATE orders.order_lines SET status = 'REFUNDED', updated_at = now() WHERE id = $1`,
              [line.id],
            );
            await client.query(
              `UPDATE orders.stock_holds
               SET status = 'RELEASED'
               WHERE order_id = $1 AND offer_id = $2 AND status = 'CONVERTED'`,
              [decision.order_id, line.offer_id],
            );
            await client.query(
              `UPDATE catalog.offers
               SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at = now()
               WHERE id = $2`,
              [line.qty, line.offer_id],
            );
          }

          const remainingLines = await client.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM orders.order_lines
             WHERE order_id = $1 AND status NOT IN ('REFUNDED', 'CANCELLED')`,
            [decision.order_id],
          );

          const newStatus = Number(remainingLines.rows[0].count) === 0 ? 'CANCELLED' : 'PARTIALLY_REFUNDED';
          computedOrderStatus = newStatus;
          await client.query(
            `UPDATE orders.orders SET status = $1, updated_at = now() WHERE id = $2`,
            [newStatus, decision.order_id],
          );

          if (newStatus === 'CANCELLED') {
            await client.query(
              `UPDATE escrow.escrow_orders
               SET status = 'RELEASED', released_at = now(), updated_at = now()
               WHERE order_id = $1 AND status IN ('HELD', 'RELEASING')`,
              [decision.order_id],
            );
          } else {
            await client.query(
              `UPDATE escrow.escrow_orders
               SET status = 'RELEASING', updated_at = now()
               WHERE order_id = $1 AND status = 'HELD'`,
              [decision.order_id],
            );
          }

          const escrowRow = await client.query<{ id: string; amount_held_cents: string }>(
            `SELECT id, amount_held_cents FROM escrow.escrow_orders WHERE order_id = $1`,
            [decision.order_id],
          );

          if (escrowRow.rowCount !== 0) {
            const lineRefund = lines.rows.reduce((sum, l) => sum + l.qty, 0);
            const totalQty = await client.query<{ total: string }>(
              `SELECT SUM(qty) as total FROM orders.order_lines WHERE order_id = $1`,
              [decision.order_id],
            );
            const totalQ = Number(totalQty.rows[0].total) || 1;
            const escrow = escrowRow.rows[0];
            const refundAmount = Math.round((Number(escrow.amount_held_cents) * lineRefund) / totalQ);

            await client.query(
              `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, idempotency_key)
               VALUES ($1, 'PARTIAL_RELEASE', $2, 'BUYER', $3)`,
              [escrow.id, -refundAmount, `partial-continue:${decision.order_id}:${Date.now()}`],
            );

            await client.query(
              `UPDATE escrow.escrow_orders
               SET amount_held_cents = amount_held_cents - $1, updated_at = now()
               WHERE id = $2`,
              [refundAmount, escrow.id],
            );
          }

          break;
        }

        case 'CANCEL': {
          for (const line of lines.rows) {
            await client.query(
              `UPDATE orders.order_lines SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
              [line.id],
            );
            await client.query(
              `UPDATE orders.stock_holds
               SET status = 'RELEASED'
               WHERE order_id = $1 AND offer_id = $2 AND status IN ('CONVERTED', 'ACTIVE')`,
              [decision.order_id, line.offer_id],
            );
            await client.query(
              `UPDATE catalog.offers
               SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at = now()
               WHERE id = $2`,
              [line.qty, line.offer_id],
            );
          }

          const allCancelled = await client.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM orders.order_lines
             WHERE order_id = $1 AND status != 'CANCELLED'`,
            [decision.order_id],
          );

          if (Number(allCancelled.rows[0].count) === 0) {
            computedOrderStatus = 'CANCELLED';
            await client.query(
              `UPDATE orders.orders SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
              [decision.order_id],
            );

            await client.query(
              `UPDATE escrow.escrow_orders
               SET status = 'RELEASED', released_at = now(), updated_at = now()
               WHERE order_id = $1 AND status = 'HELD'`,
              [decision.order_id],
            );

            const escrowRow = await client.query<{ id: string; amount_held_cents: string }>(
              `SELECT id, amount_held_cents FROM escrow.escrow_orders WHERE order_id = $1`,
              [decision.order_id],
            );

            if (escrowRow.rowCount !== 0) {
              await client.query(
                `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, idempotency_key)
                 VALUES ($1, 'DELIVERY_RELEASE', $2, 'BUYER', $3)`,
                [escrowRow.rows[0].id, -Number(escrowRow.rows[0].amount_held_cents), `cancel:${decision.order_id}:${Date.now()}`],
              );
            }
          } else {
            computedOrderStatus = 'PARTIALLY_REFUNDED';
            await client.query(
              `UPDATE orders.orders SET status = 'PARTIALLY_REFUNDED', updated_at = now() WHERE id = $1`,
              [decision.order_id],
            );
          }

          break;
        }

        case 'REPLACE_SELLER': {
          for (const line of lines.rows) {
            await client.query(
              `UPDATE orders.order_lines SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
              [line.id],
            );
            await client.query(
              `UPDATE orders.stock_holds
               SET status = 'RELEASED'
               WHERE order_id = $1 AND offer_id = $2 AND status IN ('CONVERTED', 'ACTIVE')`,
              [decision.order_id, line.offer_id],
            );
            await client.query(
              `UPDATE catalog.offers
               SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at = now()
               WHERE id = $2`,
              [line.qty, line.offer_id],
            );
          }

          computedOrderStatus = 'PARTIALLY_DISPATCHED';
          await client.query(
            `UPDATE orders.orders SET status = 'PARTIALLY_DISPATCHED', updated_at = now() WHERE id = $1`,
            [decision.order_id],
          );

          await this.outbox.enqueue(client, 'order.line_status_changed', decision.order_id, {
            order_id: decision.order_id,
            line_id: lines.rows[0].id,
            status: 'REPLACED',
          });

          break;
        }
      }

      await client.query('COMMIT');

      this.logger.log(
        { orderId: decision.order_id, action: decision.action, lineCount: decision.line_ids.length },
        'buyer decision processed',
      );

      return {
        order_id: decision.order_id,
        order_status: computedOrderStatus,
        affected_lines: decision.line_ids,
        action: decision.action,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getOrderFulfilmentStatus(orderId: string): Promise<{
    order_id: string;
    order_status: string;
    lines: Array<{
      line_id: string;
      offer_id: string;
      seller_id: string;
      qty: number;
      status: LineStatus;
    }>;
    pending_decisions: string[];
  }> {
    const orderResult = await this.pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM orders.orders WHERE id = $1`,
      [orderId],
    );

    if (orderResult.rowCount === 0) throw new NotFoundException(`order ${orderId} not found`);

    const linesResult = await this.pool.query<{
      id: string;
      offer_id: string;
      seller_id: string;
      qty: number;
      status: string;
    }>(
      `SELECT id, offer_id, seller_id, qty, status
       FROM orders.order_lines
       WHERE order_id = $1`,
      [orderId],
    );

    const pendingDecisionLines = linesResult.rows
      .filter((l) => l.status === 'CANCELLED' || l.status === 'REFUNDED')
      .map((l) => l.id);

    return {
      order_id: orderId,
      order_status: orderResult.rows[0].status,
      lines: linesResult.rows.map((l) => ({
        line_id: l.id,
        offer_id: l.offer_id,
        seller_id: l.seller_id,
        qty: l.qty,
        status: l.status as LineStatus,
      })),
      pending_decisions: pendingDecisionLines,
    };
  }
}
