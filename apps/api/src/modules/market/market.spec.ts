import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import { MarketService } from './market.service.js';
import type { MarketFeedService } from '../realtime/market-feed.service.js';
import type { FeedService } from '../notifications/feed.service.js';
import type { NotifyService } from '../notifications/notify.service.js';

const feedStub = { publishMarket: async () => {}, subscribe: async () => {} } as unknown as MarketFeedService;
const feedServiceStub = { push: async () => ({ id: 'stub' }), list: async () => [] } as unknown as FeedService;
const notifyStub = { notify: async () => {} } as unknown as NotifyService;

let admin: Pool;
let app: Pool;
let market: MarketService;

interface Resources {
  sellerId: string;
  foreignSellerId: string;
  buyerId: string;
  offerId: string;
  lotId: string;
  clusterId: string;
}

let resources: Resources | null = null;


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
  market = new MarketService(app, feedStub, feedServiceStub, notifyStub);
});

afterAll(async () => {
  await cleanup();
  await app.end();
  await admin.end();
});

beforeEach(async () => {
  await cleanup();
});

describe('creator crowd sales', () => {
  it('rejects bad inputs', async () => {
    const r = await seedResources();

    await expect(market.createCrowdSale(r.sellerId, { offer_id: '', unit_price_kobo: 100, qty_available: 5 })).rejects.toThrow(
      'offer_id is required',
    );
    await expect(
      market.createCrowdSale(r.sellerId, { offer_id: r.offerId, unit_price_kobo: 0, qty_available: 5 }),
    ).rejects.toThrow('unit_price_kobo must be a positive integer');
    await expect(
      market.createCrowdSale(r.sellerId, { offer_id: r.offerId, unit_price_kobo: 100, qty_available: 0 }),
    ).rejects.toThrow('qty_available must be a positive integer');
    await expect(
      market.createCrowdSale(r.foreignSellerId, { offer_id: r.offerId, unit_price_kobo: 100, qty_available: 5 }),
    ).rejects.toThrow('Active offer not found for this seller');
  });

  it('creates an OPEN sale with the seller and product details', async () => {
    const r = await seedResources();
    const sale = (await market.createCrowdSale(r.sellerId, {
      offer_id: r.offerId,
      unit_price_kobo: 250000,
      qty_available: 40,
      min_qty: 5,
      note: 'Weekend bulk deal',
    })) as Record<string, unknown>;

    expect(String(sale.status)).toBe('OPEN');
    expect(String(sale.seller_id)).toBe(r.sellerId);
    expect(Number(sale.unit_price_kobo)).toBe(250000);
    expect(Number(sale.qty_available)).toBe(40);
    expect(Number(sale.min_qty)).toBe(5);
    expect(Number(sale.join_count)).toBe(0);
    expect(String(sale.product_name)).toBeTruthy();
    expect(String(sale.seller_name)).toBeTruthy();
  });

  it('lists open crowd sales with and without a seller filter', async () => {
    const r = await seedResources();
    await market.createCrowdSale(r.sellerId, { offer_id: r.offerId, unit_price_kobo: 80000, qty_available: 20 });

    const mine = (await market.listCrowdSales({ seller_id: r.sellerId })) as Array<Record<string, unknown>>;
    expect(mine.some((s) => Number(s.unit_price_kobo) === 80000)).toBe(true);

    const open = (await market.listCrowdSales({ status: 'OPEN' })) as Array<Record<string, unknown>>;
    expect(open.some((s) => String(s.seller_id) === r.sellerId)).toBe(true);
  });

  it('closes a crowd sale and refuses to close it twice', async () => {
    const r = await seedResources();
    const sale = (await market.createCrowdSale(r.sellerId, {
      offer_id: r.offerId,
      unit_price_kobo: 99000,
      qty_available: 10,
    })) as Record<string, unknown>;

    const closed = await market.closeCrowdSale(String(sale.id), r.sellerId);
    expect(closed).toEqual({ ok: true });

    const listed = (await market.listCrowdSales({ seller_id: r.sellerId })) as Array<Record<string, unknown>>;
    expect(String(listed[0].status)).toBe('CLOSED');

    await expect(market.closeCrowdSale(String(sale.id), r.sellerId)).rejects.toThrow(
      'Open crowd sale not found for this seller',
    );
  });

  it("only the owner can close the owner's sale", async () => {
    const r = await seedResources();
    const sale = (await market.createCrowdSale(r.sellerId, {
      offer_id: r.offerId,
      unit_price_kobo: 50000,
      qty_available: 8,
    })) as Record<string, unknown>;

    await expect(market.closeCrowdSale(String(sale.id), r.foreignSellerId)).rejects.toThrow(
      'Open crowd sale not found for this seller',
    );
  });
});

