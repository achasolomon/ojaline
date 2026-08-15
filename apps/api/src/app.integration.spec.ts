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
});
