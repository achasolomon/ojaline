import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { OutboxService } from '../outbox/outbox.service.js';
import { FeedService } from './feed.service.js';
import { NotifyService } from './notify.service.js';
import { PushService } from '../push/push.service.js';
import { MarketFeedService } from '../realtime/market-feed.service.js';
import { DisputesService } from '../disputes/disputes.service.js';
import { SellersService } from '../sellers/sellers.service.js';
import { EscrowReleaseService } from '../escrow/escrow-release.service.js';
import type { AuthUser } from '../auth/auth.service.js';

/**
 * Notification wiring (Phase 4 deferred item) — integration against the live DB:
 *  - NotifyService.notify writes a feed row + a push-log row
 *  - NotifyService.notifyRoles fans out to every OPS/AGENT user
 *  - buyer creates a return → the seller is notified
 *  - escalation → OPS + AGENT notified
 *  - OPS mediates REFUND → buyer + seller notified
 *  - KYC approve → the applicant is notified
 *  - payout request approved → the seller is notified
 *  - escrow release (payday) → the seller is notified
 */

let admin: Pool;
let app: Pool;
let notify: NotifyService;
let disputes: DisputesService;
let sellers: SellersService;
let release: EscrowReleaseService;

let resources: {
  sellerId: string;
  buyerId: string;
  opsUserId: string;
  agentUserId: string;
  offerId: string;
  clusterId: string;
  lotId: string;
  orders: Array<{ order_id?: string; escrow_id?: string; line_id?: string }>;
} | null = null;

const created: Array<{ order_id?: string; escrow_id?: string; line_id?: string }> = [];

const sellerActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000020',
  email: null,
  full_name: 'Notify Seller',
  status: 'ACTIVE',
  seller_type: 'STORE',
  channel: 'WHOLESALE',
  roles: ['SELLER', 'BUYER'],
});

const buyerActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000021',
  email: null,
  full_name: 'Notify Buyer',
  status: 'ACTIVE',
  seller_type: null,
  channel: 'WHOLESALE',
  roles: ['BUYER'],
});

const opsActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000022',
  email: null,
  full_name: 'Notify OPS',
  status: 'ACTIVE',
  seller_type: null,
  channel: 'WHOLESALE',
  roles: ['OPS'],
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

  notify = new NotifyService(app, new FeedService(app, new MarketFeedService(app, redisStub)), new PushService(app));
  disputes = new DisputesService(app, new OutboxService(), notify);
  sellers = new SellersService(app, notify);
  release = new EscrowReleaseService(app, new OutboxService(), notify);
});

afterAll(async () => {
  await cleanup();
  await app.end();
  await admin.end();
});

beforeEach(async () => {
  await cleanup();
});

async function seedResources(): Promise<NonNullable<typeof resources>> {
  if (resources) return resources;

  const mkUser = async (name: string, sellerType: string | null) => {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO pii.users (phone, full_name, seller_type, channel)
       VALUES ($1, $2, $3, 'WHOLESALE') RETURNING id`,
      [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`, `${name} ${randomUUID().slice(0, 6)}`, sellerType],
    );
    return rows[0].id as string;
  };

  const sellerId = await mkUser('Notify Seller', 'STORE');
  await admin.query(
    `INSERT INTO catalog.seller_profiles (user_id, seller_type, kyc_tier) VALUES ($1, 'STORE', 'FULL')`,
    [sellerId],
  );
  await admin.query(
    `INSERT INTO pii.seller_kyc (user_id, id_type, id_number, date_of_birth, address_line1, city, state)
     VALUES ($1, 'NIN', $2, '1990-01-01', '1 Test St', 'Lagos', 'Lagos')`,
    [sellerId, `NIN-${randomUUID().slice(0, 8)}`],
  );

  const buyerId = await mkUser('Notify Buyer', null);
  const opsUserId = await mkUser('Notify OPS', null);
  const agentUserId = await mkUser('Notify Agent', null);

  const grantRole = async (userId: string, role: string) => {
    await admin.query(
      `INSERT INTO pii.user_roles (user_id, role_id)
       SELECT $1, id FROM pii.roles WHERE name = $2
       ON CONFLICT DO NOTHING`,
      [userId, role],
    );
  };
  await grantRole(opsUserId, 'OPS');
  await grantRole(agentUserId, 'AGENT');
  await grantRole(sellerId, 'SELLER');
  await grantRole(buyerId, 'BUYER');

  const cluster = await admin.query<{ id: string }>(
    `INSERT INTO catalog.clusters (name, lga, centroid)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography) RETURNING id`,
    [`Notify Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA'],
  );
  const clusterId = cluster.rows[0].id as string;

  const lot = await admin.query<{ id: string }>(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
    [sellerId, `Notify Product ${randomUUID().slice(0, 4)}`, `ref-${randomUUID()}`],
  );
  const lotId = lot.rows[0].id as string;

  const offer = await admin.query<{ id: string }>(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
     VALUES ($1, 'WHOLESALE', $2, 50, 1, 'SHELF_GT_7D', ARRAY['SCHEDULED'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
     RETURNING id`,
    [sellerId, lotId, clusterId],
  );
  const offerId = offer.rows[0].id as string;

  resources = { sellerId, buyerId, opsUserId, agentUserId, offerId, clusterId, lotId, orders: created };
  return resources;
}

