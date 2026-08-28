import { Module } from '@nestjs/common';
import { EscrowReleaseService } from './escrow-release.service.js';
import { EscrowController } from './escrow.controller.js';

@Module({
  controllers: [EscrowController],
  providers: [EscrowReleaseService],
  exports: [EscrowReleaseService],
})
export class EscrowModule {}
