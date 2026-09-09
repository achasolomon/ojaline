import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { envelope, type EventType, type EventPayload, type OutboxEnvelope } from '@ojaline/contracts';

export const MARKET_CHANNEL = 'realtime:market';
export const SYSTEM_CHANNEL = 'realtime:system';
export const RECENT_KEY = 'realtime:events:recent';
const PRESENCE_TTL_SECONDS = 40;

interface PresenceUser {
  id: string;
  full_name: string;
  seller_type: string | null;
}

/**
 * Market activity feed. Each event is buffered (recent replay for late joiners)
 * and broadcast on the realtime:market Redis channel consumed by SSE + WS.
 */
@Injectable()
export class MarketFeedService {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(Redis) private readonly redis: Redis,
  ) {}

  private async bufferAndPublish(channel: string, environment: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.lpush(RECENT_KEY, environment),
        this.redis.ltrim(RECENT_KEY, 0, 39),
        this.redis.publish(channel, environment),
      ]);
    } catch (err) {
      console.error(`[market-feed] publish to ${channel} failed`, err);
    }
  }

  async publishMarket<E extends EventType>(
    eventType: E,
    aggregateId: string,
    payload: EventPayload<E>,
  ): Promise<void> {
    const env = envelope(eventType, aggregateId, payload);
    await this.bufferAndPublish(MARKET_CHANNEL, JSON.stringify(env));
  }

  /** Publish a full outbox envelope (worker-driven system events). */
  async publishSystemEnvelope(env: OutboxEnvelope): Promise<void> {
    await this.bufferAndPublish(SYSTEM_CHANNEL, JSON.stringify(env));
  }

  async getRecent(): Promise<OutboxEnvelope[]> {
    const items = await this.redis.lrange(RECENT_KEY, 0, 39);
    const parsed: OutboxEnvelope[] = [];
    for (const item of items) {
      try {
        parsed.push(JSON.parse(item) as OutboxEnvelope);
      } catch {
        // skip malformed
      }
    }
    return parsed;
  }

  /**
   * Presence heartbeat. Registers the user as online in Redis and announces
   * sellers to the market feed exactly once per online window.
   */
  async touchPresence(user: PresenceUser): Promise<void> {
    const key = `market:presence:${user.id}`;
    const value = JSON.stringify({ user_id: user.id, seller_type: user.seller_type, online_at: new Date().toISOString() });
    const fresh = await this.redis.set(key, value, 'EX', PRESENCE_TTL_SECONDS, 'NX');
    if (fresh !== 'OK') {
      await this.redis.expire(key, PRESENCE_TTL_SECONDS);
      return;
    }
    if (!user.seller_type) return;

    let marketName: string | undefined;
    try {
      const { rows } = await this.pool.query(
        `SELECT market_name FROM catalog.seller_profiles WHERE user_id = $1`,
        [user.id],
      );
      marketName = (rows[0]?.market_name as string | undefined) ?? undefined;
    } catch (err) {
      console.error('[market-feed] seller market lookup failed', err);
    }

    await this.publishMarket(
      'market.seller_online',
      user.id,
      {
        seller_id: user.id,
        seller_name: user.full_name,
        seller_type: user.seller_type ?? undefined,
        market_name: marketName,
      },
    );
  }

  async announceOfferCreated(offerId: string, productName: string, priceCents: number): Promise<void> {
    const ctx = await this.offerContext(offerId);
    if (!ctx) return;
    await this.publishMarket(
      'market.offer_created',
      offerId,
      {
        offer_id: offerId,
        seller_id: ctx.seller_id,
        seller_name: ctx.seller_name,
        product_name: productName,
        price_cents: priceCents,
        unit: ctx.unit ?? undefined,
        channel: ctx.channel ?? undefined,
        market_name: ctx.market_name ?? undefined,
        image_key: ctx.image_key ?? undefined,
      },
    );
  }

  async announceOfferPriceChanged(
    offerId: string,
    productName: string,
    oldPriceCents: number,
    newPriceCents: number,
  ): Promise<void> {
    const ctx = await this.offerContext(offerId);
    if (!ctx) return;
    await this.publishMarket(
      'market.offer_price_changed',
      offerId,
      {
        offer_id: offerId,
        seller_id: ctx.seller_id,
        seller_name: ctx.seller_name,
        product_name: productName,
        old_price_cents: oldPriceCents,
        new_price_cents: newPriceCents,
        unit: ctx.unit ?? undefined,
        market_name: ctx.market_name ?? undefined,
        image_key: ctx.image_key ?? undefined,
      },
    );
  }

  private async offerContext(offerId: string): Promise<{
    seller_id: string;
    seller_name: string;
    unit: string | null;
    channel: string | null;
    market_name: string | null;
    image_key: string | null;
  } | null> {
    const { rows } = await this.pool.query(
      `SELECT o.seller_id, u.full_name AS seller_name, o.unit, o.channel, sp.market_name,
              (SELECT m.storage_key FROM catalog.offer_media m
                WHERE m.offer_id = o.id AND m.is_primary = TRUE LIMIT 1) AS image_key
         FROM catalog.offers o
         JOIN catalog.lots l ON l.id = o.lot_id
         JOIN pii.users u ON u.id = o.seller_id
         LEFT JOIN catalog.seller_profiles sp ON sp.user_id = o.seller_id
        WHERE o.id = $1`,
      [offerId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      seller_id: String(r.seller_id),
      seller_name: String(r.seller_name),
      unit: r.unit ? String(r.unit) : null,
      channel: r.channel ? String(r.channel) : null,
      market_name: r.market_name ? String(r.market_name) : null,
      image_key: r.image_key ? String(r.image_key) : null,
    };
  }
}