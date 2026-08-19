import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';
import { validateEnvelope, type EventType } from '@ojaline/contracts';
import { ReservationGate } from './modules/reservation/reservation.gate.js';

const POLL_INTERVAL_MS = 2000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const RELEASE_SWEEP_INTERVAL_MS = 60 * 1000;
const DECISION_TIMEOUT_SWEEP_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const DISPATCHERS: Partial<Record<EventType, (payload: unknown) => Promise<void>>> = {
  'order.paid': async (payload) => {
    const p = payload as { order_id: string; buyer_id: string; landed_total_cents: number };
    console.log(`[worker] order.paid: order=${p.order_id} buyer=${p.buyer_id} total=${p.landed_total_cents}`);
  },
  'order.line_status_changed': async (payload) => {
    const p = payload as { order_id: string; line_id: string; status: string };
    console.log(`[worker] order.line_status_changed: order=${p.order_id} line=${p.line_id} status=${p.status}`);
  },
  'stock.hold_created': async (payload) => {
    const p = payload as { offer_id: string; user_id: string; qty: number; kind: string };
    console.log(`[worker] stock.hold_created: offer=${p.offer_id} user=${p.user_id} qty=${p.qty} kind=${p.kind}`);
  },
  'stock.hold_converted': async (payload) => {
    const p = payload as { hold_id: string; offer_id: string; qty: number; paystack_reference: string };
    console.log(`[worker] stock.hold_converted: hold=${p.hold_id} offer=${p.offer_id} ref=${p.paystack_reference}`);
  },
  'stock.hold_released': async (payload) => {
    const p = payload as { hold_id: string; offer_id: string; qty: number; reason: string };
    console.log(`[worker] stock.hold_released: hold=${p.hold_id} offer=${p.offer_id} reason=${p.reason}`);
  },
  'escrow.released': async (payload) => {
    const p = payload as { escrow_order_id: string; order_id: string; reason: string };
    console.log(`[worker] escrow.released: escrow=${p.escrow_order_id} order=${p.order_id} reason=${p.reason}`);
  },
  'escrow.disputed': async (payload) => {
    const p = payload as { escrow_order_id: string; dispute_id: string; type: string };
    console.log(`[worker] escrow.disputed: escrow=${p.escrow_order_id} dispute=${p.dispute_id} type=${p.type}`);
  },
  'notification.sent': async (payload) => {
    const p = payload as { channel: string; recipient: string; template: string };
    console.log(`[worker] notification.sent: channel=${p.channel} to=${p.recipient} template=${p.template}`);
  },
};

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

  const buyerTimeoutSweep = setInterval(async () => {
    try {
      await sweepBuyerConfirmationTimeout(pool);
    } catch (err) {
      console.error('[worker] buyer-confirmation-timeout sweep failed', err);
    }
  }, RELEASE_SWEEP_INTERVAL_MS);

  const decisionTimeoutSweep = setInterval(async () => {
    try {
      await sweepDecisionTimeouts(pool);
    } catch (err) {
      console.error('[worker] decision timeout sweep failed', err);
    }
  }, DECISION_TIMEOUT_SWEEP_MS);

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
    clearInterval(buyerTimeoutSweep);
    clearInterval(decisionTimeoutSweep);
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

async function sweepBuyerConfirmationTimeout(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    order_id: string;
    amount_held_cents: string;
  }>(`
    SELECT id, order_id, amount_held_cents
    FROM escrow.escrow_orders
    WHERE status = 'HELD' AND release_scheduled_at < now()
    LIMIT 50
  `);

  for (const row of rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query<{ id: string }>(
        `SELECT id FROM escrow.escrow_orders
         WHERE id = $1 AND status = 'HELD'
         FOR UPDATE`,
        [row.id],
      );
      if (locked.rowCount !== 1) {
        await client.query('ROLLBACK');
        continue;
      }

      await client.query(
        `UPDATE escrow.escrow_orders
         SET status = 'RELEASED', released_at = now(), updated_at = now()
         WHERE id = $1`,
        [row.id],
      );

      const negAmount = -Number(row.amount_held_cents);
      await client.query(
        `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, idempotency_key)
         VALUES ($1, 'DELIVERY_RELEASE', $2, 'SELLER', $3)`,
        [row.id, negAmount, `release:${row.id}:${Date.now()}`],
      );

      const holds = await client.query<{ offer_id: string; qty: number }>(
        `SELECT offer_id, qty FROM orders.stock_holds
         WHERE order_id = $1 AND status = 'CONVERTED' AND kind = 'HARD'`,
        [row.order_id],
      );

      for (const h of holds.rows) {
        await client.query(
          `UPDATE catalog.offers
           SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at = now()
           WHERE id = $2`,
          [h.qty, h.offer_id],
        );
        await client.query(
          `UPDATE orders.stock_holds SET status = 'RELEASED' WHERE order_id = $1 AND offer_id = $2 AND status = 'CONVERTED'`,
          [row.order_id, h.offer_id],
        );
      }

      const orderId = row.order_id;
      await client.query(
        `UPDATE orders.orders SET status = 'PARTIALLY_REFUNDED', updated_at = now() WHERE id = $1`,
        [orderId],
      );

      await client.query('COMMIT');
      console.log(`[worker] buyer-confirmation-timeout release for escrow ${row.id} order ${orderId}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[worker] buyer-confirmation-timeout release failed for escrow ${row.id}`, err);
    } finally {
      client.release();
    }
  }
}

