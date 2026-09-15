import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { SellersService } from './sellers.service.js';
import type { NotifyService } from '../notifications/notify.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const notifyStub = {
  notify: async () => {},
  notifyRoles: async () => {},
} as unknown as NotifyService;

/**
 * Phase 3 — payouts end-to-end against the live DB:
 *  - balance = Σ(SELLER_PAYOUT released) − Σ(active withdrawals); on-hold escrow
 *  - bank account CRUD gated on FULL tier (NUBAN validation, primary handling)
 *  - withdrawal request (FULL-tier gate, pending reservation, balance ceiling)
 *  - OPS approve → settlement batch created, settlement_lines linked, money
 *    moves out of "available" once approved
 *  - append-only ledger respected (no UPDATE/DELETE on ledger_entries)
 */

let admin: Pool;
let app: Pool;
let sellers: SellersService;

let resources: {
  sellerFullId: string;
  sellerBasicId: string;
  buyerId: string;
  offerId: string;
  clusterId: string;
  lotId: string;
  opsUserId: string;
  orders: Array<{ order_id?: string; escrow_id?: string }>;
} | null = null;

const created: Array<{ order_id?: string; escrow_id?: string }> = [];

const sellerFullActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000000',
  email: null,
  full_name: 'Payout Seller',
  status: 'ACTIVE',
  seller_type: 'STORE',
  channel: 'WHOLESALE',
  roles: ['SELLER', 'BUYER'],
});

const sellerBasicActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000001',
  email: null,
  full_name: 'Basic Seller',
  status: 'ACTIVE',
  seller_type: 'STORE',
  channel: 'WHOLESALE',
  roles: ['SELLER', 'BUYER'],
});

const opsActor = (id: string): AuthUser => ({
  id,
  phone: '+2348100000002',
  email: null,
  full_name: 'Ops Agent',
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
  sellers = new SellersService(app, notifyStub);
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

  const sellerFull = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, $2, 'STORE', 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`, `Payout Seller ${randomUUID().slice(0, 6)}`],
  );
  const sellerFullId = sellerFull.rows[0].id as string;
  const sellerBasic = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, $2, 'STORE', 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`, `Basic Seller ${randomUUID().slice(0, 6)}`],
  );
  const sellerBasicId = sellerBasic.rows[0].id as string;

  await admin.query(
    `INSERT INTO catalog.seller_profiles (user_id, seller_type, kyc_tier) VALUES ($1, 'STORE', 'FULL')`,
    [sellerFullId],
  );
  await admin.query(
    `INSERT INTO catalog.seller_profiles (user_id, seller_type) VALUES ($1, 'STORE')`,
    [sellerBasicId],
  );

  const buyer = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, 'Test Buyer', NULL, 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`],
  );
  const buyerId = buyer.rows[0].id as string;

  const opsUser = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, 'OPS Reviewer', NULL, 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`],
  );
  const opsUserId = opsUser.rows[0].id as string;

  const cluster = await admin.query<{ id: string }>(
    `INSERT INTO catalog.clusters (name, lga, centroid)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography) RETURNING id`,
    [`Payout Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA'],
  );
  const clusterId = cluster.rows[0].id as string;

  const lot = await admin.query<{ id: string }>(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
    [sellerFullId, `Payout Product ${randomUUID().slice(0, 4)}`, `ref-${randomUUID()}`],
  );
  const lotId = lot.rows[0].id as string;

  const offer = await admin.query<{ id: string }>(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
     VALUES ($1, 'WHOLESALE', $2, 50, 1, 'SHELF_GT_7D', ARRAY['SCHEDULED'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
     RETURNING id`,
    [sellerFullId, lotId, clusterId],
  );
  const offerId = offer.rows[0].id as string;

  resources = { sellerFullId, sellerBasicId, buyerId, offerId, clusterId, lotId, opsUserId, orders: created };
  return resources;
}

/** Unique 10-digit NUBAN number per call to avoid collisions across tests sharing the same seller. */
let acctSeq = 1000000000;
function uniqAcct(): string {
  acctSeq++;
  return String(acctSeq).slice(0, 10);
}

