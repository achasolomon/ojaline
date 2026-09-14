import { Controller, Get, Patch, Post, Delete, Param, Query, Body, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CatalogService, DiscoverOffersQuery } from './catalog.service.js';
import { CurrentUser, AuthRequired, type AuthUser, assertOwnedOrAnon } from '../auth/auth-guards.js';

@Controller('catalog')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get('offers')
  async discoverOffers(
    @Query('channel') channel?: string,
    @Query('cluster_id') clusterId?: string,
    @Query('perishability') perishability?: string,
    @Query('category_id') categoryId?: string,
    @Query('q') q?: string,
    @Query('price_min') priceMin?: string,
    @Query('price_max') priceMax?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const query: DiscoverOffersQuery = {
      channel: channel || undefined,
      cluster_id: clusterId || undefined,
      perishability: perishability || undefined,
      category_id: categoryId || undefined,
      q: q || undefined,
      price_min: priceMin ? parseInt(priceMin, 10) : undefined,
      price_max: priceMax ? parseInt(priceMax, 10) : undefined,
      sort: (sort as any) || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };
    return this.catalog.discoverOffers(query);
  }

  @Get('categories')
  async getCategories() {
    return this.catalog.getCategories();
  }

  @Get('locations/states')
  async getStates() {
    return this.catalog.getStates();
  }

  @Get('locations/lgas')
  async getLgas(@Query('state') state: string) {
    return this.catalog.getLgas(state);
  }

  @Get('clusters')
  async getClusters(
    @Query('state') state?: string,
    @Query('lga') lga?: string,
  ) {
    return this.catalog.getClusters(state || undefined, lga || undefined);
  }

  @Get('markets')
  async getMarkets(
    @Query('cluster_id') clusterId?: string,
    @Query('date') date?: string,
  ) {
    return this.catalog.getMarkets(clusterId || undefined, date || undefined);
  }

  @Get('markets/:id')
  async getMarketById(@Param('id') id: string) {
    return this.catalog.getMarketById(id);
  }

  @Get('markets/:id/sellers')
  async getMarketSellers(
    @Param('id') id: string,
    @Query('seller_type') sellerType?: string,
  ) {
    return this.catalog.getMarketSellers(id, sellerType || undefined);
  }

  @Get('sellers/top')
  async getTopSellers(@Query('limit') limit?: string) {
    return this.catalog.getTopSellers(limit ? parseInt(limit, 10) : 5);
  }

  @Get('sellers/:id')
  async getSellerById(@Param('id') id: string) {
    return this.catalog.getSellerById(id);
  }

  @Get('sellers/:id/storefront')
  async getStorefront(@Param('id') id: string) {
    return this.catalog.getStorefront(id);
  }

  @Get('offers/batch')
  async getBatchOffers(@Query('ids') ids?: string) {
    if (!ids) return [];
    const idList = ids.split(',').filter(Boolean).slice(0, 20);
    return this.catalog.getBatchOffers(idList);
  }

  @Get('offers/mine')
  @AuthRequired()
  async listMyOffers(
    @CurrentUser() user: AuthUser,
    @Query('seller_id') sellerIdParam?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const requested = sellerIdParam || user.id;
    if (user.id !== requested && !user.roles.some((r) => r === 'OPS' || r === 'AGENT')) {
      throw new ForbiddenException('This inventory belongs to another seller');
    }
    return this.catalog.listMyOffers(requested, {
      status: status || undefined,
      q: q || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('offers/:id/similar')
  async getSimilarOffers(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.catalog.getSimilarOffers(id, limit ? parseInt(limit, 10) : 8);
  }

  @Get('offers/:id/reviews')
  async getReviews(@Param('id') id: string) {
    return this.catalog.getReviews(id);
  }

  @Post('offers/:id/reviews')
  async addReview(
    @Param('id') offerId: string,
    @Body() body: { reviewer_id: string; rating: number; review_text?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    assertOwnedOrAnon(user, body.reviewer_id, 'Review identity');
    return this.catalog.addReview(offerId, body.reviewer_id, body.rating, body.review_text);
  }

  @Get('offers/:id')
  async findOffer(@Param('id') id: string) {
    return this.catalog.findOfferById(id);
  }

  @Patch('offers/:id/price')
  @AuthRequired()
  async updateOfferPrice(
    @Param('id') id: string,
    @Body() body: { new_price_cents?: number },
    @CurrentUser() user: AuthUser,
  ) {
    if (!Number.isInteger(body.new_price_cents) || body.new_price_cents! < 0) {
      throw new NotFoundException('Valid new_price_cents is required');
    }
    return this.catalog.updateOfferPrice(id, body.new_price_cents!, user);
  }

  @Patch('offers/:id')
  @AuthRequired()
  async updateOffer(
    @Param('id') id: string,
    @Body() body: {
      product_name?: string;
      physical_ref?: string;
      unit?: string;
      available_qty?: number;
      min_order_qty?: number;
      channel?: string;
      perishability?: string;
      fulfilment_modes?: string[];
      cluster_id?: string;
      price_cents?: number;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.updateOffer(id, user, body);
  }

  @Post('offers/:id/pause')
  @AuthRequired()
  async pauseOffer(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.catalog.setOfferStatus(id, user, 'pause');
  }

  @Post('offers/:id/reactivate')
  @AuthRequired()
  async reactivateOffer(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.catalog.setOfferStatus(id, user, 'reactivate');
  }

  @Post('offers/:id/delist')
  @AuthRequired()
  async delistOffer(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.catalog.setOfferStatus(id, user, 'delist');
  }

  @Post('offers/:id/media')
  @AuthRequired()
  async addOfferMedia(
    @Param('id') id: string,
    @Body() body: { storage_key?: string; is_primary?: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    if (!body.storage_key) throw new BadRequestException('storage_key is required');
    return this.catalog.addOfferMedia(id, user, { storage_key: body.storage_key, is_primary: body.is_primary });
  }

  @Delete('offers/:id/media/:media_id')
  @AuthRequired()
  async removeOfferMedia(
    @Param('id') id: string,
    @Param('media_id') mediaId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.removeOfferMedia(id, user, mediaId);
  }

  @Post('offers')
  @AuthRequired()
  async createOffer(
    @Body() body: {
      seller_id: string;
      product_name: string;
      physical_ref: string;
      channel: string;
      available_qty: number;
      min_order_qty: number;
      perishability: string;
      fulfilment_modes: string[];
      cluster_id: string;
      price_cents: number;
      category_id?: string;
      unit?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    assertOwnedOrAnon(user, body.seller_id, 'Seller identity');
    return this.catalog.createOffer(body);
  }

  @Get('wishlist')
  async getWishlist(@Query('user_id') userId?: string, @CurrentUser() user?: AuthUser) {
    if (!userId) return [];
    assertOwnedOrAnon(user, userId, 'Wishlist identity');
    return this.catalog.listWishlist(userId);
  }

  @Post('wishlist')
  async addToWishlist(@Body() body: { user_id: string; offer_id: string }, @CurrentUser() user?: AuthUser) {
    assertOwnedOrAnon(user, body.user_id, 'Wishlist identity');
    return this.catalog.addWishlistItem(body.user_id, body.offer_id);
  }

  @Delete('wishlist')
  async removeFromWishlist(
    @Query('user_id') userId?: string,
    @Query('offer_id') offerId?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    if (!userId || !offerId) {
      throw new BadRequestException('user_id and offer_id are required');
    }
    assertOwnedOrAnon(user, userId, 'Wishlist identity');
    return this.catalog.removeWishlistItem(userId, offerId);
  }
}