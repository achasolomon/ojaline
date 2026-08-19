import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';

const MAX_SELLERS_PER_ORDER = 2;
const MIN_ON_TIME_RATE = 0.95;
const CAPACITY_RESERVATION_TTL_SECONDS = 10 * 60;

export interface GateCheckItem {
  offer_id: string;
  seller_id: string;
  cluster_id: string;
  qty: number;
}

export interface GateCheckResult {
  allowed: boolean;
  reason?: string;
  seller_count: number;
  clusters: string[];
  capacity_ok: boolean;
}

export interface CapacityResult {
  cluster_id: string;
  window_start: string;
  window_end: string;
  capacity: number;
  booked: number;
  available: number;
}

@Injectable()
export class MultiSellerGate {
  private readonly logger = new Logger(MultiSellerGate.name);

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(Redis) private readonly redis: Redis,
  ) {}

  async checkGate(items: GateCheckItem[]): Promise<GateCheckResult> {
    if (items.length === 0) {
      return { allowed: true, reason: 'empty cart', seller_count: 0, clusters: [], capacity_ok: true };
    }

    const sellers = new Set(items.map((i) => i.seller_id));
    const clusters = new Set(items.map((i) => i.cluster_id));

    if (sellers.size > MAX_SELLERS_PER_ORDER) {
      return {
        allowed: false,
        reason: `too many sellers: ${sellers.size} (max ${MAX_SELLERS_PER_ORDER})`,
        seller_count: sellers.size,
        clusters: [...clusters],
        capacity_ok: false,
      };
    }

    if (clusters.size > 1) {
      return {
        allowed: false,
        reason: `sellers must be in the same cluster, found ${clusters.size} clusters`,
        seller_count: sellers.size,
        clusters: [...clusters],
        capacity_ok: false,
      };
    }

    const sellerIds = [...sellers];
    const riskResult = await this.pool.query<{
      seller_id: string;
      on_time_rate_30d: string;
      tier: string;
    }>(
      `SELECT seller_id, on_time_rate_30d, tier
       FROM trust.seller_risk_tiers
       WHERE seller_id = ANY($1)`,
      [sellerIds],
    );

    const riskMap = new Map(riskResult.rows.map((r) => [r.seller_id, r]));

    for (const sid of sellerIds) {
      const risk = riskMap.get(sid);
      if (!risk) {
        this.logger.log({ sellerId: sid }, 'seller has no risk tier — treating as NEW (allowed)');
        continue;
      }
      const rate = Number(risk.on_time_rate_30d);
      if (rate < MIN_ON_TIME_RATE && risk.tier !== 'NEW') {
        return {
          allowed: false,
          reason: `seller ${sid} on_time_rate ${rate} < ${MIN_ON_TIME_RATE}`,
          seller_count: sellers.size,
          clusters: [...clusters],
          capacity_ok: false,
        };
      }
    }

    return {
      allowed: true,
      seller_count: sellers.size,
      clusters: [...clusters],
      capacity_ok: true,
    };
  }

  async checkCapacity(
    clusterId: string,
    windowStart: string,
    windowEnd: string,
    additionalBooked: number,
  ): Promise<CapacityResult> {
    const redisKey = `capacity:${clusterId}:${windowStart}:${windowEnd}`;
    const bookedRaw = await this.redis.get(redisKey);
    const redisBooked = bookedRaw ? parseInt(bookedRaw, 10) : 0;

    const dbResult = await this.pool.query<{
      capacity: string;
      booked: string;
    }>(
      `SELECT capacity, booked FROM fulfilment.capacity_slots
       WHERE cluster_id = $1 AND window_start = $2 AND window_end = $3`,
      [clusterId, windowStart, windowEnd],
    );

    let capacity: number;
    let dbBooked: number;

    if (dbResult.rowCount === 0) {
      capacity = 100;
      dbBooked = 0;
      await this.pool.query(
        `INSERT INTO fulfilment.capacity_slots (cluster_id, window_start, window_end, capacity, booked)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (cluster_id, window_start, window_end) DO NOTHING`,
        [clusterId, windowStart, windowEnd, capacity, additionalBooked],
      );
    } else {
      capacity = Number(dbResult.rows[0].capacity);
      dbBooked = Number(dbResult.rows[0].booked);
    }

    const totalBooked = Math.max(redisBooked, dbBooked);
    const available = capacity - totalBooked;

    return {
      cluster_id: clusterId,
      window_start: windowStart,
      window_end: windowEnd,
      capacity,
      booked: totalBooked,
      available,
    };
  }

  async reserveCapacity(
    clusterId: string,
    windowStart: string,
    windowEnd: string,
    qty: number,
  ): Promise<boolean> {
    const redisKey = `capacity:${clusterId}:${windowStart}:${windowEnd}`;

    const existing = await this.redis.get(redisKey);
    if (existing === null) {
      await this.redis.set(redisKey, String(qty), 'EX', CAPACITY_RESERVATION_TTL_SECONDS);
    } else {
      const newVal = parseInt(existing, 10) + qty;
      if (newVal > 100) return false;
      await this.redis.set(redisKey, String(newVal), 'EX', CAPACITY_RESERVATION_TTL_SECONDS);
    }

    await this.pool.query(
      `UPDATE fulfilment.capacity_slots
       SET booked = booked + $1, created_at = created_at
       WHERE cluster_id = $2 AND window_start = $3 AND window_end = $4`,
      [qty, clusterId, windowStart, windowEnd],
    );

    const finalVal = await this.redis.get(redisKey);
    this.logger.log(
      { clusterId, windowStart, booked: finalVal, qty },
      'capacity reserved',
    );

    return true;
  }

  async releaseCapacity(
    clusterId: string,
    windowStart: string,
    windowEnd: string,
    qty: number,
  ): Promise<void> {
    const redisKey = `capacity:${clusterId}:${windowStart}:${windowEnd}`;
    await this.redis.decrby(redisKey, qty);

    await this.pool.query(
      `UPDATE fulfilment.capacity_slots
       SET booked = GREATEST(booked - $1, 0)
       WHERE cluster_id = $2 AND window_start = $3 AND window_end = $4`,
      [qty, clusterId, windowStart, windowEnd],
    );

    this.logger.log({ clusterId, windowStart, qty }, 'capacity released');
  }
}
