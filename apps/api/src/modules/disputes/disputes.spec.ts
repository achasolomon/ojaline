import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { OutboxService } from '../outbox/outbox.service.js';
import { DisputesService } from './disputes.service.js';
import type { AuthUser } from '../auth/auth.service.js';

/**
 * Phase 4 — returns & disputes end-to-end against the live DB:
 *  - buyer raises a return on a DELIVERED line → escrow not yet touched
 *  - seller ACCEPT → REFUND ledger entry (HELD escrow deducted)
 *  - seller REJECT → buyer escalates → OPS mediates (REFUND or DISMISS)
 *  - refund after escrow was RELEASED → MANUAL_ADJUSTMENT clawback, and the
 *    seller's available payout balance is debited
 *  - OPS console: KYC queue + approve/reject, risk tier override + recompute,
 *    platform stats
 *  - analytics: seller stats
 */

let admin: Pool;
let app: Pool;
let disputes: DisputesService;

let resources: {
  sellerId: string;
  buyerId: string;
  opsUserId: string;
  offerId: string;
  clusterId: string;
  lotId: string;
  orders: Array<{ order_id?: string; escrow_id?: string }>;
} | null = null;

const created: Array<{ order_id?: string; escrow_id?: string }> = [];

const sellerActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000010',
  email: null,
  full_name: 'Return Seller',
  status: 'ACTIVE',
  seller_type: 'STORE',
  channel: 'WHOLESALE',
  roles: ['SELLER', 'BUYER'],
});

const buyerActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000011',
  email: null,
  full_name: 'Return Buyer',
  status: 'ACTIVE',
  seller_type: null,
  channel: 'WHOLESALE',
  roles: ['BUYER'],
});

const opsActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000012',
  email: null,
  full_name: 'Ops Mediator',
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
  disputes = new DisputesService(app, new OutboxService());
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

  const seller = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, $2, 'STORE', 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`, `Return Seller ${randomUUID().slice(0, 6)}`],
  );
  const sellerId = seller.rows[0].id as string;

  await admin.query(
    `INSERT INTO catalog.seller_profiles (user_id, seller_type, kyc_tier) VALUES ($1, 'STORE', 'FULL')`,
    [sellerId],
  );
  await admin.query(
    `INSERT INTO pii.seller_kyc (user_id, id_type, id_number, date_of_birth, address_line1, city, state)
     VALUES ($1, 'NIN', $2, '1990-01-01', '1 Test St', 'Lagos', 'Lagos')`,
    [sellerId, `NIN-${randomUUID().slice(0, 8)}`],
  );

  const buyer = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, 'Return Buyer', NULL, 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`],
  );
  const buyerId = buyer.rows[0].id as string;

  const opsUser = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, 'Ops Mediator', NULL, 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`],
  );
  const opsUserId = opsUser.rows[0].id as string;

  const cluster = await admin.query<{ id: string }>(
    `INSERT INTO catalog.clusters (name, lga, centroid)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography) RETURNING id`,
    [`Return Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA'],
  );
  const clusterId = cluster.rows[0].id as string;

  const lot = await admin.query<{ id: string }>(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
    [sellerId, `Return Product ${randomUUID().slice(0, 4)}`, `ref-${randomUUID()}`],
  );
  const lotId = lot.rows[0].id as string;

  const offer = await admin.query<{ id: string }>(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
     VALUES ($1, 'WHOLESALE', $2, 50, 1, 'SHELF_GT_7D', ARRAY['SCHEDULED'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
     RETURNING id`,
    [sellerId, lotId, clusterId],
  );
  const offerId = offer.rows[0].id as string;

  resources = { sellerId, buyerId, opsUserId, offerId, clusterId, lotId, orders: created };
  return resources;
}

/** Seeds a paid, delivered, single-line order with escrow in the given status. */
async function seedOrder(
  sellerId: string,
  buyerId: string,
  offerId: string,
  opts: { escrowStatus: 'RELEASED' | 'HELD'; seller_payable_cents: number; delivered?: boolean },
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
     VALUES ($1, $2, $3, 1, $4, $5, $6, $7) RETURNING id`,
    [orderId, offerId, sellerId, held + commission, opts.delivered === false ? 'PAID' : 'DELIVERED', commission, held],
  );
  const lineId = line.rows[0].id as string;

  const escrow = await admin.query<{ id: string }>(
    `INSERT INTO escrow.escrow_orders (order_id, status, amount_held_cents)
     VALUES ($1, $2, $3) RETURNING id`,
    [orderId, opts.escrowStatus, held],
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

  return holder as { order_id: string; escrow_id: string; line_id: string };
}

async function cleanup(): Promise<void> {
  if (!resources) return;
  const { sellerId, buyerId, offerId, clusterId, lotId, opsUserId } = resources;

  await admin.query(`DELETE FROM orders.return_requests WHERE buyer_id = $1 OR seller_id = $1`, [buyerId]);
  await admin.query(`DELETE FROM orders.return_requests WHERE buyer_id = $1`, [sellerId]);
  await admin.query(`DELETE FROM escrow.disputes WHERE order_id IN (SELECT id FROM orders.orders WHERE buyer_id = ANY($1))`, [[buyerId, sellerId]]);

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
  await admin.query(`DELETE FROM pii.seller_kyc WHERE user_id = $1`, [sellerId]);
  await admin.query(`DELETE FROM trust.seller_risk_tiers WHERE seller_id = $1`, [sellerId]);
  await admin.query(`DELETE FROM catalog.seller_profiles WHERE user_id = ANY($1)`, [[sellerId, buyerId]]);
  await admin.query(`DELETE FROM pii.users WHERE id = ANY($1)`, [[sellerId, buyerId, opsUserId]]);
  created.length = 0;
  resources = null;
}

describe('Returns & disputes (integration — requires postgres)', () => {
  it('buyer creates a return on a DELIVERED line; a second active return is blocked', async () => {
    const r = await seedResources();
    const { order_id, line_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 9000,
    });

    const ret = await disputes.createReturn(buyerActor(r.buyerId), {
      order_id,
      order_line_id: line_id,
      reason: 'QUALITY',
      reason_note: 'Tomatoes arrived bruised',
      qty: 1,
    });
    expect(ret.status).toBe('AWAITING_SELLER');
    expect(ret.seller_id).toBe(r.sellerId);
    expect(ret.product_name).toBeTruthy();

    // A second active return for the same line is blocked.
    await expect(
      disputes.createReturn(buyerActor(r.buyerId), {
        order_id,
        order_line_id: line_id,
        reason: 'QUALITY',
        qty: 1,
      }),
    ).rejects.toThrow('already exists');

    // A non-DELIVERED line is rejected.
    const nonDelivered = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 4000,
      delivered: false,
    });
    await expect(
      disputes.createReturn(buyerActor(r.buyerId), {
        order_id: nonDelivered.order_id,
        order_line_id: nonDelivered.line_id,
        reason: 'QUALITY',
        qty: 1,
      }),
    ).rejects.toThrow('only on DELIVERED');

    // Owner-scoped listing shows the return to the seller.
    const listed = await disputes.listReturns(sellerActor(r.sellerId), {});
    expect(listed.total).toBe(1);
    expect(listed.returns[0].reason).toBe('QUALITY');
  });

  it('seller ACCEPT books a REFUND off the held escrow and marks the line REFUNDED', async () => {
    const r = await seedResources();
    const { order_id, line_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 9000,
    });

    const ret = await disputes.createReturn(buyerActor(r.buyerId), {
      order_id,
      order_line_id: line_id,
      reason: 'WRONG_ITEM',
      qty: 1,
    });

    const out = await disputes.sellerRespond(sellerActor(r.sellerId), {
      return_id: ret.id,
      action: 'ACCEPT',
      note: 'Happy to refund',
    });
    expect(out).toMatchObject({ status: 'RESOLVED_REFUND', refund_cents: 9000 });

    // Escrow was decremented from 9000 → 0 (no clawback on HELD).
    const escrow = await app.query<{ id: string; amount_held_cents: string; status: string }>(
      `SELECT id, amount_held_cents, status FROM escrow.escrow_orders WHERE order_id = $1`,
      [order_id],
    );
    expect(Number(escrow.rows[0].amount_held_cents)).toBe(0);
    expect(escrow.rows[0].status).toBe('HELD');

    // REFUND ledger entry for the buyer.
    const entries = await app.query<{ entry_type: string; amount_cents: string; counterparty_type: string }>(
      `SELECT entry_type, amount_cents, counterparty_type FROM escrow.ledger_entries WHERE escrow_order_id = $1`,
      [escrow.rows[0].id],
    );
    const refund = entries.rows.find((e) => e.entry_type === 'REFUND');
    expect(refund).toBeTruthy();
    expect(Number(refund!.amount_cents)).toBe(-9000);
    expect(refund!.counterparty_type).toBe('BUYER');

    // Line + order statuses.
    const line = await app.query<{ status: string }>(`SELECT status FROM orders.order_lines WHERE id = $1`, [line_id]);
    expect(line.rows[0].status).toBe('REFUNDED');
    const order = await app.query<{ status: string }>(`SELECT status FROM orders.orders WHERE id = $1`, [order_id]);
    expect(order.rows[0].status).toBe('REFUNDED');

    const fetched = await disputes.getReturn(buyerActor(r.buyerId), ret.id);
    expect(fetched.status).toBe('RESOLVED_REFUND');
    expect(fetched.refund_cents).toBe(9000);
  });

  it('seller REJECT then buyer escalates → dispute opened, escrow DISPUTED; OPS mediates a refund', async () => {
    const r = await seedResources();
    const { order_id, line_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 9000,
    });

    const ret = await disputes.createReturn(buyerActor(r.buyerId), {
      order_id,
      order_line_id: line_id,
      reason: 'DAMAGED',
      reason_note: 'Jar cracked in transit',
      qty: 1,
    });

    const rejected = await disputes.sellerRespond(sellerActor(r.sellerId), {
      return_id: ret.id,
      action: 'REJECT',
      note: 'No damage on our end',
    });
    expect(rejected.status).toBe('REJECTED');

    const escalated = await disputes.escalateReturn(buyerActor(r.buyerId), ret.id);
    expect(escalated.status).toBe('ESCALATED');
    expect(escalated.dispute_id).toBeTruthy();

    // Dispute is OPEN and the escrow moved HELD → DISPUTED.
    const dispute = await app.query<{ status: string; type: string; opened_by: string }>(
      `SELECT status, type, opened_by FROM escrow.disputes WHERE id = $1`,
      [escalated.dispute_id],
    );
    expect(dispute.rows[0]).toMatchObject({ status: 'OPEN', type: 'QUALITY', opened_by: 'BUYER' });
    const escrow = await app.query<{ status: string }>(
      `SELECT status FROM escrow.escrow_orders WHERE order_id = $1`,
      [order_id],
    );
    expect(escrow.rows[0].status).toBe('DISPUTED');

    // Only OPS can mediate.
    await expect(
      disputes.mediateReturn(sellerActor(r.sellerId), { return_id: ret.id, decision: 'REFUND' }),
    ).rejects.toThrow('Only OPS/AGENT');

    const mediated = await disputes.mediateReturn(opsActor(r.opsUserId), {
      return_id: ret.id,
      decision: 'REFUND',
      note: 'OPS rules buyer wins',
    });
    expect(mediated).toMatchObject({ status: 'RESOLVED_REFUND', refund_cents: 9000 });

    // Dispute closed as RESOLVED_BUYER; escrow restored to HELD.
    const after = await app.query<{ status: string }>(
      `SELECT status FROM escrow.disputes WHERE id = $1`,
      [escalated.dispute_id],
    );
    expect(after.rows[0].status).toBe('RESOLVED_BUYER');
    const escrowAfter = await app.query<{ status: string; amount_held_cents: string }>(
      `SELECT status, amount_held_cents FROM escrow.escrow_orders WHERE order_id = $1`,
      [order_id],
    );
    expect(escrowAfter.rows[0].status).toBe('HELD');
    expect(Number(escrowAfter.rows[0].amount_held_cents)).toBe(0);
  });

  it('refund after RELEASED escrow writes a MANUAL_ADJUSTMENT clawback and debits the seller balance', async () => {
    const r = await seedResources();
    const { order_id, line_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'RELEASED',
      seller_payable_cents: 9000,
    });

    const ret = await disputes.createReturn(buyerActor(r.buyerId), {
      order_id,
      order_line_id: line_id,
      reason: 'MISSING',
      reason_note: 'Only got 3kg instead of 4kg',
      qty: 1,
    });

    const before = await disputes.getSellerStats(sellerActor(r.sellerId));
    expect(before.revenue_cents).toBe(9000);

    const out = await disputes.sellerRespond(sellerActor(r.sellerId), {
      return_id: ret.id,
      action: 'ACCEPT',
    });
    expect(out.refund_cents).toBe(9000);

    // Clawback as MANUAL_ADJUSTMENT + SELLER, refund as REFUND + BUYER.
    const entries = await app.query<{ entry_type: string; amount_cents: string; counterparty_type: string }>(
      `SELECT entry_type, amount_cents, counterparty_type
       FROM escrow.ledger_entries
       WHERE idempotency_key LIKE 'return%' OR idempotency_key LIKE 'return-clawback%'`,
    );
    const refund = entries.rows.find((e) => e.entry_type === 'REFUND');
    const clawback = entries.rows.find((e) => e.entry_type === 'MANUAL_ADJUSTMENT');
    expect(refund).toBeTruthy();
    expect(Number(refund!.amount_cents)).toBe(-9000);
    expect(clawback).toBeTruthy();
    expect(Number(clawback!.amount_cents)).toBe(9000);
    expect(clawback!.counterparty_type).toBe('SELLER');

    // Seller stats (revenue counts releases, clawbacks not counted as revenue).
    const after = await disputes.getSellerStats(sellerActor(r.sellerId));
    expect(after.revenue_cents).toBe(9000);
  });

  it('OPS console: KYC queue lists PENDING, approve moves it to APPROVED; risk override + recompute', async () => {
    const r = await seedResources();

    const queue = await disputes.listKycQueue(opsActor(r.opsUserId), {});
    expect(queue.total).toBeGreaterThanOrEqual(1);
    expect(queue.kyc.map((k) => k.user_id)).toContain(r.sellerId);

    // A regular buyer cannot access the OPS console.
    await expect(disputes.listKycQueue(buyerActor(r.buyerId), {})).rejects.toThrow('Only OPS/AGENT');

    const approved = await disputes.approveKyc(opsActor(r.opsUserId), r.sellerId, 'APPROVED');
    expect(approved).toMatchObject({ user_id: r.sellerId, status: 'APPROVED' });

    // Approving again fails (no longer PENDING).
    await expect(
      disputes.approveKyc(opsActor(r.opsUserId), r.sellerId, 'APPROVED'),
    ).rejects.toThrow('No pending KYC');

    // Risk tier override.
    const risk = await disputes.setSellerRisk(opsActor(r.opsUserId), {
      seller_id: r.sellerId,
      tier: 'ELEVATED',
      ops_override: true,
    });
    expect(risk).toMatchObject({ user_id: r.sellerId, tier: 'ELEVATED', ops_override: true });

    const listed = await disputes.listSellerRisk(opsActor(r.opsUserId), {});
    expect(listed.sellers.map((s) => s.user_id)).toContain(r.sellerId);

    // Recompute respects the ops_override (stays ELEVATED).
    const recompute = await disputes.recomputeRiskTiers(opsActor(r.opsUserId));
    expect(recompute.updated).toBeGreaterThanOrEqual(1);
    const after = await app.query<{ tier: string }>(
      `SELECT tier FROM trust.seller_risk_tiers WHERE seller_id = $1`,
      [r.sellerId],
    );
    expect(after.rows[0].tier).toBe('ELEVATED');
  });

  it('OPS can dismiss a return and restore escrow', async () => {
    const r = await seedResources();
    const { order_id, line_id } = await seedOrder(r.sellerId, r.buyerId, r.offerId, {
      escrowStatus: 'HELD',
      seller_payable_cents: 9000,
    });

    const ret = await disputes.createReturn(buyerActor(r.buyerId), {
      order_id,
      order_line_id: line_id,
      reason: 'OTHER',
      reason_note: 'Changed my mind',
      qty: 1,
    });
    await disputes.sellerRespond(sellerActor(r.sellerId), { return_id: ret.id, action: 'REJECT' });
    await disputes.escalateReturn(buyerActor(r.buyerId), ret.id);

    const dismissed = await disputes.mediateReturn(opsActor(r.opsUserId), {
      return_id: ret.id,
      decision: 'DISMISS',
      note: 'Buyer claim unfounded',
    });
    expect(dismissed.status).toBe('DISMISSED');

    // Escrow restored HELD with its full balance (no refund).
    const escrow = await app.query<{ status: string; amount_held_cents: string }>(
      `SELECT status, amount_held_cents FROM escrow.escrow_orders WHERE order_id = $1`,
      [order_id],
    );
    expect(escrow.rows[0].status).toBe('HELD');
    expect(Number(escrow.rows[0].amount_held_cents)).toBe(9000);

    const disp = await app.query<{ status: string }>(
      `SELECT status FROM escrow.disputes WHERE return_request_id = $1`,
      [ret.id],
    );
    expect(disp.rows[0].status).toBe('DISMISSED');
  });

  it('analytics: OPS platform stats and 30-day return counting', async () => {
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

    const stats = await disputes.getPlatformStats(opsActor(r.opsUserId));
    expect(stats.sellers_total).toBeGreaterThanOrEqual(1);
    expect(stats.orders_total).toBeGreaterThanOrEqual(1);
    expect(stats.returns_30d).toBeGreaterThanOrEqual(1);
    expect(stats.pending_kyc).toBeGreaterThanOrEqual(0);
    expect(stats.open_disputes).toBe(0);

    // Non-privileged cannot view platform stats.
    await expect(disputes.getPlatformStats(buyerActor(r.buyerId))).rejects.toThrow('Only OPS/AGENT');
  });
});