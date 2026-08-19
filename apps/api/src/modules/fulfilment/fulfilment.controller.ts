import { Body, Controller, Get, Post, Param, Inject, HttpCode } from '@nestjs/common';
import {
  FulfilmentStateMachine,
  BuyerDecision,
} from './fulfilment-state-machine.js';

interface DecisionBody {
  order_id: string;
  action: 'CONTINUE' | 'CANCEL' | 'REPLACE_SELLER';
  line_ids: string[];
}

@Controller('orders')
export class FulfilmentController {
  constructor(
    @Inject(FulfilmentStateMachine) private readonly stateMachine: FulfilmentStateMachine,
  ) {}

  @Post(':id/decide')
  @HttpCode(200)
  async buyerDecision(@Param('id') id: string, @Body() body: DecisionBody) {
    const decision: BuyerDecision = {
      order_id: id,
      action: body.action,
      line_ids: body.line_ids,
    };
    return this.stateMachine.handleBuyerDecision(decision);
  }

  @Get(':id/fulfilment')
  async fulfilmentStatus(@Param('id') id: string) {
    return this.stateMachine.getOrderFulfilmentStatus(id);
  }
}
