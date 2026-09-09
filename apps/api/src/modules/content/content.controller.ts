import { Controller, Get, Inject } from '@nestjs/common';
import { ContentService } from './content.service.js';

@Controller('content')
export class ContentController {
  constructor(@Inject(ContentService) private readonly content: ContentService) {}

  @Get('banners')
  async banners() {
    return this.content.getBanners();
  }

  @Get('market-day')
  async marketDay() {
    return this.content.getMarketDay();
  }
}