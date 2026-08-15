# ADR-002 — Webhook Idempotency (Two-Layer)

**Status:** Proposed (Principal Architect decision — merge after Lead Engineer review)
**Date:** 15 August 2026

---

## Context

Every money-touching and reservation-touching inbound event arrives through unreliable channels:

- **Paystack webhooks** deliver at least once, out of order, and re-deliver after our own failures or theirs.
- **Carrier/USSD callbacks** (ADR-007) retry and duplicate by design.
- Our own **outbox dispatcher** (ADR-008) is at-least-once by construction.

Double-processing any of these corrupts state: double-crediting a payment, double-converting a hold, double-releasing an escrow. Exactly-once delivery is not achievable over these transports; the correct target is **idempotent processing** — the second and third deliveries must be no-ops.

## Decision

**Two independent layers of idempotency, applied at every inbound write and every outbox dispatch:**

### Layer 1 — Database (authoritative, survives anything)

Every write that must happen at most once carries a **dedup key with a `UNIQUE` constraint**:

| Writes | Dedup key |
|---|---|
| Paystack charge/webhook processing | Paystack `reference` (per charge) |
| Holds | `idempotency_key` (client/`SOLD`-session supplied) |
| Ledger entries | `idempotency_key` (see Data Model §3.4) |
| Outbox dispatch to an external adapter | `outbox_events.dedup_key` (unique) |
| Settlement lines | `(batch_id, ledger_entry_id)` |

The unique violation is **caught and treated as "already done"**, not as an error: handlers catch the constraint violation, load the existing row, and return the stored result. This is the durable guarantee — the DB is the single source of truth for "have we processed this?"

### Layer 2 — Redis (fast path, not authoritative)

A short-TTL **seen-set** (`webhook_seen:{key}`) lets a handler short-circuit a duplicate before it reaches the DB. Redis is a performance optimization; if it is wrong or absent, Layer 1 still prevents double-processing. TTL chosen to comfortably exceed the max re-delivery window (configurable; default 24 h).

### Interaction with the outbox (ADR-008)

The outbox dispatcher is at-least-once; consumer handlers are idempotent under the same two layers, so at-least-once delivery degrades to effectively-once *processing*. The `dedup_key` column on `outbox_events` exists precisely for this.

## Alternatives considered

1. **Exactly-once transports (broker transactional produces, 2PC)** — rejected for the same cost reason as ADR-008: the guarantee is available at the application layer cheaper than at the infrastructure layer.
2. **Redis-only dedupe** — rejected: a flushed/expired Redis means double-processing. Redis is never the source of truth for money.
3. **DB-only dedupe** — correct but slower for the hot webhook path; Layer 2 exists for cost, and its loss is provably harmless.

## Consequences

- Every new write endpoint that can be duplicated MUST ship with a dedup key + unique constraint. This is a review checklist item, not an afterthought.
- `PG UNIQUE` violations on these keys are **normal control flow**; they must never surface as 500s.
- CI must include a test that delivers a duplicate webhook/event twice and asserts a single state change.

## Acceptance

Merge after review. The Sprint 0.2 hold-conversion tests and the Paystack-stub integration exercises must demonstrate the two-layer behaviour.
