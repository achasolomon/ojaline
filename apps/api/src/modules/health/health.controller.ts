import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(Redis) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<{ status: string; db: boolean; redis: boolean; dbError?: string; redisError?: string }> {
    let db = false;
    let redis = false;
    let dbError: string | undefined;
    let redisError: string | undefined;
    try {
      const { rows } = await this.pool.query('SELECT 1');
      db = rows.length === 1;
    } catch (e) {
      db = false;
      dbError = (e as Error).message;
    }
    try {
      redis = (await this.redis.ping()) === 'PONG';
    } catch (e) {
      redis = false;
      redisError = (e as Error).message;
    }
    return { status: db && redis ? 'ok' : 'degraded', db, redis, dbError, redisError };
  }
}


