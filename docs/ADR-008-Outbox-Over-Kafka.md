# ADR-008 — Event Transport: Postgres Outbox (Phase 1), not Kafka

**Status:** Proposed (Principal Architect decision)
**Date:** 13 August 2026
**Supersedes:** Architecture v2.0 §4 transport assumption ("Kafka for side effects"). The §4 *contract* discipline (JSON Schema, `schema_version`, dead-letter, coarse topics) is **retained unchanged** — only the transport changes.

---

## Context

Architecture v2.0 §4 specifies four topics (`stock.events`, `order.events`, `escrow.events`, `notification.events`) on Kafka with JSON-Schema versioning. The Sprint Plan provisions a Kafka cluster in Sprint 0.1.

v2.0 §6 simultaneously rejects Kubernetes, service mesh, and event sourcing *"until a bottleneck is observed."* Kafka is the same category of decision: a broker cluster is an operational system to provision, secure, back up, monitor, and on-call — for four coarse topics at pilot volume.

## Decision

**Phase 1 event transport is a transactional outbox table in Postgres** consumed by the monolith's worker process, **not a Kafka cluster.**

Mechanism:

1. Any module performing a state-changing write within a transaction also inserts a row into `outbox_events` (same TX, so emit-and-write are atomic — no missing events on crash).
2. The worker polls `outbox_events` (`status = PENDING`), dispatches each event to:
   - internal module handlers (in-process), and
   - external adapters (SMS/USSD via the ADR-007 service, push, email), and
   - any future consumer via the same contract.
3. `status = SENT` on handler success; `FAILED` with backoff on retryable failure; `DEAD` after max attempts (dead-letter, surfaced to Ops dashboards).
4. Consumers still enforce the §4 contract: reject/dead-letter unknown major `schema_version`; minor (additive) fields are safe.

This is the **transactional outbox pattern** — the same guarantee Kafka consumers would get (an event for every committed state change), without the broker.

## Why not Kafka now

- **Ops cost:** a broker is a new class of infrastructure to run/secure/monitor for a team whose platform surface should stay minimal at pilot scale. It also breaks the local-Docker dev reality (a broker in Compose is easy; operating it correctly is not).
- **No current fan-out requirement:** the consumers named in v2.0 §4 (fulfilment, notification, cart notifier, agent alerts, fraud) are all in-process or thin adapters at Phase 1 volume.
- **Consistency:** matches the document's own cost discipline (§6) and the local-Docker confirmation.

## Promotion criteria (when to revisit)

Move to a managed broker (Confluent/MSK — never self-hosted) when **any** of these is observed on the NFR dashboards, measured, not anticipated:

1. Outbox consumer lag consistently above SLA (e.g. stock-propagation lag > 30s target) despite worker scaling.
2. Multiple independent consumers need their own consumption rates/offsets and backpressure semantics.
3. A second deployable (beyond the monolith + ADR-007 adapter) needs the event stream.

## Consequences

- `outbox_events` table is added to the data model (Data Model v1.0) — not `stock.events`/`order.events`/`escrow.events`/`notification.events` Kafka topics.
- Sprint 0.1 removes "Kafka cluster + 4 topics" from infra scope; adds outbox DDL + worker skeleton + JSON-Schema CI check.
- The four coarse topic names are retained as `event_type` namespaces in the contract; nothing downstream changes.
- When promotion happens, the outbox dispatcher is replaced by a Kafka producer behind the same interface — the migration is confined to one module.

## Acceptance

Merged; Sprint Plan infra section updated to remove Kafka provisioning and add outbox + worker tasks.
