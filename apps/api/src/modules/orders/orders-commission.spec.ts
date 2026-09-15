import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { OrdersService, type CreateCheckoutInput } from './orders.service.js';
import { EscrowReleaseService } from '../escrow/escrow-release.service.js';
import type { OutboxService } from '../outbox/outbox.service.js';
import type { PaystackService } from '../paystack/paystack.service.js';
import type { ReservationGate } from '../reservation/reservation.gate.js';
import type { MultiSellerGate } from '../fulfilment/multi-seller-gate.js';
import type { FulfilmentStateMachine } from '../fulfilment/fulfilment-state-machine.js';
import type { FeedService } from '../notifications/feed.service.js';
import type { NotifyService } from '../notifications/notify.service.js';

const notifyStub = {
  notify: async () => {},
  notifyRoles: async () => {},
} as unknown as NotifyService;

/**
 * Phase 0 money invariants — full money path exercised against the live DB:
 *  - commission snapshot at checkout locks onto order_lines
 *  - PAYMENT_IN (gross) then FEE (platform take) hit the ledger
 *  - release pays SELLER_PAYOUT = net running balance, closing the escrow at
 *    exactly zero (the invariant that a gross-payout bug would violate)
 */
let admin: Pool;
let app: Pool;
let orders: OrdersService;
let release: EscrowReleaseService;

let createdOrderId: string | null = null;

const outboxStub = { enqueue: async () => undefined } as unknown as OutboxService;

const passingGate = {
  checkGate: () => ({ allowed: true, reason: 'ok' }),
  checkCapacity: () => ({ available: 999 }),
  reserveCapacity: () => true,
} as unknown as MultiSellerGate;

const gateStub = {
  acquireSoftHold: async () => true,
  convertSoftToHard: async () => true,
  releaseSoftHold: async () => undefined,
} as unknown as ReservationGate;

