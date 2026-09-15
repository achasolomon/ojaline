import { Module } from '@nestjs/common';
import { MarketRealtimeModule } from '../realtime/market-realtime.module.js';
import { FeedService } from './feed.service.js';
import { PushService } from '../push/push.service.js';
import { NotifyService } from './notify.service.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [MarketRealtimeModule],
  controllers: [NotificationsController],
  providers: [FeedService, PushService, NotifyService],
  exports: [FeedService, PushService, NotifyService],
})
export class NotificationsModule {}