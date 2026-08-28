import { Controller, Get, Post, Delete, Body, Query, Inject } from '@nestjs/common';
import { PushService } from './push.service.js';

@Controller('push')
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}

  @Post('subscribe')
  async subscribe(
    @Query('user_id') userId: string,
    @Body() body: { endpoint: string; p256dh: string; auth: string; device_type?: string },
  ) {
    return this.push.subscribe(userId, body.endpoint, body.p256dh, body.auth, body.device_type);
  }

  @Delete('unsubscribe')
  async unsubscribe(
    @Query('user_id') userId: string,
    @Body() body: { endpoint: string },
  ) {
    return this.push.unsubscribe(userId, body.endpoint);
  }

  @Get('subscriptions')
  async getSubscriptions(@Query('user_id') userId: string) {
    return this.push.getSubscriptions(userId);
  }
}
