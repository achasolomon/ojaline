import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Param,
  Inject,
} from '@nestjs/common';
import { OrdersService, CreateCheckoutInput, ConfirmPaymentInput } from './orders.service.js';

interface CheckoutBody {
  buyer_id: string;
  items: Array<{ offer_id: string; qty: number; unit_price_cents: number }>;
  soft_hold_ids: string[];
  window_start: string;
  window_end: string;
}

interface ConfirmBody {
  order_id: string;
  paystack_reference: string;
}

@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post('checkout')
  @HttpCode(201)
  async checkout(@Body() body: CheckoutBody) {
    const input: CreateCheckoutInput = {
      buyer_id: body.buyer_id,
      items: body.items,
      soft_hold_ids: body.soft_hold_ids,
      window_start: body.window_start,
      window_end: body.window_end,
    };
    return this.orders.createCheckout(input);
  }

  @Post(':id/pay')
  @HttpCode(200)
  async pay(@Param('id') id: string) {
    return this.orders.initializePayment(id);
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

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    return this.orders.getOrder(id);
  }
}