describe('seller wants list', () => {
  it('returns wants where the seller has a bid, with my_bid set', async () => {
    const r = await seedResources();
    const wantId = await seedWantAndBid(r);

    const wants = (await market.listWantsForSeller(r.sellerId)) as Array<Record<string, unknown>>;
    const want = wants.find((w) => String(w.id) === wantId);
    expect(want).toBeTruthy();
    expect(Number(want?.bid_count)).toBe(1);
    const myBid = want?.my_bid as Record<string, unknown> | null;
    expect(myBid).toBeTruthy();
    expect(String(myBid?.seller_id)).toBe(r.sellerId);
    expect(String(myBid?.offer_id)).toBe(r.offerId);
    expect(Number(myBid?.quote_per_unit_kobo)).toBe(120000);
    expect((want?.bidders as Array<Record<string, unknown>>)?.length).toBe(1);

    const other = (await market.listWantsForSeller(r.foreignSellerId)) as Array<Record<string, unknown>>;
    expect(other.some((w) => String(w.id) === wantId)).toBe(false);
  });

  it('returns an empty list when the seller has no bids', async () => {
    const r = await seedResources();
    const wants = await market.listWantsForSeller(r.sellerId);
    expect(wants).toEqual([]);
  });
});

describe('bounded haggle', () => {
  it('caps the buyer at 3 bids and rejects the 4th', async () => {
    const r = await seedResources();
    const { negotiationId } = await seedHaggleThread(r);

    for (let i = 1; i <= 3; i++) {
      await market.buyerBid(negotiationId, r.buyerId, 10, 100_000 * i, `bid ${i}`);
    }
    await expect(market.buyerBid(negotiationId, r.buyerId, 10, 500_000, 'one more')).rejects.toThrow(
      /rounds/,
    );
  });

  it('caps the seller at 3 counters and rejects the 4th', async () => {
    const r = await seedResources();
    const { negotiationId } = await seedHaggleThread(r);

    for (let i = 1; i <= 3; i++) {
      await market.sellerOffer(negotiationId, r.sellerId, 150_000 + i * 1_000, 10);
    }
    await expect(market.sellerOffer(negotiationId, r.sellerId, 900_000, 10)).rejects.toThrow(
      /final word/,
    );
  });

  it('freezes prices on end, reopens once, and refuses a second reopen', async () => {
    const r = await seedResources();
    const { negotiationId } = await seedHaggleThread(r);

    await market.buyerBid(negotiationId, r.buyerId, 10, 100_000, 'I fit collect am for 10k each');
    await market.sellerOffer(negotiationId, r.sellerId, 200_000, 10);

    const ended = await market.endBargain(negotiationId, r.buyerId, 'BUYER', 'Make I reason am');
    expect(String(ended.status)).toBe('ENDED');
    expect(Number(ended.frozen_seller_per_unit_kobo)).toBe(200_000);
    expect(Number(ended.frozen_buyer_per_unit_kobo)).toBe(10_000);
    expect(ended.freeze_expires_at).toBeTruthy();

    const reopened = await market.continueBargain(negotiationId, r.buyerId, 'BUYER', 120_000, 10);
    expect(String(reopened.status)).toBe('OPEN');
    expect(Number(reopened.reopen_count)).toBe(1);

    await market.endBargain(negotiationId, r.buyerId, 'BUYER', 'E don stand o');
    await expect(market.continueBargain(negotiationId, r.buyerId, 'BUYER', 130_000, 10)).rejects.toThrow(
      /reopen/,
    );
  });

  it('refuses to reopen a bargain whose frozen window has closed', async () => {
    const r = await seedResources();
    const { negotiationId } = await seedHaggleThread(r);
    await market.buyerBid(negotiationId, r.buyerId, 10, 100_000, 'bid');
    await market.endBargain(negotiationId, r.sellerId, 'SELLER');
    await app.query(
      `UPDATE market.negotiations SET freeze_expires_at = now() - interval '1 hour' WHERE id = $1`,
      [negotiationId],
    );

    await expect(market.continueBargain(negotiationId, r.buyerId, 'BUYER', 120_000, 10)).rejects.toThrow(
      /frozen window don close/,
    );
  });

  it('auto-freezes a thread idle for 24 hours and pins the last prices', async () => {
    const r = await seedResources();
    const { negotiationId } = await seedHaggleThread(r);
    await market.buyerBid(negotiationId, r.buyerId, 10, 100_000, 'bid');
    await market.sellerOffer(negotiationId, r.sellerId, 250_000, 10);
    await app.query(
      `UPDATE market.negotiations SET updated_at = now() - interval '25 hours' WHERE id = $1`,
      [negotiationId],
    );

    await market.deadlineSweep();

    const threads = (await market.listNegotiations(r.buyerId)) as Array<Record<string, unknown>>;
    const t = threads.find((x) => String(x.id) === negotiationId);
    expect(t).toBeTruthy();
    expect(String(t?.status)).toBe('ENDED');
    expect(t?.ended_by).toBeNull();
    expect(Number(t?.frozen_seller_per_unit_kobo)).toBe(250_000);
    expect(Number(t?.frozen_buyer_per_unit_kobo)).toBe(10_000);
    expect(t?.freeze_expires_at).toBeTruthy();
    const msgs = t?.messages as Array<Record<string, unknown>>;
    const note = msgs.find((m: Record<string, unknown>) => String(m.kind) === 'NOTE');
    expect(note).toBeTruthy();
  });

  it('drops the frozen pins once the 24h grab window passes', async () => {
    const r = await seedResources();
    const { negotiationId } = await seedHaggleThread(r);
    await market.buyerBid(negotiationId, r.buyerId, 10, 100_000, 'bid');
    await market.endBargain(negotiationId, r.buyerId, 'BUYER');
    await app.query(
      `UPDATE market.negotiations SET freeze_expires_at = now() - interval '1 hour' WHERE id = $1`,
      [negotiationId],
    );

    await market.deadlineSweep();

    const { rows } = await app.query(
      `SELECT observable, frozen_seller_per_unit_kobo, frozen_buyer_per_unit_kobo, freeze_expires_at
         FROM market.negotiations WHERE id = $1`,
      [negotiationId],
    );
    expect(String(rows[0].observable)).toBe('ENDED');
    expect(rows[0].frozen_seller_per_unit_kobo).toBeNull();
    expect(rows[0].frozen_buyer_per_unit_kobo).toBeNull();
    expect(rows[0].freeze_expires_at).toBeNull();
  });

  it('nudges the idle side once 6h before the auto-freeze', async () => {
    const r = await seedResources();
    const { negotiationId } = await seedHaggleThread(r);
    await market.buyerBid(negotiationId, r.buyerId, 10, 100_000, 'bid');
    await app.query(
      `UPDATE market.negotiations SET reply_at = now() - interval '5 seconds' WHERE id = $1`,
      [negotiationId],
    );
    await market.replySweep();
    await app.query(
      `UPDATE market.negotiations SET updated_at = now() - interval '19 hours' WHERE id = $1`,
      [negotiationId],
    );
    await market.deadlineSweep();
    let row = (await app.query(`SELECT observable, auto_freeze_reminded_at FROM market.negotiations WHERE id = $1`, [negotiationId])).rows[0];
    expect(String(row.observable)).toBe('OPEN');
    expect(row.auto_freeze_reminded_at).toBeTruthy();

    await market.deadlineSweep();
    row = (await app.query(`SELECT observable, auto_freeze_reminded_at FROM market.negotiations WHERE id = $1`, [negotiationId])).rows[0];
    expect(String(row.observable)).toBe('OPEN');
    expect(row.auto_freeze_reminded_at).toBeTruthy();
  });
});

