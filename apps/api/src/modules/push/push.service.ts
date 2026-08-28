import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class PushService {
  constructor(@Inject(Pool) private readonly pool: Pool) {}

  async subscribe(userId: string, endpoint: string, p256dh: string, authKey: string, deviceType = 'web'): Promise<{ ok: boolean; id: string }> {
    const existing = await this.pool.query(
      `SELECT id FROM users.push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [userId, endpoint],
    );

    if (existing.rows.length > 0) {
      return { ok: true, id: existing.rows[0].id };
    }

    const { rows } = await this.pool.query(
      `INSERT INTO users.push_subscriptions (user_id, endpoint, p256dh, auth_key, device_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, endpoint, p256dh, authKey, deviceType],
    );
    return { ok: true, id: rows[0].id };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    await this.pool.query(
      `DELETE FROM users.push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [userId, endpoint],
    );
    return { ok: true };
  }

  async getSubscriptions(userId: string): Promise<Array<Record<string, unknown>>> {
    const { rows } = await this.pool.query(
      `SELECT id, endpoint, device_type, created_at
       FROM users.push_subscriptions WHERE user_id = $1`,
      [userId],
    );
    return rows;
  }

  async sendNotification(userId: string, title: string, body: string, data: Record<string, unknown> = {}): Promise<{ ok: boolean }> {
    await this.pool.query(
      `INSERT INTO users.push_notifications (user_id, title, body, data)
       VALUES ($1, $2, $3, $4)`,
      [userId, title, body, JSON.stringify(data)],
    );
    return { ok: true };
  }
}
