import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { DisputesService } from './disputes.service.js';
import { DisputesController } from './disputes.controller.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [DisputesController],
  providers: [DisputesService, OutboxService],
  exports: [DisputesService],
})
export class DisputesModule {}
