import { Controller, Get, Post, Delete, Param, Body, Query, Inject } from '@nestjs/common';
import { AddressesService } from './addresses.service.js';

@Controller('addresses')
export class AddressesController {
  constructor(@Inject(AddressesService) private readonly addresses: AddressesService) {}

  @Get()
  async getAddresses(@Query('user_id') userId: string) {
    return this.addresses.getAddresses(userId);
  }

  @Post()
  async createAddress(
    @Query('user_id') userId: string,
    @Body() body: {
      label?: string;
      address_line1: string;
      address_line2?: string;
      city: string;
      state: string;
      lga?: string;
      landmark?: string;
      phone_number: string;
      is_default?: boolean;
    },
  ) {
    return this.addresses.createAddress(userId, body);
  }

  @Post(':id/default')
  async setDefault(
    @Query('user_id') userId: string,
    @Param('id') id: string,
  ) {
    await this.addresses.setDefault(userId, id);
    return { ok: true };
  }

  @Delete(':id')
  async deleteAddress(
    @Query('user_id') userId: string,
    @Param('id') id: string,
  ) {
    await this.addresses.deleteAddress(userId, id);
    return { ok: true };
  }
}
