import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
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

  /* ── Phase 3: Payouts ── */

  @Get('payouts/balance')
  @AuthRequired()
  async payoutBalance(@CurrentUser() user: AuthUser) {
    return this.sellers.getPayoutBalance(user);
  }

  @Get('payouts/ledger')
  @AuthRequired()
  async payoutLedger(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.sellers.getPayoutLedger(user, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('payouts/request')
  @AuthRequired()
  @HttpCode(HttpStatus.CREATED)
  async requestPayout(
    @CurrentUser() user: AuthUser,
    @Body() body: { amount_cents?: number; bank_account_id?: string },
  ) {
    return this.sellers.requestPayout(user, body);
  }

  @Get('payouts/requests')
  @AuthRequired()
  async listPayoutRequests(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.sellers.listPayoutRequests(user, {
      all: all === 'true' || all === '1',
      status: status || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('payouts/requests/:id/approve')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async approvePayout(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body?: { note?: string },
  ) {
    return this.sellers.approvePayout(user, id, body?.note);
  }

  @Get('payouts/bank-accounts')
  @AuthRequired()
  async listBankAccounts(@CurrentUser() user: AuthUser) {
    return this.sellers.listBankAccounts(user);
  }

  @Post('payouts/bank-accounts')
  @AuthRequired()
  @HttpCode(HttpStatus.CREATED)
  async addBankAccount(
    @CurrentUser() user: AuthUser,
    @Body() body: { bank_code?: string; bank_name?: string; account_number?: string; account_name?: string; is_primary?: boolean },
  ) {
    return this.sellers.addBankAccount(user, body);
  }

  @Patch('payouts/bank-accounts/:id/primary')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async setPrimaryBankAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sellers.setPrimaryBankAccount(user, id);
  }

  @Delete('payouts/bank-accounts/:id')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async deleteBankAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sellers.deleteBankAccount(user, id);
  }
}