/* ------------------------------- seeding ------------------------------- */

async function seedResources(): Promise<Resources> {
  if (resources) return resources;

  const seller = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, 'Crowd Seller', 'STORE', 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`],
  );
  const foreignSeller = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, 'Other Seller', 'STORE', 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`],
  );
  const buyer = await admin.query<{ id: string }>(
    `INSERT INTO pii.users (phone, full_name, seller_type, channel)
     VALUES ($1, 'Crowd Buyer', NULL, 'WHOLESALE') RETURNING id`,
    [`+234${Math.floor(Math.random() * 1_000_000_000_0)}`],
  );

  const cluster = await admin.query<{ id: string }>(
    `INSERT INTO catalog.clusters (name, lga, centroid)
     VALUES ($1, 'Market LGA', ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography) RETURNING id`,
    [`Crowd Cluster ${randomUUID().slice(0, 6)}`],
  );

  const lot = await admin.query<{ id: string }>(
    `INSERT INTO catalog.lots (seller_id, product_name, physical_ref)
     VALUES ($1, $2, $3) RETURNING id`,
    [seller.rows[0].id, `Tomato Basket ${randomUUID().slice(0, 4)}`, `ref-${randomUUID()}`],
  );

  const offer = await admin.query<{ id: string }>(
    `INSERT INTO catalog.offers (seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id)
     VALUES ($1, 'WHOLESALE', $2, 200, 1, 'SHELF_GT_7D', ARRAY['SCHEDULED'], ST_SetSRID(ST_MakePoint(8.5, 6.0), 4326)::geography, $3)
     RETURNING id`,
    [seller.rows[0].id, lot.rows[0].id, cluster.rows[0].id],
  );

  resources = {
    sellerId: seller.rows[0].id,
    foreignSellerId: foreignSeller.rows[0].id,
    buyerId: buyer.rows[0].id,
    offerId: offer.rows[0].id,
    lotId: lot.rows[0].id,
    clusterId: cluster.rows[0].id,
  };
  return resources;
}