/** Seeds a paid, delivered order with an escrow row in the given status. */
async function seedOrder(
  sellerFullId: string,
  buyerId: string,
  offerId: string,
  opts: { escrowStatus: 'RELEASED' | 'HELD'; seller_payable_cents: number },
): Promise<{ order_id: string; escrow_id: string }> {
  const held = opts.seller_payable_cents;
  const commission = 500;
  const order = await admin.query<{ id: string }>(
    `INSERT INTO orders.orders (buyer_id, channel, status, item_total_cents, delivery_fee_cents, landed_total_cents)
     VALUES ($1, 'WHOLESALE', 'DELIVERED', $2, 0, $2) RETURNING id`,
    [buyerId, held + commission],
  );
  const orderId = order.rows[0].id as string;

  await admin.query(
    `INSERT INTO orders.order_lines (order_id, offer_id, seller_id, qty, unit_price_cents, status, commission_cents, seller_payable_cents)
     VALUES ($1, $2, $3, 1, $4, 'DELIVERED', $5, $6)`,
    [orderId, offerId, sellerFullId, held + commission, commission, held],
  );

  const escrow = await admin.query<{ id: string }>(
    `INSERT INTO escrow.escrow_orders (order_id, status, amount_held_cents)
     VALUES ($1, $2, $3) RETURNING id`,
    [orderId, opts.escrowStatus, held],
  );
  const escrowId = escrow.rows[0].id as string;

  const holder = { order_id: orderId, escrow_id: escrowId };
  created.push(holder);

  if (opts.escrowStatus === 'RELEASED') {
    // Payment in, platform fee, then the net payout to the seller (negative credit).
    await admin.query(
      `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, counterparty_id, idempotency_key)
       VALUES ($1, 'PAYMENT_IN', $2, 'BUYER', $3, $4),
              ($1, 'FEE', $5, 'PLATFORM', NULL, $6),
               ($1, 'SELLER_PAYOUT', $7, 'SELLER', $8, $9)`,
      [escrowId, held + commission, buyerId, `pay:${randomUUID()}`, -commission, `fee:${randomUUID()}`, -held, sellerFullId, `payout:${randomUUID()}`],
    );
  }

  return holder;
}

async function cleanup(): Promise<void> {
  if (!resources) return;
  const { sellerFullId, sellerBasicId, buyerId, offerId, clusterId, lotId, opsUserId } = resources;

  // Payout artifacts: settlement_lines → duties on batches owned by this seller's requests.
  const { rows: batchRows } = await admin.query<{ batch_id: string }>(
    `SELECT batch_id FROM finance.payout_requests WHERE seller_id = $1 AND batch_id IS NOT NULL`,
    [sellerFullId],
  );
  const batchIds = batchRows.map((r) => r.batch_id);
  if (batchIds.length > 0) {
    await admin.query(`DELETE FROM escrow.settlement_lines WHERE batch_id = ANY($1)`, [batchIds]);
  }
  await admin.query(`DELETE FROM finance.payout_requests WHERE seller_id = ANY($1)`, [[sellerFullId]]);
  if (batchIds.length > 0) {
    await admin.query(`DELETE FROM escrow.settlement_batches WHERE id = ANY($1)`, [batchIds]);
  }
  await admin.query(`DELETE FROM finance.seller_bank_accounts WHERE user_id = ANY($1)`, [[sellerFullId]]);

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
  await admin.query(`DELETE FROM catalog.seller_profiles WHERE user_id = ANY($1)`, [[sellerFullId, sellerBasicId]]);
  await admin.query(`DELETE FROM pii.users WHERE id = ANY($1)`, [[sellerFullId, sellerBasicId, buyerId, opsUserId]]);
  created.length = 0;
  resources = null;
}

