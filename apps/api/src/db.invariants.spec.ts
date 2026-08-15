import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';

let admin: Pool;
let app: Pool;
let sellerId: string;
let buyerId: string;
let clusterId: string;
let lotId: string;

async function insertUser(pool: Pool): Promise<string> {
  const r = await pool.query(
    `INSERT INTO pii.users (phone, full_name) VALUES ($1, $2) RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, 'Invariant Tester'],
  );
  return r.rows[0].id as string;
}

async function insertCluster(pool: Pool): Promise<string> {
  const r = await pool.query(
    `INSERT INTO catalog.clusters (name, lga, centroid) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography) RETURNING id`,
    ['Invariant Cluster', 'Test LGA', 8.5, 6.0],
  );
  return r.rows[0].id as string;
}

async function insertLot(pool: Pool, ownerId: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
    [ownerId, 'Test Product', `ref-${randomUUID()}`],
  );
  return r.rows[0].id as string;
}

async function insertOffer(
  pool: Pool,
  ownerId: string,
  lot: string,
  cluster: string,
  available: number,
  reserved: number,
  softHeld: number,
): Promise<string> {
  const r = await pool.query(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, reserved_qty, soft_held_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id, status)
     VALUES ($1, 'RETAILER', $2, $3, $4, $5, 1, 'SHELF_GT_7D', ARRAY['PICKUP'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $6, 'ACTIVE')
     RETURNING id`,
    [ownerId, lot, available, reserved, softHeld, cluster],
  );
  return r.rows[0].id as string;
}

async function insertOrder(pool: Pool, buyer: string, itemTotal: number, deliveryFee: number, landedTotal?: number): Promise<string> {
  const r = await pool.query(
    `INSERT INTO orders.orders (buyer_id, channel, status, item_total_cents, delivery_fee_cents, landed_total_cents)
     VALUES ($1, 'RETAILER', 'CHECKOUT', $2, $3, $4) RETURNING id`,
    [buyer, itemTotal, deliveryFee, landedTotal ?? itemTotal + deliveryFee],
  );
  return r.rows[0].id as string;
}

async function insertEscrow(pool: Pool, order: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO escrow.escrow_orders (order_id, status, amount_held_cents) VALUES ($1, 'HELD', 0) RETURNING id`,
    [order],
  );
  return r.rows[0].id as string;
}

async function insertLedgerEntry(
  pool: Pool,
  escrow: string,
  entryType: string,
  amount: number,
  counterparty: string,
): Promise<string> {
  const r = await pool.query(
    `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, idempotency_key)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [escrow, entryType, amount, counterparty, randomUUID()],
  );
  return r.rows[0].id as string;
}

