/**
 * ADR-002: Webhook Idempotency — Two-Layer Handler
 *
 * Layer 1 (DB): Unique constraints prevent double-processing at the DB level.
 * Layer 2 (Redis): Short-TTL seen-set short-circuits duplicates before DB write.
 *
 * Every inbound event handler should use `tryProcess()` before writing.
 */

import Redis from 'ioredis';
import { Pool } from 'pg';

// ---------- Redis seen-set utilities ----------
const REDIS_SEEN_TTL = 24 * 60 * 60; // 24 hours (max re-delivery window)

export async function isSeen(redis: Redis, key: string): Promise<boolean> {
  const result = await redis.sismember(`webhook_seen:${key}`, '1');
  if (result) return true;
  // Mark as seen with TTL
  await redis.sadd(`webhook_seen:${key}`, '1');
  await redis.expire(`webhook_seen:${key}`, REDIS_SEEN_TTL);
  return false;
}

// ---------- Core processing function ----------

/**
 * Core processing function — must be called by all inbound event handlers.
 * Returns `true` if the event was new and processed, `false` if it was a duplicate.
 *
 * @param redis  Redis client (connected)
 * @param pool   PostgreSQL pool (for Layer 1 DB check)
 * @param eventKey  The dedup key (e.g. paystack_reference, idempotency_key, etc.)
 * @param processFn  Async function that writes to DB if the event is new
 * @returns `true` if the event was new and processed, `false` if it was a duplicate
 */
export async function tryProcess(
  redis: Redis,
  _pool: Pool,  // reserved for future Layer-1 DB pre-check; currently relies on processFn's UNIQUE constraint
  eventKey: string,
  processFn: () => Promise<void>,
): Promise<boolean> {
  // Layer 2: Redis seen-set short-circuit
  const isDuplicate = await isSeen(redis, eventKey);
  if (isDuplicate) {
    return false; // Duplicate — already processed
  }

  // Layer 1 (try-catch): DB unique-violation is normal control flow
  try {
    await processFn(); // Write to DB (will throw if UNIQUE violated)
    // If DB write succeeded, mark as seen in Redis (Layer 2)
    await isSeen(redis, eventKey);
    return true; // New event, successfully processed
  } catch (err) {
    // Layer 1 catch: unique-violation = duplicate → treat as no-op
    if ((err as any).code === '23505') { // PostgreSQL UNIQUE violation
      // Also mark as seen in Redis so future duplicates are fast-caught
      await isSeen(redis, eventKey);
      return false; // Duplicate — already processed
    }
    // Re-throw non-unique violations
    throw err;
  }
}

// ---------- Convenience: per-event wrappers ----------

/**
 * Process a Paystack webhook event idempotently.
 * The `paystack_reference` must be the UNIQUE key in the `charges` table.
 */
export async function processPaystackWebhook(
  redis: Redis,
  pool: Pool,
  paystackReference: string,
  processFn: () => Promise<void>,
): Promise<boolean> {
  return tryProcess(redis, pool, paystackReference, processFn);
}

/**
 * Process a hold acquisition idempotently.
 * The `idempotency_key` must be UNIQUE on `orders.stock_holds`.
 */
export async function processHoldAcquisition(
  redis: Redis,
  pool: Pool,
  idempotencyKey: string,
  processFn: () => Promise<void>,
): Promise<boolean> {
  return tryProcess(redis, pool, idempotencyKey, processFn);
}

// Export types for use in handlers
export type ProcessFn = () => Promise<void>;