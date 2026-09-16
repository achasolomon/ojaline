import { Module } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MarketRealtimeModule } from '../realtime/market-realtime.module.js';

@Module({
  imports: [NotificationsModule, MarketRealtimeModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
