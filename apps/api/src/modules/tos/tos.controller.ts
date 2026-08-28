import { Controller, Get, Post, Body, Query, Inject } from '@nestjs/common';
import { ToSEnforcementService } from './tos.service.js';

@Controller('tos')
export class ToSController {
  constructor(@Inject(ToSEnforcementService) private readonly tos: ToSEnforcementService) {}

  @Get('violations')
  async getViolations(@Query('user_id') userId: string) {
    return this.tos.getViolations(userId);
  }

  @Get('status')
  async getStatus(@Query('user_id') userId: string) {
    return this.tos.getSellerStatus(userId);
  }

  @Post('report')
  async reportViolation(
    @Body() body: { target_user_id: string; violation_type: string; description: string; evidence?: Record<string, unknown> },
  ) {
    const result = await this.tos.recordViolation(
      body.target_user_id,
      body.violation_type,
      1,
      body.description,
      body.evidence || {},
    );
    return { ok: true, ...result };
  }
}
