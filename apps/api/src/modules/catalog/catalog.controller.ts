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
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };
    return this.catalog.discoverOffers(query);
  }

  @Get('categories')
  async getCategories() {
    return this.catalog.getCategories();
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
