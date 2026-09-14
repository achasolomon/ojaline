import { Body, Controller, Get, Post, Param, Inject, HttpCode, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import {
  FulfilmentStateMachine,
  BuyerDecision,
} from './fulfilment-state-machine.js';
import { FeedService } from '../notifications/feed.service.js';
import { CurrentUser, type AuthUser } from '../auth/auth-guards.js';

interface DecisionBody {
  order_id: string;
  action: 'CONTINUE' | 'CANCEL' | 'REPLACE_SELLER';
  line_ids: string[];
}

@Controller('orders')
export class FulfilmentController {
  constructor(
    @Inject(FulfilmentStateMachine) private readonly stateMachine: FulfilmentStateMachine,
    @Inject(Pool) private readonly pool: Pool,
    @Inject(FeedService) private readonly feed: FeedService,
  ) {}

  @Post(':id/decide')
  @HttpCode(200)
  async buyerDecision(@Param('id') id: string, @Body() body: DecisionBody, @CurrentUser() user?: AuthUser) {
    const decision: BuyerDecision = {
      order_id: id,
      action: body.action,
      line_ids: body.line_ids,
    };
    const owner = await this.pool.query<{ buyer_id: string }>(
      `SELECT buyer_id FROM orders.orders WHERE id = $1`,
      [id],
    );
    if (owner.rowCount === 0) throw new BadRequestException(`order ${id} not found`);
    if (user && user.id !== owner.rows[0].buyer_id) {
      throw new ForbiddenException('This order belongs to another buyer');
    }
    const result = await this.stateMachine.handleBuyerDecision(decision);
    await this.broadcastDecision(id, body.action);
    return result;
  }

  private async broadcastDecision(orderId: string, action: BuyerDecision['action']): Promise<void> {
    try {
      const order = await this.pool.query<{ buyer_id: string }>(
        `SELECT buyer_id FROM orders.orders WHERE id = $1`,
        [orderId],
      );
      if (order.rowCount === 0) return;
      const text = {
        CANCEL: { title: 'Order cancelled', body: 'Your order has been cancelled and refunded.' },
        CONTINUE: { title: 'Refund requested', body: 'We will refund the affected items. The rest of your order continues.' },
        REPLACE_SELLER: { title: 'Order updated', body: 'The affected items will be replaced by another seller.' },
      }[action];
      await this.feed.push(order.rows[0].buyer_id, {
        type: 'order',
        title: text.title,
        body: text.body,
        deep_link: `/orders/${orderId}`,
      });
    } catch (err) {
      /* decision already committed — a failed notification must not fail the request */
    }
  }

  @Get(':id/fulfilment')
  async fulfilmentStatus(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const owner = await this.pool.query<{ buyer_id: string }>(
      `SELECT buyer_id FROM orders.orders WHERE id = $1`,
      [id],
    );
    if (owner.rowCount === 0) throw new BadRequestException(`order ${id} not found`);
    if (user && user.id !== owner.rows[0].buyer_id) {
      const isOps = user.roles.some((r) => r === 'OPS' || r === 'AGENT');
      if (!isOps) throw new ForbiddenException('This order belongs to another buyer');
    }
    return this.stateMachine.getOrderFulfilmentStatus(id);
  }
}