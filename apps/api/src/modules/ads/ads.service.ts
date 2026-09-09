import { Injectable, Inject, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { MarketFeedService } from '../realtime/market-feed.service.js';

export const AD_FORMATS = ['TOAST', 'BANNER'] as const;
export type AdFormat = (typeof AD_FORMATS)[number];

export const AD_TARGETS = ['OFFER', 'SELLER', 'NONE'] as const;
export type AdTargetType = (typeof AD_TARGETS)[number];

export const AD_STATUSES = ['ACTIVE', 'PAUSED', 'ENDED', 'REMOVED'] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

export const AD_REPORT_REASONS = ['SPAM', 'MISLEADING', 'OFFENSIVE', 'OTHER'] as const;
export type AdReportReason = (typeof AD_REPORT_REASONS)[number];

const CHANNELS = ['RETAILER', 'WHOLESALE', 'DIRECT', 'OPEN'] as const;
const MAX_ACTIVE_ADS = 3;
const REPORT_REMOVE_THRESHOLD = 5;
const DEFAULT_DURATION_DAYS = 7;

export interface CreateAdInput {
  title: string;
  body?: string;
  format: AdFormat;
  image_key?: string;
  target_type: AdTargetType;
  target_id?: string;
  category_id?: string;
  cluster_id?: string;
  channel?: string;
  starts_at?: string;
  ends_at?: string;
  max_impressions?: number;
}

export interface UpdateAdInput {
  title?: string;
  body?: string;
  format?: AdFormat;
  image_key?: string;
  target_type?: AdTargetType;
  target_id?: string;
  category_id?: string;
  cluster_id?: string;
  channel?: string;
  status?: AdStatus;
  starts_at?: string;
  ends_at?: string;
  max_impressions?: number;
}

export interface AdRow {
  id: string;
  seller_id: string;
  title: string;
  body: string | null;
  format: AdFormat;
  image_key: string | null;
  target_type: AdTargetType;
  target_id: string | null;
  category_id: string | null;
  cluster_id: string | null;
  channel: string | null;
  status: AdStatus;
  starts_at: Date;
  ends_at: Date;
  max_impressions: number | null;
  impressions_shown: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AdsService {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(MarketFeedService) private readonly feed: MarketFeedService,
  ) {}

  /**
   * Seller-gated identity check (v1 resolves the seller id from the request
   * like the rest of the prototype controllers). Resolved seller is returned
   * for downstream payloads (seller_name on realtime events).
   */
  private async assertSeller(sellerId: string): Promise<{ id: string; full_name: string }> {
    const { rows } = await this.pool.query(
      `SELECT id, full_name FROM pii.users WHERE id = $1 AND seller_type IS NOT NULL AND status = 'ACTIVE'`,
      [sellerId],
    );
    if (rows.length === 0) throw new ForbiddenException('Seller account required');
    return { id: String(rows[0].id), full_name: String(rows[0].full_name) };
  }

  private assertTargetType(value: unknown): AdTargetType {
    if (typeof value !== 'string' || !(AD_TARGETS as readonly string[]).includes(value)) {
      throw new BadRequestException('Invalid target_type');
    }
    return value as AdTargetType;
  }

  private assertFormat(value: unknown): AdFormat {
    if (typeof value !== 'string' || !(AD_FORMATS as readonly string[]).includes(value)) {
      throw new BadRequestException('Invalid format');
    }
    return value as AdFormat;
  }

  private async validateTarget(targetType: AdTargetType, targetId?: string): Promise<{ target_type: AdTargetType; target_id: string | null }> {
    if (targetType === 'NONE') {
      if (targetId) throw new BadRequestException('target_id must be empty for target_type NONE');
      return { target_type: targetType, target_id: null };
    }
    if (!targetId) throw new BadRequestException(`target_id is required for ${targetType}`);
    if (targetType === 'OFFER') {
      const { rows } = await this.pool.query(`SELECT seller_id FROM catalog.offers WHERE id = $1`, [targetId]);
      if (rows.length === 0) throw new BadRequestException('Target offer not found');
    } else {
      const { rows } = await this.pool.query(`SELECT id FROM pii.users WHERE id = $1 AND seller_type IS NOT NULL`, [targetId]);
      if (rows.length === 0) throw new BadRequestException('Target seller not found');
    }
    return { target_type: targetType, target_id: targetId };
  }

  private validateWindow(startsAt?: string, endsAt?: string): { starts_at: Date; ends_at: Date } {
    const start = startsAt ? new Date(startsAt) : new Date();
    const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + DEFAULT_DURATION_DAYS * 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Invalid date window');
    if (end.getTime() <= start.getTime()) throw new BadRequestException('ends_at must be after starts_at');
    return { starts_at: start, ends_at: end };
  }

  private validateChannel(value?: string): string | null {
    if (value == null) return null;
    if (!(CHANNELS as readonly string[]).includes(value)) throw new BadRequestException('Invalid channel');
    return value;
  }

  private validateMaxImpressions(value?: number): number | null {
    if (value == null) return null;
    if (!Number.isInteger(value) || value < 0) throw new BadRequestException('max_impressions must be a non-negative integer');
    return value;
  }

  private rowToPublic(row: AdRow, sellerName: string) {
    return {
      id: row.id,
      seller_id: row.seller_id,
      seller_name: sellerName,
      title: row.title,
      body: row.body,
      format: row.format,
      image_key: row.image_key,
      target_type: row.target_type,
      target_id: row.target_id,
      category_id: row.category_id,
      cluster_id: row.cluster_id,
      channel: row.channel,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
    };
  }

  async create(sellerId: string, input: CreateAdInput): Promise<AdRow> {
    const seller = await this.assertSeller(sellerId);
    if (!input.title || !input.title.trim()) throw new BadRequestException('title is required');

    const format = this.assertFormat(input.format);
    const targetType = this.assertTargetType(input.target_type);
    const target = await this.validateTarget(targetType, input.target_id);
    const window = this.validateWindow(input.starts_at, input.ends_at);
    const channel = this.validateChannel(input.channel);
    const maxImpressions = this.validateMaxImpressions(input.max_impressions);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Advisory lock keeps the 3-active cap correct under concurrent creates.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [`ad-seller:${sellerId}`]);

      const { rows: active } = await client.query(
        `SELECT count(*)::int AS n FROM marketing.ads WHERE seller_id = $1 AND status = 'ACTIVE'`,
        [sellerId],
      );
      if (Number(active[0].n) >= MAX_ACTIVE_ADS) {
        throw new BadRequestException(`Sellers can have at most ${MAX_ACTIVE_ADS} active ads`);
      }

      const { rows } = await client.query(
        `INSERT INTO marketing.ads
           (seller_id, title, body, format, image_key, target_type, target_id,
            category_id, cluster_id, channel, starts_at, ends_at, max_impressions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          sellerId,
          input.title.trim(),
          input.body?.trim() || null,
          format,
          input.image_key || null,
          target.target_type,
          target.target_id,
          input.category_id || null,
          input.cluster_id || null,
          channel,
          window.starts_at,
          window.ends_at,
          maxImpressions,
        ],
      );
      await client.query('COMMIT');

      void this.feed.publishMarket('marketing.ad_published', String(rows[0].id), {
        ad_id: String(rows[0].id),
        seller_id: sellerId,
        seller_name: seller.full_name,
        title: String(rows[0].title),
        body: rows[0].body ? String(rows[0].body) : undefined,
        format: String(rows[0].format) as 'TOAST' | 'BANNER',
        image_key: rows[0].image_key ? String(rows[0].image_key) : undefined,
        target_type: String(rows[0].target_type) as 'OFFER' | 'SELLER' | 'NONE',
        target_id: rows[0].target_id ? String(rows[0].target_id) : undefined,
      });

      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async list(sellerId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT * FROM marketing.ads WHERE seller_id = $1 ORDER BY created_at DESC`,
      [sellerId],
    );
    return rows;
  }

  private async requireOwnedAd(sellerId: string, adId: string): Promise<AdRow> {
    const { rows } = await this.pool.query(`SELECT * FROM marketing.ads WHERE id = $1`, [adId]);
    if (rows.length === 0) throw new NotFoundException(`Ad ${adId} not found`);
    if (String(rows[0].seller_id) !== sellerId) throw new ForbiddenException('Not your ad');
    return rows[0];
  }

  async update(sellerId: string, adId: string, patch: UpdateAdInput): Promise<AdRow> {
    await this.requireOwnedAd(sellerId, adId);

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const push = (column: string, value: unknown) => {
      sets.push(`${column} = $${idx++}`);
      params.push(value);
    };

    if (patch.title != null) {
      if (!patch.title.trim()) throw new BadRequestException('title cannot be empty');
      push('title', patch.title.trim());
    }
    if (patch.body !== undefined) push('body', patch.body?.trim() || null);
    if (patch.format != null) push('format', this.assertFormat(patch.format));
    if (patch.image_key !== undefined) push('image_key', patch.image_key || null);
    if (patch.channel !== undefined) push('channel', this.validateChannel(patch.channel));
    if (patch.category_id !== undefined) push('category_id', patch.category_id || null);
    if (patch.cluster_id !== undefined) push('cluster_id', patch.cluster_id || null);
    if (patch.max_impressions !== undefined) push('max_impressions', this.validateMaxImpressions(patch.max_impressions));

    if (patch.target_type != null || patch.target_id !== undefined) {
      const targetType = this.assertTargetType(patch.target_type ?? 'NONE');
      const target = await this.validateTarget(targetType, patch.target_id ?? undefined);
      push('target_type', target.target_type);
      push('target_id', target.target_id);
    }

    // Status changes are limited to the live/pause toggle; ENDED/REMOVED go
    // through DELETE / reporting so lifecycle events are always published.
    if (patch.status != null) {
      if (patch.status !== 'ACTIVE' && patch.status !== 'PAUSED') {
        throw new BadRequestException('Status may only be toggled between ACTIVE and PAUSED');
      }
      push('status', patch.status);
    }

    if (patch.starts_at !== undefined || patch.ends_at !== undefined) {
      const window = this.validateWindow(patch.starts_at, patch.ends_at);
      push('starts_at', window.starts_at);
      push('ends_at', window.ends_at);
    }

    if (sets.length === 0) {
      const current = await this.pool.query(`SELECT * FROM marketing.ads WHERE id = $1`, [adId]);
      return current.rows[0];
    }

    push('updated_at', new Date());
    const { rows } = await this.pool.query(
      `UPDATE marketing.ads SET ${sets.join(', ')} WHERE id = $${idx++} RETURNING *`,
      [...params, adId],
    );
    return rows[0];
  }

  async remove(sellerId: string, adId: string): Promise<{ ok: boolean; removed: boolean }> {
    const ad = await this.requireOwnedAd(sellerId, adId);
    await this.pool.query(
      `UPDATE marketing.ads SET status = 'ENDED', updated_at = now() WHERE id = $1`,
      [adId],
    );
    void this.feed.publishMarket('marketing.ad_removed', adId, {
      ad_id: adId,
      seller_id: sellerId,
      reason: 'MANUAL',
    });
    void this.cleanupExpired();
    return { ok: true, removed: ad.status !== 'ENDED' };
  }

  /**
   * Serve currently-eligible ads. Targeting matches only when the caller
   * provides the filter dimension (cluster/category): an ad whose filter is
   * NULL is room-wide and always eligible; an ad with a filter matches only
   * callers asking for that dimension. Impressions are bumped best-effort.
   */
  async getActive(format?: AdFormat, clusterId?: string, categoryId?: string): Promise<Array<Record<string, unknown>>> {
    const conditions = [
      `a.status = 'ACTIVE'`,
      `a.starts_at <= now()`,
      `a.ends_at > now()`,
      `(a.max_impressions IS NULL OR a.impressions_shown < a.max_impressions)`,
    ];
    const params: unknown[] = [];
    let idx = 1;
    if (format) {
      conditions.push(`a.format = $${idx++}`);
      params.push(format);
    }
    if (clusterId) {
      conditions.push(`(a.cluster_id IS NULL OR a.cluster_id = $${idx++})`);
      params.push(clusterId);
    } else {
      conditions.push(`a.cluster_id IS NULL`);
    }
    if (categoryId) {
      conditions.push(`(a.category_id IS NULL OR a.category_id = $${idx++})`);
      params.push(categoryId);
    } else {
      conditions.push(`a.category_id IS NULL`);
    }

    const { rows } = await this.pool.query(
      `SELECT a.*, u.full_name AS seller_name
         FROM marketing.ads a
         JOIN pii.users u ON u.id = a.seller_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.created_at DESC
        LIMIT $${idx++}`,
      [...params, 3],
    );

    if (rows.length > 0) {
      try {
        const ids = rows.map((r) => r.id as string);
        const list = ids.map((_, i) => `$${i + 1}`).join(',');
        await this.pool.query(
          `UPDATE marketing.ads SET impressions_shown = impressions_shown + 1 WHERE id IN (${list})`,
          ids,
        );
      } catch (err) {
        console.error('[ads] impression bump failed (advisory only)', err);
      }
    }

    return rows.map((r) => this.rowToPublic(r as AdRow, String(r.seller_name)));
  }

  async report(adId: string, reporterId: string | null, reason: AdReportReason): Promise<{ ok: boolean; removed: boolean }> {
    if (!(AD_REPORT_REASONS as readonly string[]).includes(reason)) {
      throw new BadRequestException('Invalid report reason');
    }
    const { rows } = await this.pool.query(`SELECT seller_id FROM marketing.ads WHERE id = $1`, [adId]);
    if (rows.length === 0) throw new NotFoundException(`Ad ${adId} not found`);

    if (reporterId) {
      // A live user id is expected; any unknown id would trip the FK and 500.
      const reporter = await this.pool.query(
        `SELECT id FROM pii.users WHERE id = $1 AND status = 'ACTIVE'`,
        [reporterId],
      );
      if (reporter.rows.length === 0) throw new BadRequestException('Unknown reporter');

      const existing = await this.pool.query(
        `SELECT id FROM marketing.ad_reports WHERE ad_id = $1 AND reporter_id = $2`,
        [adId, reporterId],
      );
      if (existing.rows.length > 0) throw new BadRequestException('You already reported this ad');
    }

    await this.pool.query(
      `INSERT INTO marketing.ad_reports (ad_id, reporter_id, reason) VALUES ($1, $2, $3)`,
      [adId, reporterId, reason],
    );

    const { rows: countRows } = await this.pool.query(
      `SELECT count(*)::int AS n FROM marketing.ad_reports WHERE ad_id = $1`,
      [adId],
    );
    const reportCount = Number(countRows[0].n);

    if (reportCount >= REPORT_REMOVE_THRESHOLD) {
      await this.pool.query(
        `UPDATE marketing.ads SET status = 'REMOVED', updated_at = now() WHERE id = $1 AND status = 'ACTIVE'`,
        [adId],
      );
      void this.feed.publishMarket('marketing.ad_removed', adId, {
        ad_id: adId,
        seller_id: String(rows[0].seller_id),
        reason: 'REPORTED',
      });
      return { ok: true, removed: true };
    }
    return { ok: true, removed: false };
  }

  /** Opportunistic sweep: mark window-expired ACTIVE ads as ENDED. */
  private async cleanupExpired(): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE marketing.ads SET status = 'ENDED', updated_at = now()
          WHERE status = 'ACTIVE' AND ends_at <= now()`,
      );
    } catch (err) {
      console.error('[ads] expiry sweep failed', err);
    }
  }
}