async function seedOrder(
  sellerId: string,
  buyerId: string,
  offerId: string,
  opts: { escrowStatus: 'RELEASED' | 'HELD'; seller_payable_cents: number; release_scheduled_at?: string },
): Promise<{ order_id: string; escrow_id: string; line_id: string }> {
  const held = opts.seller_payable_cents;
  const commission = 500;
  const order = await admin.query<{ id: string }>(
    `INSERT INTO orders.orders (buyer_id, channel, status, item_total_cents, delivery_fee_cents, landed_total_cents)
     VALUES ($1, 'WHOLESALE', 'DELIVERED', $2, 0, $2) RETURNING id`,
    [buyerId, held + commission],
  );
  const orderId = order.rows[0].id as string;

  const line = await admin.query<{ id: string }>(
    `INSERT INTO orders.order_lines (order_id, offer_id, seller_id, qty, unit_price_cents, status, commission_cents, seller_payable_cents)
     VALUES ($1, $2, $3, 1, $4, 'DELIVERED', $5, $6) RETURNING id`,
    [orderId, offerId, sellerId, held + commission, commission, held],
  );
  const lineId = line.rows[0].id as string;

  const escrow = await admin.query<{ id: string }>(
    `INSERT INTO escrow.escrow_orders (order_id, status, amount_held_cents, release_scheduled_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [orderId, opts.escrowStatus, held, opts.release_scheduled_at ?? null],
  );
  const escrowId = escrow.rows[0].id as string;

  const holder = { order_id: orderId, escrow_id: escrowId, line_id: lineId };
  created.push(holder);

  if (opts.escrowStatus === 'RELEASED') {
    await admin.query(
      `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, counterparty_id, idempotency_key)
       VALUES ($1, 'PAYMENT_IN', $2, 'BUYER', $3, $4),
              ($1, 'FEE', $5, 'PLATFORM', NULL, $6),
              ($1, 'SELLER_PAYOUT', $7, 'SELLER', $8, $9)`,
      [escrowId, held + commission, buyerId, `pay:${randomUUID()}`, -commission, `fee:${randomUUID()}`, -held, sellerId, `payout:${randomUUID()}`],
    );
  } else {
    await admin.query(
      `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, counterparty_id, idempotency_key)
       VALUES ($1, 'PAYMENT_IN', $2, 'BUYER', $3, $4)`,
      [escrowId, held + commission, buyerId, `pay:${randomUUID()}`],
    );
  }

  return holder;
}

async function feedTitles(userId: string): Promise<string[]> {
  const { rows } = await app.query(`SELECT title FROM users.notifications WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
  return rows.map((r) => String(r.title));
}

async function pushBodies(userId: string): Promise<string[]> {
  const { rows } = await app.query(`SELECT body FROM users.push_notifications WHERE user_id = $1 ORDER BY sent_at DESC`, [userId]);
  return rows.map((r) => String(r.body));
}

