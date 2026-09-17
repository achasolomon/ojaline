import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { DisputesService } from './disputes.service.js';
import { AuthRequired, CurrentUser, Roles, type AuthUser } from '../auth/auth-guards.js';

@Controller('disputes')
export class DisputesController {
  constructor(@Inject(DisputesService) private readonly disputes: DisputesService) {}

  /* ── Returns (buyer + seller) ── */

  @Post('returns')
  @AuthRequired()
  @HttpCode(HttpStatus.CREATED)
  async createReturn(
    @CurrentUser() user: AuthUser,
    @Body() body: { order_id?: string; order_line_id?: string; reason?: string; reason_note?: string; qty?: number },
  ) {
    return this.disputes.createReturn(user, body);
  }

  @Get('returns')
  @AuthRequired()
  async listReturns(
    @CurrentUser() user: AuthUser,
    @Query('all') all?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.disputes.listReturns(user, {
      all: all === 'true' || all === '1',
      status: status || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('returns/:id')
  @AuthRequired()
  async getReturn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disputes.getReturn(user, id);
  }

  @Post('returns/:id/accept')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async sellerAccept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body?: { note?: string },
  ) {
    return this.disputes.sellerRespond(user, { return_id: id, action: 'ACCEPT', note: body?.note });
  }

  @Post('returns/:id/reject')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async sellerReject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body?: { note?: string },
  ) {
    return this.disputes.sellerRespond(user, { return_id: id, action: 'REJECT', note: body?.note });
  }

  @Post('returns/:id/escalate')
  @AuthRequired()
  @HttpCode(HttpStatus.OK)
  async escalateReturn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.disputes.escalateReturn(user, id);
  }

  @Post('returns/:id/mediate')
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  @HttpCode(HttpStatus.OK)
  async mediateReturn(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { decision?: string; note?: string },
  ) {
    return this.disputes.mediateReturn(user, { return_id: id, decision: body.decision, note: body.note });
  }

  /* ── Disputes (OPS only) ── */

  @Get()
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  async listDisputes(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.disputes.listDisputes(user, {
      status: status || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /* ── OPS Console: KYC Queue ── */

  @Get('ops/kyc')
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  async listKycQueue(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.disputes.listKycQueue(user, {
      status: status || undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('ops/kyc/:userId/approve')
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  @HttpCode(HttpStatus.OK)
  async approveKyc(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
  ) {
    return this.disputes.approveKyc(user, userId, 'APPROVED');
  }

  @Post('ops/kyc/:userId/reject')
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  @HttpCode(HttpStatus.OK)
  async rejectKyc(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() body: { note?: string },
  ) {
    return this.disputes.approveKyc(user, userId, 'REJECTED', body.note);
  }

  /* ── OPS Console: Seller Risk ── */

  @Get('ops/risk')
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  async listSellerRisk(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.disputes.listSellerRisk(user, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('ops/risk')
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  @HttpCode(HttpStatus.OK)
  async setSellerRisk(
    @CurrentUser() user: AuthUser,
    @Body() body: { seller_id?: string; tier?: string; ops_override?: boolean },
  ) {
    return this.disputes.setSellerRisk(user, body);
  }

  @Post('ops/risk/recompute')
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  @HttpCode(HttpStatus.OK)
  async recomputeRiskTiers(@CurrentUser() user: AuthUser) {
    return this.disputes.recomputeRiskTiers(user);
  }

  /* ── Analytics ── */

  @Get('analytics/seller')
  @AuthRequired()
  async getSellerStats(@CurrentUser() user: AuthUser) {
    return this.disputes.getSellerStats(user);
  }

  @Get('analytics/seller/trend')
  @AuthRequired()
  async getSellerTrend(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.disputes.getSellerTrend(user, days ? Number(days) : 14);
  }

  @Get('analytics/platform')
  @AuthRequired()
  @Roles('OPS', 'AGENT')
  async getPlatformStats(@CurrentUser() user: AuthUser) {
    return this.disputes.getPlatformStats(user);
  }
}
