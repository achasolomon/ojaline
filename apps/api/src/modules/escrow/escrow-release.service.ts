import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { OutboxService } from '../outbox/outbox.service.js';
import { NotifyService } from '../notifications/notify.service.js';

@Injectable()
export class EscrowReleaseService {
  private readonly logger = new Logger(EscrowReleaseService.name);

  constructor(
    @Inject(Pool) private readonly pool: Pool,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(NotifyService) private readonly notify: NotifyService,
  ) {}

  async releaseDueEscrows(): Promise<{ released: number; errors: string[] }> {
    const client = await this.pool.connect();
    const errors: string[] = [];
    let released = 0;

    try {
      const { rows } = await client.query<{ id: string; order_id: string; amount_held_cents: string }>(
        `SELECT id, order_id, amount_held_cents
         FROM escrow.escrow_orders
         WHERE status = 'HELD'
           AND release_scheduled_at IS NOT NULL
           AND release_scheduled_at <= now()
         ORDER BY release_scheduled_at ASC
         LIMIT 20`,
      );

      for (const escrow of rows) {
        try {
          await client.query('BEGIN');

          const orderResult = await client.query<{ buyer_id: string; seller_id: string }>(
            `SELECT o.buyer_id, ol.seller_id
             FROM orders.orders o
             JOIN orders.order_lines ol ON ol.order_id = o.id
             WHERE o.id = $1
             LIMIT 1`,
            [escrow.order_id],
          );

          if (orderResult.rowCount === 0) {
            await client.query('ROLLBACK');
            errors.push(`order not found for escrow ${escrow.id}`);
            continue;
          }

          const sellerId = orderResult.rows[0].seller_id;

          await client.query(
            `UPDATE escrow.escrow_orders
             SET status = 'RELEASED', released_at = now(), updated_at = now()
             WHERE id = $1`,
            [escrow.id],
          );

          // The seller's payout is the escrow's net running balance (gross held
          // minus platform commission and any refunds already released). Paying
          // the gross would break the closed-escrow-balance = 0 invariant once
          // commission exists.
          const balanceResult = await client.query<{ running_balance_cents: string }>(
            `SELECT running_balance_cents
             FROM escrow.ledger_entries
             WHERE escrow_order_id = $1
             ORDER BY sequence_no DESC
             LIMIT 1`,
            [escrow.id],
          );
          const payableCents = Number(balanceResult.rows[0]?.running_balance_cents ?? escrow.amount_held_cents);

          if (payableCents > 0) {
            await client.query(
              `INSERT INTO escrow.ledger_entries (escrow_order_id, entry_type, amount_cents, counterparty_type, counterparty_id, idempotency_key)
               VALUES ($1, 'SELLER_PAYOUT', $2, 'SELLER', $3, $4)`,
              [escrow.id, -payableCents, sellerId, `payout:${escrow.order_id}:${Date.now()}`],
            );
          }

          await client.query(
            `UPDATE catalog.seller_profiles
             SET completed_orders = COALESCE(completed_orders, 0) + 1,
                 total_orders = COALESCE(total_orders, 0) + 1
             WHERE user_id = $1`,
            [sellerId],
          );

          await this.outbox.enqueue(client, 'escrow.released', escrow.order_id, {
            escrow_order_id: escrow.id,
            order_id: escrow.order_id,
            reason: 'SILENT_24H',
          });

          await client.query('COMMIT');
          released++;

          try {
            const { rows: paid } = await this.pool.query<{ seller_id: string }>(
              `SELECT DISTINCT counterparty_id AS seller_id
               FROM escrow.ledger_entries
               WHERE escrow_order_id = $1 AND entry_type = 'SELLER_PAYOUT'
                 AND counterparty_type = 'SELLER'`,
              [escrow.id],
            );
            for (const row of paid) {
              await this.notify.notify(row.seller_id, {
                type: 'order',
                title: 'Payout released',
                body: 'Escrow funds were released — your payout balance has been topped up.',
                deep_link: '/payouts',
              });
            }
          } catch (err) {
            this.logger.warn({ escrowId: escrow.id, err }, 'payout release notifications skipped');
          }
        } catch (err) {
          await client.query('ROLLBACK');
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`escrow ${escrow.id}: ${msg}`);
          this.logger.error({ escrowId: escrow.id, err }, 'escrow release failed');
        }
      }
    } finally {
      client.release();
    }

    this.logger.log({ released, errorCount: errors.length }, 'escrow release batch complete');
    return { released, errors };
  }
}
