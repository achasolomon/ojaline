import { Controller, Get, Query, Inject } from '@nestjs/common';
import { GeoService } from './geo.service.js';

@Controller('geo')
export class GeoController {
  constructor(@Inject(GeoService) private readonly geo: GeoService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.geo.search(q);
  }

  @Get('reverse')
  reverse(@Query('lat') lat: string, @Query('lon') lon: string) {
    return this.geo.reverse(parseFloat(lat), parseFloat(lon));
  }
}