async function sweepDecisionTimeouts(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    window_start: string | null;
    window_end: string | null;
  }>(`
    SELECT id, window_start, window_end
    FROM orders.orders
    WHERE status = 'PARTIALLY_DISPATCHED'
      AND decision_deadline_at IS NOT NULL
      AND decision_deadline_at < now()
    LIMIT 50
  `);

  for (const row of rows) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query<{ id: string }>(
        `SELECT id FROM orders.orders
         WHERE id = $1 AND status = 'PARTIALLY_DISPATCHED'
         FOR UPDATE`,
        [row.id],
      );
      if (locked.rowCount !== 1) {
        await client.query('ROLLBACK');
        continue;
      }

      await client.query(
        `UPDATE orders.order_lines
         SET status = 'CANCELLED', updated_at = now()
         WHERE order_id = $1 AND status NOT IN ('CANCELLED', 'REFUNDED')`,
        [row.id],
      );

      await client.query(
        `UPDATE orders.orders
         SET status = 'CANCELLED', decision_deadline_at = NULL, updated_at = now()
         WHERE id = $1`,
        [row.id],
      );

      await client.query(
        `UPDATE orders.stock_holds
         SET status = 'RELEASED'
         WHERE order_id = $1 AND status IN ('CONVERTED', 'ACTIVE')`,
        [row.id],
      );

      const holds = await client.query<{ offer_id: string; qty: number }>(
        `SELECT offer_id, qty FROM orders.stock_holds
         WHERE order_id = $1 AND status = 'RELEASED'`,
        [row.id],
      );
      for (const h of holds.rows) {
        await client.query(
          `UPDATE catalog.offers
           SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at = now()
           WHERE id = $2`,
          [h.qty, h.offer_id],
        );
      }

      const escrowRow = await client.query<{ id: string; amount_held_cents: string }>(
        `SELECT id, amount_held_cents FROM escrow.escrow_orders
         WHERE order_id = $1 AND status IN ('HELD', 'RELEASING')`,
        [row.id],
      );
      if (escrowRow.rowCount !== 0) {
        const esc = escrowRow.rows[0];
        await client.query(
          `UPDATE escrow.escrow_orders
           SET status = 'RELEASED', released_at = now(), updated_at = now()
           WHERE id = $1`,
          [esc.id],
        );
        await client.query(
          `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, idempotency_key)
           VALUES ($1, 'DELIVERY_RELEASE', $2, 'BUYER', $3)`,
          [esc.id, -Number(esc.amount_held_cents), `decision-timeout:${row.id}:${Date.now()}`],
        );
      }

      if (row.window_start && row.window_end) {
        const totalQty = holds.rows.reduce((sum, h) => sum + h.qty, 0);
        if (totalQty > 0) {
          await client.query(
            `UPDATE fulfilment.capacity_slots
             SET booked = GREATEST(booked - $1, 0)
             WHERE window_start = $2 AND window_end = $3`,
            [totalQty, row.window_start, row.window_end],
          );
        }
      }

      await client.query('COMMIT');
      console.log(`[worker] auto-cancelled order ${row.id} (decision timeout)`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[worker] decision timeout sweep failed for order ${row.id}`, err);
    } finally {
      client.release();
    }
  }
}

async function deadLetter(pool: Pool, id: string, reason: string): Promise<void> {
  await pool.query(`UPDATE audit.outbox_events SET status='DEAD', last_attempt_at=now() WHERE id=$1`, [id]);
  console.error(`[worker] dead-lettered ${id}: ${reason}`);
}

void main();
