import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { DatabaseModule } from './modules/database/database.module.js';
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
import { MultiSellerGate } from './modules/fulfilment/multi-seller-gate.js';
import { FulfilmentStateMachine } from './modules/fulfilment/fulfilment-state-machine.js';
import { FulfilmentController } from './modules/fulfilment/fulfilment.controller.js';
import { MediaController } from './modules/media/media.controller.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { EscrowReleaseService } from './modules/escrow/escrow-release.service.js';
import { EscrowController } from './modules/escrow/escrow.controller.js';
import { AddressesModule } from './modules/addresses/addresses.module.js';
import { PushService } from './modules/push/push.service.js';
import { PushController } from './modules/push/push.controller.js';
import { ToSEnforcementService } from './modules/tos/tos.service.js';
import { ToSController } from './modules/tos/tos.controller.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
    }),
    DatabaseModule,
    ChatModule,
    AddressesModule,
  ],
  controllers: [HealthController, MetricsController, ReservationsController, OrdersController, WebhookController, CatalogController, FulfilmentController, MediaController, EscrowController, PushController, ToSController],
  providers: [
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
    MultiSellerGate,
    FulfilmentStateMachine,
    EscrowReleaseService,
    PushService,
    ToSEnforcementService,
  ],
})
export class AppModule {}
