import { Controller, Get, Query, Inject } from '@nestjs/common';
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
}
