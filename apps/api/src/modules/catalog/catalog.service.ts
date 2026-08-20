import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

export interface DiscoverOffersQuery {
  channel?: string;
  cluster_id?: string;
  perishability?: string;
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = query.offset ?? 0;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM catalog.offers o ${where}`,
      params,
    );
    const total = Number(countResult.rows[0].count);

    const { rows } = await this.pool.query(
      `SELECT
         o.id,
         o.seller_id,
         o.channel,
         o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
         o.min_order_qty,
         o.perishability,
         o.fulfilment_modes,
         o.cluster_id,
         o.created_at,
         l.product_name,
         l.physical_ref,
         p.new_price_cents::int AS price_cents
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       LEFT JOIN catalog.offer_price_history p ON p.offer_id = o.id
         AND p.changed_at = (
           SELECT max(p2.changed_at)
           FROM catalog.offer_price_history p2
           WHERE p2.offer_id = o.id
         )
       ${where}
       ORDER BY o.created_at DESC
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
         o.channel,
         o.available_qty - o.reserved_qty - o.soft_held_qty AS sellable_qty,
         o.min_order_qty,
         o.perishability,
         o.fulfilment_modes,
         o.cluster_id,
         o.created_at,
         l.product_name,
         l.physical_ref,
         p.new_price_cents::int AS price_cents
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
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
  }): Promise<{ offer_id: string; lot_id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: lotRows } = await client.query(
        `INSERT INTO catalog.lots (seller_id, product_name, physical_ref)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [input.seller_id, input.product_name, input.physical_ref],
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
}
