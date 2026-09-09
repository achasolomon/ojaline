import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Inject } from '@nestjs/common';
import { AdsService, type AdFormat, type AdReportReason, type CreateAdInput, type UpdateAdInput } from './ads.service.js';

@Controller('ads')
export class AdsController {
  constructor(@Inject(AdsService) private readonly ads: AdsService) {}

  @Post()
  async create(@Query('seller_id') sellerId: string, @Body() body: CreateAdInput) {
    return this.ads.create(sellerId, body);
  }

  @Get()
  async list(@Query('seller_id') sellerId: string) {
    return this.ads.list(sellerId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Query('seller_id') sellerId: string,
    @Body() body: UpdateAdInput,
  ) {
    return this.ads.update(sellerId, id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('seller_id') sellerId: string) {
    return this.ads.remove(sellerId, id);
  }

  @Get('active')
  async active(
    @Query('format') format?: AdFormat,
    @Query('cluster_id') clusterId?: string,
    @Query('category_id') categoryId?: string,
  ) {
    return this.ads.getActive(format, clusterId, categoryId);
  }

  @Post(':id/report')
  async report(
    @Param('id') id: string,
    @Query('user_id') userId: string | undefined,
    @Body() body: { reason?: AdReportReason },
  ) {
    return this.ads.report(id, userId || null, body.reason ?? 'OTHER');
  }
}