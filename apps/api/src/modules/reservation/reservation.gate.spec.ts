import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { ReservationGate } from './reservation.gate.js';

const SOFT_HOLD_TTL = 480;

describe('ReservationGate (integration — requires redis on REDIS_URL)', () => {
  let redis: Redis;
  let gate: ReservationGate;
  let offerId: string;

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
    gate = new ReservationGate(redis);
  });

  afterAll(async () => {
    redis.disconnect();
  });

  beforeEach(async () => {
    offerId = randomUUID();
    await gate.seedOffer(offerId, 3);
  });

  afterEach(async () => {
    await redis.del(`oj:offers:${offerId}`);
  });

  it('acquires a soft hold and decrements sellable budget', async () => {
    const ok = await gate.acquireSoftHold(offerId, randomUUID(), 2, SOFT_HOLD_TTL);
    expect(ok).toBe(true);
    const c = await gate.getCounters(offerId);
    expect(c).toEqual({ available: 3, reserved: 0, softHeld: 2 });
  });

  it('rejects acquisition beyond sellable budget', async () => {
    const ok = await gate.acquireSoftHold(offerId, randomUUID(), 4, SOFT_HOLD_TTL);
    expect(ok).toBe(false);
    const c = await gate.getCounters(offerId);
    expect(c.softHeld).toBe(0);
  });

  it('lets exactly one concurrent acquirer take the last unit — zero double-sell', async () => {
    await gate.seedOffer(offerId, 1);

    const attempts = Array.from({ length: 20 }, () => gate.acquireSoftHold(offerId, randomUUID(), 1, SOFT_HOLD_TTL));
    const results = await Promise.all(attempts);
    const wins = results.filter(Boolean).length;
    expect(wins).toBe(1);

    const c = await gate.getCounters(offerId);
    expect(c).toEqual({ available: 1, reserved: 0, softHeld: 1 });
  });

  it('releases a soft hold and restores sellable budget', async () => {
    const holdKey = randomUUID();
    await gate.acquireSoftHold(offerId, holdKey, 1, SOFT_HOLD_TTL);
    const released = await gate.releaseSoftHold(holdKey, 1);
    expect(released).toBe(true);
    const c = await gate.getCounters(offerId);
    expect(c.softHeld).toBe(0);
  });

  it('converts a soft hold to a hard reservation', async () => {
    const holdKey = randomUUID();
    await gate.acquireSoftHold(offerId, holdKey, 1, SOFT_HOLD_TTL);
    const converted = await gate.convertSoftToHard(holdKey, 1);
    expect(converted).toBe(true);
    const c = await gate.getCounters(offerId);
    expect(c).toEqual({ available: 3, reserved: 1, softHeld: 0 });
  });

  it('fails release/convert when the hold does not exist', async () => {
    const missing = randomUUID();
    expect(await gate.releaseSoftHold(missing, 1)).toBe(false);
    expect(await gate.convertSoftToHard(missing, 1)).toBe(false);
  });
});
