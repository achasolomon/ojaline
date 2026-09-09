import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../app.module.js';
import request from 'supertest';

// Bootstraps the full HTTP app under vitest; the ws adapter needs a running
// HTTP server, so these suites only run when explicitly requested (RUN_E2E=1).
describe.skipIf(process.env.RUN_E2E !== '1')('reservation holds endpoint (integration)', () => {
  let app: INestApplication;
  let redis: Redis;
  let offerId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
    offerId = randomUUID();
  });

  afterAll(async () => {
    await redis.del(`oj:offers:${offerId}`);
    redis.disconnect();
    await app.close();
  });

  it('seeds an offer and acquires holds up to capacity', async () => {
    const seed = await request(app.getHttpServer()).post('/reservations/offers').send({ offer_id: offerId, available: 2 });
    expect(seed.status).toBe(200);
    expect(seed.body).toEqual({ ok: true });

    const first = await request(app.getHttpServer())
      .post('/reservations/soft-holds')
      .send({ offer_id: offerId, qty: 1, idempotency_key: randomUUID() });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ acquired: true });

    const second = await request(app.getHttpServer())
      .post('/reservations/soft-holds')
      .send({ offer_id: offerId, qty: 1, idempotency_key: randomUUID() });
    expect(second.status).toBe(201);
  });

  it('refuses a hold beyond capacity with 409', async () => {
    const overrun = await request(app.getHttpServer())
      .post('/reservations/soft-holds')
      .send({ offer_id: offerId, qty: 1, idempotency_key: randomUUID() });
    expect(overrun.status).toBe(409);
    expect(overrun.body).toMatchObject({ acquired: false, reason: 'INSUFFICIENT' });
  });

  it('rejects malformed input with 400', async () => {
    const badOffer = await request(app.getHttpServer())
      .post('/reservations/soft-holds')
      .send({ offer_id: 'not-a-uuid', qty: 1 });
    expect(badOffer.status).toBe(400);

    const badQty = await request(app.getHttpServer())
      .post('/reservations/soft-holds')
      .send({ offer_id: offerId, qty: 0 });
    expect(badQty.status).toBe(400);
  });
});
