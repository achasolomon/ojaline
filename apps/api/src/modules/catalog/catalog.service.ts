import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

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
  constructor(@Inject(Pool) private readonly pool: Pool) {}

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
      conditions.push(`l.category_id = $${idx++}`);
      params.push(query.category_id);
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
       ${where}
       ORDER BY ${query.sort === 'cheapest' ? 'p.new_price_cents ASC' : query.sort === 'popular' ? 'o.available_qty DESC' : 'o.created_at DESC'}
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
         COUNT(l.id)::int AS offer_count
       FROM catalog.categories c
       LEFT JOIN catalog.lots l ON l.category_id = c.id
       LEFT JOIN catalog.offers o ON o.lot_id = l.id AND o.status = 'ACTIVE'
         AND o.available_qty > o.reserved_qty + o.soft_held_qty
        GROUP BY c.id, c.name, c.perishability_default, c.image_url
       ORDER BY c.name`,
    );
    return rows;
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
  }): Promise<{ offer_id: string; lot_id: string }> {
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
            perishability, fulfilment_modes, cluster_id, geo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
            ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography)
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
        ],
      );
      const offerId: string = offerRows[0].id;

      await client.query(
        `INSERT INTO catalog.offer_price_history (offer_id, new_price_cents)
         VALUES ($1, $2)`,
        [offerId, input.price_cents],
      );

      await client.query('COMMIT');
      return { offer_id: offerId, lot_id: lotId };
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
    const offer = await this.pool.query(
      `SELECT o.seller_id FROM catalog.offers o WHERE o.id = $1`,
      [offerId],
    );
    if (offer.rows.length === 0) throw new NotFoundException(`Offer ${offerId} not found`);

    const sellerId = offer.rows[0].seller_id;

    const { rows } = await this.pool.query(
      `INSERT INTO catalog.reviews (offer_id, reviewer_id, seller_id, rating, review_text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [offerId, reviewerId, sellerId, rating, reviewText || null],
    );

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
}
