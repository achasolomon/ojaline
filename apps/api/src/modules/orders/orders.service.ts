import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { FULFILMENT_MODES, FULFILMENT_PREFERENCE, DELIVERY_FEE_CENTS, type FulfilmentMode } from '@ojaline/contracts';
import { OutboxService } from '../outbox/outbox.service.js';
import { PaystackService } from '../paystack/paystack.service.js';
import { ReservationGate } from '../reservation/reservation.gate.js';
import { MultiSellerGate } from '../fulfilment/multi-seller-gate.js';
import { FulfilmentStateMachine } from '../fulfilment/fulfilment-state-machine.js';
import { FeedService, type NotificationType } from '../notifications/feed.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const SOFT_HOLD_TTL_SECONDS = 8 * 60;

export interface CheckoutItem {
  offer_id: string;
  qty: number;
  unit_price_cents: number;
}

export interface CreateCheckoutInput {
  buyer_id: string;
  items: CheckoutItem[];
  soft_hold_ids: string[];
  window_start: string;
  window_end: string;
  delivery_mode?: string;
}

export interface ConfirmPaymentInput {
  order_id: string;
  paystack_reference: string;
}

export interface CommissionRate {
  category_id: string | null;
  percent_bps: number;
  flat_cents: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(PaystackService) private readonly paystack: PaystackService,
    @Inject(ReservationGate) private readonly gate: ReservationGate,
    @Inject(MultiSellerGate) private readonly multiSellerGate: MultiSellerGate,
    @Inject(FulfilmentStateMachine) private readonly stateMachine: FulfilmentStateMachine,
    @Inject(FeedService) private readonly feed: FeedService,
  ) {}

  private async resolveBuyerChannel(client: import('pg').PoolClient, userId: string): Promise<'RETAILER' | 'WHOLESALE' | 'DIRECT' | 'OPEN'> {
    const { rows } = await client.query<{ channel: string | null }>(
      'SELECT channel FROM pii.users WHERE id = $1',
      [userId],
    );
    if (rows.length === 0) throw new NotFoundException('Buyer account not found');
    return (rows[0].channel as 'RETAILER' | 'WHOLESALE' | 'DIRECT' | 'OPEN') ?? 'RETAILER';
  }

  /**
   * Commission is snapshotted at checkout: the rate effective on the offer's
   * channel/category at order time is locked onto the line forever (rate changes
   * later never rewrite history). Category-specific rates win over the generic
   * channel rate; an absent rate means the platform takes 0 on that line.
   */
  private async resolveCommissionRates(client: import('pg').PoolClient): Promise<Map<string, CommissionRate[]>> {
    const { rows } = await client.query<{ channel: string; category_id: string | null; percent_bps: number; flat_cents: string }>(
      `SELECT channel, category_id, percent_bps, flat_cents
       FROM finance.commission_rates
       WHERE effective_from <= now()
         AND (effective_to IS NULL OR effective_to > now())`,
    );
    const byChannel = new Map<string, CommissionRate[]>();
    for (const row of rows) {
      const list = byChannel.get(row.channel) ?? [];
      // flat_cents is BIGINT — pg returns it as a string; coerce to number so
      // "500 + '0'" never string-concatenates into "5000".
      list.push({ category_id: row.category_id, percent_bps: row.percent_bps, flat_cents: Number(row.flat_cents) });
      byChannel.set(row.channel, list);
    }
    return byChannel;
  }

  private resolveLineCommission(
    ratesByChannel: Map<string, CommissionRate[]>,
    channel: string,
    categoryId: string | null,
    lineTotalCents: number,
  ): { commission_cents: number } {
    const rates = ratesByChannel.get(channel);
    if (!rates || rates.length === 0) return { commission_cents: 0 };
    const categoryRate = categoryId ? rates.find((r) => r.category_id === categoryId) : undefined;
    const rate = categoryRate ?? rates.find((r) => r.category_id === null);
    if (!rate) return { commission_cents: 0 };
    const commissionCents = Math.round(lineTotalCents * (rate.percent_bps / 10_000)) + rate.flat_cents;
    return { commission_cents: commissionCents };
  }

  async createCheckout(input: CreateCheckoutInput, actor?: AuthUser): Promise<{
    order_id: string;
    checkout_session_id: string;
    channel: string;
    delivery_mode: FulfilmentMode;
    item_total_cents: number;
    delivery_fee_cents: number;
    landed_total_cents: number;
    currency: string;
    items: Array<{ offer_id: string; qty: number; unit_price_cents: number; line_total_cents: number }>;
    soft_hold_expires_at: Date;
  }> {
    if (input.items.length === 0) throw new BadRequestException('items must not be empty');
    this.assertBuyerOrAnon(actor, input.buyer_id);

    const holdKeys: Array<{ key: string; qty: number }> = [];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const offerIds = input.items.map((i) => i.offer_id);
      const offersResult = await client.query<{ id: string; channel: string; available_qty: number; seller_id: string; cluster_id: string; fulfilment_modes: string[]; category_id: string | null }>(
        `SELECT id, channel, available_qty, seller_id, cluster_id, fulfilment_modes, category_id FROM catalog.offers WHERE id = ANY($1)`,
        [offerIds],
      );

      const offerMap = new Map(offersResult.rows.map((o) => [o.id, o]));
      const commissionRates = await this.resolveCommissionRates(client);

      for (const item of input.items) {
        if (!offerMap.has(item.offer_id)) {
          throw new NotFoundException(`offer ${item.offer_id} not found`);
        }
      }

      const buyerChannel = await this.resolveBuyerChannel(client, input.buyer_id);
      for (const item of input.items) {
        const offer = offerMap.get(item.offer_id)!;
        if (offer.channel !== 'OPEN' && buyerChannel !== 'OPEN' && offer.channel !== buyerChannel) {
          throw new ForbiddenException(
            `This item is on the ${offer.channel} channel and your buyer channel is ${buyerChannel} — your buyer role must match to purchase`,
          );
        }
      }

      const gateItems = input.items.map((item) => {
        const offer = offerMap.get(item.offer_id)!;
        return {
          offer_id: item.offer_id,
          seller_id: offer.seller_id,
          cluster_id: offer.cluster_id,
          qty: item.qty,
        };
      });

      const gateResult = await this.multiSellerGate.checkGate(gateItems);
      if (!gateResult.allowed) {
        throw new BadRequestException(`multi-seller gate rejected: ${gateResult.reason}`);
      }

      const totalQty = input.items.reduce((sum, item) => sum + item.qty, 0);
      const clusterId = gateItems[0].cluster_id;
      const capacityResult = await this.multiSellerGate.checkCapacity(
        clusterId,
        input.window_start,
        input.window_end,
        totalQty,
      );
      if (capacityResult.available < totalQty) {
        throw new BadRequestException(
          `capacity exceeded: ${capacityResult.available} available, ${totalQty} requested for window ${input.window_start}–${input.window_end}`,
        );
      }

      const orderChannel = offerMap.get(offerIds[0])?.channel ?? 'RETAILER';

      const expiresAt = new Date(Date.now() + SOFT_HOLD_TTL_SECONDS * 1000);

      const sessionResult = await client.query<{ id: string }>(
        `INSERT INTO orders.checkout_sessions (buyer_id, status, items, soft_hold_ids, expires_at)
         VALUES ($1, 'OPEN', $2, $3, $4) RETURNING id`,
        [input.buyer_id, JSON.stringify(input.items), input.soft_hold_ids.length > 0 ? input.soft_hold_ids : [], expiresAt],
      );
      const checkoutSessionId = sessionResult.rows[0].id;

      const itemTotalCents = input.items.reduce(
        (sum, item) => sum + BigInt(item.unit_price_cents * item.qty),
        0n,
      );

      const offeredModes = new Set(offersResult.rows.flatMap((o) => o.fulfilment_modes));
      let deliveryMode: FulfilmentMode;
      if (input.delivery_mode) {
        if (!FULFILMENT_MODES.includes(input.delivery_mode as FulfilmentMode)) {
          throw new BadRequestException(`unsupported delivery_mode: ${input.delivery_mode}`);
        }
        const requested = input.delivery_mode as FulfilmentMode;
        deliveryMode = offeredModes.has(requested)
          ? requested
          : (FULFILMENT_PREFERENCE.find((m) => offeredModes.has(m)) ?? requested);
      } else {
        deliveryMode = FULFILMENT_PREFERENCE.find((m) => offeredModes.has(m)) ?? 'SCHEDULED';
      }

      const deliveryFeeCents = BigInt(DELIVERY_FEE_CENTS[deliveryMode]);
      const landedTotalCents = itemTotalCents + deliveryFeeCents;
      const multiSeller = new Set(input.items.map((i) => i.offer_id)).size > 1;

      const orderResult = await client.query<{ id: string }>(
        `INSERT INTO orders.orders
           (buyer_id, channel, status, multi_seller, checkout_session_id,
            item_total_cents, delivery_fee_cents, landed_total_cents,
            window_start, window_end, delivery_mode)
         VALUES ($1, $2, 'CHECKOUT', $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          input.buyer_id,
          orderChannel,
          multiSeller,
          checkoutSessionId,
          itemTotalCents,
          deliveryFeeCents,
          landedTotalCents,
          input.window_start,
          input.window_end,
          deliveryMode,
        ],
      );
      const orderId = orderResult.rows[0].id;

      const commissionByOffer = new Map<string, { commission_cents: number; seller_payable_cents: number }>();

      for (let i = 0; i < input.items.length; i++) {
        const item = input.items[i];
        const idempotencyKey = `hold:${orderId}:${i}`;

        const acquired = await this.gate.acquireSoftHold(
          item.offer_id,
          idempotencyKey,
          item.qty,
          SOFT_HOLD_TTL_SECONDS,
        );
        if (!acquired) {
          for (const h of holdKeys) {
            await this.gate.releaseSoftHold(h.key, h.qty);
          }
          throw new ConflictException(`stock unavailable for offer ${item.offer_id}`);
        }
        holdKeys.push({ key: idempotencyKey, qty: item.qty });

        const holdResult = await client.query<{ id: string }>(
          `INSERT INTO orders.stock_holds (offer_id, user_id, qty, kind, status, expires_at, idempotency_key, order_id)
           VALUES ($1, $2, $3, 'SOFT', 'ACTIVE', $4, $5, $6)
           RETURNING id`,
          [item.offer_id, input.buyer_id, item.qty, expiresAt, idempotencyKey, orderId],
        );
        const holdId = holdResult.rows[0].id;

        await client.query(
          `UPDATE catalog.offers SET soft_held_qty = soft_held_qty + $1, updated_at = now() WHERE id = $2`,
          [item.qty, item.offer_id],
        );

        const offer = offerMap.get(item.offer_id)!;
        const lineTotalCents = item.unit_price_cents * item.qty;
        const { commission_cents } = this.resolveLineCommission(
          commissionRates,
          offer.channel,
          offer.category_id,
          lineTotalCents,
        );
        commissionByOffer.set(item.offer_id, {
          commission_cents,
          seller_payable_cents: lineTotalCents - commission_cents,
        });

        await client.query(
          `INSERT INTO orders.order_lines (order_id, offer_id, seller_id, qty, unit_price_cents, commission_cents, seller_payable_cents, status, stock_hold_id)
           VALUES ($1, $2, (SELECT seller_id FROM catalog.offers WHERE id = $2), $3, $4, $5, $6, 'PENDING', $7)`,
          [orderId, item.offer_id, item.qty, item.unit_price_cents, commission_cents, lineTotalCents - commission_cents, holdId],
        );
      }

      const capacityReserved = await this.multiSellerGate.reserveCapacity(
        clusterId,
        input.window_start,
        input.window_end,
        totalQty,
      );
      if (!capacityReserved) {
        for (const h of holdKeys) {
          await this.gate.releaseSoftHold(h.key, h.qty);
        }
        throw new ConflictException(`capacity no longer available for window ${input.window_start}–${input.window_end}`);
      }

      await client.query('COMMIT');
      return {
        order_id: orderId,
        checkout_session_id: checkoutSessionId,
        channel: orderChannel,
        delivery_mode: deliveryMode,
        item_total_cents: Number(itemTotalCents),
        delivery_fee_cents: Number(deliveryFeeCents),
        landed_total_cents: Number(landedTotalCents),
        currency: 'NGN',
        soft_hold_expires_at: expiresAt,
        items: input.items.map((item) => {
          const comm = commissionByOffer.get(item.offer_id) ?? {
            commission_cents: 0,
            seller_payable_cents: item.unit_price_cents * item.qty,
          };
          return {
            offer_id: item.offer_id,
            qty: item.qty,
            unit_price_cents: item.unit_price_cents,
            line_total_cents: item.unit_price_cents * item.qty,
            commission_cents: comm.commission_cents,
            seller_payable_cents: comm.seller_payable_cents,
          };
        }),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async initializePayment(orderId: string, callbackUrl?: string, actor?: AuthUser): Promise<{ authorization_url: string; reference: string }> {
    const orderResult = await this.pool.query<{
      id: string;
      status: string;
      buyer_id: string;
      landed_total_cents: string;
    }>(
      `SELECT id, status, buyer_id, landed_total_cents
       FROM orders.orders WHERE id = $1`,
      [orderId],
    );

    if (orderResult.rowCount === 0) throw new NotFoundException(`order ${orderId} not found`);

    const order = orderResult.rows[0];
    this.assertBuyerOrAnon(actor, order.buyer_id);
    if (order.status !== 'CHECKOUT' && order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(`order ${order.id} is in status ${order.status}, expected CHECKOUT or PENDING_PAYMENT`);
    }

    const holdsResult = await this.pool.query<{
      idempotency_key: string;
      qty: number;
    }>(
      `SELECT idempotency_key, qty FROM orders.stock_holds
       WHERE order_id = $1 AND kind = 'SOFT' AND status = 'ACTIVE'`,
      [orderId],
    );

    for (const hold of holdsResult.rows) {
      const converted = await this.gate.convertSoftToHard(hold.idempotency_key, hold.qty);
      if (!converted) {
        throw new ConflictException(`hold ${hold.idempotency_key} expired or unavailable — stock may have been released`);
      }
    }

    const reference = `ojl-${orderId.slice(0, 8)}-${Date.now()}`;
    const amountKobo = Number(order.landed_total_cents);

    const result = await this.paystack.initialize({
      reference,
      amount_kobo: amountKobo,
      email: `${order.buyer_id}@ojaline.dev`,
      callback_url: callbackUrl,
      metadata: { order_id: orderId },
    });

    await this.pool.query(
      `UPDATE orders.stock_holds
       SET kind = 'HARD', paystack_reference = $1
       WHERE order_id = $2 AND status = 'ACTIVE' AND kind IN ('SOFT', 'HARD')`,
      [reference, orderId],
    );

    for (const item of holdsResult.rows) {
      const hold = holdsResult.rows.find((h) => h.idempotency_key === item.idempotency_key);
      if (hold) {
        await this.pool.query(
          `UPDATE catalog.offers
           SET soft_held_qty = GREATEST(soft_held_qty - $1, 0),
               reserved_qty = reserved_qty + $1,
               updated_at = now()
           WHERE id = (SELECT offer_id FROM orders.stock_holds WHERE idempotency_key = $2)`,
          [hold.qty, hold.idempotency_key],
        );
      }
    }

    await this.pool.query(
      `UPDATE orders.orders SET status = 'PENDING_PAYMENT', updated_at = now() WHERE id = $1`,
      [orderId],
    );

    return { authorization_url: result.authorization_url, reference: result.reference };
  }

  async confirmPayment(input: ConfirmPaymentInput, actor?: AuthUser): Promise<{ order_id: string; status: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const orderResult = await client.query<{
        id: string;
        status: string;
        buyer_id: string;
        landed_total_cents: string;
      }>(
        `SELECT id, status, buyer_id, landed_total_cents
         FROM orders.orders WHERE id = $1 FOR UPDATE`,
        [input.order_id],
      );

      if (orderResult.rowCount === 0) throw new NotFoundException(`order ${input.order_id} not found`);

      const order = orderResult.rows[0];
      if (actor) {
        const isOps = actor.roles.some((r) => r === 'OPS' || r === 'AGENT');
        if (order.buyer_id !== actor.id && !isOps) {
          throw new ForbiddenException('Only the buyer may confirm payment for this order');
        }
      }
      if (order.status !== 'CHECKOUT') {
        throw new BadRequestException(`order ${order.id} is in status ${order.status}, expected CHECKOUT`);
      }

      await client.query(
        `UPDATE orders.orders SET status = 'PAID', updated_at = now() WHERE id = $1`,
        [input.order_id],
      );

      await client.query(
        `UPDATE orders.stock_holds SET status = 'CONVERTED', paystack_reference = $1
         WHERE order_id = $2 AND status = 'ACTIVE'`,
        [input.paystack_reference, input.order_id],
      );

      const escrowResult = await client.query<{ id: string }>(
        `INSERT INTO escrow.escrow_orders (order_id, status, amount_held_cents)
         VALUES ($1, 'HELD', $2) RETURNING id`,
        [input.order_id, order.landed_total_cents],
      );

      await client.query(
        `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, counterparty_id, idempotency_key)
         VALUES ($1, 'PAYMENT_IN', $2, 'BUYER', $3, $4)`,
        [
          escrowResult.rows[0].id,
          order.landed_total_cents,
          order.buyer_id,
          `payment:${input.order_id}:${input.paystack_reference}`,
        ],
      );

      const commission = await client.query<{ total: string | null }>(
        `SELECT SUM(commission_cents) AS total FROM orders.order_lines WHERE order_id = $1`,
        [input.order_id],
      );
      const commissionCents = Number(commission.rows[0]?.total ?? 0);
      if (commissionCents > 0) {
        await client.query(
          `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, idempotency_key)
           VALUES ($1, 'FEE', $2, 'PLATFORM', $3)`,
          [
            escrowResult.rows[0].id,
            -commissionCents,
            `fee:${input.order_id}:${input.paystack_reference}`,
          ],
        );
      }

      await this.outbox.enqueue(client, 'order.paid', input.order_id, {
        order_id: input.order_id,
        buyer_id: order.buyer_id,
        landed_total_cents: Number(order.landed_total_cents),
      });

      await client.query(
        `UPDATE orders.order_lines SET status = 'PAID', updated_at = now() WHERE order_id = $1`,
        [input.order_id],
      );

      await client.query('COMMIT');
      return { order_id: input.order_id, status: 'PAID' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async confirmDelivery(orderId: string, actor?: AuthUser): Promise<{ order_id: string; escrow_status: string; release_scheduled_at: Date }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const orderResult = await client.query<{
        id: string;
        status: string;
        buyer_id: string;
      }>(
        `SELECT id, status, buyer_id FROM orders.orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );

      if (orderResult.rowCount === 0) throw new NotFoundException(`order ${orderId} not found`);

      const order = orderResult.rows[0];
      this.assertBuyerOrAnon(actor, order.buyer_id);
      if (order.status !== 'PAID') {
        throw new BadRequestException(`order ${order.id} is in status ${order.status}, expected PAID`);
      }

      const escrowResult = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM escrow.escrow_orders
         WHERE order_id = $1 AND status = 'HELD'
         FOR UPDATE`,
        [orderId],
      );

      if (escrowResult.rowCount === 0) {
        throw new BadRequestException(`no HELD escrow found for order ${orderId}`);
      }

      const releaseScheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await client.query(
        `UPDATE escrow.escrow_orders
         SET release_scheduled_at = $1, updated_at = now()
         WHERE id = $2`,
        [releaseScheduledAt, escrowResult.rows[0].id],
      );

      await client.query(
        `UPDATE orders.orders SET status = 'DELIVERED', updated_at = now() WHERE id = $1`,
        [orderId],
      );

      await client.query('COMMIT');
      this.logger.log(
        { orderId, releaseScheduledAt: releaseScheduledAt.toISOString() },
        'delivery confirmed, escrow release scheduled',
      );

      await this.safePush(order.buyer_id, {
        type: 'order',
        title: 'Delivery confirmed',
        body: 'Your order has been delivered. The seller will be paid from escrow within 24 hours.',
        deep_link: `/orders/${orderId}`,
      });

      return {
        order_id: orderId,
        escrow_status: 'HELD',
        release_scheduled_at: releaseScheduledAt,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async cancelOrder(orderId: string, actor?: AuthUser): Promise<{
    order_id: string;
    order_status: string;
    refunded_cents: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const orderResult = await client.query<{ id: string; status: string; buyer_id: string }>(
        `SELECT id, status, buyer_id FROM orders.orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );

      if (orderResult.rowCount === 0) throw new NotFoundException(`order ${orderId} not found`);

      const order = orderResult.rows[0];
      this.assertBuyerOrAnon(actor, order.buyer_id);

      if (['CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(order.status)) {
        throw new BadRequestException(`order ${order.id} is already ${order.status}`);
      }

      const linesResult = await client.query<{ id: string }>(
        `SELECT id FROM orders.order_lines WHERE order_id = $1`,
        [orderId],
      );

      if (order.status === 'CHECKOUT' || order.status === 'PENDING_PAYMENT') {
        const holds = await client.query<{
          hold_id: string;
          offer_id: string;
          qty: number;
          kind: string;
          hold_status: string;
          idempotency_key: string;
        }>(
          `SELECT h.id AS hold_id, h.offer_id, h.qty, h.kind, h.status AS hold_status, h.idempotency_key
           FROM orders.order_lines ol
           JOIN orders.stock_holds h ON h.id = ol.stock_hold_id
           WHERE ol.order_id = $1`,
          [orderId],
        );

        for (const hold of holds.rows) {
          if (hold.hold_status !== 'ACTIVE') continue;
          if (hold.kind === 'SOFT') {
            await this.gate.releaseSoftHold(hold.idempotency_key, hold.qty);
            await client.query(
              `UPDATE catalog.offers
               SET soft_held_qty = GREATEST(soft_held_qty - $1, 0),
                   available_qty = available_qty + $1,
                   updated_at = now()
               WHERE id = $2`,
              [hold.qty, hold.offer_id],
            );
          } else {
            await client.query(
              `UPDATE catalog.offers
               SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at = now()
               WHERE id = $2`,
              [hold.qty, hold.offer_id],
            );
          }
          await client.query(
            `UPDATE orders.stock_holds SET status = 'RELEASED' WHERE id = $1`,
            [hold.hold_id],
          );
        }

        await client.query(
          `UPDATE orders.order_lines SET status = 'CANCELLED', updated_at = now() WHERE order_id = $1`,
          [orderId],
        );
        await client.query(
          `UPDATE orders.orders SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
          [orderId],
        );

        await client.query('COMMIT');
        this.logger.log({ orderId }, 'unpaid order cancelled, holds released');

        await this.safePush(order.buyer_id, {
          type: 'order',
          title: 'Order cancelled',
          body: 'Your order was cancelled and your stock reservation released.',
          deep_link: `/orders/${orderId}`,
        });

        return { order_id: orderId, order_status: 'CANCELLED', refunded_cents: 0 };
      }

      if (!['PAID', 'PARTIALLY_DISPATCHED', 'DISPATCHED'].includes(order.status)) {
        throw new BadRequestException(`order ${order.id} is in status ${order.status}, cannot be cancelled`);
      }

      const escrowBefore = await client.query<{ amount_held_cents: string }>(
        `SELECT amount_held_cents FROM escrow.escrow_orders WHERE order_id = $1 LIMIT 1`,
        [orderId],
      );
      await client.query('COMMIT');

      const lineIds = linesResult.rows.map((l) => l.id);
      const result = await this.stateMachine.handleBuyerDecision({
        order_id: orderId,
        action: 'CANCEL',
        line_ids: lineIds,
      });

      const refunded = escrowBefore.rowCount ? Number(escrowBefore.rows[0].amount_held_cents) : 0;
      await this.safePush(order.buyer_id, {
        type: 'order',
        title: result.order_status === 'CANCELLED' ? 'Order cancelled' : 'Refund initiated',
        body: refunded > 0
          ? `Your refund of the escrow amount is being released.`
          : 'Your order has been cancelled.',
        deep_link: `/orders/${orderId}`,
      });

      return {
        order_id: result.order_id,
        order_status: result.order_status,
        refunded_cents: refunded,
      };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* already committed */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async listOrders(buyerId: string, actor?: AuthUser): Promise<Array<Record<string, unknown>>> {
    this.assertBuyerOrAnon(actor, buyerId);
    const { rows } = await this.pool.query(
      `SELECT o.id, o.channel, o.status, o.multi_seller,
              o.item_total_cents, o.delivery_fee_cents, o.landed_total_cents,
              o.currency, o.created_at, o.updated_at, o.delivery_mode,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'offer_id', ol.offer_id,
                  'product_name', l.product_name,
                  'unit', ofr.unit,
                  'qty', ol.qty,
                  'unit_price_cents', ol.unit_price_cents,
                  'commission_cents', ol.commission_cents,
                  'seller_payable_cents', ol.seller_payable_cents,
                  'status', ol.status
                ) ORDER BY ol.created_at)
                 FROM orders.order_lines ol
                 JOIN catalog.offers ofr ON ofr.id = ol.offer_id
                 JOIN catalog.lots l ON l.id = ofr.lot_id
                WHERE ol.order_id = o.id),
                '[]'::json
              ) AS lines
         FROM orders.orders o
        WHERE o.buyer_id = $1
        ORDER BY o.created_at DESC`,
      [buyerId],
    );
    return rows.map((r) => ({
      ...r,
      item_total_cents: Number(r.item_total_cents),
      delivery_fee_cents: Number(r.delivery_fee_cents),
      landed_total_cents: Number(r.landed_total_cents),
    }));
  }

  async getOrder(orderId: string, actor?: AuthUser): Promise<Record<string, unknown>> {
    const orderResult = await this.pool.query<{
      id: string;
      buyer_id: string;
      channel: string;
      status: string;
      multi_seller: boolean;
      item_total_cents: string;
      delivery_fee_cents: string;
      landed_total_cents: string;
      currency: string;
      created_at: Date;
      updated_at: Date;
    }>(`SELECT * FROM orders.orders WHERE id = $1`, [orderId]);

    if (orderResult.rowCount === 0) throw new NotFoundException(`order ${orderId} not found`);

    const order = orderResult.rows[0];

    const linesResult = await this.pool.query<{
      id: string;
      offer_id: string;
      seller_id: string;
      seller_name: string;
      product_name: string;
      unit: string | null;
      qty: number;
      unit_price_cents: string;
      commission_cents: string;
      seller_payable_cents: string;
      status: string;
      stock_hold_id: string | null;
    }>(
      `SELECT ol.id, ol.offer_id, ol.seller_id,
              u.full_name AS seller_name,
              l.product_name, ofr.unit,
              ol.qty, ol.unit_price_cents, ol.commission_cents, ol.seller_payable_cents, ol.status, ol.stock_hold_id
       FROM orders.order_lines ol
       JOIN catalog.offers ofr ON ofr.id = ol.offer_id
       JOIN catalog.lots l ON l.id = ofr.lot_id
       JOIN pii.users u ON u.id = ol.seller_id
       WHERE ol.order_id = $1`,
      [orderId],
    );

    if (actor) {
      const isBuyer = order.buyer_id === actor.id;
      const isSeller = linesResult.rows.some((l) => l.seller_id === actor.id);
      const isOps = actor.roles.some((r) => r === 'OPS' || r === 'AGENT');
      if (!isBuyer && !isSeller && !isOps) {
        throw new ForbiddenException('You do not have access to this order');
      }
    }

    const escrowResult = await this.pool.query<{
      id: string;
      status: string;
      amount_held_cents: string;
      release_scheduled_at: Date | null;
    }>(`SELECT id, status, amount_held_cents, release_scheduled_at FROM escrow.escrow_orders WHERE order_id = $1`, [orderId]);

    return {
      ...order,
      item_total_cents: Number(order.item_total_cents),
      delivery_fee_cents: Number(order.delivery_fee_cents),
      landed_total_cents: Number(order.landed_total_cents),
      lines: linesResult.rows.map((l) => ({
        ...l,
        unit_price_cents: Number(l.unit_price_cents),
        commission_cents: Number(l.commission_cents),
        seller_payable_cents: Number(l.seller_payable_cents),
      })),
      escrow: escrowResult.rows[0]
        ? { ...escrowResult.rows[0], amount_held_cents: Number(escrowResult.rows[0].amount_held_cents) }
        : null,
    };
  }

  private async safePush(userId: string, input: { type: NotificationType; title: string; body?: string; deep_link?: string }): Promise<void> {
    try {
      await this.feed.push(userId, input);
    } catch (err) {
      this.logger.warn({ err }, 'notification push skipped');
    }
  }

  /** Buyers may only act on their own orders; anonymous demo callers are allowed through. */
  private assertBuyerOrAnon(actor: AuthUser | undefined, buyerId: string): void {
    if (actor && actor.id !== buyerId) {
      throw new ForbiddenException('This order belongs to another buyer');
    }
  }
}
