import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import { FeedService } from './feed.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(FeedService) private readonly feed: FeedService) {}

  @Get()
  async list(@Query('user_id') userId: string, @Query('limit') limit?: string) {
    return this.feed.list(userId, limit ? parseInt(limit, 10) : 50);
  }

  @Get('unread')
  async unread(@Query('user_id') userId: string) {
    return { count: await this.feed.unreadCount(userId) };
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Body() body: { user_id: string; ids?: string[] }) {
    return this.feed.markRead(body.user_id, body.ids);
  }
}