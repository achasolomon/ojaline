import { Injectable, Logger, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { OutboxService } from '../outbox/outbox.service.js';

type FulfilmentAction = 'CONTINUE' | 'CANCEL' | 'REPLACE_SELLER';
type LineStatus = 'PENDING' | 'PAID' | 'DISPATCHED' | 'DELIVERED' | 'REFUNDED' | 'CANCELLED' | 'REPLACED';

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
       SET status = 'PARTIALLY_DISPATCHED', updated_at = now()
       WHERE id = (SELECT order_id FROM orders.order_lines WHERE id = $1)
         AND status NOT IN ('CANCELLED', 'PARTIALLY_REFUNDED')`,
      [failure.line_id],
    );

    this.logger.log({ lineId: failure.line_id, reason: failure.reason }, 'line failure recorded');
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

          const newStatus = Number(remainingLines.rows[0].count) === 0 ? 'PARTIALLY_REFUNDED' : 'PARTIALLY_REFUNDED';
          await client.query(
            `UPDATE orders.orders SET status = $1, updated_at = now() WHERE id = $2`,
            [newStatus, decision.order_id],
          );

          await client.query(
            `UPDATE escrow.escrow_orders
             SET status = 'RELEASING', updated_at = now()
             WHERE order_id = $1 AND status = 'HELD'`,
            [decision.order_id],
          );

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
        order_status: decision.action === 'CANCEL' && lines.rowCount === 1 ? 'CANCELLED' : 'PARTIALLY_REFUNDED',
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