describe('Seller payouts (integration — requires postgres)', () => {
  // eslint-disable-next-line vitest/no-disabled-tests
  it('balance reflects released payout minus active withdrawals, with on-hold escrow separate', async () => {
    const r = await seedResources();
    await seedOrder(r.sellerFullId, r.buyerId, r.offerId, { escrowStatus: 'RELEASED', seller_payable_cents: 9000 });
    await seedOrder(r.sellerFullId, r.buyerId, r.offerId, { escrowStatus: 'HELD', seller_payable_cents: 5000 });

    const balance = await sellers.getPayoutBalance(sellerFullActor(r.sellerFullId));
    expect(balance.available_cents).toBe(9000); // released 9000 − withdrawn 0
    expect(balance.on_hold_cents).toBe(5000);
    expect(balance.withdrawn_cents).toBe(0);
    expect(balance.released_total_cents).toBe(9000);

    const ledger = await sellers.getPayoutLedger(sellerFullActor(r.sellerFullId), { limit: 10, offset: 0 });
    expect(ledger.total).toBe(1);
    expect(ledger.entries[0]).toMatchObject({ entry_type: 'SELLER_PAYOUT', amount_cents: 9000 });
    expect(ledger.entries[0].order_id).toBeTruthy();
  });

  it('bank account CRUD: FULL-tier gate, NUBAN validation, primary handling', async () => {
    const r = await seedResources();
    const firstAcct = uniqAcct();

    // BASIC tier cannot add a payout account.
    await expect(
      sellers.addBankAccount(sellerBasicActor(r.sellerBasicId), {
        bank_code: '058',
        bank_name: 'GTBank',
        account_number: '0123456789',
        account_name: 'Payout Seller',
      }),
    ).rejects.toThrow('Verify your identity');

    // Validation: non-10-digit NUBAN rejected.
    await expect(
      sellers.addBankAccount(sellerFullActor(r.sellerFullId), {
        bank_code: '058',
        bank_name: 'GTBank',
        account_number: '123',
        account_name: 'Payout Seller',
      }),
    ).rejects.toThrow('10-digit');

    const first = await sellers.addBankAccount(sellerFullActor(r.sellerFullId), {
      bank_code: '058',
      bank_name: 'GTBank',
      account_number: firstAcct,
      account_name: 'Payout Seller',
    });
    expect(first.is_primary).toBe(true);

    // Duplicate account for the same user is rejected (unique constraint).
    await expect(
      sellers.addBankAccount(sellerFullActor(r.sellerFullId), {
        bank_code: '058',
        bank_name: 'GTBank',
        account_number: firstAcct,
        account_name: 'Payout Seller',
      }),
    ).rejects.toThrow('already on file');

    const second = await sellers.addBankAccount(sellerFullActor(r.sellerFullId), {
      bank_code: '011',
      bank_name: 'First Bank',
      account_number: uniqAcct(),
      account_name: 'Second Account',
    });
    expect(second.is_primary).toBe(false);

    const listed = await sellers.listBankAccounts(sellerFullActor(r.sellerFullId));
    expect(listed).toHaveLength(2);

    await sellers.setPrimaryBankAccount(sellerFullActor(r.sellerFullId), second.id);
    const after = await sellers.listBankAccounts(sellerFullActor(r.sellerFullId));
    expect(after.find((a) => a.id === second.id)?.is_primary).toBe(true);
    expect(after.find((a) => a.id === first.id)?.is_primary).toBe(false);

    await sellers.deleteBankAccount(sellerFullActor(r.sellerFullId), first.id);
    const remaining = await sellers.listBankAccounts(sellerFullActor(r.sellerFullId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].is_primary).toBe(true);
  });

  it('withdrawal request: FULL-tier gate, pending reservation, balance ceiling', async () => {
    const r = await seedResources();
    await seedOrder(r.sellerFullId, r.buyerId, r.offerId, { escrowStatus: 'RELEASED', seller_payable_cents: 9000 });
    const account = await sellers.addBankAccount(sellerFullActor(r.sellerFullId), {
      bank_code: '058',
      bank_name: 'GTBank',
      account_number: '0123456789',
      account_name: 'Payout Seller',
    });

    // BASIC tier is blocked from requesting a withdrawal.
    await expect(
      sellers.requestPayout(sellerBasicActor(r.sellerBasicId), { amount_cents: 1000, bank_account_id: account.id }),
    ).rejects.toThrow('Verify your identity');

    // Unknown bank account is rejected.
    await expect(
      sellers.requestPayout(sellerFullActor(r.sellerFullId), { amount_cents: 1000, bank_account_id: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow('Choose one of your bank accounts');

    // Over-balance request (including the pending reservation) is rejected.
    await expect(
      sellers.requestPayout(sellerFullActor(r.sellerFullId), { amount_cents: 20000, bank_account_id: account.id }),
    ).rejects.toThrow('Insufficient available balance');

    // Valid request: 4000 of the 9000 available.
    const req = await sellers.requestPayout(sellerFullActor(r.sellerFullId), {
      amount_cents: 4000,
      bank_account_id: account.id,
    });
    expect(req.status).toBe('PENDING');
    expect(req.bank_account?.account_number).toBe('0123456789');

    // Pending reservation: a second request for the rest must respect it.
    await expect(
      sellers.requestPayout(sellerFullActor(r.sellerFullId), { amount_cents: 6000, bank_account_id: account.id }),
    ).rejects.toThrow('Insufficient available balance');

    const balance = await sellers.getPayoutBalance(sellerFullActor(r.sellerFullId));
    expect(balance.pending_cents).toBe(4000);
    expect(balance.available_cents).toBe(9000); // pending reserved but not withdrawn yet
  });

  it('OPS approve creates a settlement batch and settlement_lines; seller cannot approve', async () => {
    const r = await seedResources();
    await seedOrder(r.sellerFullId, r.buyerId, r.offerId, { escrowStatus: 'RELEASED', seller_payable_cents: 9000 });
    const account = await sellers.addBankAccount(sellerFullActor(r.sellerFullId), {
      bank_code: '058',
      bank_name: 'GTBank',
      account_number: '0123456789',
      account_name: 'Payout Seller',
    });
    const req = await sellers.requestPayout(sellerFullActor(r.sellerFullId), {
      amount_cents: 4000,
      bank_account_id: account.id,
    });

    // A regular seller (or another non-privileged user) cannot approve.
    await expect(sellers.approvePayout(sellerFullActor(r.sellerFullId), req.id)).rejects.toThrow('Only OPS/AGENT');

    // Approve as OPS.
    const approved = await sellers.approvePayout(opsActor(r.opsUserId), req.id, 'Checked');
    expect(approved).toMatchObject({ ok: true, request_id: req.id, status: 'APPROVED' });
    expect(approved.batch_id).toBeTruthy();

    // A settlement batch row was created for the approved amount.
    const batch = await app.query<{ status: string; total_cents: string }>(
      `SELECT status, total_cents FROM escrow.settlement_batches WHERE id = $1`,
      [approved.batch_id],
    );
    expect(batch.rows[0]).toMatchObject({ status: 'SUBMITTED', total_cents: '4000' });

    // The released ledger entry is linked via settlement_lines (no ledger UPDATE).
    const lines = await app.query<{ ledger_entry_id: string; amount_cents: string; status: string }>(
      `SELECT ledger_entry_id, amount_cents, status FROM escrow.settlement_lines WHERE batch_id = $1`,
      [approved.batch_id],
    );
    expect(lines.rows).toHaveLength(1);
    expect(Number(lines.rows[0].amount_cents)).toBe(4000);
    expect(lines.rows[0].status).toBe('PENDING');

    // Approving an already-approved request is rejected.
    await expect(sellers.approvePayout(opsActor(r.opsUserId), req.id)).rejects.toThrow(
      'Only a pending payout request can be approved',
    );

    // Once approved, the money leaves "available" and lands in withdrawn.
    const balance = await sellers.getPayoutBalance(sellerFullActor(r.sellerFullId));
    expect(balance.available_cents).toBe(5000);
    expect(balance.withdrawn_cents).toBe(4000);
    expect(balance.pending_cents).toBe(0);
  });

  it('request list respects ownership; OPS can list all', async () => {
    const r = await seedResources();
    await seedOrder(r.sellerFullId, r.buyerId, r.offerId, { escrowStatus: 'RELEASED', seller_payable_cents: 9000 });
    const account = await sellers.addBankAccount(sellerFullActor(r.sellerFullId), {
      bank_code: '058',
      bank_name: 'GTBank',
      account_number: '0123456789',
      account_name: 'Payout Seller',
    });
    const createdReq = await sellers.requestPayout(sellerFullActor(r.sellerFullId), { amount_cents: 9000, bank_account_id: account.id });

    // Own list includes the request.
    const own = await sellers.listPayoutRequests(sellerFullActor(r.sellerFullId), {});
    expect(own.total).toBe(1);
    expect(own.requests[0].amount_cents).toBe(9000);

    // OPS all-list includes it; a non-privileged seller is denied.
    const all = await sellers.listPayoutRequests(opsActor(r.opsUserId), { all: true });
    expect(all.total).toBeGreaterThanOrEqual(1);
    expect(all.requests.some((x) => x.id === createdReq.id)).toBe(true);
    await expect(sellers.listPayoutRequests(sellerFullActor(r.sellerFullId), { all: true })).rejects.toThrow(
      'Only OPS/AGENT',
    );

    // Status filter narrows the queue.
    const pending = await sellers.listPayoutRequests(opsActor('00000000-0000-0000-0000-000000000000'), {
      all: true,
      status: 'PENDING',
    });
    expect(pending.total).toBeGreaterThanOrEqual(1);
    expect(pending.requests.some((x) => x.id === createdReq.id && x.status === 'PENDING')).toBe(true);
    const approved = await sellers.listPayoutRequests(opsActor('00000000-0000-0000-0000-000000000000'), {
      all: true,
      status: 'SENT',
    });
    expect(approved.total).toBe(0);
  });
});