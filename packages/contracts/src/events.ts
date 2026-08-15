import { z } from 'zod';

/**
 * Ojaline event contract (ADR-003, ADR-008).
 *
 * Every outbox event MUST carry event_type + schema_version + aggregate_id + occurred_at.
 * Consumers reject/dead-letter unknown major schema versions rather than guessing.
 * Minor (additive) payload fields are safe; removing/repurposing a field is a major bump.
 */

export const EVENT_NAMESPACES = ['stock', 'order', 'escrow', 'notification'] as const;

export const lineStatuses = ['PAID', 'DISPATCHED', 'DELIVERED', 'PENDING', 'REFUNDED', 'FAILED'] as const;

export const holdKinds = ['SOFT', 'HARD'] as const;
export const holdReasons = ['EXPIRED', 'CANCELLED', 'FAILED'] as const;
export const escrowReleaseReasons = ['DELIVERY_VERIFIED', 'SILENT_24H'] as const;
export const notificationChannels = ['SMS', 'PUSH', 'USSD', 'EMAIL'] as const;

/** Payload schemas keyed by full event_type. This is the single source of truth. */
export const eventSchemas = {
  'stock.hold_created': z.object({
    offer_id: z.string().uuid(),
    user_id: z.string().uuid(),
    qty: z.number().int().positive(),
    kind: z.enum(holdKinds),
  }),
  'stock.hold_converted': z.object({
    hold_id: z.string().uuid(),
    offer_id: z.string().uuid(),
    qty: z.number().int().positive(),
    paystack_reference: z.string().min(1),
  }),
  'stock.hold_released': z.object({
    hold_id: z.string().uuid(),
    offer_id: z.string().uuid(),
    qty: z.number().int().positive(),
    reason: z.enum(holdReasons),
  }),
  'order.paid': z.object({
    order_id: z.string().uuid(),
    buyer_id: z.string().uuid(),
    landed_total_cents: z.number().int().nonnegative(),
  }),
  'order.line_status_changed': z.object({
    order_id: z.string().uuid(),
    line_id: z.string().uuid(),
    status: z.enum(lineStatuses),
  }),
  'escrow.released': z.object({
    escrow_order_id: z.string().uuid(),
    order_id: z.string().uuid(),
    reason: z.enum(escrowReleaseReasons),
  }),
  'escrow.disputed': z.object({
    escrow_order_id: z.string().uuid(),
    dispute_id: z.string().uuid(),
    type: z.string().min(1),
  }),
  'notification.sent': z.object({
    channel: z.enum(notificationChannels),
    recipient: z.string().min(1),
    template: z.string().min(1),
  }),
} as const;

export type EventType = keyof typeof eventSchemas;
export type EventPayload<T extends EventType> = z.infer<(typeof eventSchemas)[T]>;

export const SCHEMA_VERSIONS: Record<EventType, number> = {
  'stock.hold_created': 1,
  'stock.hold_converted': 1,
  'stock.hold_released': 1,
  'order.paid': 1,
  'order.line_status_changed': 1,
  'escrow.released': 1,
  'escrow.disputed': 1,
  'notification.sent': 1,
};

export interface OutboxEnvelope {
  event_type: EventType;
  schema_version: number;
  aggregate_id: string;
  occurred_at: string;
  payload: unknown;
}

export function isKnownEventType(value: unknown): value is EventType {
  return typeof value === 'string' && value in eventSchemas;
}

/**
 * Validates a full outbox envelope. Returns a discriminated result so the
 * outbox dispatcher can dead-letter on schema mismatch (ADR-003/008).
 */
export function validateEnvelope(raw: unknown):
  | { ok: true; envelope: OutboxEnvelope }
  | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'not an object' };
  const { event_type, schema_version, aggregate_id, occurred_at, payload } = raw as Record<string, unknown>;
  if (!isKnownEventType(event_type)) return { ok: false, reason: `unknown event_type: ${String(event_type)}` };
  if (typeof schema_version !== 'number' || schema_version !== SCHEMA_VERSIONS[event_type]) {
    return { ok: false, reason: `schema_version mismatch for ${event_type}: expected ${SCHEMA_VERSIONS[event_type]}` };
  }
  const payloadParsed = eventSchemas[event_type].safeParse(payload);
  if (!payloadParsed.success) {
    return { ok: false, reason: `payload invalid: ${payloadParsed.error.message}` };
  }
  return {
    ok: true,
    envelope: {
      event_type,
      schema_version,
      aggregate_id: String(aggregate_id),
      occurred_at: String(occurred_at),
      payload: payloadParsed.data,
    },
  };
}

export function envelope<T extends EventType>(
  eventType: T,
  aggregateId: string,
  payload: EventPayload<T>,
  occurredAt = new Date().toISOString(),
): OutboxEnvelope {
  return {
    event_type: eventType,
    schema_version: SCHEMA_VERSIONS[eventType],
    aggregate_id: aggregateId,
    occurred_at: occurredAt,
    payload,
  };
}
