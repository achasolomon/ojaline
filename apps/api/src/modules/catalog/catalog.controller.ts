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
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const query: DiscoverOffersQuery = {
      channel: channel || undefined,
      cluster_id: clusterId || undefined,
      perishability: perishability || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };
    return this.catalog.discoverOffers(query);
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
    },
  ) {
    return this.catalog.createOffer(body);
  }
}
