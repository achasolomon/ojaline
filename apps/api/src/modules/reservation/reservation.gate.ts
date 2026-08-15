import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

export interface OfferCounters {
  available: number;
  reserved: number;
  softHeld: number;
}

const ACQUIRE_SOFT = `
local offer = KEYS[1]
local holdKey = KEYS[2]
local qty = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local available = tonumber(redis.call('HGET', offer, 'available') or '0')
local reserved = tonumber(redis.call('HGET', offer, 'reserved') or '0')
local softHeld = tonumber(redis.call('HGET', offer, 'soft_held') or '0')
if available - reserved - softHeld < qty then
  return 0
end
redis.call('HSET', offer, 'soft_held', softHeld + qty)
redis.call('SET', holdKey, offer, 'EX', ttl)
return 1
`;

const RELEASE_SOFT = `
local holdKey = KEYS[1]
local offer = redis.call('GET', holdKey)
if not offer then return 0 end
local qty = tonumber(ARGV[1])
local softHeld = tonumber(redis.call('HGET', offer, 'soft_held') or '0')
local next = softHeld - qty
if next < 0 then next = 0 end
redis.call('HSET', offer, 'soft_held', next)
redis.call('DEL', holdKey)
return 1
`;

const CONVERT_SOFT_TO_HARD = `
local holdKey = KEYS[1]
local offer = redis.call('GET', holdKey)
if not offer then return 0 end
local qty = tonumber(ARGV[1])
local softHeld = tonumber(redis.call('HGET', offer, 'soft_held') or '0')
if softHeld < qty then return 0 end
redis.call('HSET', offer, 'soft_held', softHeld - qty)
redis.call('HSET', offer, 'reserved', (tonumber(redis.call('HGET', offer, 'reserved') or '0')) + qty)
redis.call('DEL', holdKey)
return 1
`;

const GET_COUNTERS = `
local offer = KEYS[1]
return {redis.call('HGET', offer, 'available'), redis.call('HGET', offer, 'reserved'), redis.call('HGET', offer, 'soft_held')}
`;

@Injectable()
export class ReservationGate {
  constructor(private readonly redis: Redis) {}

  private offerKey(offerId: string): string {
    return `oj:offers:${offerId}`;
  }

  private holdKey(idempotencyKey: string): string {
    return `oj:hold:soft:${idempotencyKey}`;
  }

  async seedOffer(offerId: string, available: number): Promise<void> {
    await this.redis.hmset(this.offerKey(offerId), { available, reserved: 0, soft_held: 0 });
  }

  async acquireSoftHold(offerId: string, idempotencyKey: string, qty: number, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.eval(
      ACQUIRE_SOFT,
      2,
      this.offerKey(offerId),
      this.holdKey(idempotencyKey),
      String(qty),
      String(ttlSeconds),
    );
    return result === 1;
  }

  async releaseSoftHold(idempotencyKey: string, qty: number): Promise<boolean> {
    const result = await this.redis.eval(RELEASE_SOFT, 1, this.holdKey(idempotencyKey), String(qty));
    return result === 1;
  }

  async convertSoftToHard(idempotencyKey: string, qty: number): Promise<boolean> {
    const result = await this.redis.eval(CONVERT_SOFT_TO_HARD, 1, this.holdKey(idempotencyKey), String(qty));
    return result === 1;
  }

  async getCounters(offerId: string): Promise<OfferCounters> {
    const [available, reserved, softHeld] = (await this.redis.eval(GET_COUNTERS, 1, this.offerKey(offerId))) as string[];
    return {
      available: Number(available ?? 0),
      reserved: Number(reserved ?? 0),
      softHeld: Number(softHeld ?? 0),
    };
  }

  async rebuild(offers: Array<{ offerId: string; available: number; reserved: number; softHeld: number }>): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const offer of offers) {
      pipeline.hmset(this.offerKey(offer.offerId), {
        available: offer.available,
        reserved: offer.reserved,
        soft_held: offer.softHeld,
      });
    }
    await pipeline.exec();
  }
}
