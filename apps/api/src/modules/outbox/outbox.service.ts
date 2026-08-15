import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { envelope, type EventPayload, type EventType } from '@ojaline/contracts';

@Injectable()
export class OutboxService {
  async enqueue<T extends EventType>(
    tx: PoolClient,
    eventType: T,
    aggregateId: string,
    payload: EventPayload<T>,
  ): Promise<void> {
    const ev = envelope(eventType, aggregateId, payload);
    await tx.query(
      `INSERT INTO audit.outbox_events (event_type, schema_version, aggregate_id, payload, occurred_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [ev.event_type, ev.schema_version, ev.aggregate_id, JSON.stringify(ev.payload), ev.occurred_at],
    );
  }
}
