import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { CatalogService } from './catalog.service.js';
import { CatalogController } from './catalog.controller.js';
import type { MarketFeedService } from '../realtime/market-feed.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Phase 2 — seller catalogue management + storefront, exercised against the
 * live DB:
 *  - listMyOffers: ownership scoping, status/q filters, sales stats
 *  - updateOffer: edits + price history; cross-seller Forbidden
 *  - setOfferStatus: pause/reactivate/delist and visibility in discoverOffers
 *  - storefront: verified badge (kyc_tier FULL) + active products only
 *  - visibility_penalty: flagged sellers rank last in discoverOffers
 *  - media: attach primary image, discover reflects it, remove clears it
 */

let admin: Pool;
let app: Pool;
let catalog: CatalogService;
let controller: CatalogController;

const createdUserIds: string[] = [];
const createdOfferIds: string[] = [];
const createdLotIds: string[] = [];
const createdClusterIds: string[] = [];
const createdMediaIds: string[] = [];
const createdOrderIds: string[] = [];
const createdLineIds: string[] = [];

const feedStub = { publishMarket: async () => {} } as unknown as MarketFeedService;

const actor = (id: string): AuthUser => ({
  id,
  phone: '+2348000000300',
  email: null,
  full_name: 'Seller Test',
  status: 'ACTIVE',
  seller_type: 'STORE',
  channel: 'WHOLESALE',
  roles: ['SELLER', 'BUYER'],
});

async function insertSeller(profile?: { kyc_tier?: string; business_name?: string }) {
  const r = await admin.query(
    `INSERT INTO pii.users (phone, full_name, seller_type, status)
     VALUES ($1, $2, 'STORE', 'ACTIVE') RETURNING id`,
    [`+23480${String(Math.floor(Math.random() * 1_000_000_000)).slice(0, 10)}`, `Cat Seller ${randomUUID().slice(0, 6)}`],
  );
  const id: string = r.rows[0].id;
  createdUserIds.push(id);
  await admin.query(
    `INSERT INTO catalog.seller_profiles (user_id, seller_type, bio, kyc_tier, business_name)
     VALUES ($1, 'STORE', 'Test store', $2, $3)`,
    [id, profile?.kyc_tier ?? 'BASIC', profile?.business_name ?? null],
  );
  return id;
}

async function insertCluster(): Promise<string> {
  const r = await admin.query(
    `INSERT INTO catalog.clusters (name, lga, centroid)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography) RETURNING id`,
    [`Cat Cluster ${randomUUID().slice(0, 6)}`, 'Test LGA'],
  );
  const id: string = r.rows[0].id;
  createdClusterIds.push(id);
  return id;
}

async function insertOffer(sellerId: string, clusterId: string, opts?: { status?: string; price?: number }): Promise<string> {
  const lot = await admin.query(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref)
     VALUES ($1, $2, $3) RETURNING id`,
    [sellerId, `Cat Product ${randomUUID().slice(0, 6)}`, `cat-ref-${randomUUID()}`],
  );
  const lotId: string = lot.rows[0].id;
  createdLotIds.push(lotId);
  const r = await admin.query(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id, status)
     VALUES ($1, 'OPEN', $2, 100, 1, 'SHELF_GT_7D', ARRAY['INSTANT'], ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography, $3, $4)
     RETURNING id`,
    [sellerId, lotId, clusterId, opts?.status ?? 'ACTIVE'],
  );
  const offerId: string = r.rows[0].id;
  createdOfferIds.push(offerId);
  await admin.query(
    `INSERT INTO catalog.offer_price_history (offer_id, new_price_cents) VALUES ($1, $2)`,
    [offerId, opts?.price ?? 5000],
  );
  return offerId;
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
  controller = new CatalogController(catalog);
});

afterAll(async () => {
  if (admin) {
    await admin.query('DELETE FROM orders.order_lines WHERE id = ANY($1)', [createdLineIds]);
    await admin.query('DELETE FROM orders.orders WHERE id = ANY($1)', [createdOrderIds]);
    await admin.query('DELETE FROM catalog.offer_media WHERE id = ANY($1)', [createdMediaIds]);
    await admin.query('DELETE FROM catalog.offer_price_history WHERE offer_id = ANY($1)', [createdOfferIds]);
    await admin.query('DELETE FROM catalog.offers WHERE id = ANY($1)', [createdOfferIds]);
    await admin.query('DELETE FROM catalog.lots WHERE id = ANY($1)', [createdLotIds]);
    await admin.query('DELETE FROM catalog.seller_profiles WHERE user_id = ANY($1)', [createdUserIds]);
    await admin.query('DELETE FROM pii.users WHERE id = ANY($1)', [createdUserIds]);
    await admin.query('DELETE FROM catalog.clusters WHERE id = ANY($1)', [createdClusterIds]);
  }
  await admin.end();
  await app.end();
});