async function cleanup(): Promise<void> {
  if (!resources) return;
  const { sellerId, buyerId, opsUserId, agentUserId, offerId, clusterId, lotId } = resources;
  const users = [sellerId, buyerId, opsUserId, agentUserId];

  await admin.query(`DELETE FROM orders.return_requests WHERE buyer_id = ANY($1)`, [users]);
  await admin.query(`DELETE FROM escrow.disputes WHERE order_id IN (SELECT id FROM orders.orders WHERE buyer_id = ANY($1))`, [users]);
  const { rows: batchRows } = await admin.query<{ batch_id: string }>(
    `SELECT DISTINCT batch_id FROM finance.payout_requests WHERE seller_id = ANY($1) AND batch_id IS NOT NULL`,
    [users],
  );
  const batchIds = batchRows.map((r) => r.batch_id);
  if (batchIds.length > 0) {
    await admin.query(`DELETE FROM escrow.settlement_lines WHERE batch_id = ANY($1)`, [batchIds]);
  }
  await admin.query(`DELETE FROM finance.payout_requests WHERE seller_id = ANY($1)`, [users]);
  if (batchIds.length > 0) {
    await admin.query(`DELETE FROM escrow.settlement_batches WHERE id = ANY($1)`, [batchIds]);
  }
  await admin.query(`DELETE FROM finance.seller_bank_accounts WHERE user_id = ANY($1)`, [users]);

  for (const r of created) {
    if (!r.escrow_id) continue;
    await admin.query(`DELETE FROM escrow.ledger_entries WHERE escrow_order_id = $1`, [r.escrow_id]);
    await admin.query(`DELETE FROM escrow.escrow_orders WHERE id = $1`, [r.escrow_id]);
  }
  for (const r of created) {
    if (!r.order_id) continue;
    await admin.query(`DELETE FROM orders.order_lines WHERE order_id = $1`, [r.order_id]);
    await admin.query(`DELETE FROM orders.stock_holds WHERE order_id = $1`, [r.order_id]);
    await admin.query(`DELETE FROM orders.orders WHERE id = $1`, [r.order_id]);
  }
  await admin.query(`DELETE FROM catalog.offers WHERE id = $1`, [offerId]);
  await admin.query(`DELETE FROM catalog.lots WHERE id = $1`, [lotId]);
  await admin.query(`DELETE FROM catalog.clusters WHERE id = $1`, [clusterId]);
  await admin.query(`DELETE FROM pii.seller_kyc WHERE user_id = ANY($1)`, [users]);
  await admin.query(`DELETE FROM pii.user_roles WHERE user_id = ANY($1)`, [users]);
  await admin.query(`DELETE FROM trust.seller_risk_tiers WHERE seller_id = ANY($1)`, [users]);
  await admin.query(`DELETE FROM catalog.seller_profiles WHERE user_id = ANY($1)`, [users]);
  await admin.query(`DELETE FROM users.notifications WHERE user_id = ANY($1)`, [users]);
  await admin.query(`DELETE FROM users.push_subscriptions WHERE user_id = ANY($1)`, [users]);
  await admin.query(`DELETE FROM users.push_notifications WHERE user_id = ANY($1)`, [users]);
  await admin.query(`DELETE FROM pii.users WHERE id = ANY($1)`, [users]);
  created.length = 0;
  resources = null;
}

