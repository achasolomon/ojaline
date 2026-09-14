import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { CatalogService } from './catalog.service.js';
import type { MarketFeedService } from '../realtime/market-feed.service.js';

let admin: Pool;
let app: Pool;
let catalog: CatalogService;
const allUserIds: string[] = [];
let clusterId: string;
let offerId: string;
let buyerId: string;

const feedStub = { publishMarket: async () => {} } as unknown as MarketFeedService;

async function insertUser(pool: Pool): Promise<string> {
  const r = await pool.query(
    `INSERT INTO pii.users (phone, full_name, seller_type) VALUES ($1, $2, $3) RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_0000)}`, `Wishlist Test ${randomUUID().slice(0, 6)}`, null],
  );
  allUserIds.push(r.rows[0].id as string);
  return r.rows[0].id as string;
}

async function insertCluster(pool: Pool): Promise<string> {
  const r = await pool.query(
    `INSERT INTO catalog.clusters (name, lga, centroid) VALUES ($1, $2, ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography) RETURNING id`,
    [`Wishlist Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA'],
  );
  return r.rows[0].id as string;
}

async function insertOffer(pool: Pool, owner: string, cluster: string): Promise<string> {
  const lot = await pool.query(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref) VALUES ($1, $2, $3) RETURNING id`,
    [owner, 'Wishlist Test Product', `ref-${randomUUID()}`],
  );
  const r = await pool.query(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
     VALUES ($1, 'WHOLESALE', $2, 10, 1, 'SHELF_GT_7D', ARRAY['PICKUP'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
     RETURNING id`,
    [owner, lot.rows[0].id as string, cluster],
  );
  return r.rows[0].id as string;
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
  catalog = new CatalogService(app, feedStub);

  clusterId = await insertCluster(admin);
  const owner = await insertUser(admin);
  offerId = await insertOffer(admin, owner, clusterId);
  buyerId = await insertUser(admin);
});

beforeEach(async () => {
  if (app) {
    await app.query('DELETE FROM catalog.wishlist_items');
  }
});

afterAll(async () => {
  if (app) {
    await app.query('DELETE FROM catalog.wishlist_items');
  }
  await app.end();
  await admin.query(`DELETE FROM catalog.offers WHERE id = $1`, [offerId]);
  await admin.query(`DELETE FROM catalog.lots WHERE seller_id = ANY($1)`, [allUserIds]);
  await admin.query(`DELETE FROM catalog.clusters WHERE id = $1`, [clusterId]);
  await admin.query(`DELETE FROM pii.users WHERE id = ANY($1)`, [allUserIds]);
  await admin.end();
});

describe('CatalogService wishlist (integration — requires postgres on DB_HOST)', () => {
  it('adds an item and returns it nested with the offer', async () => {
    await catalog.addWishlistItem(buyerId, offerId);
    const list = await catalog.listWishlist(buyerId);
    expect(list).toHaveLength(1);
    const entry = list[0] as Record<string, unknown> & { offer: Record<string, unknown> };
    expect(entry.offer_id).toBe(offerId);
    expect((entry.offer as Record<string, unknown>).id).toBe(offerId);
    expect((entry.offer as Record<string, unknown>).product_name).toBe('Wishlist Test Product');
    expect((entry.offer as Record<string, unknown>).channel).toBe('WHOLESALE');
    expect(entry.wished_at).toBeDefined();
  });

  it('is idempotent — adding the same offer twice keeps a single entry', async () => {
    await catalog.addWishlistItem(buyerId, offerId);
    await catalog.addWishlistItem(buyerId, offerId);
    const list = await catalog.listWishlist(buyerId);
    expect(list).toHaveLength(1);
  });

  it('keeps wishlists scoped per user', async () => {
    const other = await insertUser(admin);
    await catalog.addWishlistItem(buyerId, offerId);
    const otherList = await catalog.listWishlist(other);
    expect(otherList).toHaveLength(0);
  });

  it('removes an item (and tolerates a second remove)', async () => {
    await catalog.addWishlistItem(buyerId, offerId);
    await catalog.removeWishlistItem(buyerId, offerId);
    expect(await catalog.listWishlist(buyerId)).toHaveLength(0);
    await expect(catalog.removeWishlistItem(buyerId, offerId)).resolves.toBeTruthy();
  });

  it('rejects wishlisting a missing offer', async () => {
    await expect(catalog.addWishlistItem(buyerId, randomUUID())).rejects.toThrow(/not found/i);
  });
});