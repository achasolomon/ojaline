import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { Registry, Gauge, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly outboxPending = new Gauge({
    name: 'ojaline_outbox_pending',
    help: 'Number of outbox events awaiting dispatch (PENDING/FAILED)',
    registers: [this.registry],
  });

  private readonly softHoldActive = new Gauge({
    name: 'ojaline_soft_hold_active',
    help: 'Number of active soft-hold keys in Redis',
    registers: [this.registry],
  });

  private readonly dbPoolConnections = new Gauge({
    name: 'ojaline_db_pool_connections',
    help: 'Postgres pool size (total/idle/waiting)',
    labelNames: ['state'],
    registers: [this.registry],
  });

  private readonly redisConnected = new Gauge({
    name: 'ojaline_redis_connected',
    help: 'Redis connectivity (1 = connected)',
    registers: [this.registry],
  });

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(Redis) private readonly redis: Redis,
  ) {
    collectDefaultMetrics({ register: this.registry });
  }

  async refresh(): Promise<void> {
    await Promise.allSettled([this.refreshOutbox(), this.refreshSoftHolds(), this.refreshDbPool(), this.refreshRedis()]);
  }

  private async refreshOutbox(): Promise<void> {
    try {
      const { rows } = await this.pool.query(
        `SELECT count(*)::int AS n FROM audit.outbox_events WHERE status IN ('PENDING','FAILED')`,
      );
      this.outboxPending.set(rows[0].n);
    } catch {
      this.outboxPending.set(-1);
    }
  }

  private async refreshSoftHolds(): Promise<void> {
    try {
      let count = 0;
      const stream = this.redis.scanStream({ match: 'oj:hold:soft:*', count: 100 });
      for await (const keys of stream) count += keys.length;
      this.softHoldActive.set(count);
    } catch {
      this.softHoldActive.set(-1);
    }
  }

  private refreshDbPool(): void {
    const p = this.pool as unknown as { totalCount?: number; idleCount?: number; waitingCount?: number };
    this.dbPoolConnections.set({ state: 'total' }, p.totalCount ?? -1);
    this.dbPoolConnections.set({ state: 'idle' }, p.idleCount ?? -1);
    this.dbPoolConnections.set({ state: 'waiting' }, p.waitingCount ?? -1);
  }

  private async refreshRedis(): Promise<void> {
    try {
      const pong = await this.redis.ping();
      this.redisConnected.set(pong === 'PONG' ? 1 : 0);
    } catch {
      this.redisConnected.set(0);
    }
  }
}
