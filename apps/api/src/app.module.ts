import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { HealthController } from './modules/health/health.controller.js';
import { ReservationGate } from './modules/reservation/reservation.gate.js';
import { MetricsController } from './modules/metrics/metrics.controller.js';
import { MetricsService } from './modules/metrics/metrics.service.js';
import { ReservationsController } from './modules/reservation/reservations.controller.js';
import { OrdersController } from './modules/orders/orders.controller.js';
import { OrdersService } from './modules/orders/orders.service.js';
import { OutboxService } from './modules/outbox/outbox.service.js';
import { PaystackService } from './modules/paystack/paystack.service.js';
import { WebhookController } from './modules/paystack/webhook.controller.js';
import { CatalogController } from './modules/catalog/catalog.controller.js';
import { CatalogService } from './modules/catalog/catalog.service.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
    }),
  ],
  controllers: [HealthController, MetricsController, ReservationsController, OrdersController, WebhookController, CatalogController],
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
    OrdersService,
    PaystackService,
    CatalogService,
  ],
})
export class AppModule {}
