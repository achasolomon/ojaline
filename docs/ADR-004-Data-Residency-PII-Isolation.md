# ADR-004 — Data Residency & PII Isolation

**Status:** Proposed (Principal Architect decision — merge after Lead Engineer review)
**Date:** 15 August 2026

---

## Context

Ojaline is Nigerian-market-first. NDPR compliance is a Phase 1 exit requirement, and PII handling is a design constraint, not an ops footnote. Two things must be settled before the data freeze is valid:

1. **Where data may live** — cloud provisioning is deferred under ADR-000, so the residency requirement must be recorded now so that the eventual cloud choice (AWS is the default) honors it rather than being discovered late.
2. **How PII is isolated** — the Data Model places PII in a dedicated `pii` schema; the isolation mechanism (who can read it and how) must be decided at the schema level, not by application convention.

## Decision

### A. PII isolation (mechanism)

1. **All PII lives in the `pii` schema.** No other schema holds NDPR-relevant personal data; cross-schema references use `user_id` UUIDs, not PII values.
2. **No direct grants on `pii` tables.** Application roles hold `USAGE` on the schema and `SELECT` only on **view-layer** objects (`app.users`, `app.user_roles`) that expose the minimal, need-to-know projection.
3. **Module access discipline:** the `pii`-owning module reads/writes tables; every other module goes through its public interface (same rule as ADR-005 module boundaries). A module that needs a PII value must receive the projection it is entitled to — it never reaches into `pii`.
4. **Deletion path:** NDPR delete requests are processed through `pii.delete_requests`; the deletion-cascade map is finalized before Phase 1 exit (Data Model §6, Open Item 2). Deletion is the exception that is *audited* (`audit.audit_log`), never silent.
5. **Enforcement:** grants are enforced by `REVOKE` at migration time and proven by tests (the `db.invariants.spec.ts` suite asserts direct `pii` reads fail and view reads succeed as the app role).

### B. Data residency

1. **Phase 1 stored data must remain in a region that satisfies NDPR** for processing/storage of Nigerian residents' personal data (in-country or an approved processing region per compliance sign-off).
2. Recorded default when the cloud decision is made: **AWS, region selected with compliance sign-off** (shortlist: `af-south-1` Cape Town, or `eu-west-1` per approved processing status). The selection is captured in the cloud ADR (ADR-000 follow-up), not defaulted silently.
3. Replication/backup (PITR, Data Model §6) must not copy PII outside the approved region; cross-region disaster recovery, if added, re-runs this decision.

## Alternatives considered

1. **Application-layer-only PII protection (no schema isolation)** — rejected: protection that depends on every developer remembering to filter is not a control; a `REVOKE` is.
2. **Column-level encryption for everything** — deferred: schema isolation plus region control covers the NDPR risk for Phase 1; field-level encryption is re-evaluated with the cloud ADR.

## Consequences

- The grant model in `V1__init.sql` (§grants) and the view layer are normative; tests protect them from regression.
- The eventual cloud region is a *constrained* choice (NDPR-approved), which may affect latency/cost — accepted and recorded.
- SEC-1's PII findings (F-4 column-level masking) remain backlog hardening; they do not change this ADR.

## Acceptance

Merge after review. This ADR is cited by the V1 migration grant comments and the `db.invariants.spec.ts` PII tests.
