import { Controller, Get, Post, Param, Body, Query, Inject } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { CurrentUser, assertOwnedOrAnon, type AuthUser } from '../auth/auth-guards.js';

@Controller('chat')
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Post('conversations')
  async createConversation(
    @Body() body: { buyer_id: string; seller_id: string; offer_id?: string; order_id?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    assertOwnedOrAnon(user, body.buyer_id, 'Conversation identity');
    return this.chat.getOrCreateConversation(body);
  }

  @Get('conversations')
  async getUserConversations(@Query('user_id') userId: string, @CurrentUser() user?: AuthUser) {
    assertOwnedOrAnon(user, userId, 'Conversations identity');
    return this.chat.getUserConversations(userId);
  }

  @Post('conversations/:id/read')
  async markConversationRead(@Param('id') conversationId: string, @Body() body: { user_id: string }, @CurrentUser() user?: AuthUser) {
    assertOwnedOrAnon(user, body.user_id, 'Mark read identity');
    return this.chat.markConversationRead(conversationId, body.user_id);
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') conversationId: string,
    @Body() body: { sender_id: string; content: string },
    @CurrentUser() user?: AuthUser,
  ) {
    assertOwnedOrAnon(user, body.sender_id, 'Message identity');
    return this.chat.sendMessage(conversationId, body.sender_id, body.content);
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') conversationId: string,
    @Query('user_id') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    assertOwnedOrAnon(user, userId, 'Messages identity');
    return this.chat.getMessages(
      conversationId,
      userId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post('conversations/:id/proxy-number')
  async createProxyNumber(@Param('id') conversationId: string) {
    const proxyNumber = await this.chat.createProxyNumber(conversationId);
    return { proxy_number: proxyNumber };
  }
}
