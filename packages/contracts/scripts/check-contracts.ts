import { randomUUID } from 'node:crypto';
import { validateEnvelope, envelope, eventSchemas, type EventType, type EventPayload } from '../src/index.js';

const uuid = () => randomUUID();

let failures = 0;

function expectOk(label: string, result: { ok: boolean }): void {
  if (result.ok) {
    console.log(`ok: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    failures += 1;
  }
}

function expectBad(label: string, result: { ok: boolean }): void {
  if (!result.ok) {
    console.log(`ok (rejected): ${label}`);
  } else {
    console.error(`FAIL (accepted invalid input): ${label}`);
    failures += 1;
  }
}

const good = envelope('order.paid', uuid(), {
  order_id: uuid(),
  buyer_id: uuid(),
  landed_total_cents: 5000,
});
expectOk('valid order.paid envelope', validateEnvelope(good));

expectBad(
  'order.paid with invalid payload is rejected',
  validateEnvelope({ ...good, payload: { order_id: 'not-a-uuid', landed_total_cents: -5 } }),
);
expectBad('order.paid with wrong schema_version is rejected', validateEnvelope({ ...good, schema_version: 999 }));
expectBad('unknown event_type is rejected', validateEnvelope({ ...good, event_type: 'nope.nothing' }));

const samples: Record<EventType, EventPayload<EventType>> = {
  'stock.hold_created': { offer_id: uuid(), user_id: uuid(), qty: 2, kind: 'SOFT' },
  'stock.hold_converted': { hold_id: uuid(), offer_id: uuid(), qty: 1, paystack_reference: 'ref-1' },
  'stock.hold_released': { hold_id: uuid(), offer_id: uuid(), qty: 1, reason: 'EXPIRED' },
  'order.paid': { order_id: uuid(), buyer_id: uuid(), landed_total_cents: 5000 },
  'order.line_status_changed': { order_id: uuid(), line_id: uuid(), status: 'DISPATCHED' },
  'escrow.released': { escrow_order_id: uuid(), order_id: uuid(), reason: 'SILENT_24H' },
  'escrow.disputed': { escrow_order_id: uuid(), dispute_id: uuid(), type: 'QUALITY' },
  'notification.sent': { channel: 'SMS', recipient: '+2348000000001', template: 'order.confirmed' },
};

for (const [eventType, payload] of Object.entries(samples) as [EventType, EventPayload<EventType>][]) {
  if (!(eventType in eventSchemas)) {
    console.error(`FAIL: ${eventType} missing from eventSchemas`);
    failures += 1;
    continue;
  }
  expectOk(`${eventType} sample envelope`, validateEnvelope(envelope(eventType, uuid(), payload)));
}

if (failures > 0) {
  console.error(`${failures} contract check(s) failed`);
  process.exit(1);
}
console.log('all contract checks passed');
