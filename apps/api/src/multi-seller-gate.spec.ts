import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { MultiSellerGate, GateCheckItem } from './modules/fulfilment/multi-seller-gate.js';

let admin: Pool;
let pool: Pool;
let gate: MultiSellerGate;
let clusterA: string;
let clusterB: string;
let seller1: string;
let seller2: string;
let seller3: string;

function mockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, val: string) => { store.set(key, val); return 'OK'; }),
    decrby: vi.fn(async (key: string, n: number) => {
      const cur = parseInt(store.get(key) ?? '0', 10);
      const next = cur - n;
      store.set(key, String(next));
      return next;
    }),
    _store: store,
  } as const;
}

async function insertUser(pool: Pool): Promise<string> {
  const r = await pool.query(
    `INSERT INTO pii.users (phone, full_name) VALUES ($1, $2) RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, 'Gate Test User'],
  );
  return r.rows[0].id as string;
}

async function insertCluster(pool: Pool, name: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO catalog.clusters (name, lga, centroid) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography) RETURNING id`,
    [name, 'Test LGA', 8.5 + Math.random(), 6.0 + Math.random()],
  );
  return r.rows[0].id as string;
}

async function insertLot(pool: Pool, sellerId: string): Promise<string> {
  const r = await pool.query(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
    [sellerId, 'Test Product', `ref-${randomUUID()}`],
  );
  return r.rows[0].id as string;
}

async function insertOffer(pool: Pool, sellerId: string, clusterId: string): Promise<string> {
  const lotId = await insertLot(pool, sellerId);
  const r = await pool.query(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, reserved_qty, soft_held_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id, status)
     VALUES ($1, 'RETAILER', $2, 100, 0, 0, 1, 'SHELF_GT_7D', ARRAY['PICKUP'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3, 'ACTIVE')
     RETURNING id`,
    [sellerId, lotId, clusterId],
  );
  return r.rows[0].id as string;
}

async function insertRiskTier(
  pool: Pool,
  sellerId: string,
  tier: string,
  onTimeRate: number,
  opsOverride: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO trust.seller_risk_tiers (seller_id, tier, on_time_rate_30d, ops_override)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (seller_id) DO UPDATE SET tier = $2, on_time_rate_30d = $3, ops_override = $4`,
    [sellerId, tier, onTimeRate, opsOverride],
  );
}

beforeAll(async () => {
  const config = loadConfig();
  admin = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: 'ojaline',
    password: 'ojaline_dev_pw',
  });
  pool = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
  });

  const redis = mockRedis();
  gate = new MultiSellerGate(pool, redis as never);

  clusterA = await insertCluster(admin, 'Cluster A');
  clusterB = await insertCluster(admin, 'Cluster B');
  seller1 = await insertUser(admin);
  seller2 = await insertUser(admin);
  seller3 = await insertUser(admin);
});

afterAll(async () => {
  await admin.end();
  await pool.end();
});

function makeItem(offerId: string, sellerId: string, clusterId: string, qty = 10): GateCheckItem {
  return { offer_id: offerId, seller_id: sellerId, cluster_id: clusterId, qty };
}

