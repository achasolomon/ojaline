/**
 * Example: Hold Acquisition Handler (Idempotent)
 *
 * ADR-002: Two-Layer Idempotency
 * - Layer 1 (DB): UNIQUE constraint on `idempotency_key` in `stock_holds` table
 * - Layer 2 (Redis): seen-set with TTL matching checkout window
 *
 * The handler uses `tryProcess()` from `lib/idempotency.ts` to guarantee
 * that a duplicate hold attempt is a no-op (returns `false`).
 */

import { processHoldAcquisition } from '../lib/idempotency';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { ReservationGate } from '../modules/reservation/reservation.gate';

interface HoldAcquisitionPayload {
  offerId: string;
  qty: number;
  idempotencyKey: string;
}

export async function acquireHoldIdempotent(
  reservationGate: ReservationGate,
  redis: Redis,
  pool: Pool,
  payload: HoldAcquisitionPayload,
): Promise<boolean> {
  return processHoldAcquisition(redis, pool, payload.idempotencyKey, () =>
    reservationGate
      .acquireSoftHold(payload.offerId, payload.idempotencyKey, payload.qty, 480)
      .then(() => undefined),
  );
}

/**
 * Example usage in an Express route:
 *
 * app.post('/holds', async (req, res) => {
 *   const { offerId, qty, idempotencyKey } = req.body;
 *   const result = await acquireHoldIdempotent(
 *     reservationGate, redis, { offerId, qty, idempotencyKey }
 *   );
 *   res.json({ acquired: result });
 * });
 */