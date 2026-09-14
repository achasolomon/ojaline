import { Controller, Get, Post, Delete, Param, Body, Query, Inject } from '@nestjs/common';
import { AddressesService, type CreateAddressInput } from './addresses.service.js';

@Controller('addresses')
export class AddressesController {
  constructor(@Inject(AddressesService) private readonly addresses: AddressesService) {}

  @Get('areas')
  async getAreas() {
    return this.addresses.getCoveredCities();
  }

  @Get('wards')
  async getWards(@Query('state') state?: string, @Query('lga') lga?: string) {
    return this.addresses.getWards(state ?? '', lga ?? '');
  }

  @Get()
  async getAddresses(@Query('user_id') userId: string) {
    return this.addresses.getAddresses(userId);
  }

  @Post()
  async createAddress(@Query('user_id') userId: string, @Body() body: CreateAddressInput) {
    return this.addresses.createAddress(userId, body);
  }

  @Post(':id/default')
  async setDefault(@Query('user_id') userId: string, @Param('id') id: string) {
    await this.addresses.setDefault(userId, id);
    return { ok: true };
  }

  @Delete(':id')
  async deleteAddress(@Query('user_id') userId: string, @Param('id') id: string) {
    await this.addresses.deleteAddress(userId, id);
    return { ok: true };
  }
}