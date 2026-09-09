import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';
import { MarketFeedService } from '../realtime/market-feed.service.js';

export type NotificationType = 'order' | 'chat' | 'market' | 'deal' | 'system';

export const NOTIFICATION_TYPES: readonly NotificationType[] = ['order', 'chat', 'market', 'deal', 'system'];

@Injectable()
export class FeedService {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(MarketFeedService) private readonly feed: MarketFeedService,
  ) {}

  /**
   * Insert an in-app notification, broadcast it over SSE, and return the row.
   */
  async push(
    userId: string,
    input: { type: NotificationType; title: string; body?: string; deep_link?: string },
  ): Promise<{ id: string }> {
    const { rows } = await this.pool.query(
      `INSERT INTO users.notifications (user_id, type, title, body, deep_link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, input.type, input.title.trim(), input.body?.trim() || null, input.deep_link || null],
    );
    const id = String(rows[0].id);
    void this.feed.publishMarket('notification.feed', id, {
      notification_id: id,
      user_id: userId,
      type: input.type,
      title: input.title,
      body: input.body ?? undefined,
      deep_link: input.deep_link ?? undefined,
    });
    return { id };
  }

  async list(userId: string, limit = 50): Promise<Array<Record<string, unknown>>> {
    const capped = Math.min(Math.max(limit, 1), 100);
    const { rows } = await this.pool.query(
      `SELECT id, type, title, body, deep_link, read_at, created_at
         FROM users.notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, capped],
    );
    return rows.map((r) => ({
      id: String(r.id),
      type: String(r.type),
      title: String(r.title),
      body: r.body ? String(r.body) : null,
      deep_link: r.deep_link ? String(r.deep_link) : null,
      read: r.read_at != null,
      created_at: r.created_at,
    }));
  }

  async unreadCount(userId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT count(*)::int AS n FROM users.notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return Number(rows[0].n);
  }

  /** Mark one/all notifications as read for a user. Missing ids means "all". */
  async markRead(userId: string, ids?: string[]): Promise<{ ok: boolean; updated: number }> {
    if (ids && ids.length > 0) {
      const params: unknown[] = [userId];
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
      params.push(...ids);
      const { rowCount } = await this.pool.query(
        `UPDATE users.notifications
            SET read_at = COALESCE(read_at, now())
          WHERE user_id = $1 AND id IN (${placeholders})`,
        params,
      );
      return { ok: true, updated: rowCount ?? 0 };
    }
    const { rowCount } = await this.pool.query(
      `UPDATE users.notifications SET read_at = COALESCE(read_at, now()) WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return { ok: true, updated: rowCount ?? 0 };
  }

  static assertType(value: unknown): NotificationType {
    if (typeof value !== 'string' || !(NOTIFICATION_TYPES as readonly string[]).includes(value)) {
      throw new BadRequestException('Invalid notification type');
    }
    return value as NotificationType;
  }
}