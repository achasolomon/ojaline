import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DisputesService } from './disputes.service.js';
import { DisputesController } from './disputes.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