describe('MultiSellerGate — checkGate', () => {
  it('allows a single-seller order', async () => {
    await insertRiskTier(pool, seller1, 'VERIFIED_LOW', 0.96, false);
    const offer = await insertOffer(pool, seller1, clusterA);
    const result = await gate.checkGate([makeItem(offer, seller1, clusterA)]);
    expect(result.allowed).toBe(true);
    expect(result.seller_count).toBe(1);
  });

  it('allows two sellers in the same cluster', async () => {
    await insertRiskTier(pool, seller1, 'VERIFIED_LOW', 0.96, false);
    await insertRiskTier(pool, seller2, 'VERIFIED_LOW', 0.97, false);
    const offer1 = await insertOffer(pool, seller1, clusterA);
    const offer2 = await insertOffer(pool, seller2, clusterA);
    const result = await gate.checkGate([
      makeItem(offer1, seller1, clusterA),
      makeItem(offer2, seller2, clusterA),
    ]);
    expect(result.allowed).toBe(true);
    expect(result.seller_count).toBe(2);
  });

  it('blocks three sellers', async () => {
    await insertRiskTier(pool, seller1, 'VERIFIED_LOW', 0.96, false);
    await insertRiskTier(pool, seller2, 'VERIFIED_LOW', 0.97, false);
    await insertRiskTier(pool, seller3, 'VERIFIED_LOW', 0.98, false);
    const offer1 = await insertOffer(pool, seller1, clusterA);
    const offer2 = await insertOffer(pool, seller2, clusterA);
    const offer3 = await insertOffer(pool, seller3, clusterA);
    const result = await gate.checkGate([
      makeItem(offer1, seller1, clusterA),
      makeItem(offer2, seller2, clusterA),
      makeItem(offer3, seller3, clusterA),
    ]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('too many sellers');
    expect(result.seller_count).toBe(3);
  });

  it('blocks sellers in different clusters', async () => {
    await insertRiskTier(pool, seller1, 'VERIFIED_LOW', 0.96, false);
    await insertRiskTier(pool, seller2, 'VERIFIED_LOW', 0.97, false);
    const offer1 = await insertOffer(pool, seller1, clusterA);
    const offer2 = await insertOffer(pool, seller2, clusterB);
    const result = await gate.checkGate([
      makeItem(offer1, seller1, clusterA),
      makeItem(offer2, seller2, clusterB),
    ]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('same cluster');
    expect(result.clusters.length).toBe(2);
  });

  it('blocks seller with on_time_rate < 0.95 and no Ops override', async () => {
    const offer = await insertOffer(pool, seller1, clusterA);
    await insertRiskTier(pool, seller1, 'VERIFIED_LOW', 0.80, false);
    const result = await gate.checkGate([makeItem(offer, seller1, clusterA)]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('on_time_rate');
  });

  it('allows NEW seller with ops_override = true even with low rate', async () => {
    const offer = await insertOffer(pool, seller1, clusterA);
    await insertRiskTier(pool, seller1, 'NEW', 0.50, true);
    const result = await gate.checkGate([makeItem(offer, seller1, clusterA)]);
    expect(result.allowed).toBe(true);
  });

  it('blocks NEW seller without ops_override', async () => {
    const offer = await insertOffer(pool, seller1, clusterA);
    await insertRiskTier(pool, seller1, 'NEW', 0.50, false);
    const result = await gate.checkGate([makeItem(offer, seller1, clusterA)]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('on_time_rate');
    expect(result.reason).toContain('no Ops override');
  });

  it('blocks seller with no risk tier row at all', async () => {
    const freshSeller = await insertUser(admin);
    const offer = await insertOffer(pool, freshSeller, clusterA);
    const result = await gate.checkGate([makeItem(offer, freshSeller, clusterA)]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no risk tier');
  });

  it('allows seller with on_time_rate >= 0.95', async () => {
    const offer = await insertOffer(pool, seller1, clusterA);
    await insertRiskTier(pool, seller1, 'VERIFIED_LOW', 0.95, false);
    const result = await gate.checkGate([makeItem(offer, seller1, clusterA)]);
    expect(result.allowed).toBe(true);
  });

  it('allows empty cart', async () => {
    const result = await gate.checkGate([]);
    expect(result.allowed).toBe(true);
  });
});

describe('MultiSellerGate — checkCapacity', () => {
  it('returns available capacity for a new window', async () => {
    const result = await gate.checkCapacity(
      clusterA,
      '2026-09-01T08:00:00Z',
      '2026-09-01T12:00:00Z',
      0,
    );
    expect(result.capacity).toBe(100);
    expect(result.booked).toBe(0);
    expect(result.available).toBe(100);
  });

  it('returns correct booked count from DB', async () => {
    await pool.query(
      `INSERT INTO fulfilment.capacity_slots (cluster_id, window_start, window_end, capacity, booked)
       VALUES ($1, $2, $3, 50, 30)
       ON CONFLICT (cluster_id, window_start, window_end) DO UPDATE SET booked = 30`,
      [clusterA, '2026-09-02T08:00:00Z', '2026-09-02T12:00:00Z'],
    );
    const result = await gate.checkCapacity(
      clusterA,
      '2026-09-02T08:00:00Z',
      '2026-09-02T12:00:00Z',
      0,
    );
    expect(result.capacity).toBe(50);
    expect(result.booked).toBe(30);
    expect(result.available).toBe(20);
  });
});