async function seedWantAndBid(r: Resources): Promise<string> {
  const want = await admin.query<{ id: string }>(
    `INSERT INTO market.wants (buyer_id, product_name, qty, unit, note)
     VALUES ($1, $2, 10, 'basket', 'urgent') RETURNING id`,
    [r.buyerId, `Tomato Basket ${randomUUID().slice(0, 4)}`],
  );
  await admin.query(
    `INSERT INTO market.bids (want_id, seller_id, offer_id, product_name, quote_per_unit_kobo, quote_total_kobo, pitch)
     VALUES ($1, $2, $3, $4, 120000, 1200000, 'Fresh tomatoes for you')`,
    [want.rows[0].id, r.sellerId, r.offerId, 'Tomato Basket'],
  );
  return want.rows[0].id;
}

/** Opens a REQUEST-type haggle (want + bid) the way the mobile flow does. */
async function seedHaggleThread(r: Resources): Promise<{ negotiationId: string }> {
  const want = await admin.query<{ id: string }>(
    `INSERT INTO market.wants (buyer_id, product_name, qty, unit, note)
     VALUES ($1, $2, 10, 'basket', 'urgent') RETURNING id`,
    [r.buyerId, `Tomato Basket ${randomUUID().slice(0, 4)}`],
  );
  const bid = await admin.query<{ id: string }>(
    `INSERT INTO market.bids (want_id, seller_id, offer_id, product_name, quote_per_unit_kobo, quote_total_kobo, pitch)
     VALUES ($1, $2, $3, $4, 120000, 1200000, 'Fresh tomatoes for you') RETURNING id`,
    [want.rows[0].id, r.sellerId, r.offerId, 'Tomato Basket'],
  );
  const thread = (await market.openThread(
    { basis_type: 'REQUEST', want_id: want.rows[0].id, bid_id: bid.rows[0].id },
    r.buyerId,
  )) as Record<string, unknown>;
  return { negotiationId: String(thread.id) };
}

async function cleanup(): Promise<void> {
  if (!resources) return;
  const { sellerId, foreignSellerId, buyerId, offerId, lotId, clusterId } = resources;

  await admin.query(`DELETE FROM market.crowd_sales WHERE seller_id = ANY($1)`, [[sellerId]]);
  await admin.query(
    `DELETE FROM market.negotiation_messages
      WHERE negotiation_id IN (
        SELECT id FROM market.negotiations WHERE buyer_id = ANY($1) OR seller_id = ANY($1)
      )`,
    [[sellerId, foreignSellerId, buyerId]],
  );
  await admin.query(
    `DELETE FROM market.negotiations WHERE buyer_id = ANY($1) OR seller_id = ANY($1)`,
    [[sellerId, foreignSellerId, buyerId]],
  );
  await admin.query(`DELETE FROM market.bids WHERE seller_id = ANY($1)`, [[sellerId, foreignSellerId]]);
  await admin.query(`DELETE FROM market.wants WHERE buyer_id = ANY($1)`, [[buyerId]]);
  await admin.query(`DELETE FROM catalog.offer_price_history WHERE offer_id = $1`, [offerId]);
  await admin.query(`DELETE FROM catalog.offers WHERE id = $1`, [offerId]);
  await admin.query(`DELETE FROM catalog.lots WHERE id = $1`, [lotId]);
  await admin.query(`DELETE FROM catalog.clusters WHERE id = $1`, [clusterId]);
  await admin.query(`DELETE FROM pii.users WHERE id = ANY($1)`, [[sellerId, foreignSellerId, buyerId]]);

  resources = null;
}
