import { Controller, Post, Inject, HttpCode } from '@nestjs/common';
import { EscrowReleaseService } from './escrow-release.service.js';

@Controller('escrow')
export class EscrowController {
  constructor(
    @Inject(EscrowReleaseService) private readonly releaseService: EscrowReleaseService,
  ) {}

  @Post('release')
  @HttpCode(200)
  async release() {
    return this.releaseService.releaseDueEscrows();
  }
}
