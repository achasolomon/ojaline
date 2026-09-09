import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { MarketRealtimeModule } from '../realtime/market-realtime.module.js';

@Module({
  imports: [forwardRef(() => MarketRealtimeModule)],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}