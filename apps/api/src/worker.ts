import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { validateEnvelope, type EventType } from '@ojaline/contracts';
import { ReservationGate } from './modules/reservation/reservation.gate.js';

const POLL_INTERVAL_MS = 2000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const DISPATCHERS: Partial<Record<EventType, (payload: unknown) => Promise<void>>> = {};

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
  });
  const redis = new Redis(config.REDIS_URL);
  const gate = new ReservationGate(redis);

  await pool.query('SELECT 1');
  console.log('[worker] connected, polling audit.outbox_events');

  const sweep = setInterval(async () => {
    try {
      await sweepExpiredSoftHolds(pool, gate);
    } catch (err) {
      console.error('[worker] sweep failed', err);
    }
  }, SWEEP_INTERVAL_MS);

  const stop = setInterval(async () => {
    try {
      const { rows } = await pool.query<{
        id: string;
        event_type: EventType;
        schema_version: number;
        aggregate_id: string;
        payload: unknown;
        occurred_at: Date;
        attempts: number;
      }>(`
        SELECT id, event_type, schema_version, aggregate_id, payload, occurred_at, attempts
        FROM audit.outbox_events
        WHERE status IN ('PENDING','FAILED')
        ORDER BY created_at
        LIMIT 20
      `);

      for (const row of rows) {
        const result = validateEnvelope({
          event_type: row.event_type,
          schema_version: row.schema_version,
          aggregate_id: row.aggregate_id,
          occurred_at: row.occurred_at.toISOString(),
          payload: row.payload,
        });
        if (!result.ok) {
          await deadLetter(pool, row.id, `schema validation failed: ${result.reason}`);
          continue;
        }
        const handler = DISPATCHERS[row.event_type];
        try {
          if (handler) await handler(result.envelope.payload);
          await pool.query(`UPDATE audit.outbox_events SET status='SENT', dispatched_at=now() WHERE id=$1`, [row.id]);
        } catch {
          const next = row.attempts + 1;
          if (next >= MAX_ATTEMPTS) {
            await deadLetter(pool, row.id, `max attempts (${MAX_ATTEMPTS}) reached`);
          } else {
            await pool.query(`UPDATE audit.outbox_events SET status='FAILED', attempts=$1, last_attempt_at=now() WHERE id=$2`, [next, row.id]);
          }
        }
      }
    } catch (err) {
      console.error('[worker] poll failed', err);
    }
  }, POLL_INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(stop);
    clearInterval(sweep);
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function sweepExpiredSoftHolds(pool: Pool, gate: ReservationGate): Promise<void> {
  const { rows } = await pool.query<{ id: string; offer_id: string; qty: number; idempotency_key: string }>(`
    SELECT id, offer_id, qty, idempotency_key
    FROM orders.stock_holds
    WHERE kind = 'SOFT' AND status = 'ACTIVE' AND expires_at < now()
    LIMIT 500
  `);

  for (const row of rows) {
    const claimed = await pool.query(
      `UPDATE orders.stock_holds SET status='EXPIRED' WHERE id=$1 AND status='ACTIVE' RETURNING id`,
      [row.id],
    );
    if (claimed.rowCount !== 1) continue;
    await gate.releaseSoftHold(row.idempotency_key, row.qty);
    await pool.query(
      `UPDATE catalog.offers SET soft_held_qty = soft_held_qty - $1, updated_at = now()
       WHERE id = $2 AND soft_held_qty >= $1`,
      [row.qty, row.offer_id],
    );
    console.log(`[worker] released expired soft hold ${row.id}`);
  }
}

async function deadLetter(pool: Pool, id: string, reason: string): Promise<void> {
  await pool.query(`UPDATE audit.outbox_events SET status='DEAD', last_attempt_at=now() WHERE id=$1`, [id]);
  console.error(`[worker] dead-lettered ${id}: ${reason}`);
}

void main();
