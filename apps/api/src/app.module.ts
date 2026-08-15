import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { HealthController } from './modules/health/health.controller.js';
import { OutboxService } from './modules/outbox/outbox.service.js';
import { ReservationGate } from './modules/reservation/reservation.gate.js';
import { MetricsController } from './modules/metrics/metrics.controller.js';
import { MetricsService } from './modules/metrics/metrics.service.js';
import { ReservationsController } from './modules/reservation/reservations.controller.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
    }),
  ],
  controllers: [HealthController, MetricsController, ReservationsController],
  providers: [
    {
      provide: Pool,
      useFactory: () => {
        const c = loadConfig();
        return new Pool({
          host: c.DB_HOST,
          port: c.DB_PORT,
          database: c.DB_NAME,
          user: c.DB_USER,
          password: c.DB_PASSWORD,
        });
      },
    },
    {
      provide: Redis,
      useFactory: () => {
        const c = loadConfig();
        return new Redis(c.REDIS_URL);
      },
    },
    OutboxService,
    ReservationGate,
    MetricsService,
  ],
  exports: [Pool, Redis, OutboxService, ReservationGate],
})
export class AppModule {}