describe('Notification wiring (integration — requires postgres)', () => {
  it('notify writes a feed row and a push-log row', async () => {
    const r = await seedResources();
    await notify.notify(r.sellerId, {
      type: 'order',
      title: 'Direct test',
      body: 'body',
      deep_link: '/payouts',
    });

    const { rows } = await app.query<{ title: string; body: string; deep_link: string }>(
      `SELECT title, body, deep_link FROM users.notifications WHERE user_id = $1`,
      [r.sellerId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Direct test');
    expect(rows[0].deep_link).toBe('/payouts');

    const push = await pushBodies(r.sellerId);
    expect(push).toContain('body');
  });

  it('notifyRoles fans out to OPS and AGENT users', async () => {
    const r = await seedResources();
    await notify.notifyRoles(['OPS', 'AGENT'], {
      type: 'order',
      title: 'Role alert',
      body: 'For the console',
      deep_link: '/ops-console',
    });

    expect(await feedTitles(r.opsUserId)).toContain('Role alert');
    expect(await feedTitles(r.agentUserId)).toContain('Role alert');
    expect(await feedTitles(r.buyerId)).not.toContain('Role alert');
  });

  it('a buyer creating a return notifies the seller', async () => {
    const r = await seedResources();
    const { order_id, line_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 9000,
    });

    await disputes.createReturn(buyerActor(r.buyerId), {
      order_id,
      order_line_id: line_id,
      reason: 'QUALITY',
      qty: 1,
    });

    expect(await feedTitles(r.sellerId)).toContain('New return request');
    expect((await pushBodies(r.sellerId))[0]).toContain('respond before it escalates');
  });

  it('escalation notifies OPS and AGENT console users', async () => {
    const r = await seedResources();
    const { order_id, line_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 9000,
    });

    const ret = await disputes.createReturn(buyerActor(r.buyerId), {
      order_id,
      order_line_id: line_id,
      reason: 'QUALITY',
      qty: 1,
    });
    await disputes.sellerRespond(sellerActor(r.sellerId), { return_id: ret.id, action: 'REJECT' });
    await disputes.escalateReturn(buyerActor(r.buyerId), ret.id);

    expect(await feedTitles(r.opsUserId)).toContain('Return dispute escalated');
    expect(await feedTitles(r.agentUserId)).toContain('Return dispute escalated');
    expect(await feedTitles(r.buyerId)).not.toContain('Return dispute escalated');
  });

  it('OPS mediating a refund notifies the buyer and the seller', async () => {
    const r = await seedResources();
    const { order_id, line_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 9000,
    });

    const ret = await disputes.createReturn(buyerActor(r.buyerId), {
      order_id,
      order_line_id: line_id,
      reason: 'QUALITY',
      qty: 1,
    });
    await disputes.sellerRespond(sellerActor(r.sellerId), { return_id: ret.id, action: 'REJECT' });
    await disputes.escalateReturn(buyerActor(r.buyerId), ret.id);
    await disputes.mediateReturn(opsActor(r.opsUserId), { return_id: ret.id, decision: 'REFUND' });

    expect(await feedTitles(r.buyerId)).toContain('Dispute resolved — refund issued');
    expect(await feedTitles(r.sellerId)).toContain('Refund issued on your order');
  });

  it('KYC approval notifies the applicant', async () => {
    const r = await seedResources();
    await disputes.approveKyc(opsActor(r.opsUserId), r.sellerId, 'APPROVED');

    expect(await feedTitles(r.sellerId)).toContain('KYC approved');
    expect((await pushBodies(r.sellerId))[0]).toContain('approved');
  });

  it('approving a payout request notifies the seller', async () => {
    const r = await seedResources();
    const { order_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'RELEASED',
      seller_payable_cents: 9000,
    });

    const req = await admin.query<{ id: string }>(
      `INSERT INTO finance.payout_requests (seller_id, amount_cents) VALUES ($1, 5000) RETURNING id`,
      [r.sellerId],
    );
    await sellers.approvePayout(opsActor(r.opsUserId), req.rows[0].id as string, 'Checked');

    expect(await feedTitles(r.sellerId)).toContain('Withdrawal approved');
    expect(await feedTitles(r.buyerId)).not.toContain('Withdrawal approved');
    void order_id;
  });

  it('escrow release notifies the seller that the payout landed', async () => {
    const r = await seedResources();
    await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 9000,
      release_scheduled_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const result = await release.releaseDueEscrows();
    expect(result.released).toBeGreaterThanOrEqual(1);

    expect(await feedTitles(r.sellerId)).toContain('Payout released');
    expect((await pushBodies(r.sellerId))[0]).toContain('balance has been topped up');
  });
});