describe('DB invariants (integration — requires docker compose stack)', () => {
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
    sellerId = await insertUser(admin);
    buyerId = await insertUser(admin);
    clusterId = await insertCluster(admin);
    lotId = await insertLot(admin, sellerId);
  });

  afterAll(async () => {
    await admin.end();
    await app.end();
  });

  describe('offers CHECK — reserved + soft_held <= available', () => {
    it('rejects an INSERT that exceeds sellable budget at creation', async () => {
      await expect(
        insertOffer(admin, sellerId, lotId, clusterId, 5, 6, 0),
      ).rejects.toThrow(/check constraint/);
    });

    it('rejects an UPDATE that pushes soft_held over available', async () => {
      const offerId = await insertOffer(admin, sellerId, lotId, clusterId, 5, 0, 0);
      await expect(
        admin.query(
          `UPDATE catalog.offers SET soft_held_qty = 6, updated_at = now() WHERE id = $1`,
          [offerId],
        ),
      ).rejects.toThrow(/check constraint/);
    });

    it('allows a write that respects the invariant', async () => {
      const offerId = await insertOffer(admin, sellerId, lotId, clusterId, 5, 3, 2);
      expect(offerId).toBeTruthy();
    });
  });

  describe('orders CHECK — landed_total = item_total + delivery_fee', () => {
    it('rejects a mismatched landed_total', async () => {
      await expect(insertOrder(admin, buyerId, 5000, 1000, 7000)).rejects.toThrow(/check constraint/);
    });

    it('accepts a balanced landed_total', async () => {
      const orderId = await insertOrder(admin, buyerId, 5000, 1000);
      expect(orderId).toBeTruthy();
    });
  });

  describe('escrow ledger — running balance trigger', () => {
    it('assigns sequence_no and running_balance from prior entries', async () => {
      const orderId = await insertOrder(admin, buyerId, 5000, 0);
      const escrowId = await insertEscrow(admin, orderId);
      await insertLedgerEntry(admin, escrowId, 'PAYMENT_IN', 5000, 'BUYER');
      await insertLedgerEntry(admin, escrowId, 'PAYOUT', -3000, 'SELLER');

      const { rows } = await admin.query(
        `SELECT sequence_no, amount_cents, running_balance_cents
         FROM escrow.ledger_entries WHERE escrow_order_id = $1 ORDER BY sequence_no`,
        [escrowId],
      );
      expect(rows).toEqual([
        { sequence_no: 1, amount_cents: '5000', running_balance_cents: '5000' },
        { sequence_no: 2, amount_cents: '-3000', running_balance_cents: '2000' },
      ]);
    });

    it('nets to zero for a released escrow — all funds distributed', async () => {
      const orderId = await insertOrder(admin, buyerId, 5000, 0);
      const escrowId = await insertEscrow(admin, orderId);
      await insertLedgerEntry(admin, escrowId, 'PAYMENT_IN', 5000, 'BUYER');
      await insertLedgerEntry(admin, escrowId, 'PAYOUT', -4000, 'SELLER');
      await insertLedgerEntry(admin, escrowId, 'FEE', -1000, 'PLATFORM');
      await admin.query(`UPDATE escrow.escrow_orders SET status = 'RELEASED' WHERE id = $1`, [escrowId]);

      const { rows } = await admin.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS balance
         FROM escrow.ledger_entries WHERE escrow_order_id = $1`,
        [escrowId],
      );
      expect(rows[0].balance).toBe('0');
    });
  });

  describe('append-only REVOKE — mutation blocked as ojaline_app', () => {
    it('blocks UPDATE/DELETE on escrow.ledger_entries', async () => {
      const orderId = await insertOrder(admin, buyerId, 5000, 0);
      const escrowId = await insertEscrow(admin, orderId);
      const ledgerId = await insertLedgerEntry(admin, escrowId, 'PAYMENT_IN', 5000, 'BUYER');

      await expect(
        app.query(`UPDATE escrow.ledger_entries SET amount_cents = 0 WHERE id = $1`, [ledgerId]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        app.query(`DELETE FROM escrow.ledger_entries WHERE id = $1`, [ledgerId]),
      ).rejects.toThrow(/permission denied/);
    });

    it('blocks UPDATE/DELETE on audit.audit_log', async () => {
      const r = await app.query(
        `INSERT INTO audit.audit_log (actor_type, action, entity_type, entity_id)
         VALUES ('SYSTEM', 'TEST', 'offer', $1) RETURNING id`,
        [randomUUID()],
      );
      const id = r.rows[0].id as string;

      await expect(app.query(`UPDATE audit.audit_log SET action = 'X' WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(app.query(`DELETE FROM audit.audit_log WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
    });

    it('blocks UPDATE/DELETE on trust.agent_actions', async () => {
      const r = await app.query(
        `INSERT INTO trust.agent_actions (agent_id, farmer_id, action, payload)
         VALUES ($1, $2, 'TEST', '{}'::jsonb) RETURNING id`,
        [randomUUID(), randomUUID()],
      );
      const id = r.rows[0].id as string;

      await expect(app.query(`UPDATE trust.agent_actions SET action = 'X' WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(app.query(`DELETE FROM trust.agent_actions WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
    });

    it('blocks UPDATE/DELETE on trust.fraud_signals', async () => {
      const r = await app.query(
        `INSERT INTO trust.fraud_signals (subject_type, subject_id, signal_type, severity, evidence)
         VALUES ('SELLER', $1, 'TEST', 1, '{}'::jsonb) RETURNING id`,
        [randomUUID()],
      );
      const id = r.rows[0].id as string;

      await expect(app.query(`UPDATE trust.fraud_signals SET severity = 2 WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
      await expect(app.query(`DELETE FROM trust.fraud_signals WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
    });

    it('allows status lifecycle on outbox but blocks payload mutation', async () => {
      const r = await app.query(
        `INSERT INTO audit.outbox_events (event_type, schema_version, aggregate_id, payload)
         VALUES ('order.paid', 1, $1, $2::jsonb) RETURNING id`,
        [randomUUID(), JSON.stringify({ amount_cents: 5000 })],
      );
      const id = r.rows[0].id as string;

      await app.query(`UPDATE audit.outbox_events SET status = 'SENT', dispatched_at = now() WHERE id = $1`, [id]);
      await expect(
        app.query(`UPDATE audit.outbox_events SET payload = $2::jsonb WHERE id = $1`, [id, JSON.stringify({ evil: true })]),
      ).rejects.toThrow(/permission denied/);
      await expect(app.query(`DELETE FROM audit.outbox_events WHERE id = $1`, [id])).rejects.toThrow(/permission denied/);
    });
  });

  describe('PII isolation — view layer only', () => {
    it('denies direct reads of pii.users as ojaline_app', async () => {
      await expect(app.query(`SELECT * FROM pii.users WHERE id = $1`, [sellerId])).rejects.toThrow(/permission denied/);
    });

    it('serves users through the app view layer', async () => {
      const { rows } = await app.query(`SELECT id, phone, status FROM app.users WHERE id = $1`, [sellerId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(sellerId);
    });
  });
});
