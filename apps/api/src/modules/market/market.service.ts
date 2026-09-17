import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { MarketFeedService } from '../realtime/market-feed.service.js';
import { FeedService } from '../notifications/feed.service.js';
import { NotifyService } from '../notifications/notify.service.js';

/* ================================================================
 * Server-side Crowd Market + Negotiation engine.
 *
 * Replaces the old localStorage simulation: wants, bids, haggling
 * threads, deal freezing and the in-app feed all live in postgres
 * so behaviour is identical across devices and survives reloads.
 * ================================================================ */

export interface CreateWantInput {
  product_name: string;
  qty: number;
  unit?: string | null;
  ceiling_kobo?: number | null;
  note?: string;
}

export interface CreateThreadInput {
  basis_type: 'OFFER' | 'REQUEST';
  offer_id?: string;
  want_id?: string;
  bid_id?: string;
  qty?: number;
}

export interface CreateCrowdSaleInput {
  offer_id: string;
  unit_price_kobo: number;
  qty_available: number;
  min_qty?: number;
  note?: string;
  ends_at?: string | null;
}

/* ---------- deterministic helpers (ported 1:1 from the client) ---------- */

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function firstName(name: string | null | undefined): string {
  return (name ?? '').split(' ')[0] || 'seller';
}

function pluralUnit(unit: string | null | undefined, qty: number): string {
  const u = unit?.trim() || 'unit';
  if (qty === 1 || /^[a-z]{1,2}$/i.test(u)) return u;
  if (/(ch|sh|x|z|ss)$/i.test(u)) return `${u}es`;
  if (/[bcdfghjklmnpqrstvwxz]y$/i.test(u)) return u.replace(/y$/i, 'ies');
  if (/s$/i.test(u)) return u;
  return `${u}s`;
}

const NG0 = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const label = (kobo: number) => NG0.format(kobo / 100);

interface OfferLike {
  id: string;
  price_cents: number | null;
  channel: string;
  unit: string | null;
  min_order_qty: number;
  sellable_qty: number;
}

/** Deterministic single-unit haggle ask (5–13% off, ₦50 grid). */
function bargainPriceKobo(offer: OfferLike): number | null {
  if (offer.price_cents == null) return null;
  const pct = 5 + (hashCode(offer.id) % 9);
  const dropped = offer.price_cents * (1 - pct / 100);
  return Math.max(5000, Math.round(dropped / 5000) * 5000);
}

/** 15% floor below the ask, ₦100 grid. */
function bargainFloorKobo(offer: OfferLike): number | null {
  if (offer.price_cents == null) return null;
  const ask = bargainPriceKobo(offer) ?? offer.price_cents;
  return Math.max(5000, Math.round((ask * 0.85) / 10000) * 10000);
}

function channelBonus(channel: string): number {
  switch (channel) {
    case 'WHOLESALE':
      return 8;
    case 'DIRECT':
      return 4;
    case 'RETAILER':
      return 0;
    default:
      return 2;
  }
}

function volumeDepthPct(offer: OfferLike): number {
  const base = 4 + (hashCode(offer.id) % 7);
  return base + channelBonus(offer.channel);
}

function fullDepthQty(offer: OfferLike): number {
  let stretch = 1;
  if (offer.channel === 'WHOLESALE') stretch = 2;
  else if (offer.channel === 'RETAILER') stretch = 0;
  return 3 + (hashCode(offer.id) % 3) + stretch;
}

/** Per-unit ask at volume (same ladder as the old client engine). */
function volumePerUnitKobo(offer: OfferLike, qty: number): number | null {
  const single = bargainPriceKobo(offer);
  if (single == null || offer.price_cents == null || qty <= 0) return null;
  const depth = fullDepthQty(offer);
  const fill = Math.min(1, Math.max(0, qty - 1) / Math.max(1, depth - 1));
  const perUnit = single * (1 - (volumeDepthPct(offer) * fill) / 100);
  const hardFloor = offer.price_cents * 0.75;
  return Math.max(hardFloor, Math.round(perUnit / 5000) * 5000);
}

/** Per-unit floor the seller will settle for at this volume. */
function volumeFloorKobo(offer: OfferLike, qty: number): number | null {
  if (qty <= 1) return bargainFloorKobo(offer);
  const ask = volumePerUnitKobo(offer, qty);
  if (ask == null) return null;
  return Math.max(5000, Math.round((ask * 0.9) / 10000) * 10000);
}

const RHO: Record<string, number> = { easy: 0.5, fair: 0.72, tough: 0.9 };

function demeanorFor(seed: string): 'easy' | 'fair' | 'tough' {
  const roll = hashCode(seed) % 3;
  return roll === 0 ? 'easy' : roll === 1 ? 'fair' : 'tough';
}

/** Seller's final word for a buyer bid (lower price = firmer as rounds grow). */
function sellerResponse(input: {
  bidPerUnitKobo: number;
  qty: number;
  askPerUnitKobo: number;
  floorPerUnitKobo: number;
  demeanor: 'easy' | 'fair' | 'tough';
  round: number;
}): { kind: 'SELLER_OFFER' | 'SELLER_ACCEPT'; perUnitKobo: number } {
  const { bidPerUnitKobo, askPerUnitKobo, floorPerUnitKobo, demeanor, round } = input;
  const gap = Math.max(0, askPerUnitKobo - floorPerUnitKobo);
  const threshold = askPerUnitKobo - gap * Math.pow(RHO[demeanor], round + 1);
  if (bidPerUnitKobo >= threshold) {
    return { kind: 'SELLER_ACCEPT', perUnitKobo: bidPerUnitKobo };
  }
  const grid = 5000;
  const counter = Math.min(askPerUnitKobo, Math.max(50, Math.round(threshold / grid) * grid));
  return { kind: 'SELLER_OFFER', perUnitKobo: Math.max(floorPerUnitKobo, counter) };
}

function sellerMessageText(kind: 'SELLER_OFFER' | 'SELLER_ACCEPT', kobo: number, unit: string, qty: number): string {
  const unitLabel = pluralUnit(unit, qty);
  const qtyLabel = `${qty} ${unitLabel}`;
  const total = label(kobo * qty);
  const roll = hashCode(`${kobo}:${qty}:${unit}`);
  if (kind === 'SELLER_ACCEPT') {
    const lines = [
      `Na you win today o! ${label(kobo)} each, ${total} for the ${qtyLabel} — no dey vex, carry am.`,
      `Since you talk am like that… fine! ${label(kobo)} each. God bless your money.`,
      `Yawa gas! But na you be my kpokoro customer. ${label(kobo)} each — done deal.`,
    ];
    return lines[roll % lines.length];
  }
  const lines = [
    `E no reach. Make we meet for ${label(kobo)} each? Moni no dey tree o.`,
    `Ha! You sabi market well well. Abeg ${label(kobo)} each, make I still chop.`,
    `The price wey I carry am, ${label(kobo)} each. I no dey do branch less pass that.`,
  ];
  return lines[roll % lines.length];
}

