import { Controller, Get, Post, Param, Query, Body, Inject } from '@nestjs/common';
import { CatalogService, DiscoverOffersQuery } from './catalog.service.js';

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

  @Get('offers/batch')
  async getBatchOffers(@Query('ids') ids?: string) {
    if (!ids) return [];
    const idList = ids.split(',').filter(Boolean).slice(0, 20);
    return this.catalog.getBatchOffers(idList);
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
  ) {
    return this.catalog.addReview(offerId, body.reviewer_id, body.rating, body.review_text);
  }

  @Get('offers/:id')
  async findOffer(@Param('id') id: string) {
    return this.catalog.findOfferById(id);
  }

  @Post('offers')
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
    },
  ) {
    return this.catalog.createOffer(body);
  }
}
