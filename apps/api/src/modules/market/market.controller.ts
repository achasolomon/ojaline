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
import { MarketService, type CreateThreadInput, type CreateWantInput, type CreateCrowdSaleInput } from './market.service.js';
import { CurrentUser, assertOwnedOrAnon, type AuthUser } from '../auth/auth-guards.js';

@Controller()
export class MarketController {
  constructor(@Inject(MarketService) private readonly market: MarketService) {}

  private map(err: unknown): never {
    if (err instanceof Error) throw new BadRequestException(err.message);
    throw err;
  }

  private actor(query: { buyer_id?: string; seller_id?: string }): { id: string; side: 'BUYER' | 'SELLER' } {
    if (query.buyer_id) return { id: query.buyer_id, side: 'BUYER' };
    if (query.seller_id) return { id: query.seller_id, side: 'SELLER' };
    throw new BadRequestException('buyer_id or seller_id required');
  }

  /* ------------------------------ wants ------------------------------ */

  @Post('wants')
  async createWant(@Query('buyer_id') buyerId: string, @Body() body: CreateWantInput, @CurrentUser() user?: AuthUser) {
    try {
      assertOwnedOrAnon(user, buyerId, 'Want identity');
      return await this.market.createWant(buyerId, body);
    } catch (err) {
      this.map(err);
    }
  }

  @Get('wants')
  async listWants(
    @Query('buyer_id') buyerId?: string,
    @Query('seller_id') sellerId?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      if (sellerId) {
        assertOwnedOrAnon(user, sellerId, 'Seller wants identity');
        return await this.market.listWantsForSeller(sellerId);
      }
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
  async settleWant(@Param('id') id: string, @Query('buyer_id') buyerId: string, @Body() body: { bid_id: string }, @CurrentUser() user?: AuthUser) {
    try {
      assertOwnedOrAnon(user, buyerId, 'Want settlement identity');
      return await this.market.settleWant(id, body.bid_id, buyerId);
    } catch (err) {
      this.map(err);
    }
  }

  /* --------------------------- crowd sales --------------------------- */

  @Post('crowd-sales')
  async createCrowdSale(
    @Query('seller_id') sellerId: string,
    @Body() body: CreateCrowdSaleInput,
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      assertOwnedOrAnon(user, sellerId, 'Crowd sale identity');
      return await this.market.createCrowdSale(sellerId, body);
    } catch (err) {
      this.map(err);
    }
  }

  @Get('crowd-sales')
  async listCrowdSales(@Query('seller_id') sellerId?: string, @Query('status') status?: string) {
    try {
      return await this.market.listCrowdSales({
        ...(sellerId ? { seller_id: sellerId } : {}),
        ...(status === 'OPEN' || status === 'CLOSED' ? { status } : {}),
      });
    } catch (err) {
      this.map(err);
    }
  }

  @Post('crowd-sales/:id/close')
  @HttpCode(HttpStatus.OK)
  async closeCrowdSale(
    @Param('id') id: string,
    @Query('seller_id') sellerId: string,
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      assertOwnedOrAnon(user, sellerId, 'Close crowd sale identity');
      return await this.market.closeCrowdSale(id, sellerId);
    } catch (err) {
      this.map(err);
    }
  }

  /* --------------------------- negotiations --------------------------- */

  @Post('negotiations')
  async openThread(@Query('buyer_id') buyerId: string, @Body() body: CreateThreadInput, @CurrentUser() user?: AuthUser) {
    try {
      assertOwnedOrAnon(user, buyerId, 'Negotiation identity');
      return await this.market.openThread(body, buyerId);
    } catch (err) {
      this.map(err);
    }
  }

  @Get('negotiations')
  async listNegotiations(@Query() query: { buyer_id?: string; seller_id?: string }, @CurrentUser() user?: AuthUser) {
    try {
      if (query.seller_id) {
        assertOwnedOrAnon(user, query.seller_id, 'Seller negotiation identity');
        return await this.market.listSellerNegotiations(query.seller_id);
      }
      const buyerId = query.buyer_id ?? '';
      assertOwnedOrAnon(user, buyerId, 'Negotiation identity');
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
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      assertOwnedOrAnon(user, buyerId, 'Bid identity');
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
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      assertOwnedOrAnon(user, buyerId, 'Accept identity');
      return await this.market.accept(id, buyerId, body.per_unit_kobo);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/seller-offer')
  async sellerOffer(
    @Param('id') id: string,
    @Query('seller_id') sellerId: string,
    @Body() body: { per_unit_kobo: number; qty?: number; message?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      assertOwnedOrAnon(user, sellerId, 'Seller offer identity');
      return await this.market.sellerOffer(id, sellerId, body.per_unit_kobo, body.qty, body?.message);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/seller-accept')
  async sellerAccept(
    @Param('id') id: string,
    @Query('seller_id') sellerId: string,
    @Body() body: { per_unit_kobo: number },
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      assertOwnedOrAnon(user, sellerId, 'Seller accept identity');
      return await this.market.sellerAccept(id, sellerId, body.per_unit_kobo);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/end')
  async endBargain(
    @Param('id') id: string,
    @Query() query: { buyer_id?: string; seller_id?: string },
    @Body() body: { message?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      const { id: actorId, side } = this.actor(query);
      const paramId = query.buyer_id ?? query.seller_id;
      assertOwnedOrAnon(user, paramId, 'Bargain identity');
      return await this.market.endBargain(id, actorId, side, body?.message);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/accept-frozen')
  @HttpCode(HttpStatus.OK)
  async acceptFrozen(@Param('id') id: string, @Query() query: { buyer_id?: string; seller_id?: string }, @CurrentUser() user?: AuthUser) {
    try {
      const { id: actorId, side } = this.actor(query);
      const paramId = query.buyer_id ?? query.seller_id;
      assertOwnedOrAnon(user, paramId, 'Frozen accept identity');
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
    @CurrentUser() user?: AuthUser,
  ) {
    try {
      const { id: actorId, side } = this.actor(query);
      const paramId = query.buyer_id ?? query.seller_id;
      assertOwnedOrAnon(user, paramId, 'Continue identity');
      return await this.market.continueBargain(id, actorId, side, body.per_unit_kobo, body.qty, body?.message);
    } catch (err) {
      this.map(err);
    }
  }

  @Post('negotiations/:id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@Param('id') id: string, @Query('buyer_id') buyerId: string, @CurrentUser() user?: AuthUser) {
    try {
      assertOwnedOrAnon(user, buyerId, 'Revoke identity');
      return await this.market.revokeDeal(id, buyerId);
    } catch (err) {
      this.map(err);
    }
  }
}