import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import { MarketFeedService } from '../realtime/market-feed.service.js';
import type { AuthUser } from '../auth/auth.service.js';

export interface DiscoverOffersQuery {
  channel?: string;
  cluster_id?: string;
  perishability?: string;
  category_id?: string;
  q?: string;
  price_min?: number;
  price_max?: number;
  sort?: 'newest' | 'popular' | 'cheapest';
  limit?: number;
  offset?: number;
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(MarketFeedService) private readonly feed: MarketFeedService,
  ) {}

  async discoverOffers(query: DiscoverOffersQuery): Promise<{
    offers: Array<Record<string, unknown>>;
    total: number;
  }> {
    const conditions: string[] = [
      `o.status = 'ACTIVE'`,
      `o.available_qty > o.reserved_qty + o.soft_held_qty`,
    ];
    const params: unknown[] = [];
    let idx = 1;

    if (query.channel) {
      conditions.push(`o.channel = $${idx++}`);
      params.push(query.channel);
    }
    if (query.cluster_id) {
      conditions.push(`o.cluster_id = $${idx++}`);
      params.push(query.cluster_id);
    }
    if (query.perishability) {
      conditions.push(`o.perishability = $${idx++}`);
      params.push(query.perishability);
    }
    if (query.category_id) {
      conditions.push(
        `(l.category_id = $${idx} OR l.category_id IN (SELECT id FROM catalog.categories WHERE parent_id = $${idx}))`,
      );
      params.push(query.category_id);
      idx++;
    }
    if (query.q) {
      conditions.push(`l.product_name ILIKE $${idx++}`);
      params.push(`%${query.q}%`);
    }
    if (query.price_min != null) {
      conditions.push(`p.new_price_cents >= $${idx++}`);
      params.push(query.price_min);
    }
    if (query.price_max != null) {
      conditions.push(`p.new_price_cents <= $${idx++}`);
      params.push(query.price_max);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (
           SELECT max(p2.changed_at)
           FROM catalog.offer_price_history p2
           WHERE p2.offer_id = o.id
         )
       ${where}`,
      params,
    );
    const total = Number(countResult.rows[0].count);

    const { rows } = await this.pool.query(
      `SELECT
         o.id,
         o.seller_id,
         u.full_name AS seller_name,
         o.channel,
         o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
         o.min_order_qty,
         o.perishability,
         o.fulfilment_modes,
         o.cluster_id,
         o.created_at,
         o.negotiable,
         o.unit,
         l.product_name,
         l.physical_ref,
         l.category_id,
         p.new_price_cents::int AS price_cents,
         COALESCE(
           (SELECT json_build_object('id', m.id, 'storage_key', m.storage_key)
            FROM catalog.offer_media m
            WHERE m.offer_id = o.id AND m.is_primary = TRUE
            LIMIT 1),
           'null'
         ) AS primary_image
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       JOIN pii.users u ON u.id = o.seller_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (
           SELECT max(p2.changed_at)
           FROM catalog.offer_price_history p2
           WHERE p2.offer_id = o.id
         )
       LEFT JOIN catalog.seller_profiles sp ON sp.user_id = o.seller_id
       ${where}
       ORDER BY sp.visibility_penalty ASC,
         ${query.sort === 'cheapest' ? 'p.new_price_cents ASC' : query.sort === 'popular' ? 'o.available_qty DESC' : 'o.created_at DESC'}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return { offers: rows, total };
  }

  async findOfferById(offerId: string): Promise<Record<string, unknown>> {
    const { rows } = await this.pool.query(
      `SELECT
         o.id,
         o.seller_id,
         u.full_name AS seller_name,
         o.channel,
         o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
         o.min_order_qty,
         o.perishability,
         o.fulfilment_modes,
         o.cluster_id,
         o.created_at,
         o.negotiable,
         o.unit,
         l.product_name,
         l.physical_ref,
         l.category_id,
         p.new_price_cents::int AS price_cents,
         sp.stall_number,
         sp.market_name,
         sp.member_since,
         sp.profile_photo_url,
         sp.years_in_market,
         COALESCE(
           (SELECT json_agg(json_build_object('id', m.id, 'storage_key', m.storage_key, 'kind', m.kind, 'is_primary', m.is_primary))
            FROM catalog.offer_media m
            WHERE m.offer_id = o.id),
           '[]'
         ) AS images,
         COALESCE(
           (SELECT json_build_object(
             'avg_rating', (SELECT AVG(rating)::numeric(3,2) FROM catalog.reviews WHERE seller_id = o.seller_id),
             'review_count', (SELECT COUNT(*)::int FROM catalog.reviews WHERE seller_id = o.seller_id)
           )),
           '{"avg_rating": null, "review_count": 0}'
         ) AS seller_stats
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       JOIN pii.users u ON u.id = o.seller_id
       LEFT JOIN catalog.seller_profiles sp ON sp.user_id = o.seller_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (
           SELECT max(p2.changed_at)
           FROM catalog.offer_price_history p2
           WHERE p2.offer_id = o.id
         )
       WHERE o.id = $1`,
      [offerId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Offer ${offerId} not found`);
    }

    return rows[0];
  }

  async getCategories(): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT
         c.id,
         c.name,
         c.perishability_default,
         c.image_url,
         c.parent_id,
         c.menu_section,
         COUNT(l.id)::int AS offer_count
       FROM catalog.categories c
       LEFT JOIN catalog.lots l ON l.category_id = c.id
       LEFT JOIN catalog.offers o ON o.lot_id = l.id AND o.status = 'ACTIVE'
         AND o.available_qty > o.reserved_qty + o.soft_held_qty
       GROUP BY c.id, c.name, c.perishability_default, c.image_url, c.parent_id, c.menu_section
       ORDER BY c.name`,
    );

    const byParent = new Map<string | null, typeof rows>();
    for (const r of rows) {
      const key = r.parent_id ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(r);
    }

    const result: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      if (r.parent_id) continue;
      const children = (byParent.get(r.id) ?? []).map((ch) => ({
        id: ch.id,
        name: ch.name,
        perishability_default: ch.perishability_default,
        image_url: ch.image_url,
        menu_section: ch.menu_section ?? null,
        offer_count: ch.offer_count,
      }));
      result.push({
        id: r.id,
        name: r.name,
        perishability_default: r.perishability_default,
        image_url: r.image_url,
        offer_count: r.offer_count,
        children,
      });
    }
    return result;
  }

  async createOffer(input: {
    seller_id: string;
    product_name: string;
    physical_ref: string;
    channel: string;
    available_qty: number;
    min_order_qty: number;
    perishability: string;
    fulfilment_modes: string[];
    cluster_id: string;
    price_cents: number;
    category_id?: string;
    unit?: string;
  }): Promise<{ offer_id: string; lot_id: string }> {
    await this.assertCanSell(input.seller_id);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: lotRows } = await client.query(
        `INSERT INTO catalog.lots (seller_id, product_name, physical_ref, category_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [input.seller_id, input.product_name, input.physical_ref, input.category_id || null],
      );
      const lotId: string = lotRows[0].id;

      const { rows: offerRows } = await client.query(
        `INSERT INTO catalog.offers
           (seller_id, channel, lot_id, available_qty, min_order_qty,
            perishability, fulfilment_modes, cluster_id, geo, unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
            ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography, $9)
         RETURNING id`,
        [
          input.seller_id,
          input.channel,
          lotId,
          input.available_qty,
          input.min_order_qty,
          input.perishability,
          input.fulfilment_modes,
          input.cluster_id,
          input.unit?.trim() || null,
        ],
      );
      const offerId: string = offerRows[0].id;

      await client.query(
        `INSERT INTO catalog.offer_price_history (offer_id, new_price_cents)
         VALUES ($1, $2)`,
        [offerId, input.price_cents],
      );

      await client.query('COMMIT');
      void this.feed.announceOfferCreated(offerId, input.product_name, input.price_cents);
      return { offer_id: offerId, lot_id: lotId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Any registered seller (BASIC tier) may list offers — the account info
   * gathered at sign-up plus their business profile is enough to start.
   * Full identity KYC unlocks payouts and the verified badge, not listing.
   */
  private async assertCanSell(sellerId: string): Promise<void> {
    const { rows } = await this.pool.query(
      `SELECT id, full_name FROM pii.users
        WHERE id = $1 AND seller_type IS NOT NULL AND status = 'ACTIVE'`,
      [sellerId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException('Only registered sellers can create offers. Register as a seller to get started.');
    }
  }

  async updateOfferPrice(
    offerId: string,
    newPriceCents: number,
    actor?: AuthUser,
  ): Promise<{ offer_id: string; old_price_cents: number; new_price_cents: number }> {
    if (!Number.isInteger(newPriceCents) || newPriceCents < 0) {
      throw new NotFoundException('Invalid price');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT o.seller_id, l.product_name
           FROM catalog.offers o
           JOIN catalog.lots l ON l.id = o.lot_id
          WHERE o.id = $1
          FOR UPDATE`,
        [offerId],
      );
      if (rows.length === 0) {
        throw new NotFoundException(`Offer ${offerId} not found`);
      }
      const sellerId = String(rows[0].seller_id);
      if (actor && actor.id !== sellerId && !actor.roles.some((r) => r === 'OPS' || r === 'AGENT')) {
        throw new ForbiddenException('This offer belongs to another seller');
      }
      const productName = String(rows[0].product_name);

      const { rows: historyRows } = await client.query(
        `SELECT new_price_cents
           FROM catalog.offer_price_history
          WHERE offer_id = $1
          ORDER BY changed_at DESC, id DESC
          LIMIT 1`,
        [offerId],
      );
      const oldPriceCents = historyRows.length > 0 ? Number(historyRows[0].new_price_cents) : newPriceCents;

      if (oldPriceCents !== newPriceCents) {
        await client.query(
          `INSERT INTO catalog.offer_price_history (offer_id, old_price_cents, new_price_cents)
           VALUES ($1, $2, $3)`,
          [offerId, oldPriceCents, newPriceCents],
        );
      }

      await client.query('COMMIT');
      void this.feed.announceOfferPriceChanged(offerId, productName, oldPriceCents, newPriceCents);
      return { offer_id: offerId, old_price_cents: oldPriceCents, new_price_cents: newPriceCents };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getClusters(state?: string, lga?: string): Promise<Array<Record<string, unknown>>> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (state) { conditions.push(`c.state = $${idx++}`); params.push(state); }
    if (lga) { conditions.push(`c.lga = $${idx++}`); params.push(lga); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.pool.query(
      `SELECT c.id, c.name, c.lga, c.state
       FROM catalog.clusters c
       ${where}
       ORDER BY c.name`,
      params,
    );
    return rows;
  }

  async getStates(): Promise<Array<{ state: string; cluster_count: number }>> {
    const { rows } = await this.pool.query(
      `SELECT state, COUNT(*)::int AS cluster_count
       FROM catalog.clusters
       GROUP BY state
       ORDER BY state`,
    );
    return rows;
  }

  async getLgas(state: string): Promise<Array<{ lga: string; cluster_count: number }>> {
    const { rows } = await this.pool.query(
      `SELECT lga, COUNT(*)::int AS cluster_count
       FROM catalog.clusters
       WHERE state = $1
       GROUP BY lga
       ORDER BY lga`,
      [state],
    );
    return rows;
  }

  async getMarkets(clusterId?: string, date?: string): Promise<Array<Record<string, unknown>>> {
    const DAY_MAP: Record<string, number> = {
      SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
    };
    let filterDate: Date | null = null;
    if (date) {
      filterDate = new Date(date + 'T00:00:00');
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (clusterId) { conditions.push(`m.cluster_id = $${idx++}`); params.push(clusterId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: markets } = await this.pool.query(
      `SELECT
         m.id, m.name, m.calendar, m.order_cutoff,
         c.id AS cluster_id, c.name AS cluster_name, c.lga, c.state
       FROM catalog.markets m
       JOIN catalog.clusters c ON c.id = m.cluster_id
       ${where}
       ORDER BY c.name, m.name`,
      params,
    );

    const now = new Date();
    const todayDow = now.getDay();

    const results: Array<Record<string, unknown>> = [];

    for (const m of markets) {
      const calDays: string[] = m.calendar?.days ?? [];
      const dayNums = calDays.map((d: string) => DAY_MAP[d]).filter((d: number) => d !== undefined);

      // Filter by date: skip markets that don't operate on the requested day
      if (filterDate && dayNums.length > 0) {
        const filterDow = filterDate.getDay();
        if (!dayNums.includes(filterDow)) continue;
      }

      let nextDate: Date | null = null;
      if (dayNums.length > 0) {
        for (let offset = 0; offset <= 7; offset++) {
          const candidate = (todayDow + offset) % 7;
          if (dayNums.includes(candidate)) {
            nextDate = new Date(now);
            nextDate.setDate(now.getDate() + offset);
            nextDate.setHours(0, 0, 0, 0);
            break;
          }
        }
      }

      const isToday = nextDate !== null &&
        nextDate.getFullYear() === now.getFullYear() &&
        nextDate.getMonth() === now.getMonth() &&
        nextDate.getDate() === now.getDate();

      const { rows: sellerRows } = await this.pool.query(
        `SELECT DISTINCT u.id, u.full_name, u.seller_type
         FROM catalog.market_sellers ms
         JOIN pii.users u ON u.id = ms.seller_id
         WHERE ms.market_id = $1`,
        [m.id],
      );

      const { rows: countRows } = await this.pool.query(
        `SELECT COUNT(*)::int AS product_count
         FROM catalog.offers o
         WHERE o.market_id = $1 AND o.status = 'ACTIVE'
           AND o.available_qty > o.reserved_qty + o.soft_held_qty`,
        [m.id],
      );

      const nextDateStr = nextDate ? nextDate.toISOString().split('T')[0] : null;
      const isOpenOnFilter = filterDate ? true : isToday;

      results.push({
        id: m.id,
        name: m.name,
        cluster_id: m.cluster_id,
        cluster_name: m.cluster_name,
        lga: m.lga,
        state: m.state,
        operating_days: calDays,
        next_date: nextDateStr,
        is_open_today: isToday,
        is_open_on_date: isOpenOnFilter,
        sellers: sellerRows,
        product_count: countRows[0]?.product_count ?? 0,
      });
    }

    results.sort((a, b) => {
      if (a.is_open_today && !b.is_open_today) return -1;
      if (!a.is_open_today && b.is_open_today) return 1;
      if (a.next_date && b.next_date) return (a.next_date as string).localeCompare(b.next_date as string);
      return 0;
    });

    return results;
  }

  async getMarketById(marketId: string): Promise<Record<string, unknown>> {
    const { rows } = await this.pool.query(
      `SELECT
         m.id, m.name, m.calendar, m.order_cutoff,
         c.id AS cluster_id, c.name AS cluster_name, c.lga, c.state
       FROM catalog.markets m
       JOIN catalog.clusters c ON c.id = m.cluster_id
       WHERE m.id = $1`,
      [marketId],
    );
    if (rows.length === 0) throw new NotFoundException(`Market ${marketId} not found`);

    const market = rows[0];
    const calDays: string[] = market.calendar?.days ?? [];

    // Sellers grouped by type
    const { rows: sellerRows } = await this.pool.query(
      `SELECT DISTINCT u.id, u.full_name, u.seller_type
       FROM catalog.market_sellers ms
       JOIN pii.users u ON u.id = ms.seller_id
       WHERE ms.market_id = $1`,
      [marketId],
    );

    const sellerGroups: Record<string, Array<Record<string, unknown>>> = {};
    for (const s of sellerRows) {
      const type = s.seller_type || 'UNKNOWN';
      if (!sellerGroups[type]) sellerGroups[type] = [];
      sellerGroups[type].push(s);
    }

    // Product count
    const { rows: countRows } = await this.pool.query(
      `SELECT COUNT(*)::int AS product_count
       FROM catalog.offers o
       WHERE o.market_id = $1 AND o.status = 'ACTIVE'
         AND o.available_qty > o.reserved_qty + o.soft_held_qty`,
      [marketId],
    );

    return {
      ...market,
      operating_days: calDays,
      sellers: sellerRows,
      seller_groups: sellerGroups,
      product_count: countRows[0]?.product_count ?? 0,
    };
  }

  async getMarketSellers(marketId: string, sellerType?: string): Promise<Array<Record<string, unknown>>> {
    const conditions = [`ms.market_id = $1`];
    const params: unknown[] = [marketId];
    let idx = 2;
    if (sellerType) { conditions.push(`u.seller_type = $${idx++}`); params.push(sellerType); }

    const { rows } = await this.pool.query(
      `SELECT u.id, u.full_name, u.seller_type,
              COUNT(DISTINCT o.id)::int AS product_count
       FROM catalog.market_sellers ms
       JOIN pii.users u ON u.id = ms.seller_id
       LEFT JOIN catalog.offers o ON o.seller_id = u.id AND o.market_id = ms.market_id
         AND o.status = 'ACTIVE' AND o.available_qty > o.reserved_qty + o.soft_held_qty
       WHERE ${conditions.join(' AND ')}
       GROUP BY u.id, u.full_name, u.seller_type
       ORDER BY u.full_name`,
      params,
    );
    return rows;
  }

  async getSellerById(sellerId: string): Promise<Record<string, unknown>> {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.full_name, u.seller_type,
              sp.kyc_tier, sp.business_name,
              CASE WHEN sp.kyc_tier = 'FULL' THEN TRUE ELSE FALSE END AS verified,
              sp.bio, sp.seller_type AS profile_type,
              sp.stall_number, sp.market_name, sp.member_since,
              sp.profile_photo_url, sp.years_in_market,
              sp.avg_rating, sp.review_count,
              sp.completed_orders, sp.total_orders,
              CASE WHEN sp.total_orders > 0
                THEN ROUND((sp.completed_orders::numeric / sp.total_orders) * 100, 1)
                ELSE 100
              END AS completion_rate
       FROM pii.users u
       LEFT JOIN catalog.seller_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1`,
      [sellerId],
    );
    if (rows.length === 0) throw new NotFoundException(`Seller ${sellerId} not found`);

    const seller = rows[0];

    // Markets this seller operates at
    const { rows: marketRows } = await this.pool.query(
      `SELECT m.id, m.name, c.name AS cluster_name, c.lga
       FROM catalog.market_sellers ms
       JOIN catalog.markets m ON m.id = ms.market_id
       JOIN catalog.clusters c ON c.id = m.cluster_id
       WHERE ms.seller_id = $1`,
      [sellerId],
    );

    // Active products
    const { rows: productRows } = await this.pool.query(
      `SELECT
         o.id, o.channel, o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
         o.min_order_qty, o.perishability, o.fulfilment_modes, o.cluster_id,
         l.product_name, l.physical_ref, l.category_id,
         p.new_price_cents::int AS price_cents,
         COALESCE(
           (SELECT json_build_object('id', m.id, 'storage_key', m.storage_key)
            FROM catalog.offer_media m
            WHERE m.offer_id = o.id AND m.is_primary = TRUE
            LIMIT 1),
           'null'
         ) AS primary_image
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (
           SELECT max(p2.changed_at) FROM catalog.offer_price_history p2
           WHERE p2.offer_id = o.id
         )
       WHERE o.seller_id = $1 AND o.status = 'ACTIVE'
         AND o.available_qty > o.reserved_qty + o.soft_held_qty
       ORDER BY o.created_at DESC`,
      [sellerId],
    );

    return {
      ...seller,
      markets: marketRows,
      products: productRows,
    };
  }

  async getSimilarOffers(offerId: string, limit = 8): Promise<Array<Record<string, unknown>>> {
    const { rows: offerRows } = await this.pool.query(
      `SELECT l.category_id, o.seller_id, o.cluster_id
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       WHERE o.id = $1`,
      [offerId],
    );
    if (offerRows.length === 0) throw new NotFoundException(`Offer ${offerId} not found`);
    const { category_id, seller_id } = offerRows[0];

    const { rows } = await this.pool.query(
      `SELECT
         o.id, o.seller_id, u.full_name AS seller_name, o.channel,
         o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
         o.min_order_qty, o.perishability, o.fulfilment_modes, o.cluster_id,
         l.product_name, l.physical_ref, l.category_id,
         p.new_price_cents::int AS price_cents,
         COALESCE(
           (SELECT json_build_object('id', m.id, 'storage_key', m.storage_key)
            FROM catalog.offer_media m
            WHERE m.offer_id = o.id AND m.is_primary = TRUE
            LIMIT 1),
           'null'
         ) AS primary_image
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       JOIN pii.users u ON u.id = o.seller_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (
           SELECT max(p2.changed_at) FROM catalog.offer_price_history p2
           WHERE p2.offer_id = o.id
         )
       WHERE o.status = 'ACTIVE'
         AND o.available_qty > o.reserved_qty + o.soft_held_qty
         AND l.category_id = $1
         AND o.seller_id != $2
       ORDER BY RANDOM()
       LIMIT $3`,
      [category_id, seller_id, limit],
    );
    return rows;
  }

  async getBatchOffers(ids: string[]): Promise<Array<Record<string, unknown>>> {
    if (ids.length === 0) return [];
    const params = ids.map((_, i) => `$${i + 1}`);
    const { rows } = await this.pool.query(
      `SELECT
         o.id, o.seller_id, u.full_name AS seller_name, o.channel,
         o.unit, o.negotiable,
         o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
         o.min_order_qty, o.perishability, o.fulfilment_modes, o.cluster_id,
         o.created_at, l.product_name, l.physical_ref, l.category_id,
         p.new_price_cents::int AS price_cents,
         COALESCE(
           (SELECT json_build_object('id', m.id, 'storage_key', m.storage_key)
            FROM catalog.offer_media m WHERE m.offer_id = o.id AND m.is_primary = TRUE LIMIT 1),
           'null'
         ) AS primary_image
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       JOIN pii.users u ON u.id = o.seller_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (SELECT max(p2.changed_at) FROM catalog.offer_price_history p2 WHERE p2.offer_id = o.id)
       WHERE o.id IN (${params.join(',')})
         AND o.status = 'ACTIVE'`,
      ids,
    );
    return rows;
  }

  /* ── wishlist ── */

  async listWishlist(userId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT wi.created_at AS wished_at,
              o.id, o.seller_id, u.full_name AS seller_name, o.channel, o.status,
              o.unit, o.negotiable,
              o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
              o.min_order_qty, o.perishability, o.fulfilment_modes, o.cluster_id,
              o.created_at, l.product_name, l.physical_ref, l.category_id,
              p.new_price_cents::int AS price_cents,
              COALESCE(
                (SELECT json_build_object('id', m.id, 'storage_key', m.storage_key)
                 FROM catalog.offer_media m WHERE m.offer_id = o.id AND m.is_primary = TRUE LIMIT 1),
                'null'
              ) AS primary_image
       FROM catalog.wishlist_items wi
       JOIN catalog.offers o ON o.id = wi.offer_id
       JOIN catalog.lots l ON l.id = o.lot_id
       JOIN pii.users u ON u.id = o.seller_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (SELECT max(p2.changed_at) FROM catalog.offer_price_history p2 WHERE p2.offer_id = o.id)
       WHERE wi.user_id = $1
       ORDER BY wi.created_at DESC`,
      [userId],
    );
    return rows.map((r) => {
      const { wished_at, ...offer } = r;
      return { offer_id: String(offer.id), wished_at: String(wished_at), offer };
    });
  }

  async addWishlistItem(userId: string, offerId: string): Promise<Record<string, unknown>> {
    const offer = await this.pool.query(
      'SELECT 1 FROM catalog.offers WHERE id = $1',
      [offerId],
    );
    if (offer.rows.length === 0) throw new NotFoundException('Offer not found');
    await this.pool.query(
      `INSERT INTO catalog.wishlist_items (user_id, offer_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, offer_id) DO NOTHING`,
      [userId, offerId],
    );
    return { added: true };
  }

  async removeWishlistItem(userId: string, offerId: string): Promise<Record<string, unknown>> {
    await this.pool.query(
      'DELETE FROM catalog.wishlist_items WHERE user_id = $1 AND offer_id = $2',
      [userId, offerId],
    );
    return { removed: true };
  }

  async getReviews(offerId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT r.id, r.rating, r.review_text, r.reviewer_photo_url, r.created_at,
              u.full_name AS reviewer_name
       FROM catalog.reviews r
       JOIN pii.users u ON u.id = r.reviewer_id
       WHERE r.offer_id = $1
       ORDER BY r.created_at DESC`,
      [offerId],
    );
    return rows;
  }

  async addReview(offerId: string, reviewerId: string, rating: number, reviewText?: string): Promise<Record<string, unknown>> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('rating must be an integer between 1 and 5');
    }

    const offer = await this.pool.query(
      `SELECT o.seller_id FROM catalog.offers o WHERE o.id = $1`,
      [offerId],
    );
    if (offer.rows.length === 0) throw new NotFoundException(`Offer ${offerId} not found`);
    const sellerId = offer.rows[0].seller_id;

    const purchase = await this.pool.query(
      `SELECT o.id AS order_id
       FROM orders.orders o
       JOIN orders.order_lines ol ON ol.order_id = o.id
       WHERE ol.offer_id = $1 AND o.buyer_id = $2 AND o.status = 'DELIVERED'
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [offerId, reviewerId],
    );
    if (purchase.rows.length === 0) {
      throw new ForbiddenException('Only buyers with a delivered order for this item can leave a review');
    }

    const { rows } = await this.pool.query(
      `INSERT INTO catalog.reviews (offer_id, reviewer_id, seller_id, rating, review_text, order_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (reviewer_id, offer_id) DO NOTHING
       RETURNING *`,
      [offerId, reviewerId, sellerId, rating, reviewText || null, purchase.rows[0].order_id],
    );
    if (rows.length === 0) {
      throw new ConflictException('You have already reviewed this item');
    }

    const stats = await this.pool.query(
      `SELECT AVG(rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS review_count
       FROM catalog.reviews WHERE seller_id = $1`,
      [sellerId],
    );
    await this.pool.query(
      `UPDATE catalog.seller_profiles SET avg_rating = $1, review_count = $2 WHERE user_id = $3`,
      [stats.rows[0].avg_rating, stats.rows[0].review_count, sellerId],
    );

    return rows[0];
  }

  async getTopSellers(limit = 5): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT
         u.id, u.full_name AS name, u.seller_type,
         COALESCE(sp.avg_rating, 4.5) AS avg_rating,
         COALESCE(sp.review_count, 0) AS review_count,
         sp.bio, sp.stall_number, sp.market_name,
         sp.member_since, sp.years_in_market,
         sp.completed_orders, sp.total_orders,
         CASE WHEN sp.total_orders > 0
           THEN ROUND((sp.completed_orders::numeric / sp.total_orders) * 100, 1)
           ELSE 100
         END AS completion_rate,
         (SELECT COUNT(*) FROM catalog.market_sellers ms2 WHERE ms2.seller_id = u.id) AS market_count
       FROM pii.users u
       LEFT JOIN catalog.seller_profiles sp ON sp.user_id = u.id
       WHERE u.seller_type IS NOT NULL
       ORDER BY
         (COALESCE(sp.avg_rating, 4.5) * 0.6 +
          (CASE WHEN sp.total_orders > 0 THEN (sp.completed_orders::numeric / sp.total_orders) ELSE 1 END) * 4.0) DESC NULLS LAST,
         sp.review_count DESC NULLS LAST
       LIMIT $1`,
      [limit],
    );
    return rows;
  }

  /* ── seller catalogue management (Phase 2) ── */

  async listMyOffers(
    sellerId: string,
    query: { status?: string; q?: string; limit?: number; offset?: number },
  ): Promise<{ offers: Array<Record<string, unknown>>; total: number }> {
    const conditions = [`o.seller_id = $1`];
    const params: unknown[] = [sellerId];
    let idx = 2;
    if (query.status) {
      conditions.push(`o.status = $${idx++}`);
      params.push(query.status);
    }
    if (query.q) {
      conditions.push(`l.product_name ILIKE $${idx++}`);
      params.push(`%${query.q}%`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;

    const count = await this.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       ${where}`,
      params,
    );

    const { rows } = await this.pool.query(
      `SELECT
         o.id, o.status, o.channel,
         o.available_qty, o.reserved_qty, o.soft_held_qty,
         (o.available_qty - o.reserved_qty - o.soft_held_qty) AS sellable_qty,
         o.min_order_qty, o.perishability, o.fulfilment_modes, o.cluster_id,
         o.unit, o.created_at,
         l.product_name, l.physical_ref, l.category_id,
         p.new_price_cents::int AS price_cents,
         COALESCE(
           (SELECT json_build_object('id', m.id, 'storage_key', m.storage_key)
            FROM catalog.offer_media m
            WHERE m.offer_id = o.id AND m.is_primary = TRUE
            LIMIT 1),
           'null'
         ) AS primary_image,
         COALESCE(SUM(ol.qty) FILTER (WHERE ol.status IN ('PAID','ACCEPTED','DISPATCHED','DELIVERED')), 0)::int AS sold_qty,
         COALESCE(SUM(ol.qty) FILTER (WHERE ol.status = 'DELIVERED'), 0)::int AS delivered_qty
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (
           SELECT max(p2.changed_at)
           FROM catalog.offer_price_history p2
           WHERE p2.offer_id = o.id
         )
       LEFT JOIN orders.order_lines ol ON ol.offer_id = o.id
       ${where}
       GROUP BY o.id, o.status, o.channel, o.available_qty, o.reserved_qty, o.soft_held_qty,
                o.min_order_qty, o.perishability, o.fulfilment_modes, o.cluster_id,
                o.unit, o.created_at, l.product_name, l.physical_ref, l.category_id,
                p.new_price_cents
       ORDER BY o.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return { offers: rows, total: count.rows[0].count };
  }

  async updateOffer(
    offerId: string,
    actor: AuthUser,
    patch: {
      product_name?: string;
      physical_ref?: string;
      unit?: string;
      available_qty?: number;
      min_order_qty?: number;
      channel?: string;
      perishability?: string;
      fulfilment_modes?: string[];
      cluster_id?: string;
      price_cents?: number;
    },
  ): Promise<{ offer_id: string; updated: string[] }> {
    const CHANNELS = ['RETAILER', 'WHOLESALE', 'DIRECT', 'OPEN'];
    const PERISHABILITY = ['SHELF_GT_7D', 'SHELF_LT_7D'];
    const MODES = ['INSTANT', 'SCHEDULED', 'MARKET_DAY'];

    if (patch.channel !== undefined && !CHANNELS.includes(patch.channel)) throw new BadRequestException('Unknown channel');
    if (patch.perishability !== undefined && !PERISHABILITY.includes(patch.perishability)) throw new BadRequestException('Unknown perishability');
    if (patch.fulfilment_modes !== undefined) {
      if (
        !Array.isArray(patch.fulfilment_modes) ||
        patch.fulfilment_modes.length === 0 ||
        patch.fulfilment_modes.some((m) => !MODES.includes(m))
      ) {
        throw new BadRequestException('at least one valid fulfilment_modes entry is required');
      }
    }
    if (patch.product_name !== undefined && !patch.product_name.trim()) throw new BadRequestException('product_name cannot be empty');
    if (patch.physical_ref !== undefined && !patch.physical_ref.trim()) throw new BadRequestException('physical_ref cannot be empty');
    if (patch.available_qty !== undefined && (!Number.isInteger(patch.available_qty) || patch.available_qty < 0)) {
      throw new BadRequestException('available_qty must be a non-negative integer');
    }
    if (patch.min_order_qty !== undefined && (!Number.isInteger(patch.min_order_qty) || patch.min_order_qty < 1)) {
      throw new BadRequestException('min_order_qty must be a positive integer');
    }
    if (patch.price_cents !== undefined && (!Number.isInteger(patch.price_cents) || patch.price_cents < 0)) {
      throw new BadRequestException('price_cents must be a non-negative integer');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT o.seller_id, o.available_qty, o.reserved_qty, o.soft_held_qty,
                l.id AS lot_id, l.product_name AS current_name,
                p.new_price_cents AS current_price
           FROM catalog.offers o
           JOIN catalog.lots l ON l.id = o.lot_id
           LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
             AND p.changed_at = (
               SELECT max(p2.changed_at)
               FROM catalog.offer_price_history p2
               WHERE p2.offer_id = o.id
             )
          WHERE o.id = $1
          FOR UPDATE OF o`,
        [offerId],
      );
      if (rows.length === 0) throw new NotFoundException(`Offer ${offerId} not found`);
      const offer = rows[0];
      if (actor.id !== String(offer.seller_id) && !actor.roles.some((r) => r === 'OPS' || r === 'AGENT')) {
        throw new ForbiddenException('This offer belongs to another seller');
      }

      const updated: string[] = [];
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      const setIf = (field: string, value: unknown, col: string) => {
        if (value === undefined) return;
        sets.push(`${field} = $${idx++}`);
        vals.push(value);
        updated.push(col);
      };
      if (patch.available_qty !== undefined) {
        const floor = Number(offer.reserved_qty) + Number(offer.soft_held_qty);
        if (patch.available_qty < floor) {
          throw new BadRequestException(`available_qty cannot drop below reserved + held qty (${floor})`);
        }
        setIf('available_qty', patch.available_qty, 'available_qty');
      }
      setIf('min_order_qty', patch.min_order_qty, 'min_order_qty');
      setIf('channel', patch.channel, 'channel');
      setIf('perishability', patch.perishability, 'perishability');
      setIf('fulfilment_modes', patch.fulfilment_modes, 'fulfilment_modes');
      setIf('cluster_id', patch.cluster_id, 'cluster_id');
      setIf('unit', patch.unit?.trim() || undefined, 'unit');
      if (sets.length > 0) {
        await client.query(
          `UPDATE catalog.offers SET ${sets.join(', ')}, updated_at = now() WHERE id = $${idx++}`,
          [...vals, offerId],
        );
      }

      const lotSets: string[] = [];
      const lotVals: unknown[] = [];
      let lidx = 1;
      if (patch.product_name !== undefined) { lotSets.push(`product_name = $${lidx++}`); lotVals.push(patch.product_name.trim()); updated.push('product_name'); }
      if (patch.physical_ref !== undefined) { lotSets.push(`physical_ref = $${lidx++}`); lotVals.push(patch.physical_ref.trim()); updated.push('physical_ref'); }
      if (lotSets.length > 0) {
        await client.query(
          `UPDATE catalog.lots SET ${lotSets.join(', ')} WHERE id = $${lidx++}`,
          [...lotVals, offer.lot_id],
        );
      }

      const currentPrice = offer.current_price != null ? Number(offer.current_price) : null;
      if (patch.price_cents !== undefined && currentPrice !== patch.price_cents) {
        await client.query(
          `INSERT INTO catalog.offer_price_history (offer_id, old_price_cents, new_price_cents)
           VALUES ($1, $2, $3)`,
          [offerId, currentPrice, patch.price_cents],
        );
        updated.push('price_cents');
      }

      await client.query('COMMIT');
      return { offer_id: offerId, updated };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async setOfferStatus(
    offerId: string,
    actor: AuthUser,
    action: 'pause' | 'reactivate' | 'delist',
  ): Promise<{ offer_id: string; status: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT seller_id, status FROM catalog.offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      if (rows.length === 0) throw new NotFoundException(`Offer ${offerId} not found`);
      if (actor.id !== String(rows[0].seller_id) && !actor.roles.some((r) => r === 'OPS' || r === 'AGENT')) {
        throw new ForbiddenException('This offer belongs to another seller');
      }
      const current = String(rows[0].status);
      const next =
        action === 'pause' && current === 'ACTIVE'
          ? 'PAUSED'
          : action === 'reactivate' && current === 'PAUSED'
            ? 'ACTIVE'
            : action === 'delist' && (current === 'ACTIVE' || current === 'PAUSED')
              ? 'DELISTED'
              : null;
      if (!next) {
        throw new BadRequestException(`Offer cannot be ${action.replace(/e$/, '')}ed while ${current}`);
      }

      await client.query(
        `UPDATE catalog.offers SET status = $1, updated_at = now() WHERE id = $2`,
        [next, offerId],
      );
      await client.query('COMMIT');
      return { offer_id: offerId, status: next };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getStorefront(sellerId: string): Promise<Record<string, unknown>> {
    return this.getSellerById(sellerId);
  }

  async addOfferMedia(
    offerId: string,
    actor: AuthUser,
    input: { storage_key: string; is_primary?: boolean },
  ): Promise<Record<string, unknown>> {
    const key = input.storage_key?.trim() ?? '';
    if (!/^[0-9a-zA-Z.-]{8,100}\.(jpg|jpeg|png|webp|gif)$/i.test(key)) {
      throw new BadRequestException('storage_key must reference an uploaded image (jpg, jpeg, png, webp or gif)');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT seller_id FROM catalog.offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      if (rows.length === 0) throw new NotFoundException(`Offer ${offerId} not found`);
      if (actor.id !== String(rows[0].seller_id) && !actor.roles.some((r) => r === 'OPS' || r === 'AGENT')) {
        throw new ForbiddenException('This offer belongs to another seller');
      }

      if (input.is_primary) {
        await client.query(`UPDATE catalog.offer_media SET is_primary = FALSE WHERE offer_id = $1`, [offerId]);
      }
      const { rows: media } = await client.query(
        `INSERT INTO catalog.offer_media (offer_id, kind, storage_key, is_primary)
         VALUES ($1, 'GALLERY', $2, $3)
         RETURNING id, offer_id, kind, storage_key, is_primary, created_at`,
        [offerId, key, input.is_primary === true],
      );
      await client.query('COMMIT');
      return media[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async removeOfferMedia(offerId: string, actor: AuthUser, mediaId: string): Promise<{ removed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT o.seller_id
           FROM catalog.offer_media m
           JOIN catalog.offers o ON o.id = m.offer_id
          WHERE m.id = $1 AND m.offer_id = $2
          FOR UPDATE OF o`,
        [mediaId, offerId],
      );
      if (rows.length === 0) throw new NotFoundException(`Media ${mediaId} not found on offer ${offerId}`);
      if (actor.id !== String(rows[0].seller_id) && !actor.roles.some((r) => r === 'OPS' || r === 'AGENT')) {
        throw new ForbiddenException('This offer belongs to another seller');
      }

      await client.query(`DELETE FROM catalog.offer_media WHERE id = $1`, [mediaId]);
      await client.query('COMMIT');
      return { removed: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