/* ================================================================ service */

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Market');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(MarketFeedService) private readonly feed: MarketFeedService,
    @Inject(FeedService) private readonly feedService: FeedService,
    @Inject(NotifyService) private readonly notify: NotifyService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.replySweep();
      void this.pruneEmptyThreads();
    }, 3000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async assertUser(userId: string): Promise<{ id: string; full_name: string }> {
    const { rows } = await this.pool.query(
      `SELECT id, full_name FROM pii.users WHERE id = $1 AND status = 'ACTIVE'`,
      [userId],
    );
    if (rows.length === 0) throw new Error('Active user account required');
    return { id: String(rows[0].id), full_name: String(rows[0].full_name) };
  }

  /** Build the seller-side context for one bidder revenue row. */
  private bidderFromOffer(o: Record<string, unknown>, qty: number): Record<string, unknown> {
    const offer: OfferLike = {
      id: String(o.id),
      price_cents: o.price_cents == null ? null : Number(o.price_cents),
      channel: String(o.channel),
      unit: o.unit ? String(o.unit) : null,
      min_order_qty: Number(o.min_order_qty),
      sellable_qty: Number(o.sellable_qty),
    };
    const ask = volumePerUnitKobo(offer, qty);
    const perUnit = ask ?? Number(o.price_cents);
    const unit = offer.unit ?? null;
    const roll = hashCode(String(o.id)) % 3;
    const total = label(perUnit * qty);
    const unitLabel = pluralUnit(unit, qty);
    let pitch: string;
    if (roll === 0) {
      pitch = `Oya, you wan buy ${qty} ${unitLabel} of ${String(o.product_name)}? I go do ${total}. Na only you I for drop am for oja.`;
    } else if (roll === 1) {
      pitch = `Make I help you pack ${qty} ${unitLabel} of ${String(o.product_name)} for ${total} — cash and carry, na so market dey.`;
    } else {
      pitch = `${qty} ${unitLabel} of ${String(o.product_name)} wey you want? I get fresh one. ${total} only, comot am.`;
    }
    return {
      seller_id: String(o.seller_id),
      offer_id: String(o.id),
      product_name: String(o.product_name),
      unit,
      market_name: o.market_name ? String(o.market_name) : null,
      stall_number: o.stall_number ? String(o.stall_number) : null,
      rating: o.avg_rating == null ? null : Number(o.avg_rating),
      review_count: Number(o.review_count ?? 0),
      quote_per_unit_kobo: perUnit,
      quote_total_kobo: perUnit * qty,
      pitch,
    };
  }

  private async findBidderOffers(products: string[], qty: number): Promise<Array<Record<string, unknown>>> {
    const params: unknown[] = [qty, ...products];
    const likes = products.map((_, i) => `l.product_name ILIKE $${i + 2}`).join(' OR ');
    const { rows } = await this.pool.query(
      `SELECT
         o.id, o.seller_id, o.channel, o.unit, o.min_order_qty,
         o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
         l.product_name,
         p.new_price_cents::int AS price_cents,
         sp.market_name, sp.stall_number,
         (SELECT AVG(r.rating)::numeric(2,1) FROM catalog.reviews r WHERE r.seller_id = o.seller_id) AS avg_rating,
         (SELECT COUNT(*) FROM catalog.reviews r WHERE r.seller_id = o.seller_id)::int AS review_count
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (SELECT MAX(p2.changed_at) FROM catalog.offer_price_history p2 WHERE p2.offer_id = o.id)
       LEFT JOIN catalog.seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.status = 'ACTIVE'
         AND o.available_qty > o.reserved_qty + o.soft_held_qty
         AND o.available_qty - o.reserved_qty - o.soft_held_qty >= $1
         AND p.new_price_cents IS NOT NULL
         AND (${likes})
       ORDER BY p.new_price_cents ASC`,
      params,
    );
    return rows;
  }

  private async searchTerms(productName: string): Promise<string[]> {
    const cleaned = productName.trim().replace(/\s+/g, ' ');
    if (!cleaned) return [];
    const words = cleaned.split(' ');
    const last = words[words.length - 1];
    const terms = [cleaned];
    if (last.length >= 3 && last.toLowerCase() !== cleaned.toLowerCase()) terms.push(last);
    return terms;
  }

  /* ------------------------------- wants ------------------------------- */

  async createWant(buyerId: string, input: CreateWantInput): Promise<Record<string, unknown>> {
    await this.assertUser(buyerId);
    if (!input.product_name?.trim()) throw new Error('product_name is required');
    const qty = Math.floor(Number(input.qty));
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('qty must be a positive integer');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO market.wants (buyer_id, product_name, qty, unit, ceiling_kobo, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          buyerId,
          input.product_name.trim(),
          qty,
          input.unit?.trim() || null,
          Number(input.ceiling_kobo) > 0 ? Math.floor(Number(input.ceiling_kobo)) : null,
          input.note?.trim() ?? '',
        ],
      );
      const wantId = String(rows[0].id);
      await client.query('COMMIT');

      await this.attachBids(wantId, qty);
      const wants = await this.listWants(buyerId, wantId);
      void this.feed.publishMarket('market.want_created', wantId, {
        want_id: wantId,
        buyer_id: buyerId,
        product_name: input.product_name.trim(),
        qty,
        unit: input.unit?.trim() || null,
        ceiling_kobo: input.ceiling_kobo ?? null,
        bid_count: (wants[0] as { bidders?: unknown[] })?.bidders?.length ?? 0,
      });
      return wants[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async hydrateBids(wantId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT b.id, b.seller_id, u.full_name AS seller_name, b.offer_id, b.product_name,
              b.unit, b.market_name, b.stall_number, b.rating, b.review_count,
              b.quote_per_unit_kobo, b.quote_total_kobo, b.pitch, b.chosen, b.created_at
         FROM market.bids b
         JOIN pii.users u ON u.id = b.seller_id
        WHERE b.want_id = $1
        ORDER BY b.quote_per_unit_kobo ASC, b.created_at ASC`,
      [wantId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      seller_id: String(r.seller_id),
      seller_name: String(r.seller_name),
      offer_id: String(r.offer_id),
      product_name: String(r.product_name),
      unit: r.unit ? String(r.unit) : null,
      market_name: r.market_name ? String(r.market_name) : null,
      stall_number: r.stall_number ? String(r.stall_number) : null,
      rating: r.rating == null ? null : Number(r.rating),
      review_count: Number(r.review_count),
      quote_per_unit_kobo: Number(r.quote_per_unit_kobo),
      quote_total_kobo: Number(r.quote_total_kobo),
      pitch: String(r.pitch),
      chosen: Boolean(r.chosen),
      created_at: r.created_at,
    }));
  }

  async listWants(
    buyerId: string | undefined,
    singleId?: string,
    forSellerId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const conn = this.pool;
    const conds: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (buyerId) {
      conds.push(`w.buyer_id = $${idx++}`);
      params.push(buyerId);
    }
    if (singleId) {
      conds.push(`w.id = $${idx++}`);
      params.push(singleId);
    }
    if (forSellerId) {
      conds.push(`EXISTS (SELECT 1 FROM market.bids ob WHERE ob.want_id = w.id AND ob.seller_id = $${idx++})`);
      params.push(forSellerId);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await conn.query(
      `SELECT w.id, w.buyer_id, u.full_name AS buyer_name, w.product_name, w.qty, w.unit,
              w.ceiling_kobo, w.note, w.status, w.chosen_bid_id, w.closed_at, w.created_at,
              (SELECT COUNT(*)::int FROM market.bids b WHERE b.want_id = w.id) AS bid_count
         FROM market.wants w
         JOIN pii.users u ON u.id = w.buyer_id
        ${where}
        ORDER BY w.created_at DESC
        LIMIT 100`,
      params,
    );

    const wants: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const bidders = await this.hydrateBids(String(r.id));
      const settledBid = bidders.find((b) => b.chosen) ?? null;
      wants.push({
        id: String(r.id),
        buyer_id: String(r.buyer_id),
        buyer_name: String(r.buyer_name),
        product_name: String(r.product_name),
        qty: Number(r.qty),
        unit: r.unit ? String(r.unit) : null,
        ceiling_kobo: r.ceiling_kobo == null ? null : Number(r.ceiling_kobo),
        note: String(r.note ?? ''),
        status: String(r.status),
        chosen_bid_id: r.chosen_bid_id ? String(r.chosen_bid_id) : null,
        settled_with: settledBid,
        closed_at: r.closed_at,
        created_at: r.created_at,
        bid_count: Number(r.bid_count),
        bidders,
        my_bid: forSellerId ? bidders.find((b) => String(b.seller_id) === forSellerId) ?? null : null,
      });
    }
    return wants;
  }

  async listWantsForSeller(sellerId: string): Promise<Array<Record<string, unknown>>> {
    await this.assertUser(sellerId);
    return this.listWants(undefined, undefined, sellerId);
  }

  private async attachBids(wantId: string, qty: number): Promise<void> {
    const existing = await this.pool.query(`SELECT id FROM market.bids WHERE want_id = $1 LIMIT 1`, [wantId]);
    if (existing.rows.length > 0) return;
    const { rows } = await this.pool.query(`SELECT product_name FROM market.wants WHERE id = $1`, [wantId]);
    if (rows.length === 0) throw new Error('Want not found');
    const productName = String(rows[0].product_name);
    const terms = await this.searchTerms(productName);

    let offers: Array<Record<string, unknown>> = [];
    for (const term of terms) {
      const hit = await this.findBidderOffers([term], qty);
      if (hit.length > offers.length) offers = hit;
      if (offers.length >= 3) break;
    }

    // One representative (cheapest) listing per seller.
    const bySeller = new Map<string, Record<string, unknown>>();
    for (const o of offers) {
      if (!bySeller.has(String(o.seller_id))) bySeller.set(String(o.seller_id), o);
    }

    if (bySeller.size === 0) return;
    const rows2 = [...bySeller.values()].map((o) => this.bidderFromOffer(o, qty));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const b of rows2) {
        await client.query(
          `INSERT INTO market.bids
             (want_id, seller_id, offer_id, product_name, unit, market_name, stall_number,
              rating, review_count, quote_per_unit_kobo, quote_total_kobo, pitch)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            wantId,
            b.seller_id,
            b.offer_id,
            b.product_name,
            b.unit,
            b.market_name,
            b.stall_number,
            b.rating,
            b.review_count,
            b.quote_per_unit_kobo,
            b.quote_total_kobo,
            b.pitch,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getWant(wantId: string): Promise<Record<string, unknown>> {
    await this.pool.query(`SELECT 1 FROM market.wants WHERE id = $1`, [wantId]).then((r) => {
      if (r.rows.length === 0) throw new Error(`Want ${wantId} not found`);
    });
    await this.attachBids(wantId, await this.wantQty(wantId));
    const wants = await this.listWants(undefined, wantId);
    return wants[0];
  }

  private async wantQty(wantId: string): Promise<number> {
    const { rows } = await this.pool.query(`SELECT qty FROM market.wants WHERE id = $1`, [wantId]);
    return Number(rows[0]?.qty ?? 1);
  }

  async settleWant(wantId: string, bidId: string, buyerId: string): Promise<{ ok: boolean }> {
    const { rows } = await this.pool.query(`SELECT buyer_id, qty, product_name, unit FROM market.wants WHERE id = $1`, [wantId]);
    if (rows.length === 0) throw new Error('Want not found');
    const want = rows[0];
    if (String(want.buyer_id) !== buyerId) throw new Error('Not your want');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const bid = await client.query(`SELECT id FROM market.bids WHERE id = $1 AND want_id = $2`, [bidId, wantId]);
      if (bid.rows.length === 0) throw new Error('Bid not found');
      await client.query(
        `UPDATE market.wants SET status = 'SETTLED', chosen_bid_id = $1, closed_at = now() WHERE id = $2`,
        [bidId, wantId],
      );
      await client.query(`UPDATE market.bids SET chosen = TRUE WHERE id = $1`, [bidId]);
      await client.query(`UPDATE market.bids SET chosen = FALSE WHERE want_id = $1 AND id <> $2`, [wantId, bidId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { ok: true };
  }

  /* ---------------------------- crowd sales ---------------------------- */

  async createCrowdSale(sellerId: string, input: CreateCrowdSaleInput): Promise<Record<string, unknown>> {
    const seller = await this.assertUser(sellerId);
    if (!input.offer_id?.trim()) throw new Error('offer_id is required');
    const { rows: offers } = await this.pool.query(
      `SELECT o.id, l.product_name, o.unit
         FROM catalog.offers o
         JOIN catalog.lots l ON l.id = o.lot_id
        WHERE o.id = $1 AND o.seller_id = $2 AND o.status = 'ACTIVE'`,
      [input.offer_id, sellerId],
    );
    if (offers.length === 0) throw new Error('Active offer not found for this seller');
    const offer = offers[0];
    const unitPriceKobo = Math.floor(Number(input.unit_price_kobo));
    if (!Number.isFinite(unitPriceKobo) || unitPriceKobo <= 0) throw new Error('unit_price_kobo must be a positive integer');
    const qtyAvailable = Math.floor(Number(input.qty_available));
    if (!Number.isFinite(qtyAvailable) || qtyAvailable <= 0) throw new Error('qty_available must be a positive integer');
    const minQty = Math.floor(Number(input.min_qty ?? 1));
    if (!Number.isFinite(minQty) || minQty <= 0) throw new Error('min_qty must be a positive integer');
    const endsAt = input.ends_at ? new Date(input.ends_at) : null;
    if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error('ends_at must be a valid date');

    const { rows } = await this.pool.query(
      `INSERT INTO market.crowd_sales
         (seller_id, offer_id, product_name, unit, unit_price_kobo, qty_available, min_qty, note, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        sellerId,
        offer.id,
        String(offer.product_name),
        offer.unit ? String(offer.unit) : null,
        unitPriceKobo,
        qtyAvailable,
        minQty,
        input.note?.trim() ?? '',
        endsAt,
      ],
    );
    const sale = rows[0];
    void this.feed.publishMarket('market.crowd_sale_created', String(sale.id), {
      sale_id: String(sale.id),
      seller_id: sellerId,
      seller_name: seller.full_name,
      offer_id: String(offer.id),
      product_name: String(sale.product_name),
      unit: sale.unit ? String(sale.unit) : null,
      unit_price_kobo: unitPriceKobo,
      qty_available: qtyAvailable,
      min_qty: minQty,
    });
    return this.rowCrowdSale(sale, 0, seller.full_name);
  }

  async listCrowdSales(opts: { seller_id?: string; status?: 'OPEN' | 'CLOSED'; limit?: string } = {}) {
    const conds: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (opts.seller_id) {
      conds.push(`cs.seller_id = $${idx++}`);
      params.push(opts.seller_id);
    }
    if (opts.status) {
      conds.push(`cs.status = $${idx++}`);
      params.push(opts.status);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(100, Math.floor(Number(opts.limit ?? 50))));
    const { rows } = await this.pool.query(
      `SELECT cs.*, u.full_name AS seller_name,
              (SELECT COUNT(DISTINCT n.buyer_id)::int
                 FROM market.negotiations n
                WHERE n.offer_id = cs.offer_id AND n.basis_type = 'OFFER'
                  AND n.seller_id = cs.seller_id AND n.created_at >= cs.created_at) AS join_count
         FROM market.crowd_sales cs
         JOIN pii.users u ON u.id = cs.seller_id
        ${where}
        ORDER BY cs.created_at DESC
        LIMIT ${limit}`,
      params,
    );
    return rows.map((r) => this.rowCrowdSale(r, Number(r.join_count ?? 0), String(r.seller_name)));
  }

  private rowCrowdSale(r: Record<string, unknown>, joinCount: number, sellerName: string): Record<string, unknown> {
    return {
      id: String(r.id),
      seller_id: String(r.seller_id),
      seller_name: sellerName,
      offer_id: String(r.offer_id),
      product_name: String(r.product_name),
      unit: r.unit ? String(r.unit) : null,
      unit_price_kobo: Number(r.unit_price_kobo),
      qty_available: Number(r.qty_available),
      min_qty: Number(r.min_qty),
      note: String(r.note ?? ''),
      status: String(r.status),
      ends_at: r.ends_at,
      created_at: r.created_at,
      join_count: joinCount,
    };
  }

  async closeCrowdSale(saleId: string, sellerId: string): Promise<{ ok: boolean }> {
    await this.assertUser(sellerId);
    const { rows } = await this.pool.query(
      `UPDATE market.crowd_sales SET status = 'CLOSED', ends_at = coalesce(ends_at, now())
        WHERE id = $1 AND seller_id = $2 AND status = 'OPEN'
        RETURNING id`,
      [saleId, sellerId],
    );
    if (rows.length === 0) throw new Error('Open crowd sale not found for this seller');
    void this.feed.publishMarket('market.crowd_sale_closed', saleId, { seller_id: sellerId, sale_id: saleId });
    return { ok: true };
  }

  /* ---------------------------- negotiations ---------------------------- */

  private async assertThread(id: string): Promise<Record<string, unknown>> {
    const { rows } = await this.pool.query(
      `SELECT n.*, u.full_name AS buyer_name, su.full_name AS seller_name,
              l.product_name AS offer_product, o.unit AS offer_unit
         FROM market.negotiations n
         JOIN pii.users u ON u.id = n.buyer_id
         JOIN pii.users su ON su.id = n.seller_id
         LEFT JOIN catalog.offers o ON o.id = n.offer_id
         LEFT JOIN catalog.lots l ON l.id = o.lot_id
        WHERE n.id = $1`,
      [id],
    );
    if (rows.length === 0) throw new Error(`Negotiation ${id} not found`);
    return rows[0];
  }

  /**
   * A "real" seller is one who owns a seller profile on the platform, i.e.
   * someone with a portal account who can actually reply in the seller
   * centre. Seeded/demo sellers (the crowd-market personas) have no profile
   * row, so their replies stay simulated.
   */
  private async isRealSeller(sellerId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM catalog.seller_profiles WHERE user_id = $1`,
      [sellerId],
    );
    return rows.length > 0;
  }

  /**
   * Ping a real seller the instant a buyer opens a haggle on their listing
   * (or on a request they bid for), so they can jump into the seller centre
   * and answer in person. Seeded sellers have no profile → skipped.
   */
  private async notifySellerOfOpen(
    negotiationId: string,
    sellerId: string,
    buyerId: string,
    basisLabel: string,
  ): Promise<void> {
    if (!(await this.isRealSeller(sellerId))) return;
    const { rows } = await this.pool.query(`SELECT full_name FROM pii.users WHERE id = $1`, [buyerId]);
    const buyerName = rows[0] ? firstName(String(rows[0].full_name)) : 'A buyer';
    await this.notify.notify(sellerId, {
      type: 'chat',
      title: `${buyerName} wan bargain your ${basisLabel}`,
      body: 'Oya run come answer — make we settle price.',
      deep_link: `/seller/negotiations/${negotiationId}`,
    });
  }

  private async threadPayload(id: string): Promise<Record<string, unknown>> {
    const n = await this.assertThread(id);
    const { rows: messages } = await this.pool.query(
      `SELECT id, kind, side, qty, per_unit_kobo, message, created_at
         FROM market.negotiation_messages
        WHERE negotiation_id = $1
        ORDER BY created_at ASC, id ASC`,
      [id],
    );
    const wantProduct = n.want_id
      ? (await this.pool.query(`SELECT product_name, unit FROM market.wants WHERE id = $1`, [n.want_id])).rows[0]
      : null;
    const productName = n.basis_type === 'OFFER' ? String(n.offer_product ?? '') : wantProduct ? String(wantProduct.product_name) : '';
    const unit = n.basis_type === 'OFFER' ? (n.offer_unit ? String(n.offer_unit) : null) : wantProduct?.unit ? String(wantProduct.unit) : null;

    return {
      id: String(n.id),
      basis: {
        type: String(n.basis_type),
        offer: n.basis_type === 'OFFER' && n.offer_id ? { id: String(n.offer_id), product_name: productName, unit } : undefined,
        request_id: n.want_id ? String(n.want_id) : undefined,
        ask_per_unit_kobo: Number(n.ask_per_unit_kobo),
        floor_per_unit_kobo: Number(n.floor_per_unit_kobo),
      },
      seller: {
        id: String(n.seller_id),
        name: String(n.seller_name),
        channel: 'OPEN',
      },
      buyer_name: String(n.buyer_name),
      qty: Number(n.qty),
      status: String(n.observable) as 'OPEN' | 'ENDED' | 'SETTLED' | 'REVOKED',
      messages: messages.map((m) => ({
        id: String(m.id),
        kind: String(m.kind),
        side: String(m.side),
        qty: Number(m.qty),
        per_unit_kobo: m.per_unit_kobo == null ? null : Number(m.per_unit_kobo),
        message: String(m.message),
        at: m.created_at,
      })),
      demeanor: String(n.demeanor),
      ended_at: n.ended_at,
      ended_by: n.ended_by ? String(n.ended_by) : null,
      frozen_seller_per_unit_kobo: n.frozen_seller_per_unit_kobo == null ? null : Number(n.frozen_seller_per_unit_kobo),
      frozen_buyer_per_unit_kobo: n.frozen_buyer_per_unit_kobo == null ? null : Number(n.frozen_buyer_per_unit_kobo),
      freeze_expires_at: n.freeze_expires_at,
      created_at: n.created_at,
      updated_at: n.updated_at,
    };
  }

  async listNegotiations(buyerId: string): Promise<Array<Record<string, unknown>>> {
    await this.replySweep();
    const { rows } = await this.pool.query(
      `SELECT id FROM market.negotiations WHERE buyer_id = $1 ORDER BY updated_at DESC`,
      [buyerId],
    );
    const out: Array<Record<string, unknown>> = [];
    for (const r of rows) out.push(await this.threadPayload(String(r.id)));
    return out;
  }

  /**
   * Seller-side thread list: every negotiation where this user is the
   * seller, newest activity first. Runs the reply sweep so parked replies
   * (seeded sellers) flush before the mirror is computed.
   */
  async listSellerNegotiations(sellerId: string): Promise<Array<Record<string, unknown>>> {
    await this.replySweep();
    const { rows } = await this.pool.query(
      `SELECT id FROM market.negotiations WHERE seller_id = $1 ORDER BY updated_at DESC`,
      [sellerId],
    );
    const out: Array<Record<string, unknown>> = [];
    for (const r of rows) out.push(await this.threadPayload(String(r.id)));
    return out;
  }

  async openThread(input: CreateThreadInput, buyerId: string): Promise<Record<string, unknown>> {
    if (input.basis_type === 'OFFER') {
      if (!input.offer_id) throw new Error('offer_id required');
      const qty = Math.max(1, Math.floor(Number(input.qty ?? 1)));
      return this.openOfferThread(input.offer_id, buyerId, qty);
    }
    if (!input.want_id || !input.bid_id) throw new Error('want_id and bid_id required for REQUEST threads');
    return this.openBidThread(input.want_id, input.bid_id, buyerId);
  }

  private async openOfferThread(offerId: string, buyerId: string, qty: number): Promise<Record<string, unknown>> {
    const { rows } = await this.pool.query(
      `SELECT o.id, o.seller_id, o.channel, o.unit, o.min_order_qty,
              o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
              l.product_name, p.new_price_cents::int AS price_cents
         FROM catalog.offers o
         JOIN catalog.lots l ON l.id = o.lot_id
         LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
           AND p.changed_at = (SELECT MAX(p2.changed_at) FROM catalog.offer_price_history p2 WHERE p2.offer_id = o.id)
        WHERE o.id = $1`,
      [offerId],
    );
    if (rows.length === 0) throw new Error('Offer not found');
    const o = rows[0];
    const offer: OfferLike = {
      id: String(o.id),
      price_cents: o.price_cents == null ? null : Number(o.price_cents),
      channel: String(o.channel),
      unit: o.unit ? String(o.unit) : null,
      min_order_qty: Number(o.min_order_qty),
      sellable_qty: Number(o.sellable_qty),
    };
    const ask = volumePerUnitKobo(offer, qty);
    const floor = volumeFloorKobo(offer, qty);
    if (ask == null || floor == null) throw new Error('Offer has no usable price');

    const existing = await this.pool.query(
      `SELECT id FROM market.negotiations WHERE offer_id = $1 AND buyer_id = $2`,
      [offerId, buyerId],
    );
    const isNew = existing.rows.length === 0;
    const id = isNew
      ? await this.insertThread({
          buyerId,
          sellerId: String(o.seller_id),
          basisType: 'OFFER',
          offerId,
          wantId: null,
          ask,
          floor,
          qty,
          demeanorSeed: `${String(o.seller_id)}:${offerId}`,
        })
      : String(existing.rows[0].id);
    if (!isNew) {
      await this.pool.query(`UPDATE market.negotiations SET qty = $1, updated_at = now() WHERE id = $2`, [qty, id]);
    } else {
      await this.notifySellerOfOpen(id, String(o.seller_id), buyerId, String(o.product_name));
    }
    return this.threadPayload(id);
  }

  private async openBidThread(wantId: string, bidId: string, buyerId: string): Promise<Record<string, unknown>> {
    const { rows } = await this.pool.query(
      `SELECT b.seller_id, b.offer_id, b.product_name, b.unit, b.quote_per_unit_kobo, w.qty, w.buyer_id
         FROM market.bids b
         JOIN market.wants w ON w.id = b.want_id
        WHERE b.id = $1 AND b.want_id = $2`,
      [bidId, wantId],
    );
    if (rows.length === 0) throw new Error('Bid not found');
    const b = rows[0];
    if (String(b.buyer_id) !== buyerId) throw new Error('Not your want');

    const ask = Number(b.quote_per_unit_kobo);
    const floor = Math.max(5000, Math.round((ask * 0.9) / 5000) * 5000);
    const qty = Math.max(1, Number(b.qty));
    const existing = await this.pool.query(
      `SELECT id FROM market.negotiations WHERE want_id = $1 AND seller_id = $2`,
      [wantId, String(b.seller_id)],
    );
    const isNew = existing.rows.length === 0;
    const id = isNew
      ? await this.insertThread({
          buyerId,
          sellerId: String(b.seller_id),
          basisType: 'REQUEST',
          offerId: null,
          wantId,
          ask,
          floor,
          qty,
          demeanorSeed: `${String(b.seller_id)}:${wantId}`,
        })
      : String(existing.rows[0].id);
    if (isNew) await this.notifySellerOfOpen(id, String(b.seller_id), buyerId, String(b.product_name));
    return this.threadPayload(id);
  }

  private async insertThread(input: {
    buyerId: string;
    sellerId: string;
    basisType: 'OFFER' | 'REQUEST';
    offerId: string | null;
    wantId: string | null;
    ask: number;
    floor: number;
    qty: number;
    demeanorSeed: string;
  }): Promise<string> {
    await this.assertUser(input.buyerId);
    const { rows } = await this.pool.query(
      `INSERT INTO market.negotiations
         (buyer_id, seller_id, basis_type, offer_id, want_id, ask_per_unit_kobo,
          floor_per_unit_kobo, qty, demeanor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [input.buyerId, input.sellerId, input.basisType, input.offerId, input.wantId,
       input.ask, input.floor, input.qty, demeanorFor(input.demeanorSeed)],
    );
    return String(rows[0].id);
  }

  private async insertMessage(negotiationId: string, msg: {
    kind: string; side: string; qty: number; perUnitKobo: number | null; message: string;
  }): Promise<string> {
    const { rows } = await this.pool.query(
      `INSERT INTO market.negotiation_messages (negotiation_id, kind, side, qty, per_unit_kobo, message)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [negotiationId, msg.kind, msg.side, msg.qty, msg.perUnitKobo, msg.message],
    );
    await this.pool.query(`UPDATE market.negotiations SET updated_at = now() WHERE id = $1`, [negotiationId]);
    return String(rows[0].id);
  }

  async buyerBid(negotiationId: string, buyerId: string, qty: number, totalKobo: number, message: string): Promise<Record<string, unknown>> {
    const n = await this.assertThread(negotiationId);
    if (String(n.buyer_id) !== buyerId) throw new Error('Not your negotiation');
    if (String(n.observable) !== 'OPEN') throw new Error('Negotiation is not open');

    const perUnit = Math.max(50, Math.round((totalKobo / qty) / 50) * 50);
    const msgText = message.trim() || `I go pay ${label(perUnit)} each for ${qty}`;
    const bidMsgId = await this.insertMessage(negotiationId, {
      kind: 'BUYER_BID', side: 'BUYER', qty, perUnitKobo: perUnit, message: msgText,
    });
    await this.pool.query(
      `UPDATE market.negotiations SET qty = $1, updated_at = now() WHERE id = $2`,
      [qty, negotiationId],
    );

    await this.parkSellerReply(negotiationId, n, perUnit, qty);

    void this.feed.publishMarket('market.negotiation_message', negotiationId, {
      negotiation_id: negotiationId,
      buyer_id: String(n.buyer_id),
      seller_id: String(n.seller_id),
      message_id: bidMsgId,
      kind: 'BUYER_BID', side: 'BUYER', qty, per_unit_kobo: perUnit,
    });

    return this.threadPayload(negotiationId);
  }

  /**
   * Park the seller's (simulated) answer to a buyer bid so the thread doesn't
   * resolve instantly: the reply_* columns are swept into real messages by
   * replySweep once due, then an SSE event + notification pull the buyer back.
   */
  private async parkSellerReply(
    negotiationId: string,
    n: Record<string, unknown>,
    bidPerUnitKobo: number,
    qty: number,
  ): Promise<void> {
    if (await this.isRealSeller(String(n.seller_id))) {
      // The seller actually exists on the portal: no deterministic reply.
      // Ping them so they can answer from the seller centre, and let the
      // buyer wait on a human instead of a scripted counter.
      await this.notify.notify(String(n.seller_id), {
        type: 'chat',
        title: `${firstName(String(n.buyer_name))} dey bargain your product`,
        body: `E propose ${label(bidPerUnitKobo)} each for ${qty} — reply make we close.`,
        deep_link: `/seller/negotiations/${negotiationId}`,
      });
      return;
    }
    const { rows: msgs } = await this.pool.query(
      `SELECT kind FROM market.negotiation_messages WHERE negotiation_id = $1 AND kind = 'BUYER_BID' ORDER BY created_at`,
      [negotiationId],
    );
    const round = Math.max(0, msgs.length - 1);
    const r = sellerResponse({
      bidPerUnitKobo,
      qty,
      askPerUnitKobo: Number(n.ask_per_unit_kobo),
      floorPerUnitKobo: Number(n.floor_per_unit_kobo),
      demeanor: String(n.demeanor) as 'easy' | 'fair' | 'tough',
      round,
    });
    const unit = n.basis_type === 'OFFER' ? (n.offer_unit ? String(n.offer_unit) : null) : null;
    const delayMs = 5000 + (hashCode(`${negotiationId}:${bidPerUnitKobo}:${Date.now()}`) % 7000);
    await this.pool.query(
      `UPDATE market.negotiations
          SET reply_at = now() + ($1 || ' milliseconds')::interval,
              reply_kind = $2, reply_per_unit_kobo = $3, reply_qty = $4, reply_text = $5,
              updated_at = now()
        WHERE id = $6`,
      [
        delayMs,
        r.kind,
        r.perUnitKobo,
        qty,
        sellerMessageText(r.kind, r.perUnitKobo, unit ?? 'unit', qty),
        negotiationId,
      ],
    );
  }

  async accept(negotiationId: string, buyerId: string, perUnitKobo: number): Promise<Record<string, unknown>> {
    const n = await this.assertThread(negotiationId);
    if (String(n.buyer_id) !== buyerId) throw new Error('Not your negotiation');
    if (String(n.observable) === 'SETTLED') return this.threadPayload(negotiationId);

    await this.insertMessage(negotiationId, {
      kind: 'BUYER_ACCEPT', side: 'BUYER', qty: Number(n.qty), perUnitKobo,
      message: `Oya na so! ${label(perUnitKobo)} each. Make you pack am.`,
    });
    await this.pool.query(
      `UPDATE market.negotiations
          SET observable = 'SETTLED', freeze_expires_at = NULL,
              reply_at = NULL, reply_kind = NULL, reply_per_unit_kobo = NULL, reply_qty = NULL, reply_text = NULL,
              updated_at = now()
        WHERE id = $1`,
      [negotiationId],
    );
    return this.threadPayload(negotiationId);
  }

  /**
   * Seller drops a counter-offer onto an OPEN thread (the buyer made a bid
   * and the seller answers). Real sellers reply from the seller centre; the
   * buyer is notified right away — no simulated delay.
   */
  async sellerOffer(
    negotiationId: string,
    sellerId: string,
    perUnitKobo: number,
    qty?: number,
    message?: string,
  ): Promise<Record<string, unknown>> {
    const n = await this.assertThread(negotiationId);
    if (String(n.seller_id) !== sellerId) throw new Error('Not your negotiation');
    if (String(n.observable) !== 'OPEN') throw new Error('Negotiation is not open');

    const perUnit = Math.max(50, Math.round(perUnitKobo / 50) * 50);
    const newQty = qty != null ? Math.max(1, Math.floor(qty)) : Number(n.qty);
    const unit = n.basis_type === 'OFFER' ? (n.offer_unit ? String(n.offer_unit) : null) : null;
    const msgText =
      message?.trim() ||
      `Make we settle — I fit do ${label(perUnit)} each for the ${newQty} ${pluralUnit(unit, newQty)}.`;
    const msgId = await this.insertMessage(negotiationId, {
      kind: 'SELLER_OFFER', side: 'SELLER', qty: newQty, perUnitKobo: perUnit, message: msgText,
    });
    await this.pool.query(
      `UPDATE market.negotiations SET qty = $1, updated_at = now() WHERE id = $2`,
      [newQty, negotiationId],
    );
    await this.pool.query(
      `UPDATE market.negotiations
          SET reply_at = NULL, reply_kind = NULL, reply_per_unit_kobo = NULL, reply_qty = NULL, reply_text = NULL
        WHERE id = $1`,
      [negotiationId],
    );
    void this.feed.publishMarket('market.negotiation_message', negotiationId, {
      negotiation_id: negotiationId,
      buyer_id: String(n.buyer_id),
      seller_id: sellerId,
      message_id: msgId,
      kind: 'SELLER_OFFER', side: 'SELLER', qty: newQty, per_unit_kobo: perUnit,
    });
    await this.notify.notify(String(n.buyer_id), {
      type: 'chat',
      title: `${firstName(String(n.seller_name))} don reply your haggling`,
      body: `E drop ${label(perUnit)} each — make we settle.`,
      deep_link: `/negotiations/${negotiationId}`,
    });
    return this.threadPayload(negotiationId);
  }

  /**
   * Seller accepts the buyer's current offer on an OPEN thread and settles
   * the deal, mirroring the buyer's `accept` from the other side.
   */
  async sellerAccept(negotiationId: string, sellerId: string, perUnitKobo: number): Promise<Record<string, unknown>> {
    const n = await this.assertThread(negotiationId);
    if (String(n.seller_id) !== sellerId) throw new Error('Not your negotiation');
    if (String(n.observable) === 'SETTLED') return this.threadPayload(negotiationId);
    if (String(n.observable) !== 'OPEN') throw new Error('Negotiation is not open');

    const msgId = await this.insertMessage(negotiationId, {
      kind: 'SELLER_ACCEPT', side: 'SELLER', qty: Number(n.qty), perUnitKobo,
      message: `Na you win today o! ${label(perUnitKobo)} each. Don send am to your cart.`,
    });
    await this.pool.query(
      `UPDATE market.negotiations
          SET observable = 'SETTLED', freeze_expires_at = NULL,
              reply_at = NULL, reply_kind = NULL, reply_per_unit_kobo = NULL, reply_qty = NULL, reply_text = NULL,
              updated_at = now()
        WHERE id = $1`,
      [negotiationId],
    );
    void this.feed.publishMarket('market.negotiation_message', negotiationId, {
      negotiation_id: negotiationId,
      buyer_id: String(n.buyer_id),
      seller_id: sellerId,
      message_id: msgId,
      kind: 'SELLER_ACCEPT', side: 'SELLER', qty: Number(n.qty), per_unit_kobo: perUnitKobo,
    });
    await this.notify.notify(String(n.buyer_id), {
      type: 'deal',
      title: `${firstName(String(n.seller_name))} don agree with your price`,
      body: `${label(perUnitKobo)} each ${Number(n.qty)} — head to your cart.`,
      deep_link: `/negotiations/${negotiationId}`,
    });
    return this.threadPayload(negotiationId);
  }

  /**
   * Either party ends the haggle. The last price each side put on the table is
   * frozen for the other to grab ("Pay this" / "Sell for this") and the freeze
   * lasts 24h. The thread can be reopened on either side with continueBargain.
   */
  async endBargain(
    negotiationId: string,
    actorId: string,
    side: 'BUYER' | 'SELLER',
    message?: string,
  ): Promise<Record<string, unknown>> {
    const n = await this.assertThread(negotiationId);
    if (side === 'BUYER' && String(n.buyer_id) !== actorId) throw new Error('Not your negotiation');
    if (side === 'SELLER' && String(n.seller_id) !== actorId) throw new Error('Not your negotiation');
    if (String(n.observable) === 'SETTLED' || String(n.observable) === 'REVOKED') {
      throw new Error('Bargain don close for this side');
    }
    if (String(n.observable) === 'ENDED') return this.threadPayload(negotiationId);

    const { rows: prices } = await this.pool.query(
      `SELECT side, per_unit_kobo FROM market.negotiation_messages
        WHERE negotiation_id = $1 AND per_unit_kobo IS NOT NULL AND side IN ('BUYER', 'SELLER')
        ORDER BY created_at DESC, id DESC`,
      [negotiationId],
    );
    let frozenSeller: number | null = null;
    let frozenBuyer: number | null = null;
    for (const p of prices) {
      if (String(p.side) === 'SELLER' && frozenSeller == null) frozenSeller = Number(p.per_unit_kobo);
      else if (String(p.side) === 'BUYER' && frozenBuyer == null) frozenBuyer = Number(p.per_unit_kobo);
    }

    const endMsgId = await this.insertMessage(negotiationId, {
      kind: 'END', side, qty: Number(n.qty), perUnitKobo: null,
      message:
        message?.trim() ||
        (side === 'BUYER'
          ? 'Abeg make we lock dis one for now — I go reason am first.'
          : 'E don stand this side. If you wan run am, e still dey.'),
    });
    await this.pool.query(
      `UPDATE market.negotiations
          SET observable = 'ENDED', ended_at = now(), ended_by = $1,
              frozen_seller_per_unit_kobo = $2, frozen_buyer_per_unit_kobo = $3,
              freeze_expires_at = now() + interval '24 hours',
              reply_at = NULL, reply_kind = NULL, reply_per_unit_kobo = NULL, reply_qty = NULL, reply_text = NULL,
              updated_at = now()
        WHERE id = $4`,
      [side, frozenSeller, frozenBuyer, negotiationId],
    );

    void this.feed.publishMarket('market.negotiation_message', negotiationId, {
      negotiation_id: negotiationId,
      buyer_id: String(n.buyer_id),
      seller_id: String(n.seller_id),
      message_id: endMsgId,
      kind: 'END', side, qty: Number(n.qty), per_unit_kobo: null,
    });
    return this.threadPayload(negotiationId);
  }

  /**
   * Accept the other side's frozen price while a bargain is ENDED. The buyer
   * "Pays this" (frozen seller price), the seller "Sells for this" (frozen
   * buyer price). Only the first side lands a deal — the second gets a race
   * error. The freeze also expires server-side after 24h.
   */
  async acceptFrozen(negotiationId: string, actorId: string, side: 'BUYER' | 'SELLER'): Promise<Record<string, unknown>> {
    const n = await this.assertThread(negotiationId);
    if (side === 'BUYER' && String(n.buyer_id) !== actorId) throw new Error('Not your negotiation');
    if (side === 'SELLER' && String(n.seller_id) !== actorId) throw new Error('Not your negotiation');
    if (String(n.observable) === 'REVOKED') throw new Error('Bargain don close for this side');
    if (String(n.observable) !== 'ENDED') throw new Error('Negotiation is not ended');

    const perUnit = side === 'BUYER' ? Number(n.frozen_seller_per_unit_kobo) : Number(n.frozen_buyer_per_unit_kobo);
    if (!Number.isFinite(perUnit) || perUnit <= 0) {
      throw new Error(side === 'BUYER' ? 'Seller never drop any price — no fit pay' : 'Buyer never drop any price — no fit sell');
    }
    const expires = n.freeze_expires_at ? new Date(String(n.freeze_expires_at)).getTime() : null;
    if (expires != null && expires < Date.now()) {
      throw new Error('The frozen price don expire — run continue bargain make e still dey');
    }

    const updated = await this.pool.query(
      `UPDATE market.negotiations
          SET observable = 'SETTLED', freeze_expires_at = NULL, updated_at = now()
        WHERE id = $1 AND observable = 'ENDED'
        RETURNING id`,
      [negotiationId],
    );
    if ((updated.rowCount ?? 0) === 0) throw new Error('The deal don close for the other side first');
    await this.pool.query(
      `UPDATE market.negotiations
          SET reply_at = NULL, reply_kind = NULL, reply_per_unit_kobo = NULL, reply_qty = NULL, reply_text = NULL
        WHERE id = $1`,
      [negotiationId],
    );

    const kind = side === 'BUYER' ? 'BUYER_ACCEPT' : 'SELLER_ACCEPT';
    const msgText =
      side === 'BUYER'
        ? `Oya na so! ${label(perUnit)} each. I don collect am — make you pack am.`
        : `Since you talk am be that, na so we go do. ${label(perUnit)} each — don send am to your cart.`;
    const msgId = await this.insertMessage(negotiationId, {
      kind, side, qty: Number(n.qty), perUnitKobo: perUnit, message: msgText,
    });
    void this.feed.publishMarket('market.negotiation_message', negotiationId, {
      negotiation_id: negotiationId,
      buyer_id: String(n.buyer_id),
      seller_id: String(n.seller_id),
      message_id: msgId,
      kind, side, qty: Number(n.qty), per_unit_kobo: perUnit,
    });
    return this.threadPayload(negotiationId);
  }

  /**
   * Either side reopens an ENDED thread by putting a new price on the table:
   * the freeze is lifted and normal haggling resumes. A buyer reopening parks
   * the seller's automated reply (same as a normal bid); a seller reopening
   * drops their price straight onto the thread.
   */
  async continueBargain(
    negotiationId: string,
    actorId: string,
    side: 'BUYER' | 'SELLER',
    perUnitKobo: number,
    qty?: number,
    message?: string,
  ): Promise<Record<string, unknown>> {
    const n = await this.assertThread(negotiationId);
    if (side === 'BUYER' && String(n.buyer_id) !== actorId) throw new Error('Not your negotiation');
    if (side === 'SELLER' && String(n.seller_id) !== actorId) throw new Error('Not your negotiation');
    if (String(n.observable) !== 'ENDED') throw new Error('Negotiation is not ended');

    const perUnit = Math.max(50, Math.round(perUnitKobo / 50) * 50);
    const newQty = qty != null ? Math.max(1, Math.floor(qty)) : Number(n.qty);
    const kind = side === 'BUYER' ? 'BUYER_BID' : 'SELLER_OFFER';
    const msgText =
      message?.trim() ||
      (side === 'BUYER'
        ? `Abeg make we still talk. I go pay ${label(perUnit)} each for the ${newQty}.`
        : `Oya make we still talk. I fit do ${label(perUnit)} each for the ${newQty}.`);
    const msgId = await this.insertMessage(negotiationId, {
      kind, side, qty: newQty, perUnitKobo: perUnit, message: msgText,
    });
    await this.pool.query(
      `UPDATE market.negotiations
          SET observable = 'OPEN', ended_at = NULL, ended_by = NULL,
              frozen_seller_per_unit_kobo = NULL, frozen_buyer_per_unit_kobo = NULL,
              freeze_expires_at = NULL, qty = $1, updated_at = now()
        WHERE id = $2`,
      [newQty, negotiationId],
    );

    if (side === 'BUYER') {
      await this.parkSellerReply(negotiationId, n, perUnit, newQty);
    }
    void this.feed.publishMarket('market.negotiation_message', negotiationId, {
      negotiation_id: negotiationId,
      buyer_id: String(n.buyer_id),
      seller_id: String(n.seller_id),
      message_id: msgId,
      kind, side, qty: newQty, per_unit_kobo: perUnit,
    });
    return this.threadPayload(negotiationId);
  }

  /**
   * Buyer removes a settled deal from the cart: the thread is marked REVOKED
   * with a notice, and the seller is notified so they can reach out and try
   * to win the deal back (deep link straight into their existing chat).
   */
  async revokeDeal(negotiationId: string, buyerId: string): Promise<Record<string, unknown>> {
    const n = await this.assertThread(negotiationId);
    if (String(n.buyer_id) !== buyerId) throw new Error('Not your negotiation');
    if (String(n.observable) !== 'SETTLED') throw new Error('Only a settled deal fit be revoked');

    const qty = Number(n.qty);
    const offerId = n.offer_id ? String(n.offer_id) : null;
    const conversation = await this.getOrCreateConversation({
      buyer_id: buyerId,
      seller_id: String(n.seller_id),
      offer_id: offerId,
    });

    const revokeMsgId = await this.insertMessage(negotiationId, {
      kind: 'REVOKE', side: 'BUYER', qty, perUnitKobo: null,
      message: `Massa, I don commot this one from my cart for now — no vex. If I change my mind, go come settle.`,
    });
    const updated = await this.pool.query(
      `UPDATE market.negotiations
          SET observable = 'REVOKED', reply_at = NULL, reply_kind = NULL,
              reply_per_unit_kobo = NULL, reply_qty = NULL, reply_text = NULL, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [negotiationId],
    );
    if ((updated.rowCount ?? 0) === 0) throw new Error('Negotiation no dey again');

    void this.feed.publishMarket('market.negotiation_message', negotiationId, {
      negotiation_id: negotiationId,
      buyer_id: buyerId,
      seller_id: String(n.seller_id),
      message_id: revokeMsgId,
      kind: 'REVOKE', side: 'BUYER', qty, per_unit_kobo: null,
    });
    await this.feedService.push(String(n.seller_id), {
      type: 'chat',
      title: `${firstName(String(n.buyer_name))} don commot the deal`,
      body: `The one wey you settle for ${qty} no stay for cart again. Ask am why e commot am.`,
      deep_link: `/chat/${String(conversation.id)}`,
    });
    return this.threadPayload(negotiationId);
  }

  private async getOrCreateConversation(input: {
    buyer_id: string;
    seller_id: string;
    offer_id: string | null;
  }): Promise<{ id: string }> {
    const existing = await this.pool.query(
      `SELECT id FROM chat.conversations
        WHERE buyer_id = $1 AND seller_id = $2 AND (offer_id = $3 OR $3::uuid IS NULL)
        ORDER BY updated_at DESC LIMIT 1`,
      [input.buyer_id, input.seller_id, input.offer_id],
    );
    if (existing.rows.length > 0) return { id: String(existing.rows[0].id) };
    const { rows } = await this.pool.query(
      `INSERT INTO chat.conversations (buyer_id, seller_id, offer_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [input.buyer_id, input.seller_id, input.offer_id],
    );
    return { id: String(rows[0].id) };
  }

  /* ----------------------- reply machine (async) ----------------------- */

  /**
   * Sweeps for parked seller replies: when a buyer bids, the seller's answer
   * is kept off the thread (reply_* columns) so the negotiation doesn't end
   * instantly. This sweep inserts it once due, then pushes an SSE event plus
   * an in-app notification so the buyer — who may be shopping elsewhere —
   * comes back when there's an update. Runs on the same 3s interval.
   */
  async replySweep(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT n.id, n.buyer_id, n.seller_id, su.full_name AS seller_name,
                n.reply_kind, n.reply_per_unit_kobo, n.reply_qty, n.reply_text
           FROM market.negotiations n
           JOIN pii.users su ON su.id = n.seller_id
          WHERE n.observable = 'OPEN' AND n.reply_at IS NOT NULL AND n.reply_at <= now()
          FOR UPDATE SKIP LOCKED`,
      );
      for (const r of rows) {
        const id = String(r.id);
        const kind = String(r.reply_kind);
        const perUnit = Number(r.reply_per_unit_kobo);
        const qty = Number(r.reply_qty);
        const text = String(r.reply_text);
        const inserted = await client.query(
          `INSERT INTO market.negotiation_messages (negotiation_id, kind, side, qty, per_unit_kobo, message)
           VALUES ($1,$2,'SELLER',$3,$4,$5) RETURNING id`,
          [id, kind, qty, perUnit, text],
        );
        await client.query(
          `UPDATE market.negotiations
              SET reply_at = NULL, reply_kind = NULL, reply_per_unit_kobo = NULL,
                  reply_qty = NULL, reply_text = NULL, updated_at = now()
            WHERE id = $1`,
          [id],
        );
        void this.feed.publishMarket('market.negotiation_message', id, {
          negotiation_id: id,
          buyer_id: String(r.buyer_id),
          seller_id: String(r.seller_id),
          message_id: String(inserted.rows[0].id),
          kind: kind as 'SELLER_OFFER' | 'SELLER_ACCEPT',
          side: 'SELLER',
          qty,
          per_unit_kobo: perUnit,
        });
        await this.feedService.push(String(r.buyer_id), {
          type: 'chat',
          title: `${firstName(String(r.seller_name))} don reply your haggling`,
          body: `New price ${label(perUnit)} each — make we settle.`,
          deep_link: `/negotiations/${id}`,
        });
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`reply sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      client.release();
    }
  }

  /* ----------------------- empty-thread prune ------------------------ */

  /**
   * Drops OPEN threads that were created but never carried a single message
   * (the buyer opened a haggle and walked off before bidding). Older than a
   * day they're just clutter, so this sweep deletes them to stop the
   * Haggling list showing empty stubs. Runs on the same 3s interval.
   */
  async pruneEmptyThreads(): Promise<void> {
    try {
      const { rows } = await this.pool.query(
        `DELETE FROM market.negotiations n
          WHERE n.observable = 'OPEN'
            AND n.created_at < now() - interval '1 day'
            AND NOT EXISTS (
              SELECT 1 FROM market.negotiation_messages m WHERE m.negotiation_id = n.id
            )`,
      );
      if (rows.length > 0) this.logger.log(`pruned ${rows.length} empty negotiation thread(s)`);
    } catch (err) {
      this.logger.error(`empty-thread prune failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  }
