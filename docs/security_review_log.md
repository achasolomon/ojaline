# SEC-1 — Secrets & Grants Review Log

**Date:** 2026-08-15
**Reviewers:** Platform/Backend (Sprint 0.1)
**Scope:** `.env` handling, PII grants, append-only REVOKEs, CI credential posture (ADR-000 §5).

## Reviewed artifacts

| Artifact | Finding | Verdict |
|---|---|---|
| `.env` (local) | gitignored; contains only dev values | PASS |
| `.env.example` | committed, no secrets (mock/dev-only keys) | PASS |
| `packages/db/migrations/V1__init.sql` | role `ojaline_app` created with dev-only password, inline (ADR-000 §5 note present) | PASS for dev; see finding F-1 |
| PII grants | `pii` schema is USAGE-only; data exposed via `app.users` / `app.user_roles` views only; no direct table grants | PASS |
| Append-only tables | `REVOKE UPDATE, DELETE` on `escrow.ledger_entries`, `audit.audit_log`, `trust.agent_actions`, `trust.fraud_signals` | PASS |
| Outbox | column-level `UPDATE (status, attempts, dispatched_at, last_attempt_at)` only — payload immutable | PASS |
| Verified by test | `apps/api/src/db.invariants.spec.ts` proves direct `pii.users` read is denied, view read succeeds, and all four append-only tables reject UPDATE/DELETE as `ojaline_app` | PASS |
| CI | creds injected via workflow env; `.env` never created in CI | PASS |

## Findings (tracked as backlog)

- **F-1** Role password `ojaline_app_dev_pw` is baked into V1. Production must provision the role via a secrets manager; add an ADR-000 follow-up so the migration never ships real credentials.
- **F-2** Flyway runs as superuser `ojaline` (password in `.env`/CI env). Acceptable in dev/CI only; restrict to a dedicated migration role in any shared environment.
- **F-3** No CI-specific credentials yet — integration tests reuse dev values. Introduce per-environment secrets when a shared/non-local CI runner is used.
- **F-4** PII is view-only at the schema level; column-level masking (e.g., partial phone) is a Phase-1 hardening item, not a Sprint 0.1 blocker.

## Sign-off

No secret committed to the repository. Dev-gate findings cleared; F-1..F-4 tracked for follow-up.