beforeAll(async () => {
  const c = loadConfig();
  admin = new Pool({
    host: c.DB_HOST,
    port: c.DB_PORT,
    database: process.env.POSTGRES_DB ?? 'ojaline',
    user: process.env.POSTGRES_USER ?? 'ojaline',
    password: process.env.POSTGRES_PASSWORD ?? 'ojaline_dev_pw',
  });
  app = new Pool({
    host: c.DB_HOST,
    port: c.DB_PORT,
    database: c.DB_NAME,
    user: c.DB_USER,
    password: c.DB_PASSWORD,
  });

  orders = new OrdersService(
    app,
    outboxStub,
    {} as unknown as PaystackService,
    gateStub,
    passingGate,
    {} as unknown as FulfilmentStateMachine,
    {} as unknown as FeedService,
  );
  release = new EscrowReleaseService(app, outboxStub, notifyStub);
});

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe('Whole money path with commission (integration — requires postgres)', () => {
  beforeAll(async () => {
    await admin.query(`DELETE FROM finance.commission_rates WHERE channel = 'WHOLESALE' AND category_id IS NULL`, []);
    await admin.query(
      `INSERT INTO finance.commission_rates (channel, category_id, percent_bps, flat_cents)
       VALUES ('WHOLESALE', NULL, 1000, 0)`, // 10% on every wholesale line
    );
  });

  it('locks a 10% commission onto the line, pays a net payout, and closes the escrow at zero', async () => {
    // Clean any stale WHOLESALE rates from prior interrupted runs.
    await admin.query(`DELETE FROM finance.commission_rates WHERE channel = 'WHOLESALE' AND category_id IS NULL`, []);
    // Re-insert the 10% rate (idempotent with UNIQUE on effective_from).
    await admin.query(
      `INSERT INTO finance.commission_rates (channel, category_id, percent_bps, flat_cents)
       VALUES ('WHOLESALE', NULL, 1000, 0)`,
    );

    const buyer = await admin.query<{ id: string }>(
      `INSERT INTO pii.users (phone, full_name, seller_type, channel) VALUES ($1, $2, $3, 'OPEN') RETURNING id`,
      [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, `MoneyPath Buyer ${randomUUID().slice(0, 6)}`, null],
    );
    const buyerId = buyer.rows[0].id as string;

    const seller = await admin.query<{ id: string }>(
      `INSERT INTO pii.users (phone, full_name, seller_type, channel) VALUES ($1, $2, 'STORE', 'WHOLESALE') RETURNING id`,
      [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, `MoneyPath Seller ${randomUUID().slice(0, 6)}`],
    );
    const sellerId = seller.rows[0].id as string;

    const cluster = await admin.query<{ id: string }>(
      `INSERT INTO catalog.clusters (name, lga, centroid) VALUES ($1, $2, ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography) RETURNING id`,
      [`MoneyPath Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA'],
    );
    const clusterId = cluster.rows[0].id as string;

    const lot = await admin.query<{ id: string }>(
      `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
      [sellerId, 'MoneyPath Product', `ref-${randomUUID()}`],
    );

    const offer = await admin.query<{ id: string }>(
      `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
       VALUES ($1, 'WHOLESALE', $2, 50, 1, 'SHELF_GT_7D', ARRAY['SCHEDULED'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
       RETURNING id`,
      [sellerId, lot.rows[0].id as string, clusterId],
    );
    const offerId = offer.rows[0].id as string;

    try {
      const input: CreateCheckoutInput = {
        buyer_id: buyerId,
        items: [{ offer_id: offerId, qty: 1, unit_price_cents: 5000 }],
        soft_hold_ids: [],
        window_start: '2026-09-16T08:00:00.000Z',
        window_end: '2026-09-16T16:00:00.000Z',
        delivery_mode: 'SCHEDULED',
      };

      const checkout = await orders.createCheckout(input);
      createdOrderId = checkout.order_id;

      // 1) Commission snapshot landed on the line + checkout response.
      expect(checkout.items[0]).toMatchObject({ commission_cents: 500, seller_payable_cents: 4500 });

      const line = await app.query<{ commission_cents: string; seller_payable_cents: string }>(
        `SELECT commission_cents, seller_payable_cents FROM orders.order_lines WHERE order_id = $1`,
        [checkout.order_id],
      );
      expect(Number(line.rows[0].commission_cents)).toBe(500);
      expect(Number(line.rows[0].seller_payable_cents)).toBe(4500);

      // 2) Payment: PAYMENT_IN gross then FEE (platform take).
      await orders.confirmPayment({ order_id: checkout.order_id, paystack_reference: `ref-test-${randomUUID()}` });

      const ledger = await app.query<{ entry_type: string; amount_cents: string; running_balance_cents: string }>(
        `SELECT entry_type, amount_cents, running_balance_cents
         FROM escrow.ledger_entries le
         JOIN escrow.escrow_orders eo ON eo.id = le.escrow_order_id
         WHERE eo.order_id = $1
         ORDER BY le.sequence_no`,
        [checkout.order_id],
      );
      expect(ledger.rows.map(r => r.entry_type)).toEqual(['PAYMENT_IN', 'FEE']);
      // PAYMENT_IN = gross landed (item + delivery fee); FEE = platform take.
      const landedCents = checkout.landed_total_cents;
      expect(Number(ledger.rows[0].amount_cents)).toBe(landedCents);
      expect(Number(ledger.rows[1].amount_cents)).toBe(-500);
      expect(Number(ledger.rows[1].running_balance_cents)).toBe(landedCents - 500);

      // 3) Release: SELLER_PAYOUT = net running balance, escrow closes at 0.
      await app.query(
        `UPDATE escrow.escrow_orders SET release_scheduled_at = now() - interval '1 hour' WHERE order_id = $1`,
        [checkout.order_id],
      );

      const result = await release.releaseDueEscrows();
      expect(result.released).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes(checkout.order_id))).toBe(false);

      const releasedStatus = await app.query<{ status: string }>(
        `SELECT status FROM escrow.escrow_orders WHERE order_id = $1`,
        [checkout.order_id],
      );
      expect(releasedStatus.rows[0].status).toBe('RELEASED');

      const after = await app.query<{ entry_type: string; amount_cents: string; running_balance_cents: string; counterparty_type: string }>(
        `SELECT le.entry_type, le.amount_cents, le.running_balance_cents, le.counterparty_type
         FROM escrow.ledger_entries le
         JOIN escrow.escrow_orders eo ON eo.id = le.escrow_order_id
         WHERE eo.order_id = $1
         ORDER BY le.sequence_no`,
        [checkout.order_id],
      );
      const payout = after.rows[after.rows.length - 1];
      expect(payout.entry_type).toBe('SELLER_PAYOUT');
      expect(Number(payout.amount_cents)).toBe(-(landedCents - 500));
      expect(payout.counterparty_type).toBe('SELLER');
      // Closed-escrow-balance invariant: gross minus fee minus payout = 0.
      expect(Number(payout.running_balance_cents)).toBe(0);
    } finally {
      if (createdOrderId) {
        await admin.query(`DELETE FROM escrow.ledger_entries WHERE escrow_order_id IN (SELECT id FROM escrow.escrow_orders WHERE order_id = $1)`, [createdOrderId]);
        await admin.query(`DELETE FROM escrow.escrow_orders WHERE order_id = $1`, [createdOrderId]);
        await app.query(`DELETE FROM orders.order_lines WHERE order_id = $1`, [createdOrderId]);
        await app.query(`DELETE FROM orders.stock_holds WHERE order_id = $1`, [createdOrderId]);
        await app.query(`DELETE FROM orders.checkout_sessions WHERE id IN (SELECT checkout_session_id FROM orders.orders WHERE id = $1)`, [createdOrderId]);
        await app.query(`DELETE FROM orders.orders WHERE id = $1`, [createdOrderId]);
        createdOrderId = null;
      }
      await admin.query(`DELETE FROM finance.commission_rates WHERE channel = 'WHOLESALE' AND category_id IS NULL`, []);
      await admin.query(`DELETE FROM catalog.offers WHERE id = $1`, [offerId]);
      await admin.query(`DELETE FROM catalog.lots WHERE id = $1`, [lot.rows[0].id as string]);
      await admin.query(`DELETE FROM catalog.clusters WHERE id = $1`, [clusterId]);
      await admin.query(`DELETE FROM pii.users WHERE id IN ($1, $2)`, [sellerId, buyerId]);
    }
  });
});