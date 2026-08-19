import {
  Controller,
  Post,
  Req,
  Res,
  Logger,
  HttpCode,
  Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PaystackService, PaystackEvent } from './paystack.service.js';
import { OutboxService } from '../outbox/outbox.service.js';

const PARTIAL_PAY_THRESHOLD = 0.01;

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @Inject(PaystackService) private readonly paystack: PaystackService,
    @Inject(Pool) private readonly pool: Pool,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  @Post('paystack')
  @HttpCode(200)
  async handlePaystack(@Req() req: Record<string, unknown>, @Res() res: Record<string, unknown>): Promise<void> {
    const signature = (req.headers as Record<string, string>)['x-paystack-signature'];
    const rawBodyBuf = req.rawBody as Buffer | undefined;
    const rawBody = rawBodyBuf ? rawBodyBuf.toString('utf8') : undefined;

    let event: PaystackEvent;
    if (rawBody && signature) {
      if (!this.paystack.verifyWebhookSignature(rawBody, signature)) {
        this.logger.warn('paystack webhook signature mismatch');
        (res as { status: (code: number) => { json: (body: unknown) => void } }).status(401).json({ error: 'invalid signature' });
        return;
      }
      event = JSON.parse(rawBody) as PaystackEvent;
    } else {
      event = req.body as PaystackEvent;
    }

    this.logger.log({ event: event.event, reference: event.data?.reference }, 'paystack webhook received');

    if (event.event === 'charge.success' && event.data?.reference) {
      try {
        await this.handleChargeSuccess(event.data.reference, event.data.amount);
      } catch (err) {
        this.logger.error({ err, reference: event.data.reference }, 'handleChargeSuccess threw');
      }
    }

    (res as { status: (code: number) => { json: (body: unknown) => void } }).status(200).json({ status: true });
  }

  private async handleChargeSuccess(reference: string, paidAmountKobo: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const holdResult = await client.query<{
        id: string;
        offer_id: string;
        user_id: string;
        qty: number;
        order_id: string | null;
      }>(
        `SELECT id, offer_id, user_id, qty, order_id
         FROM orders.stock_holds
         WHERE paystack_reference = $1 AND status = 'ACTIVE'`,
        [reference],
      );

      if (holdResult.rowCount === 0) {
        const alreadyConverted = await client.query<{ id: string }>(
          `SELECT id FROM orders.stock_holds
           WHERE paystack_reference = $1 AND status = 'CONVERTED'
           LIMIT 1`,
          [reference],
        );
        if (alreadyConverted.rowCount !== null && alreadyConverted.rowCount > 0) {
          this.logger.log({ reference }, 'replay guard: reference already processed, returning 200');
          await client.query('ROLLBACK');
          return;
        }
        this.logger.warn({ reference }, 'no active or converted hold found for paystack reference');
        await client.query('ROLLBACK');
        return;
      }

      const hold = holdResult.rows[0];
      if (!hold.order_id) {
        this.logger.warn({ reference, holdId: hold.id }, 'hold has no linked order_id');
        await client.query('ROLLBACK');
        return;
      }

      const orderResult = await client.query<{
        id: string;
        status: string;
        buyer_id: string;
        landed_total_cents: string;
      }>(
        `SELECT id, status, buyer_id, landed_total_cents
         FROM orders.orders WHERE id = $1 FOR UPDATE`,
        [hold.order_id],
      );

      if (orderResult.rowCount === 0) {
        this.logger.warn({ orderId: hold.order_id }, 'order not found');
        await client.query('ROLLBACK');
        return;
      }

      const order = orderResult.rows[0];

      if (order.status !== 'CHECKOUT' && order.status !== 'PENDING_PAYMENT') {
        this.logger.log({ orderId: order.id, status: order.status }, 'order not in payable status, skipping');
        await client.query('ROLLBACK');
        return;
      }

      const orderTotalCents = Number(order.landed_total_cents);
      const paidCents = Math.floor(paidAmountKobo / 100);
      const isPartial = paidCents < orderTotalCents - PARTIAL_PAY_THRESHOLD;

      if (isPartial) {
        this.logger.log(
          { orderId: order.id, paidCents, orderTotalCents },
          'partial payment detected',
        );
      }

      let convertedQty = hold.qty;
      if (isPartial && hold.qty > 1) {
        const ratio = paidCents / orderTotalCents;
        convertedQty = Math.max(1, Math.floor(hold.qty * ratio));
        const releaseQty = hold.qty - convertedQty;

        this.logger.log(
          { orderId: order.id, convertedQty, releaseQty },
          'partial conversion: splitting hold',
        );

        await client.query(
          `UPDATE orders.stock_holds SET qty = $1 WHERE id = $2`,
          [convertedQty, hold.id],
        );

        await client.query(
          `UPDATE catalog.offers
           SET soft_held_qty = GREATEST(soft_held_qty - $1, 0), updated_at = now()
           WHERE id = $2`,
          [releaseQty, hold.offer_id],
        );

        await client.query(
          `UPDATE catalog.offers
           SET available_qty = available_qty + $1, updated_at = now()
           WHERE id = $2`,
          [releaseQty, hold.offer_id],
        );

        await client.query(
          `INSERT INTO orders.stock_holds (offer_id, user_id, qty, kind, status, expires_at, idempotency_key, order_id)
           VALUES ($1, $2, $3, 'SOFT', 'RELEASED', now(), $4, $5)`,
          [
            hold.offer_id,
            hold.user_id,
            releaseQty,
            `release-partial:${hold.id}:${Date.now()}`,
            hold.order_id,
          ],
        );

        const paidLineTotalCents = Math.round((paidCents / orderTotalCents) * orderTotalCents);
        await client.query(
          `UPDATE orders.orders SET landed_total_cents = $1, updated_at = now() WHERE id = $2`,
          [paidLineTotalCents, order.id],
        );
      } else {
        this.logger.log(
          { orderId: order.id, paidCents, orderTotalCents },
          'full payment',
        );
      }

      await client.query(
        `UPDATE orders.orders SET status = 'PAID', updated_at = now() WHERE id = $1`,
        [order.id],
      );

      await client.query(
        `UPDATE orders.stock_holds SET status = 'CONVERTED'
         WHERE order_id = $1 AND status = 'ACTIVE' AND id = $2`,
        [order.id, hold.id],
      );

      const finalOrderAmount = isPartial && hold.qty > 1
        ? Math.round((paidCents / orderTotalCents) * orderTotalCents)
        : orderTotalCents;

      const escrowResult = await client.query<{ id: string }>(
        `INSERT INTO escrow.escrow_orders (order_id, status, amount_held_cents)
         VALUES ($1, 'HELD', $2) RETURNING id`,
        [order.id, finalOrderAmount],
      );

      await client.query(
        `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, counterparty_id, idempotency_key)
         VALUES ($1, 'PAYMENT_IN', $2, 'BUYER', $3, $4)`,
        [
          escrowResult.rows[0].id,
          finalOrderAmount,
          order.buyer_id,
          `payment:${order.id}:${reference}`,
        ],
      );

      await client.query(
        `UPDATE orders.order_lines SET status = 'PAID', updated_at = now() WHERE order_id = $1`,
        [order.id],
      );

      await this.outbox.enqueue(client, 'order.paid', order.id, {
        order_id: order.id,
        buyer_id: order.buyer_id,
        landed_total_cents: finalOrderAmount,
      });

      await this.detectArbitrage(client, order.buyer_id, order.id);

      await client.query('COMMIT');
      this.logger.log({ orderId: order.id, reference, partial: isPartial }, 'order confirmed via webhook');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error({ err, reference }, 'webhook charge.success handler failed');
      throw err;
    } finally {
      client.release();
    }
  }

  private async detectArbitrage(
    client: import('pg').PoolClient,
    buyerId: string,
    currentOrderId: string,
  ): Promise<void> {
    const lotsResult = await client.query<{ lot_id: string; channel: string }>(
      `SELECT DISTINCT l.lot_id, ord.channel
       FROM orders.order_lines ol
       JOIN catalog.offers l ON l.id = ol.offer_id
       JOIN orders.orders ord ON ord.id = ol.order_id
       WHERE ol.order_id = $1`,
      [currentOrderId],
    );

    for (const lot of lotsResult.rows) {
      const recentResult = await client.query<{ order_id: string; channel: string; created_at: Date }>(
        `SELECT ol.order_id, o.channel, o.created_at
         FROM orders.order_lines ol
         JOIN catalog.offers l ON l.id = ol.offer_id
         JOIN orders.orders o ON o.id = ol.order_id
         WHERE o.buyer_id = $1
           AND l.lot_id = $2
           AND o.channel != $3
           AND o.status = 'PAID'
           AND o.created_at > now() - interval '24 hours'
           AND o.id != $4
         LIMIT 1`,
        [buyerId, lot.lot_id, lot.channel, currentOrderId],
      );

      if (recentResult.rowCount !== null && recentResult.rowCount > 0) {
        const prev = recentResult.rows[0];
        await client.query(
          `INSERT INTO trust.fraud_signals (subject_type, subject_id, signal_type, severity, evidence)
           VALUES ('BUYER', $1, 'RAPID_BUY_LIST', 50, $2)`,
          [
            buyerId,
            JSON.stringify({
              current_order_id: currentOrderId,
              current_channel: lot.channel,
              previous_order_id: prev.order_id,
              previous_channel: prev.channel,
              lot_id: lot.lot_id,
              gap_hours: Math.round((Date.now() - new Date(prev.created_at).getTime()) / 3_600_000),
            }),
          ],
        );
        this.logger.warn(
          { buyerId, lotId: lot.lot_id, from: prev.channel, to: lot.channel },
          'arbitrage fraud signal written',
        );
      }
    }
  }
}
