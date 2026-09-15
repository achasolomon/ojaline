import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { OrdersService, type CreateCheckoutInput } from '../orders/orders.service.js';
import { FulfilmentStateMachine } from './fulfilment-state-machine.js';
import { EscrowReleaseService } from '../escrow/escrow-release.service.js';
import { FeedService } from '../notifications/feed.service.js';
import { MarketFeedService } from '../realtime/market-feed.service.js';
import type { OutboxService } from '../outbox/outbox.service.js';
import type { PaystackService } from '../paystack/paystack.service.js';
import type { ReservationGate } from '../reservation/reservation.gate.js';
import type { MultiSellerGate } from '../fulfilment/multi-seller-gate.js';
import type { AuthUser } from '../auth/auth.service.js';
import type { NotifyService } from '../notifications/notify.service.js';

const notifyStub = {
  notify: async () => {},
  notifyRoles: async () => {},
} as unknown as NotifyService;

/**
 * Phase 1 — seller orders & fulfilment, exercised against the live DB:
 *  - seller-scoped list (ownership enforced, buyer_name surfaced)
 *  - accept (PAID → ACCEPTED), dispatch w/ tracking (→ DISPATCHED, order rolls)
 *  - decline (→ CANCELLED + order PARTIALLY_DISPATCHED + 24h buyer decision)
 *  - seller-scoped getOrder (no cross-seller line leakage)
 *  - buyer confirm after dispatch still schedules the escrow release; the net
 *    payout closes the escrow at zero.
 *  - sellers are notified in-app when a payment lands.
 */

let admin: Pool;
let app: Pool;
let orders: OrdersService;
let stateMachine: FulfilmentStateMachine;
let release: EscrowReleaseService;
let feed: FeedService;

const created: Array<{ order_id?: string }> = [];
let resources: {
  sellerIds: string[];
  buyers: string[];
  offerIds: string[];
  lotIds: string[];
  clusterId: string;
} | null = null;

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

const sellerActor = (id: string): AuthUser => ({
  id,
  phone: '+2348000000000',
  email: null,
  full_name: 'Seller',
  status: 'ACTIVE',
  seller_type: 'STORE',
  channel: 'WHOLESALE',
  roles: ['SELLER', 'BUYER'],
});

const buyerActor = (id: string): AuthUser => ({
  id,
  phone: '+2348000000001',
  email: null,
  full_name: 'Buyer',
  status: 'ACTIVE',
  seller_type: null,
  channel: 'RETAILER',
  roles: ['BUYER'],
});

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

  const redisStub = {
    lpush: async () => 1,
    ltrim: async () => 'OK',
    publish: async () => 1,
  } as unknown as Redis;

  feed = new FeedService(app, new MarketFeedService(app, redisStub));

  orders = new OrdersService(
    app,
    outboxStub,
    {} as unknown as PaystackService,
    gateStub,
    passingGate,
    {} as unknown as FulfilmentStateMachine,
    feed,
  );
  stateMachine = new FulfilmentStateMachine(app, outboxStub);
  release = new EscrowReleaseService(app, outboxStub, notifyStub);
});

afterAll(async () => {
  await cleanup();
  await app.end();
  await admin.end();
});

