import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SellersService } from './sellers.service.js';
import { SellersController } from './sellers.controller.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [SellersController],
  providers: [SellersService],
})
export class SellersModule {}