import { Injectable, BadRequestException, NotFoundException, ConflictException, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { OutboxService } from '../outbox/outbox.service.js';
import { PaystackService } from '../paystack/paystack.service.js';
import { ReservationGate } from '../reservation/reservation.gate.js';
import { MultiSellerGate } from '../fulfilment/multi-seller-gate.js';

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
}

export interface ConfirmPaymentInput {
  order_id: string;
  paystack_reference: string;
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
  ) {}

  async createCheckout(input: CreateCheckoutInput): Promise<{
    order_id: string;
    checkout_session_id: string;
    channel: string;
    item_total_cents: number;
    delivery_fee_cents: number;
    landed_total_cents: number;
    currency: string;
    items: Array<{ offer_id: string; qty: number; unit_price_cents: number; line_total_cents: number }>;
    soft_hold_expires_at: Date;
  }> {
    if (input.items.length === 0) throw new BadRequestException('items must not be empty');

    const holdKeys: Array<{ key: string; qty: number }> = [];

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const offerIds = input.items.map((i) => i.offer_id);
      const offersResult = await client.query<{ id: string; channel: string; available_qty: number; seller_id: string; cluster_id: string }>(
        `SELECT id, channel, available_qty, seller_id, cluster_id FROM catalog.offers WHERE id = ANY($1)`,
        [offerIds],
      );

      const offerMap = new Map(offersResult.rows.map((o) => [o.id, o]));

      for (const item of input.items) {
        if (!offerMap.has(item.offer_id)) {
          throw new NotFoundException(`offer ${item.offer_id} not found`);
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
      const deliveryFeeCents = 0n;
      const landedTotalCents = itemTotalCents + deliveryFeeCents;
      const multiSeller = new Set(input.items.map((i) => i.offer_id)).size > 1;

      const orderResult = await client.query<{ id: string }>(
        `INSERT INTO orders.orders
           (buyer_id, channel, status, multi_seller, checkout_session_id,
            item_total_cents, delivery_fee_cents, landed_total_cents,
            window_start, window_end)
         VALUES ($1, $2, 'CHECKOUT', $3, $4, $5, $6, $7, $8, $9)
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
        ],
      );
      const orderId = orderResult.rows[0].id;

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

        await client.query(
          `INSERT INTO orders.order_lines (order_id, offer_id, seller_id, qty, unit_price_cents, status, stock_hold_id)
           VALUES ($1, $2, (SELECT seller_id FROM catalog.offers WHERE id = $2), $3, $4, 'PENDING', $5)`,
          [orderId, item.offer_id, item.qty, item.unit_price_cents, holdId],
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
        item_total_cents: Number(itemTotalCents),
        delivery_fee_cents: Number(deliveryFeeCents),
        landed_total_cents: Number(landedTotalCents),
        currency: 'NGN',
        soft_hold_expires_at: expiresAt,
        items: input.items.map((item) => ({
          offer_id: item.offer_id,
          qty: item.qty,
          unit_price_cents: item.unit_price_cents,
          line_total_cents: item.unit_price_cents * item.qty,
        })),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async initializePayment(orderId: string): Promise<{ authorization_url: string; reference: string }> {
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
    if (order.status !== 'CHECKOUT') {
      throw new BadRequestException(`order ${order.id} is in status ${order.status}, expected CHECKOUT`);
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
      metadata: { order_id: orderId },
    });

    await this.pool.query(
      `UPDATE orders.stock_holds
       SET kind = 'HARD', paystack_reference = $1
       WHERE order_id = $2 AND status = 'ACTIVE' AND kind = 'SOFT'`,
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

  async confirmPayment(input: ConfirmPaymentInput): Promise<{ order_id: string; status: string }> {
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

  async confirmDelivery(orderId: string): Promise<{ order_id: string; escrow_status: string; release_scheduled_at: Date }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const orderResult = await client.query<{
        id: string;
        status: string;
      }>(
        `SELECT id, status FROM orders.orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );

      if (orderResult.rowCount === 0) throw new NotFoundException(`order ${orderId} not found`);

      const order = orderResult.rows[0];
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

  async getOrder(orderId: string): Promise<Record<string, unknown>> {
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
      qty: number;
      unit_price_cents: string;
      status: string;
      stock_hold_id: string | null;
    }>(`SELECT * FROM orders.order_lines WHERE order_id = $1`, [orderId]);

    const escrowResult = await this.pool.query<{
      id: string;
      status: string;
      amount_held_cents: string;
    }>(`SELECT id, status, amount_held_cents FROM escrow.escrow_orders WHERE order_id = $1`, [orderId]);

    return {
      ...order,
      item_total_cents: Number(order.item_total_cents),
      delivery_fee_cents: Number(order.delivery_fee_cents),
      landed_total_cents: Number(order.landed_total_cents),
      lines: linesResult.rows.map((l) => ({
        ...l,
        unit_price_cents: Number(l.unit_price_cents),
      })),
      escrow: escrowResult.rows[0] ?? null,
    };
  }
}
