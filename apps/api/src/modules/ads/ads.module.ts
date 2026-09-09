import { Module } from '@nestjs/common';
import { MarketRealtimeModule } from '../realtime/market-realtime.module.js';
import { AdsController } from './ads.controller.js';
import { AdsService } from './ads.service.js';

@Module({
  imports: [MarketRealtimeModule],
  controllers: [AdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}