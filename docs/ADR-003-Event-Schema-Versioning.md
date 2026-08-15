# ADR-003 — Event Schema Versioning

**Status:** Proposed (Principal Architect decision — merge after Lead Engineer review)
**Date:** 15 August 2026

---

## Context

Architecture §4's contract discipline survives the ADR-008 transport change: events flow from producer modules to consumers (internal handlers and external adapters) that may be released independently within the monolith and may outlive a producer change. Without versioning, a producer that adds a field breaks every consumer; a consumer that misreads a removed field corrupts state silently.

## Decision

**Every event type has a JSON Schema and an integer `schema_version`; evolution rules are binding.**

Rules:

1. **Single source of truth:** `packages/contracts` defines each `event_type`'s payload with Zod. JSON Schemas are **generated** from the Zod definitions (`zod-to-json-schema`), not hand-maintained, so schema and types cannot drift.
2. **`schema_version` is a required envelope field** alongside `event_type`, `aggregate_id`, `occurred_at` (ADR-008 §3).
3. **Minor changes (additive only):** adding optional fields or widening enums keeps the major version. Consumers ignore unknown fields.
4. **Major changes (breaking):** removing/repurposing a field, changing types, or tightening constraints bumps the major version. A bumped major is treated as a **new `event_type`** for routing purposes (e.g. `order.paid.v2`), never a silent reinterpretation of an existing name.
5. **Consumers reject or dead-letter, never guess:** a consumer that receives an unknown `schema_version` for a known `event_type` marks the envelope `DEAD` with the mismatch reason (ADR-008 §3) and surfaces to Ops. It does not process with assumed semantics.

Enforcement points:

- **Producer:** `validateEnvelope` (contracts) runs before dispatch; a payload that fails its own schema cannot be emitted.
- **Consumer:** the same validator runs at consumption; mismatch → dead-letter.
- **CI:** the schema-drift step regenerates schemas from contracts and fails on `git diff`, so a contract change without a committed schema is a build error.

## Alternatives considered

1. **Unversioned events** — rejected: independent release cadence within the monolith makes breaking changes inevitable; silent breaks are the worst failure mode.
2. **Schema registry (Confluent-style) at Phase 1** — rejected with the broker (ADR-008); the generated-into-repo schemas plus CI drift check give the same guarantee without new infrastructure. Registry is a promotion-candidate when Kafka is.

## Consequences

- Contract changes are deliberate: any edit to `eventSchemas` in `packages/contracts` must be accompanied by a generated schema and, if breaking, a new `event_type`.
- The dead-letter path is *part of normal operation*, not an edge case — Ops dashboards must surface DEAD counts (Sprint 0.2 observability).

## Acceptance

Merge after review. The CI schema-drift check and the outbox DEAD-on-mismatch test (BE-5) cite this ADR.
