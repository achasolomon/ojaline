import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import request from 'supertest';

describe('health endpoint (integration — requires docker compose stack)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok when postgres and redis respond', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: true, redis: true });
  });

  it('exposes Prometheus metrics for outbox, soft holds, DB pool and redis', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toContain('ojaline_outbox_pending');
    expect(res.text).toContain('ojaline_soft_hold_active');
    expect(res.text).toContain('ojaline_db_pool_connections');
    expect(res.text).toContain('ojaline_redis_connected');
  });
});
