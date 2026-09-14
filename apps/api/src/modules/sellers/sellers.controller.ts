import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { SellersService } from './sellers.service.js';
import { AuthRequired, CurrentUser, type AuthUser } from '../auth/auth-guards.js';

@Controller('sellers')
export class SellersController {
  constructor(@Inject(SellersService) private readonly sellers: SellersService) {}

  @Get('me')
  @AuthRequired()
  async me(@CurrentUser() user: AuthUser) {
    return this.sellers.status(user);
  }

  @Post('register')
  @AuthRequired()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @CurrentUser() user: AuthUser,
    @Body() body?: {
      seller_type?: string;
      business_name?: string;
      market_name?: string;
      city?: string;
      state?: string;
      lga?: string;
      bio?: string;
    },
  ) {
    return this.sellers.register(user, body ?? {});
  }

  @Post('kyc')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async submitKyc(
    @CurrentUser() user: AuthUser,
    @Body() body?: {
      id_type?: string;
      id_number?: string;
      date_of_birth?: string;
      address_line1?: string;
      city?: string;
      state?: string;
    },
  ) {
    return this.sellers.submitKyc(user, body ?? {});
  }

  @Post(':id/approve')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async approve(@CurrentUser() user: AuthUser, @Param('id') id?: string, @Body() body?: { note?: string }) {
    return this.sellers.decide(user, String(id ?? ''), 'APPROVED', body?.note);
  }

  @Post(':id/reject')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async reject(@CurrentUser() user: AuthUser, @Param('id') id?: string, @Body() body?: { note?: string }) {
    return this.sellers.decide(user, String(id ?? ''), 'REJECTED', body?.note);
  }
}