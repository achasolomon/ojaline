import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Param,
  Inject,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { OrdersService, CreateCheckoutInput, ConfirmPaymentInput } from './orders.service.js';
import { CurrentUser, AuthRequired, type AuthUser } from '../auth/auth-guards.js';

interface CheckoutBody {
  buyer_id: string;
  items: Array<{ offer_id: string; qty: number; unit_price_cents: number }>;
  soft_hold_ids: string[];
  window_start: string;
  window_end: string;
  delivery_mode?: string;
}

interface PayBody {
  callback_url?: string;
}

interface ConfirmBody {
  order_id: string;
  paystack_reference: string;
}

@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Get()
  async list(
    @Query('buyer_id') buyerId: string,
    @Query('seller_id') sellerId: string,
    @Query('status') status: string,
    @Query('line_status') lineStatus: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @CurrentUser() user?: AuthUser,
  ) {
    if (sellerId) {
      return this.orders.listSellerOrders(
        sellerId,
        {
          status,
          line_status: lineStatus,
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
        },
        user,
      );
    }
    if (!buyerId) throw new BadRequestException('buyer_id or seller_id required');
    return this.orders.listOrders(buyerId, user);
  }

  @Post('checkout')
  @HttpCode(201)
  async checkout(@Body() body: CheckoutBody, @CurrentUser() user?: AuthUser) {
    const input: CreateCheckoutInput = {
      buyer_id: body.buyer_id,
      items: body.items,
      soft_hold_ids: body.soft_hold_ids,
      window_start: body.window_start,
      window_end: body.window_end,
      delivery_mode: body.delivery_mode,
    };
    return this.orders.createCheckout(input, user);
  }

  @Post(':id/pay')
  @HttpCode(200)
  async pay(@Param('id') id: string, @Body() body: PayBody, @CurrentUser() user?: AuthUser) {
    return this.orders.initializePayment(id, body.callback_url, user);
  }

  @Post('confirm')
  @HttpCode(200)
  @AuthRequired()
  async confirm(@Body() body: ConfirmBody, @CurrentUser() user: AuthUser) {
    const input: ConfirmPaymentInput = {
      order_id: body.order_id,
      paystack_reference: body.paystack_reference,
    };
    return this.orders.confirmPayment(input, user);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  async deliver(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.orders.confirmDelivery(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.orders.cancelOrder(id, user);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.orders.getOrder(id, user);
  }
}