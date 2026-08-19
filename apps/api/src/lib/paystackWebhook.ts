/**
 * Example: Paystack Webhook Handler (Idempotent)
 * 
 * ADR-002: Two-Layer Idempotency
 * - Layer 1 (DB): UNIQUE constraint on `paystack_reference` in `charges` table
 * - Layer 2 (Redis): seen-set with 24h TTL
 * 
 * The handler uses `tryProcess()` from `lib/idempotency.ts` to guarantee
 * that a duplicate webhook delivery is a no-op (returns `false`).
 */

import { processPaystackWebhook } from '../lib/idempotency';
import { Pool } from 'pg';
import Redis from 'ioredis';

interface PaystackWebhookPayload {
  event: 'charge.charged' | 'charge.failed' | 'transfer.charge.failed' | string;
  data: {
    authorization_code: string;
    charged_amount: number; // in kobo
    currency: string;
    status: string;
    paystack_reference: string; // UNIQUE dedup key
    // ... other fields
  };
}

/**
 * Idempotent Paystack webhook processor.
 * The `paystack_reference` must have a UNIQUE constraint in the `charges` table.
 * 
 * @param pool       PostgreSQL pool
 * @param redis      Redis client
 * @param payload    The webhook payload from Paystack
 * @param processFn  The business logic to execute ONCE (charge creation, refund, etc.)
 * @returns `true` if the event was new and processed, `false` if it was a duplicate
 */
export async function processPaystackWebhookIdempotent(
  pool: Pool,
  redis: Redis,
  payload: PaystackWebhookPayload,
  processFn: (payload: PaystackWebhookPayload) => Promise<void>,
): Promise<boolean> {
  return processPaystackWebhook(redis, pool, payload.data.paystack_reference, () => processFn(payload));
}

/**
 * Example business logic: create a charge record if it doesn't exist.
 * The UNIQUE constraint on `charges.paystack_reference` prevents duplicates at the DB level.
 */
export async function createChargeIfNew(pool: Pool, payload: PaystackWebhookPayload): Promise<void> {
  const { paystack_reference, charged_amount, currency, status } = payload.data;

  const { rows } = await pool.query(
    'SELECT id, status FROM charges WHERE paystack_reference = $1',
    [paystack_reference],
  );

  if (rows.length > 0) {
    if (rows[0].status !== status) {
      await pool.query(
        'UPDATE charges SET status = $1, updated_at = now() WHERE paystack_reference = $2',
        [status, paystack_reference],
      );
    }
    return;
  }

  await pool.query(
    `INSERT INTO charges (id, paystack_reference, amount_kobo, currency, status, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
    [paystack_reference, charged_amount, currency, status],
  );
}

/**
 * Example usage in an Express route or webhook endpoint:
 * 
 * app.post('/webhook/paystack', async (req, res) => {
 *   const payload = req.body;
 *   const result = await processPaystackWebhookIdempotent(
 *     pool, redis, payload,
 *     async (p) => createChargeIfNew(pool, p)
 *   );
 *   res.json({ processed: result, event: payload.event });
 * });
 */