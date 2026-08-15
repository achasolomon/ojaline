import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { HealthController } from './modules/health/health.controller.js';
import { OutboxService } from './modules/outbox/outbox.service.js';
import { ReservationGate } from './modules/reservation/reservation.gate.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
    }),
  ],
  controllers: [HealthController],
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
  ],
  exports: [Pool, Redis, OutboxService, ReservationGate],
})
export class AppModule {}
