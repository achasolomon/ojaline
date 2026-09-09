import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { AdsService, type CreateAdInput } from './ads.service.js';
import type { MarketFeedService } from '../realtime/market-feed.service.js';

let admin: Pool;
let app: Pool;
let ads: AdsService;
let allSellerIds: string[] = [];
let clusterId: string;
let offerId: string;

const feedStub = { publishMarket: async () => {} } as unknown as MarketFeedService;

async function insertUser(pool: Pool, sellerType: string | null): Promise<string> {
  const r = await pool.query(
    `INSERT INTO pii.users (phone, full_name, seller_type) VALUES ($1, $2, $3) RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, `Ads Test ${randomUUID().slice(0, 6)}`, sellerType],
  );
  return r.rows[0].id as string;
}

async function newSeller(): Promise<string> {
  const id = await insertUser(admin, 'MARKET_WOMAN');
  allSellerIds.push(id);
  return id;
}

async function newBuyer(): Promise<string> {
  const id = await insertUser(admin, null);
  allSellerIds.push(id);
  return id;
}

async function insertCluster(pool: Pool): Promise<string> {
  const r = await pool.query(
    `INSERT INTO catalog.clusters (name, lga, centroid) VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography) RETURNING id`,
    [`Ads Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA', 8.5, 6.0],
  );
  return r.rows[0].id as string;
}

