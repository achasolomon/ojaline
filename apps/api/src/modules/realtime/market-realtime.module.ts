import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MarketFeedService } from './market-feed.service.js';
import { MarketEventsController } from './market-events.controller.js';
import { MarketRealtimeGateway } from './market-realtime.gateway.js';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [MarketEventsController],
  providers: [MarketFeedService, MarketRealtimeGateway],
  exports: [MarketFeedService],
})
export class MarketRealtimeModule {}