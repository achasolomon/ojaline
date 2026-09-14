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
  async list(@Query('buyer_id') buyerId: string) {
    if (!buyerId) throw new BadRequestException('buyer_id required');
    return this.orders.listOrders(buyerId);
  }

  @Post('checkout')
  @HttpCode(201)
  async checkout(@Body() body: CheckoutBody) {
    const input: CreateCheckoutInput = {
      buyer_id: body.buyer_id,
      items: body.items,
      soft_hold_ids: body.soft_hold_ids,
      window_start: body.window_start,
      window_end: body.window_end,
      delivery_mode: body.delivery_mode,
    };
    return this.orders.createCheckout(input);
  }

  @Post(':id/pay')
  @HttpCode(200)
  async pay(@Param('id') id: string, @Body() body: PayBody) {
    return this.orders.initializePayment(id, body.callback_url);
  }

  @Post('confirm')
  @HttpCode(200)
  async confirm(@Body() body: ConfirmBody) {
    const input: ConfirmPaymentInput = {
      order_id: body.order_id,
      paystack_reference: body.paystack_reference,
    };
    return this.orders.confirmPayment(input);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  async deliver(@Param('id') id: string) {
    return this.orders.confirmDelivery(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string) {
    return this.orders.cancelOrder(id);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    return this.orders.getOrder(id);
  }
}
