# ADR-001 — Redis Lua Reservation Gate

**Status:** Proposed (Principal Architect decision — merge after Lead Engineer review)
**Date:** 15 August 2026
**Supersedes:** Architecture v2.0 §3.1 mechanism details ("Redis holds runtime counters") without changing the requirement.

---

## Context

Two-phase stock holds (SOFT → HARD) are the anti-double-sell control. `offers.available_qty` is authoritative and guarded by a DB `CHECK (reserved_qty + soft_held_qty <= available_qty)`. But the fast path is read-check-then-write: with N concurrent buyers holding the same offer, each reads "space available", each writes — and only the DB CHECK can reject, burning a serialization point per attempt and turning a routine hold into a constraint-violation lottery.

Architecture §3.1 already commits to Redis for runtime counters. That commitment is made atomic here.

## Decision

**Soft holds are gated by a single Redis Lua script executed via `EVAL`** (Redis 7 guarantees script atomicity), with the DB CHECK and unique constraints as the authoritative backstop — **never** the other way around.

Mechanism:

1. Per offer, Redis holds a hash `stock_gate:{offer_id}` with `soft_held`, `reserved`, `available` fields.
2. The Lua script atomically: reads current counters, computes `reserved + soft_held + qty <= available`, increments `soft_held` and **returns the post-hold tally to the caller** only on success; returns an explicit underflow marker otherwise. No competing client can interleave between read and write.
3. The same script decrements on RELEASE/EXPIRY/CONVERSION (SOFT→HARD moves a unit from `soft_held` to `reserved` in one step).
4. `soft_held` entries carry a TTL matching the checkout window (8 min); the expiry sweep (worker) reconciles Redis counters against `orders.stock_holds` and emits `stock.hold_released` for expired holds.
5. The DB CHECK `reserved_qty + soft_held_qty <= available_qty` stays in force and is exercised by the invariant suite. A Redis gate that passes but a DB CHECK that rejects = a bug (drift alert), not a double-sell.

**Fail-closed rule:** if the Redis gate is unreachable or errors, the hold is **refused** (HTTP 503 / explicit `GATE_UNAVAILABLE`), never allowed. The pilot must tolerate a brief 503 during a Redis outage; it must not tolerate a double-sell.

Idempotency: each hold carries a unique `idempotency_key`; the gate returns the same outcome for a repeated key (ADR-002 two-layer idempotency).

## Alternatives considered

1. **`SELECT … FOR UPDATE` on the offer row** — correct, and the natural single-node choice, but it holds a row lock for the whole hold transaction and serializes *all* writers on the offer, including price edits. Kept as the DB backstop pattern for HARD holds, not the soft-hold fast path.
2. **Postgres advisory locks** — same serialization cost as above with less ergonomic release semantics across pooled connections.
3. **Application-level mutex (in-process)** — cannot span the multi-instance worker/API deployment the modular monolith allows.

## Consequences

- Redis becomes a hard dependency of the reservation path: its availability posture is defined (fail-closed), and it is covered by the Sprint 0.2 Redis-down test.
- `packages/contracts` + `apps/api` must expose the Lua scripts as versioned artifacts (`src/modules/reservation/scripts/*.lua`) with unit tests for both the success and underflow branches.
- The DB remains the source of truth: Redis is a cache of reservation state, rebuilt from `orders.stock_holds` on node restart.

## Acceptance

Merge after review. Sprint 0.2 "reservation gate proof" references this ADR; the fail-closed and 0-double-sell criteria are measured against it.
