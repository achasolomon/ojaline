import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, UnauthorizedException } from '@nestjs/common';
import { SellersService } from './sellers.service.js';
import { AuthService, type AuthUser } from '../auth/auth.service.js';

@Controller('sellers')
export class SellersController {
  constructor(
    @Inject(SellersService) private readonly sellers: SellersService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private async requireUser(authorization?: string): Promise<AuthUser> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');
    return this.auth.verifyToken(token);
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const user = await this.requireUser(authorization);
    return this.sellers.status(user);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Headers('authorization') authorization?: string,
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
    const user = await this.requireUser(authorization);
    return this.sellers.register(user, body ?? {});
  }

  @Post('kyc')
  @HttpCode(HttpStatus.OK)
  async submitKyc(
    @Headers('authorization') authorization?: string,
    @Body() body?: {
      id_type?: string;
      id_number?: string;
      date_of_birth?: string;
      address_line1?: string;
      city?: string;
      state?: string;
    },
  ) {
    const user = await this.requireUser(authorization);
    return this.sellers.submitKyc(user, body ?? {});
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Headers('authorization') authorization?: string,
    @Param('id') id?: string,
    @Body() body?: { note?: string },
  ) {
    const user = await this.requireUser(authorization);
    return this.sellers.decide(user, String(id ?? ''), 'APPROVED', body?.note);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Headers('authorization') authorization?: string,
    @Param('id') id?: string,
    @Body() body?: { note?: string },
  ) {
    const user = await this.requireUser(authorization);
    return this.sellers.decide(user, String(id ?? ''), 'REJECTED', body?.note);
  }
}