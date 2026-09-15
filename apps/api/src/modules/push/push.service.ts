import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { loadConfig } from '@ojaline/config';
import webPush from 'web-push';

@Injectable()
export class PushService {
  private readonly vapidPublicKey: string;
  private readonly vapidPrivateKey: string;
  private readonly vapidSubject: string;

  constructor(@Inject(Pool) private readonly pool: Pool) {
    const config = loadConfig();
    this.vapidPublicKey = config.VAPID_PUBLIC_KEY;
    this.vapidPrivateKey = config.VAPID_PRIVATE_KEY;
    this.vapidSubject = config.VAPID_SUBJECT;
    if (this.vapidPublicKey && this.vapidPrivateKey) {
      webPush.setVapidDetails(this.vapidSubject, this.vapidPublicKey, this.vapidPrivateKey);
    }
  }

  getVapidPublicKey(): { public_key: string; enabled: boolean } {
    return { public_key: this.vapidPublicKey, enabled: Boolean(this.vapidPublicKey && this.vapidPrivateKey) };
  }

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

  /**
   * Record the notification and, if VAPID is configured, deliver it over the
   * Web Push protocol to every subscription owned by the user. Delivery is
   * best-effort; stale endpoints (410/404) are pruned so they don't pile up.
   */
  async sendNotification(userId: string, title: string, body: string, data: Record<string, unknown> = {}): Promise<{ ok: boolean }> {
    await this.pool.query(
      `INSERT INTO users.push_notifications (user_id, title, body, data)
       VALUES ($1, $2, $3, $4)`,
      [userId, title, body, JSON.stringify(data)],
    );

    if (!this.vapidPublicKey || !this.vapidPrivateKey) return { ok: true };

    try {
      const { rows } = await this.pool.query(
        `SELECT endpoint, p256dh, auth_key FROM users.push_subscriptions WHERE user_id = $1`,
        [userId],
      );
      const payload = JSON.stringify({ title, body, ...data });
      const stale: string[] = [];
      for (const sub of rows) {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            payload,
          );
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode ?? 0;
          if (status === 404 || status === 410) stale.push(sub.endpoint);
        }
      }
      if (stale.length > 0) {
        await this.pool.query(
          `DELETE FROM users.push_subscriptions WHERE user_id = $1 AND endpoint = ANY($2)`,
          [userId, stale],
        );
      }
    } catch {
      /* delivery is best-effort */
    }

    return { ok: true };
  }
}