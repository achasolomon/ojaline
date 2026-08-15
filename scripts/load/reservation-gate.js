// Sprint 0.2 / Phase 0 gate load leg (ADR-001, ADR-000 §6).
//
// Drives the reservation gate at the gate arithmetic: 300 concurrent hold
// attempts against a single offer. Capacity is seeded to 300, so every
// attempt MUST succeed; any 409/503 is a double-sell / availability bug.
// Phase 0 hard gate: 0 double-sell, p99 < 150ms.
//
// Run against the dev API (apps/api `pnpm dev` on :3000):
//   k6 run scripts/load/reservation-gate.js
// or with Docker:
//   docker run --rm -i -v "$PWD/scripts/load:/scripts" grafana/k6 run /scripts/reservation-gate.js

import http from 'k6/http';
import { check } from 'k6';

const API_BASE = __ENV.API_BASE ?? 'http://localhost:3000';
const CAPACITY = __ENV.CAPACITY ? Number(__ENV.CAPACITY) : 300;
const CONCURRENCY = __ENV.CONCURRENCY ? Number(__ENV.CONCURRENCY) : 300;

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
      iterations: 3000,
      maxDuration: '10m',
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(99)<150'],
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
    { headers: { 'content-type': 'application/json' } },
  );

  check(res, {
    'hold acquired (201)': (r) => r.status === 201,
  });
}
