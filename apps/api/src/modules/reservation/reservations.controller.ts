import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { ReservationGate } from './reservation.gate.js';

const SOFT_HOLD_TTL_SECONDS = 480;

interface SeedBody {
  offer_id: string;
  available: number;
}

interface AcquireBody {
  offer_id: string;
  qty: number;
  idempotency_key?: string;
}

/**
 * Minimal HTTP surface over the ReservationGate so the Sprint 0.2 load leg
 * (k6 @ 300 concurrent) and the fail-closed behaviour can be exercised
 * end-to-end (ADR-001).
 *
 * Fail-closed: any Redis/gate error is mapped to 503 — a hold is *refused*,
 * never blindly allowed.
 */
@Controller('reservations')
export class ReservationsController {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  @Post('offers')
  @HttpCode(200)
  async seedOffer(@Body() body: SeedBody): Promise<{ ok: true }> {
    const offerId = this.expectUuid(body.offer_id, 'offer_id');
    const available = Number(body.available);
    if (!Number.isInteger(available) || available < 0) {
      throw new BadRequestException('available must be a non-negative integer');
    }
    const gate = new ReservationGate(this.redis);
    await gate.seedOffer(offerId, available);
    return { ok: true };
  }

  @Post('soft-holds')
  async acquireSoftHold(@Body() body: AcquireBody): Promise<{ acquired: boolean; reason?: string }> {
    const offerId = this.expectUuid(body.offer_id, 'offer_id');
    const qty = Number(body.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('qty must be a positive integer');
    }
    const idempotencyKey = typeof body.idempotency_key === 'string' && body.idempotency_key.length > 0
      ? body.idempotency_key
      : randomUUID();

    const gate = new ReservationGate(this.redis);
    try {
      const acquired = await gate.acquireSoftHold(offerId, idempotencyKey, qty, SOFT_HOLD_TTL_SECONDS);
      if (!acquired) {
        throw new HttpException({ acquired: false, reason: 'INSUFFICIENT' }, HttpStatus.CONFLICT);
      }
      return { acquired: true };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException({ acquired: false, reason: 'GATE_UNAVAILABLE' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private expectUuid(value: string, field: string): string {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof value !== 'string' || !uuidRe.test(value)) {
      throw new BadRequestException(`${field} must be a UUID`);
    }
    return value;
  }
}