async function seedResources(): Promise<NonNullable<typeof resources>> {
  if (resources) return resources;

  const sellerA = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, $2, 'STORE', 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, `Fulfil Seller A ${randomUUID().slice(0, 6)}`],
  );
  const sellerB = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, $2, 'STORE', 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, `Fulfil Seller B ${randomUUID().slice(0, 6)}`],
  );
  const sellerIds = [sellerA.rows[0].id as string, sellerB.rows[0].id as string];

  const buyer = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, $2, NULL, 'OPEN') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, `Fulfil Buyer ${randomUUID().slice(0, 6)}`],
  );
  const buyers = [buyer.rows[0].id as string];

  const cluster = await admin.query<{ id: string }>(
    `INSERT INTO catalog.clusters (name, lga, centroid)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography) RETURNING id`,
    [`Fulfil Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA'],
  );
  const clusterId = cluster.rows[0].id as string;

  const offerIds: string[] = [];
  const lotIds: string[] = [];
  for (const sid of sellerIds) {
    const lot = await admin.query<{ id: string }>(
      `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
      [sid, `Fulfil Product ${randomUUID().slice(0, 4)}`, `ref-${randomUUID()}`],
    );
    const offer = await admin.query<{ id: string }>(
      `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
       VALUES ($1, 'WHOLESALE', $2, 50, 1, 'SHELF_GT_7D', ARRAY['SCHEDULED'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
       RETURNING id`,
      [sid, lot.rows[0].id as string, clusterId],
    );
    offerIds.push(offer.rows[0].id as string);
    lotIds.push(lot.rows[0].id as string);
  }

  await admin.query(`DELETE FROM finance.commission_rates WHERE channel = 'WHOLESALE' AND category_id IS NULL`, []);
  await admin.query(
    `INSERT INTO finance.commission_rates (channel, category_id, percent_bps, flat_cents) VALUES ('WHOLESALE', NULL, 1000, 0)`,
  );

  resources = { sellerIds, buyers, offerIds, lotIds, clusterId };
  return resources;
}

async function placePaidOrder(buyerId: string, offerIds: string[]): Promise<{ order_id: string; landed_total_cents: number }> {
  const input: CreateCheckoutInput = {
    buyer_id: buyerId,
    items: offerIds.map((offer_id) => ({ offer_id, qty: 1, unit_price_cents: 5000 })),
    soft_hold_ids: [],
    window_start: '2026-09-16T08:00:00.000Z',
    window_end: '2026-09-16T16:00:00.000Z',
    delivery_mode: 'SCHEDULED',
  };
  const checkout = await orders.createCheckout(input);
  const holder: { order_id?: string } = { order_id: checkout.order_id };
  created.push(holder);
  await orders.confirmPayment({ order_id: checkout.order_id, paystack_reference: `ref-fp-${randomUUID()}` });
  return { order_id: checkout.order_id, landed_total_cents: checkout.landed_total_cents };
}

async function cleanup(): Promise<void> {
  if (!resources) return;
  const { sellerIds, buyers, offerIds, lotIds, clusterId } = resources;

  for (const r of created) {
    if (!r.order_id) continue;
    const orderId = r.order_id;
    await admin.query(`DELETE FROM escrow.ledger_entries WHERE escrow_order_id IN (SELECT id FROM escrow.escrow_orders WHERE order_id = $1)`, [orderId]);
    await admin.query(`DELETE FROM escrow.escrow_orders WHERE order_id = $1`, [orderId]);
    await app.query(`DELETE FROM orders.order_lines WHERE order_id = $1`, [orderId]);
    await app.query(`DELETE FROM orders.stock_holds WHERE order_id = $1`, [orderId]);
    await app.query(`DELETE FROM orders.checkout_sessions WHERE id IN (SELECT checkout_session_id FROM orders.orders WHERE id = $1)`, [orderId]);
    await app.query(`DELETE FROM orders.orders WHERE id = $1`, [orderId]);
  }
  await admin.query(`DELETE FROM users.notifications WHERE user_id = ANY($1)`, [[...sellerIds, ...buyers]]);
  await admin.query(`DELETE FROM finance.commission_rates WHERE channel = 'WHOLESALE' AND category_id IS NULL`, []);
  for (const oid of offerIds) await admin.query(`DELETE FROM catalog.offers WHERE id = $1`, [oid]);
  for (const lid of lotIds) await admin.query(`DELETE FROM catalog.lots WHERE id = $1`, [lid]);
  await admin.query(`DELETE FROM catalog.clusters WHERE id = $1`, [clusterId]);
  await admin.query(`DELETE FROM pii.users WHERE id = ANY($1)`, [[...sellerIds, ...buyers]]);
  created.length = 0;
  resources = null;
}

