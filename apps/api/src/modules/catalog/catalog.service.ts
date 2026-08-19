import { Injectable, Inject } from '@nestjs/common';
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
         l.physical_ref
       FROM catalog.offers o
       JOIN catalog.lots l ON l.id = o.lot_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return { offers: rows, total };
  }
}