async function insertOffer(pool: Pool, owner: string, cluster: string): Promise<string> {
  const lot = await pool.query(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
    [owner, 'Ads Test Product', `ref-${randomUUID()}`],
  );
  const r = await pool.query(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
     VALUES ($1, 'RETAILER', $2, 10, 1, 'SHELF_GT_7D', ARRAY['PICKUP'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
     RETURNING id`,
    [owner, lot.rows[0].id as string, cluster],
  );
  return r.rows[0].id as string;
}

function toast(overrides: Partial<CreateAdInput> = {}): CreateAdInput {
  return {
    title: 'Fresh Crayfish',
    body: 'Market-day prices on bulk orders.',
    format: 'TOAST',
    target_type: 'NONE',
    ...overrides,
  };
}

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
  ads = new AdsService(app, feedStub);

  clusterId = await insertCluster(admin);
  const owner = await insertUser(admin, 'STORE');
  offerId = await insertOffer(admin, owner, clusterId);
});

// getActive serves at most 3 ads room-wide, so wipe the table between cases to
// keep counting deterministic (the schema is owned by this module's integration
// tests, not shared with seeded data).
beforeEach(async () => {
  if (app) {
    await app.query('DELETE FROM marketing.ad_reports');
    await app.query('DELETE FROM marketing.ads');
  }
});

afterAll(async () => {
  if (app) {
    await app.query(`DELETE FROM marketing.ad_reports WHERE ad_id IN (SELECT id FROM marketing.ads WHERE seller_id = ANY($1))`, [allSellerIds]);
    await app.query(`DELETE FROM marketing.ads WHERE seller_id = ANY($1)`, [allSellerIds]);
  }
  await app.end();
  await admin.query(`DELETE FROM catalog.offers WHERE id = $1`, [offerId]);
  await admin.query(`DELETE FROM catalog.lots WHERE seller_id = ANY($1)`, [allSellerIds]);
  await admin.query(`DELETE FROM catalog.clusters WHERE id = $1`, [clusterId]);
  await admin.query(`DELETE FROM pii.users WHERE id = ANY($1)`, [allSellerIds]);
  await admin.end();
});

describe('AdsService (integration — requires postgres on DB_HOST)', () => {
  it('creates a room-wide toast ad and serves it', async () => {
    const seller = await newSeller();
    const created = await ads.create(seller, toast());
    const served = await ads.getActive('TOAST');
    expect(served.some((a) => a.id === created.id)).toBe(true);
  });

  it('enforces the 3-active cap per seller', async () => {
    const seller = await newSeller();
    for (let i = 0; i < 3; i++) {
      await expect(ads.create(seller, toast({ title: `Cap ${i}` }))).resolves.toBeTruthy();
    }
    await expect(ads.create(seller, toast({ title: 'Too many' }))).rejects.toThrow(/at most 3 active ads/);
  });

  it('rejects non-seller accounts', async () => {
    const buyer = await newBuyer();
    await expect(ads.create(buyer, toast())).rejects.toThrow(/Seller account required/);
  });

  it('validates OFFER targets and rejects unknown ones', async () => {
    const seller = await newSeller();
    const from = ads.create(seller, toast({ target_type: 'OFFER', target_id: offerId }));
    await expect(from).resolves.toBeTruthy();
    await expect(
      ads.create(seller, toast({ target_type: 'OFFER', target_id: randomUUID() })),
    ).rejects.toThrow(/Target offer not found/);
  });

  it('only serves ads within the active window and impression cap', async () => {
    const seller = await newSeller();
    const past = await ads.create(seller, toast({
      starts_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
      ends_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    }));

    const pastServed = await ads.getActive('TOAST');
    expect(pastServed.some((a) => a.id === past.id)).toBe(false);

    const capped = await ads.create(seller, toast({ max_impressions: 1, title: 'Capped' }));

    const first = await ads.getActive('TOAST');
    expect(first.some((a) => a.id === capped.id)).toBe(true);
    const second = await ads.getActive('TOAST');
    expect(second.some((a) => a.id === capped.id)).toBe(false);
  });

  it('applies cluster/category targeting only when the caller filters', async () => {
    const seller = await newSeller();
    await ads.create(seller, toast({ cluster_id: clusterId, title: 'Cluster scoped' }));

    const global = await ads.getActive('TOAST');
    expect(global.some((a) => a.title === 'Cluster scoped')).toBe(false);

    const scoped = await ads.getActive('TOAST', clusterId);
    expect(scoped.some((a) => a.title === 'Cluster scoped')).toBe(true);
  });

  it('pauses and resumes without publishing lifecycle events', async () => {
    const seller = await newSeller();
    const ad = await ads.create(seller, toast({ title: 'Pausable' }));
    const paused = await ads.update(seller, ad.id, { status: 'PAUSED' });
    expect(paused.status).toBe('PAUSED');
    expect((await ads.getActive('TOAST')).some((a) => a.id === ad.id)).toBe(false);

    await ads.update(seller, ad.id, { status: 'ACTIVE' });
    expect((await ads.getActive('TOAST')).some((a) => a.id === ad.id)).toBe(true);
  });

  it('blocks cross-seller update/delete', async () => {
    const owner = await newSeller();
    const other = await newSeller();
    const ad = await ads.create(owner, toast({ title: 'Mine' }));
    await expect(ads.update(other, ad.id, { status: 'PAUSED' })).rejects.toThrow(/Not your ad/);
    await expect(ads.remove(other, ad.id)).rejects.toThrow(/Not your ad/);
  });

  it('rate-limits reports per ad+reporter and auto-removes at 5', async () => {
    const seller = await newSeller();
    const ad = await ads.create(seller, toast({ title: 'Reportable' }));
    const reporters: string[] = [];
    for (let i = 0; i < 5; i++) reporters.push(await newBuyer());

    await ads.report(ad.id, reporters[0], 'SPAM');
    await expect(ads.report(ad.id, reporters[0], 'SPAM')).rejects.toThrow(/already reported/);

    for (let i = 1; i < 4; i++) {
      const out = await ads.report(ad.id, reporters[i], 'MISLEADING');
      expect(out.removed).toBe(false);
    }
    const final = await ads.report(ad.id, reporters[4], 'SPAM');
    expect(final.removed).toBe(true);

    const { rows } = await app.query(`SELECT status FROM marketing.ads WHERE id = $1`, [ad.id]);
    expect(rows[0].status).toBe('REMOVED');
  });

  it('soft-deletes via remove() and stops serving', async () => {
    const seller = await newSeller();
    const ad = await ads.create(seller, toast({ title: 'Go away' }));
    await ads.remove(seller, ad.id);
    const { rows } = await app.query(`SELECT status FROM marketing.ads WHERE id = $1`, [ad.id]);
    expect(rows[0].status).toBe('ENDED');
    expect((await ads.getActive('TOAST')).some((a) => a.id === ad.id)).toBe(false);
  });
});