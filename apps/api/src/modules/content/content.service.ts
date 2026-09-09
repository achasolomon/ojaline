import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { CatalogService } from '../catalog/catalog.service.js';

@Injectable()
export class ContentService {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  /**
   * Live homepage slides + cards. Fully served from the DB so content can be
   * edited without a redeploy; images (image_key) come from the media API.
   */
  async getBanners(): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT id, slot, title, subtitle, cta_label, cta_href, image_key,
              gradient, fallback_icon, sort_order, starts_at, ends_at
         FROM marketing.banners
        WHERE status = 'ACTIVE' AND starts_at <= now() AND ends_at > now()
        ORDER BY sort_order NULLS LAST, created_at`,
    );
    return rows.map((r) => ({
      id: String(r.id),
      slot: String(r.slot),
      title: String(r.title),
      subtitle: String(r.subtitle),
      cta_label: String(r.cta_label),
      cta_href: String(r.cta_href),
      image_key: r.image_key ? String(r.image_key) : null,
      gradient: r.gradient ? String(r.gradient) : null,
      fallback_icon: String(r.fallback_icon),
      sort_order: Number(r.sort_order),
      starts_at: r.starts_at,
      ends_at: r.ends_at,
    }));
  }

  /**
   * The next real market day (earliest upcoming operating date across all
   * markets), total open markets / products, and the MARKET_DAY card content.
   */
  async getMarketDay(): Promise<Record<string, unknown>> {
    const markets = await this.catalog.getMarkets();
    const dated = markets
      .filter((m) => m.next_date != null)
      .map((m) => ({ next: String(m.next_date), product_count: Number(m.product_count ?? 0) }))
      .sort((a, b) => a.next.localeCompare(b.next));

    const { rows } = await this.pool.query(
      `SELECT id, title, subtitle, cta_label, cta_href, image_key, gradient, fallback_icon
         FROM marketing.banners
        WHERE slot = 'MARKET_DAY' AND status = 'ACTIVE' AND starts_at <= now() AND ends_at > now()
        ORDER BY sort_order NULLS LAST, created_at LIMIT 1`,
    );
    const banner = rows[0];

    return {
      next_date: dated[0]?.next ?? null,
      market_count: dated.length,
      product_count: dated.reduce((acc, m) => acc + m.product_count, 0),
      banner: banner
        ? {
            id: String(banner.id),
            title: String(banner.title),
            subtitle: String(banner.subtitle),
            cta_label: String(banner.cta_label),
            cta_href: String(banner.cta_href),
            image_key: banner.image_key ? String(banner.image_key) : null,
            gradient: banner.gradient ? String(banner.gradient) : null,
            fallback_icon: String(banner.fallback_icon),
          }
        : null,
    };
  }
}