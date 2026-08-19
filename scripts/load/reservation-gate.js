// Sprint 0.2 / Phase 0 gate load leg (ADR-001, ADR-000 §6).
//
// Drives the reservation gate at 300 concurrent against a single offer.
// Phase 0 hard gate: 0 double-sell, p50 < 150ms, 0 gate errors (503).
//
// Two modes:
//   Burst (default): CAPACITY=300, ITERATIONS=300, 300 VUs — exactly 300/300
//     holds acquired, 0% failures, p50 < 150ms.
//   Soak: CAPACITY=1000000, ITERATIONS=1000000, MAX_DURATION=10m — sustained
//     300-VU load for 10 min, all holds succeed (capacity >> iterations),
//     p50 < 150ms, 0 double-sell (total acquired never exceeds capacity).
//
// Run against the dev API (apps/api `pnpm dev` on :3000):
//   k6 run scripts/load/reservation-gate.js
// or via Docker:
//   docker run --rm -i -v "$PWD/scripts/load:/scripts" \
//     -e API_BASE=http://host.docker.internal:3000 \
//     -e CAPACITY=1000000 -e ITERATIONS=1000000 -e MAX_DURATION=10m \
//     grafana/k6 run /scripts/reservation-gate.js

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const API_BASE = __ENV.API_BASE ?? 'http://localhost:3000';
const CAPACITY = __ENV.CAPACITY ? Number(__ENV.CAPACITY) : 300;
const CONCURRENCY = __ENV.CONCURRENCY ? Number(__ENV.CONCURRENCY) : 300;
const MAX_DURATION = __ENV.MAX_DURATION ?? '10m';
const ITERATIONS = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 300;

const successfulHolds = new Counter('successful_holds');
const insufficientHolds = new Counter('insufficient_holds');
const gateErrors = new Counter('gate_errors');

function uuid() {
  let hex = '';
  for (let i = 0; i < 32; i += 1) hex += Math.floor(Math.random() * 16).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const options = {
  scenarios: {
    reservation_gate: {
      executor: 'shared-iterations',
      vus: CONCURRENCY,
      iterations: ITERATIONS,
      maxDuration: MAX_DURATION,
    },
  },
  thresholds: {
    // 0 failures: 503 (GATE_UNAVAILABLE) or network errors are failures; 409 (INSUFFICIENT) is expected.
    http_req_failed: ['rate==0'],
    // Phase 0 gate: p50 soft-hold acquire < 150ms
    http_req_duration: ['p(50)<150'],
    // 0 double-sell: successful holds must never exceed seeded capacity
    successful_holds: ['count<=' + CAPACITY],
    // 0 gate errors
    gate_errors: ['count==0'],
  },
};

export function setup() {
  const offerId = uuid();
  const res = http.post(
    `${API_BASE}/reservations/offers`,
    JSON.stringify({ offer_id: offerId, available: CAPACITY }),
    { headers: { 'content-type': 'application/json' } },
  );
  if (res.status !== 200) {
    throw new Error(`failed to seed offer: ${res.status} ${res.body}`);
  }
  return { offerId };
}

export default function (data) {
  const res = http.post(
    `${API_BASE}/reservations/soft-holds`,
    JSON.stringify({ offer_id: data.offerId, qty: 1, idempotency_key: `${__VU}:${__ITER}` }),
    {
      headers: { 'content-type': 'application/json' },
      // 201 = acquired, 409 = insufficient (both are valid outcomes, not failures)
      // 503 = GATE_UNAVAILABLE (real failure — fail-closed behavior)
      expected: [200, 201, 409],
    },
  );

  check(res, {
    'acquired (201) or insufficient (409) — no double-sell, no gate error': (r) =>
      r.status === 201 || r.status === 409,
  });

  if (res.status === 201) {
    successfulHolds.add(1);
  } else if (res.status === 409) {
    insufficientHolds.add(1);
  } else {
    gateErrors.add(1);
  }
}
