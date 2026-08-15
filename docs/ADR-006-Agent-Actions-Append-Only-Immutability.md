# ADR-006 — Agent Actions & Append-Only Immutability

**Status:** Proposed (Principal Architect decision — merge after Lead Engineer review)
**Date:** 15 August 2026

---

## Context

`agent_actions` records what trust-labelled actors (riders, agents) actually did — hold conversions, deliveries, refunds. Alongside `ledger_entries`, `audit_log`, and `fraud_signals`, it is **evidence**: dispute resolution, QA sampling, and fraud investigation all read these tables as a ground truth that must not be rewriteable after the fact.

A "we promise not to UPDATE" convention is not a control: a stray migration, a mis-scoped ORM call, or an emergency patch can silently rewrite evidence. The Data Model §1 already lists these as append-only; this ADR fixes the *mechanism*.

## Decision

**Immutability is enforced in the database via `REVOKE UPDATE, DELETE`, not by convention.**

1. **Covered tables:** `trust.agent_actions`, `escrow.ledger_entries`, `audit.audit_log`, `trust.fraud_signals` — full `REVOKE UPDATE, DELETE` from the app role. Inserts remain.
2. **Outbox exception:** `audit.outbox_events` must change state. It is immutable **except** for the worker's **column-level `UPDATE (status, attempts, dispatched_at, last_attempt_at)`** grant; `event_type`, `schema_version`, `aggregate_id`, `payload`, `occurred_at` are never updatable and DELETE is never granted (Data Model §3.1; ADR-008).
3. **Derived-state recomputation stays on the insert path:** `ledger_entries.running_balance` is set by the `BEFORE INSERT` trigger only — there is no `UPDATE` path to recompute it on, because there is no `UPDATE` path at all (Data Model §3.4).
4. **Correction semantics:** a bad entry is **not** edited — it is superseded by a compensating entry (`MANUAL_ADJUSTMENT` ledger type, `REVOKED`-style agent action) with its own audit trail. This is the mandated correction flow, not a recommendation.
5. **Administration:** `REVOKE`s are scoped to the application role. The migration role (superuser) necessarily retains DDL/`UPDATE` rights for schema evolution; any use of those rights outside migration is an incident, tracked in `audit_log`.

## Alternatives considered

1. **Trigger-based rejection of UPDATE/DELETE (`RAISE EXCEPTION`)** — works, but a `REVOKE` also removes the *permission*, making accidental attempts fail loudly at the privilege layer before the application even runs; triggers add a second enforcement layer that tests would have to carry. `REVOKE` chosen as the primary control; triggers are noted as a Phase-1 hardening option for the migration role's own path.
2. **Copy-on-write tables (keep `active` flag)** — rejected: the evidence value is the original row; supersession handles correction without rewriting history.

## Consequences

- `V1__init.sql` carries the REVOKEs (already present); the invariant suite proves UPDATE/DELETE rejection per table and the outbox column-grant behaviour (BE-4/BE-6, `db.invariants.spec.ts`).
- Any new append-only table MUST ship with its `REVOKE` in the same migration — a review checklist item.
- SEC-1's grant review (PASS on append-only REVOKEs) is tracked against this ADR.

## Acceptance

Merge after review. The immutability tests in `db.invariants.spec.ts` cite this ADR.
