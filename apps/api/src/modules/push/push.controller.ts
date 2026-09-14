import { Controller, Get, Post, Delete, Body, Query, Inject } from '@nestjs/common';
import { PushService } from './push.service.js';
import { CurrentUser, assertOwnedOrAnon, type AuthUser } from '../auth/auth-guards.js';

@Controller('push')
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}

  @Post('subscribe')
  async subscribe(
    @Query('user_id') userId: string,
    @Body() body: { endpoint: string; p256dh: string; auth: string; device_type?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    assertOwnedOrAnon(user, userId, 'Push subscription identity');
    return this.push.subscribe(userId, body.endpoint, body.p256dh, body.auth, body.device_type);
  }

  @Delete('unsubscribe')
  async unsubscribe(
    @Query('user_id') userId: string,
    @Body() body: { endpoint: string },
    @CurrentUser() user?: AuthUser,
  ) {
    assertOwnedOrAnon(user, userId, 'Push subscription identity');
    return this.push.unsubscribe(userId, body.endpoint);
  }

  @Get('subscriptions')
  async getSubscriptions(@Query('user_id') userId: string, @CurrentUser() user?: AuthUser) {
    assertOwnedOrAnon(user, userId, 'Push subscription identity');
    return this.push.getSubscriptions(userId);
  }
}