describe('Seller fulfilment (integration — requires postgres)', () => {
  it('seller lists, accepts, dispatches; buyer confirms; escrow closes at zero', async () => {
    const { sellerIds, buyers, offerIds } = await seedResources();
    const [sellerAId, sellerBId] = sellerIds;
    const buyerId = buyers[0];

    const { order_id } = await placePaidOrder(buyerId, [offerIds[0]]);
    const orderId = order_id;

    // Seller A can list the order; seller B cannot see it.
    const listA = await orders.listSellerOrders(sellerAId, { limit: 50 }, sellerActor(sellerAId));
    const item = listA.orders.find((o) => o.id === orderId);
    expect(item).toBeDefined();
    expect((item as any).buyer_id).toBe(buyerId);
    expect((item as any).buyer_name).toMatch(/^Fulfil Buyer/);
    expect((item as any).lines).toHaveLength(1);
    expect((item as any).lines[0]).toMatchObject({ status: 'PAID', seller_payable_cents: 4500, commission_cents: 500 });

    const listB = await orders.listSellerOrders(sellerBId, {}, sellerActor(sellerBId));
    expect(listB.orders.find((o) => o.id === orderId)).toBeUndefined();

    // Authorization: other sellers and anonymous callers are rejected.
    await expect(orders.listSellerOrders(sellerAId, {}, sellerActor(sellerBId))).rejects.toThrow();
    await expect(orders.listSellerOrders(sellerAId, {}, undefined)).rejects.toThrow();
    await expect(orders.getOrder(orderId, sellerActor(sellerBId))).rejects.toThrow();

    // Sellers are notified when the payment lands.
    const notif = await admin.query<{ title: string }>(
      `SELECT title FROM users.notifications WHERE user_id = $1 AND deep_link = $2`,
      [sellerAId, `/orders/${orderId}`],
    );
    expect(notif.rows.map((r) => r.title)).toContain('New paid order');

    // Accept the line.
    const lineId = (item as any).lines[0].id as string;
    await stateMachine.acceptLine(orderId, lineId, sellerActor(sellerAId));
    const accepted = await app.query<{ status: string; accepted_at: Date | null }>(
      `SELECT status, accepted_at FROM orders.order_lines WHERE id = $1`,
      [lineId],
    );
    expect(accepted.rows[0].status).toBe('ACCEPTED');
    expect(accepted.rows[0].accepted_at).not.toBeNull();

    // A different seller cannot act on this line.
    await expect(stateMachine.acceptLine(orderId, lineId, sellerActor(sellerBId))).rejects.toThrow();

    // Dispatch with tracking; the order rolls to DISPATCHED.
    const dispatched = await stateMachine.dispatchLine(orderId, lineId, sellerActor(sellerAId), { tracking_ref: 'TRK-0001' });
    expect(dispatched.status).toBe('DISPATCHED');
    expect(dispatched.order_status).toBe('DISPATCHED');
    expect(dispatched.tracking_ref).toBe('TRK-0001');

    const lineRow = await app.query<{ status: string; tracking_ref: string | null; dispatched_at: Date | null }>(
      `SELECT status, tracking_ref, dispatched_at FROM orders.order_lines WHERE id = $1`,
      [lineId],
    );
    expect(lineRow.rows[0].status).toBe('DISPATCHED');
    expect(lineRow.rows[0].tracking_ref).toBe('TRK-0001');
    expect(lineRow.rows[0].dispatched_at).not.toBeNull();

    const orderRow = await app.query<{ status: string }>(`SELECT status FROM orders.orders WHERE id = $1`, [orderId]);
    expect(orderRow.rows[0].status).toBe('DISPATCHED');

    // Seller-scoped getOrder shows only the seller's own lines.
    const sellerView = await orders.getOrder(orderId, sellerActor(sellerAId));
    const sellerLines = sellerView.lines as Array<Record<string, unknown>>;
    expect(sellerLines).toHaveLength(1);
    expect(sellerLines[0].seller_id).toBe(sellerAId);

    // Buyer confirms delivery once DISPATCHED; release is scheduled.
    const delivered = await orders.confirmDelivery(orderId, buyerActor(buyerId));
    expect(delivered.release_scheduled_at).toBeInstanceOf(Date);

    // Release the due escrow and check the net payout closes the escrow at zero.
    await app.query(
      `UPDATE escrow.escrow_orders SET release_scheduled_at = now() - interval '1 hour' WHERE order_id = $1`,
      [orderId],
    );
    const result = await release.releaseDueEscrows();
    expect(result.errors.some((e) => e.includes(orderId))).toBe(false);

    const ledger = await app.query<{ entry_type: string; amount_cents: string; running_balance_cents: string }>(
      `SELECT le.entry_type, le.amount_cents, le.running_balance_cents
         FROM escrow.ledger_entries le
         JOIN escrow.escrow_orders eo ON eo.id = le.escrow_order_id
        WHERE eo.order_id = $1
        ORDER BY le.sequence_no`,
      [orderId],
    );
    const payout = ledger.rows[ledger.rows.length - 1];
    expect(payout.entry_type).toBe('SELLER_PAYOUT');
    expect(Number(payout.amount_cents)).toBeLessThan(0);
    expect(Number(payout.running_balance_cents)).toBe(0);
  });

  it('a decline frees the line, arms the buyer decision deadline, and leaves sibling lines actionable', async () => {
    const { sellerIds, buyers, offerIds } = await seedResources();
    const [sellerAId, sellerBId] = sellerIds;
    const buyerId = buyers[0];

    const { order_id } = await placePaidOrder(buyerId, [offerIds[0], offerIds[1]]);
    const orderId = order_id;

    // Seller B declines their line.
    const listB = await orders.listSellerOrders(sellerBId, {}, sellerActor(sellerBId));
    const itemB = listB.orders.find((o) => o.id === orderId);
    expect(itemB).toBeDefined();
    const linesB = (itemB as any).lines as Array<{ id: string; status: string }>;
    expect(linesB).toHaveLength(1);

    const declined = await stateMachine.declineLine(orderId, linesB[0].id, sellerActor(sellerBId), { reason: 'Ran out' });
    expect(declined.status).toBe('CANCELLED');
    expect(declined.order_status).toBe('PARTIALLY_DISPATCHED');
    expect(declined.decision_deadline_at).toBeInstanceOf(Date);

    const lineRow = await app.query<{ status: string; decline_reason: string | null }>(
      `SELECT status, decline_reason FROM orders.order_lines WHERE id = $1`,
      [linesB[0].id],
    );
    expect(lineRow.rows[0].status).toBe('CANCELLED');
    expect(lineRow.rows[0].decline_reason).toBe('Ran out');

    // A second decline of the same line is rejected (status no longer PAID/ACCEPTED).
    await expect(stateMachine.declineLine(orderId, linesB[0].id, sellerActor(sellerBId))).rejects.toThrow();

    // Seller A's sibling line is still actionable even though the order is
    // PARTIALLY_DISPATCHED: accept then dispatch it.
    const listA = await orders.listSellerOrders(sellerAId, {}, sellerActor(sellerAId));
    const itemA = listA.orders.find((o) => o.id === orderId);
    const linesA = (itemA as any).lines as Array<{ id: string; status: string }>;
    expect(linesA).toHaveLength(1);
    expect(linesA[0].status).toBe('PAID');

    await stateMachine.acceptLine(orderId, linesA[0].id, sellerActor(sellerAId));
    const dispatched = await stateMachine.dispatchLine(orderId, linesA[0].id, sellerActor(sellerAId));
    expect(dispatched.status).toBe('DISPATCHED');
  });
});