describe('seller catalogue management (integration — requires postgres on DB_HOST)', () => {
  let sellerA: string;
  let sellerB: string;
  let clusterA: string;
  let clusterB: string;

  beforeAll(async () => {
    sellerA = await insertSeller();
    sellerB = await insertSeller();
    clusterA = await insertCluster();
    clusterB = await insertCluster();
  });

  it('listMyOffers returns only the owner’s offers, with price, stock and sales stats', async () => {
    const offerA1 = await insertOffer(sellerA, clusterA, { price: 4500 });
    const offerA2 = await insertOffer(sellerA, clusterA, { price: 9000 });
    await insertOffer(sellerB, clusterA, { price: 7000 });

    await admin.query(
      `INSERT INTO orders.orders (buyer_id, channel, status, item_total_cents, delivery_fee_cents, landed_total_cents)
       VALUES ((SELECT id FROM pii.users WHERE id = $1), 'OPEN', 'PAID', 450000, 0, 450000) RETURNING id`,
      [sellerA],
    ).then(async (o) => {
      const orderId: string = o.rows[0].id;
      createdOrderIds.push(orderId);
      const line = await admin.query(
        `INSERT INTO orders.order_lines (order_id, offer_id, seller_id, qty, unit_price_cents, status)
         VALUES ($1, $2, $3, 10, 45000, 'DELIVERED') RETURNING id`,
        [orderId, offerA1, sellerA],
      );
      createdLineIds.push(line.rows[0].id as string);
    });

    const page = await catalog.listMyOffers(sellerA, { limit: 100 });
    expect(page.offers as Array<Record<string, unknown>>).toHaveLength(page.total);
    const owned = (page.offers as Array<Record<string, unknown>>).filter((o) => [offerA1, offerA2].includes(String(o.id)));
    expect(owned).toHaveLength(2);
    // never leaks the other seller's offer
    const otherIds = ((await catalog.listMyOffers(sellerB, { limit: 100 })).offers as Array<Record<string, unknown>>).map((o) => String(o.id));
    expect((page.offers as Array<Record<string, unknown>>).map((o) => String(o.id))).not.toContain(otherIds[0]);
    const first = owned.find((o) => String(o.id) === offerA1);
    expect(String(first?.price_cents)).toBe('4500');
    expect(String(first?.sold_qty)).toBe('10');
    expect(String(first?.delivered_qty)).toBe('10');
    expect(first?.status).toBe('ACTIVE');
  });

  it('listMyOffers filters by status and free-text query', async () => {
    const paused = await insertOffer(sellerA, clusterA, { status: 'PAUSED', price: 3000 });
    const active = await insertOffer(sellerA, clusterA, { status: 'ACTIVE', price: 2000 });

    const pausedPage = await catalog.listMyOffers(sellerA, { status: 'PAUSED' });
    const pausedIds = (pausedPage.offers as Array<Record<string, unknown>>).map((o) => String(o.id));
    expect(pausedIds).toContain(paused);
    expect(pausedIds).not.toContain(active);
    expect(pausedPage.total).toBe(pausedPage.offers.length);

    const qPage = await catalog.listMyOffers(sellerA, {
      q: (await admin.query<{ product_name: string }>(`SELECT product_name FROM catalog.lots WHERE id = (SELECT lot_id FROM catalog.offers WHERE id = $1)`, [active])).rows[0].product_name,
    });
    const qIds = (qPage.offers as Array<Record<string, unknown>>).map((o) => String(o.id));
    expect(qIds).toContain(active);
  });

  it('listMyOffers guards cross-seller lookups at the controller (Forbidden)', async () => {
    const target = (await insertSeller()) as string;
    await insertOffer(target, clusterA);
    await expect(controller.listMyOffers(actor(target), target)).resolves.toBeTruthy();
    // requesting another seller's inventory as a buyer/seller without OPS is Forbidden
    await expect(controller.listMyOffers(actor(sellerB), target)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updateOffer edits details and records price history; other sellers are Forbidden', async () => {
    const offer = await insertOffer(sellerA, clusterA, { price: 5000 });
    const res = await catalog.updateOffer(offer, actor(sellerA), {
      product_name: 'Renamed Produce',
      available_qty: 80,
      min_order_qty: 2,
      price_cents: 4800,
      channel: 'WHOLESALE',
    });
    expect(res.updated).toEqual(expect.arrayContaining(['product_name', 'available_qty', 'min_order_qty', 'price_cents']));

    const history = await admin.query(
      `SELECT old_price_cents, new_price_cents FROM catalog.offer_price_history
       WHERE offer_id = $1 ORDER BY changed_at DESC, id DESC LIMIT 1`,
      [offer],
    );
    expect(String(history.rows[0].old_price_cents)).toBe('5000');
    expect(String(history.rows[0].new_price_cents)).toBe('4800');

    const lot = await admin.query(
      `SELECT l.product_name FROM catalog.offers o JOIN catalog.lots l ON l.id = o.lot_id WHERE o.id = $1`,
      [offer],
    );
    expect(lot.rows[0].product_name).toBe('Renamed Produce');

    await expect(catalog.updateOffer(offer, actor(sellerB), { min_order_qty: 5 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('pause/reactivate/delist toggles offer visibility in discoverOffers', async () => {
    const offer = await insertOffer(sellerA, clusterA, { price: 6000 });

    await catalog.setOfferStatus(offer, actor(sellerA), 'pause');
    let page = await catalog.discoverOffers({ cluster_id: clusterA, limit: 100 });
    expect(page.offers.map((o) => String(o.id))).not.toContain(offer);

    await catalog.setOfferStatus(offer, actor(sellerA), 'reactivate');
    page = await catalog.discoverOffers({ cluster_id: clusterA, limit: 100 });
    expect(page.offers.map((o) => String(o.id))).toContain(offer);

    await catalog.setOfferStatus(offer, actor(sellerA), 'delist');
    page = await catalog.discoverOffers({ cluster_id: clusterA, limit: 100 });
    expect(page.offers.map((o) => String(o.id))).not.toContain(offer);

    await expect(catalog.setOfferStatus(offer, actor(sellerA), 'reactivate')).rejects.toThrow(/cannot/i);
    await expect(catalog.setOfferStatus(offer, actor(sellerB), 'reactivate')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('storefront exposes the verified badge and only active products', async () => {
    const verified = await insertSeller({ kyc_tier: 'FULL', business_name: 'Ade Farms' });
    const sf = await catalog.getStorefront(verified);
    expect(sf.verified).toBe(true);
    expect(sf.business_name).toBe('Ade Farms');

    const basic = await insertSeller();
    const basicSf = await catalog.getStorefront(basic);
    expect(basicSf.verified).toBe(false);

    const offer = await insertOffer(verified, clusterB);
    const store = await catalog.getStorefront(verified);
    const activeProducts = (store.products as Array<Record<string, unknown>>).map((o) => String(o.id));
    expect(activeProducts).toContain(offer);

    await catalog.setOfferStatus(offer, actor(verified), 'pause');
    const after = await catalog.getStorefront(verified);
    expect((after.products as Array<Record<string, unknown>>).map((o) => String(o.id))).not.toContain(offer);
  });

  it('discoverOffers ranks visibility-penalised sellers last', async () => {
    const penalised = await insertSeller();
    await admin.query(`UPDATE catalog.seller_profiles SET visibility_penalty = TRUE WHERE user_id = $1`, [penalised]);
    const cluster = await insertCluster();
    const normalOffer = await insertOffer(sellerA, cluster);
    const penalisedOffer = await insertOffer(penalised, cluster);

    const page = await catalog.discoverOffers({ cluster_id: cluster, limit: 100 });
    const ids = page.offers.map((o) => String(o.id));
    const normalIdx = ids.indexOf(normalOffer);
    const penalisedIdx = ids.indexOf(penalisedOffer);
    expect(normalIdx).toBeGreaterThanOrEqual(0);
    expect(penalisedIdx).toBeGreaterThanOrEqual(0);
    expect(normalIdx).toBeLessThan(penalisedIdx);
  });

  it('offer media: attach primary image, reflect in discover, then remove', async () => {
    const offer = await insertOffer(sellerA, clusterB, { price: 2500 });
    const media = await catalog.addOfferMedia(offer, actor(sellerA), {
      storage_key: `${randomUUID()}.jpg`,
      is_primary: true,
    });
    createdMediaIds.push(String(media.id));
    expect(String(media.storage_key)).toMatch(/\.jpg$/);

    let page = await catalog.discoverOffers({ cluster_id: clusterB, limit: 100 });
    let row = page.offers.find((o) => String(o.id) === offer) as Record<string, unknown>;
    expect(String((row.primary_image as Record<string, unknown>).storage_key)).toMatch(/\.jpg$/);

    await catalog.removeOfferMedia(offer, actor(sellerA), String(media.id));
    page = await catalog.discoverOffers({ cluster_id: clusterB, limit: 100 });
    row = page.offers.find((o) => String(o.id) === offer) as Record<string, unknown>;
    expect(row.primary_image).toBeNull();

    await expect(catalog.addOfferMedia(offer, actor(sellerB), { storage_key: `${randomUUID()}.png` })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(catalog.addOfferMedia(offer, actor(sellerA), { storage_key: 'boom/../../etc/passwd' })).rejects.toThrow(/storage_key/i);
    await expect(catalog.addOfferMedia(randomUUID(), actor(sellerA), { storage_key: `${randomUUID()}.png` })).rejects.toBeInstanceOf(NotFoundException);
  });
});