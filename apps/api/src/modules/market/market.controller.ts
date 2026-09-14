import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MarketService, type CreateThreadInput, type CreateWantInput } from './market.service.js';

@Controller()
export class MarketController {
  constructor(@Inject(MarketService) private readonly market: MarketService) {}

  private map(err: unknown): never {
    if (err instanceof Error) throw new BadRequestException(err.message);
    throw err;
  }

  /** Negotiation endpoints accept the acting side as ?buyer_id= or ?seller_id=. */
  private actor(query: { buyer_id?: string; seller_id?: string }): { id: string; side: 'BUYER' | 'SELLER' } {
    if (query.buyer_id) return { id: query.buyer_id, side: 'BUYER' };
    if (query.seller_id) return { id: query.seller_id, side: 'SELLER' };
    throw new BadRequestException('buyer_id or seller_id required');
  }

  /* ------------------------------ wants ------------------------------ */

  @Post('wants')
  async createWant(@Query('buyer_id') buyerId: string, @Body() body: CreateWantInput) {
    try {
      return await this.market.createWant(buyerId, body);
    } catch (err) {
      this.map(err);
    }
  }

  @Get('wants')
  async listWants(@Query('buyer_id') buyerId?: string) {
    try {
      return await this.market.listWants(buyerId);
    } catch (err) {
      this.map(err);
    }
  }

  @Get('wants/:id')
  async getWant(@Param('id') id: string) {
    try {
      return await this.market.getWant(id);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('wants/:id/settle')
  @HttpCode(HttpStatus.OK)
  async settleWant(@Param('id') id: string, @Query('buyer_id') buyerId: string, @Body() body: { bid_id: string }) {
    try {
      return await this.market.settleWant(id, body.bid_id, buyerId);
    } catch (err) {
      this.map(err);
    }
  }

  /* --------------------------- negotiations --------------------------- */

  @Post('negotiations')
  async openThread(@Query('buyer_id') buyerId: string, @Body() body: CreateThreadInput) {
    try {
      return await this.market.openThread(body, buyerId);
    } catch (err) {
      this.map(err);
    }
  }

  @Get('negotiations')
  async listNegotiations(@Query('buyer_id') buyerId: string) {
    try {
      return await this.market.listNegotiations(buyerId);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/bid')
  async bid(
    @Param('id') id: string,
    @Query('buyer_id') buyerId: string,
    @Body() body: { qty: number; total_kobo: number; message?: string },
  ) {
    try {
      return await this.market.buyerBid(id, buyerId, body.qty, body.total_kobo, body.message ?? '');
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/accept')
  async accept(
    @Param('id') id: string,
    @Query('buyer_id') buyerId: string,
    @Body() body: { per_unit_kobo: number },
  ) {
    try {
      return await this.market.accept(id, buyerId, body.per_unit_kobo);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/end')
  async endBargain(
    @Param('id') id: string,
    @Query() query: { buyer_id?: string; seller_id?: string },
    @Body() body: { message?: string },
  ) {
    try {
      const { id: actorId, side } = this.actor(query);
      return await this.market.endBargain(id, actorId, side, body?.message);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/accept-frozen')
  @HttpCode(HttpStatus.OK)
  async acceptFrozen(@Param('id') id: string, @Query() query: { buyer_id?: string; seller_id?: string }) {
    try {
      const { id: actorId, side } = this.actor(query);
      return await this.market.acceptFrozen(id, actorId, side);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/continue')
  @HttpCode(HttpStatus.OK)
  async continueBargain(
    @Param('id') id: string,
    @Query() query: { buyer_id?: string; seller_id?: string },
    @Body() body: { per_unit_kobo: number; qty?: number; message?: string },
  ) {
    try {
      const { id: actorId, side } = this.actor(query);
      return await this.market.continueBargain(id, actorId, side, body.per_unit_kobo, body.qty, body?.message);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id') id: string, @Query('buyer_id') buyerId: string) {
    try {
      return await this.market.revokeDeal(id, buyerId);
    } catch (err) {
      this.map(err);
    }
  }
}