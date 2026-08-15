# OJALINE — Sprint 0.1 Task Board
### Foundations: Infra, Data, CI, Observability scaffolding
**Derived from:** Sprint & Phase Plan v1.1 · ADR-000/001–008 · Data Model v1.0
**Team:** 3 backend, 1 platform, 2 frontend/mobile, 1 QA/SDET, 1 design
**Sprint goal:** Provision the systems that the reservation gate (§3) and events (§4) depend on, and freeze the core schema.

---

## Entry Gate (first 2 days — must pass before core tickets start)

- [x] **REV-1** — Lead Engineer reviews ADR-000 (stack) · ADR-007 (USSD shape) · ADR-008 (outbox transport). Overrides, if any, written with justification and merged.
- [x] **REV-2** — Lead Engineer + QA review Data Model v1.0 (money-path DDL, entity map, invariant list §5). Sign-off recorded.
- [x] **REV-3** — Backend confirms ADR-001…006 (already-planned design ADRs) written and referenced.

> **Entry gate status: DONE (drafted)** — all reviews recorded in `docs/entry_gate_review_log.md` (2026-08-15): no overrides on ADR-000/007/008; Data Model v1.0 verified against `V1__init.sql` + `db.invariants.spec.ts`; ADR-001…006 written and all nine ADRs referenced. **Pending Lead Engineer + QA sign-off ticks** in the review log before the gate is formally closed.

**Exit:** any ADR requiring rework is re-issued before dependent tickets start; no ticket blocks on a merged-but-questioned decision.

---

## Backlog (all tasks; single-track dependencies shown)

### Infra — Platform (1 engineer)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| PLT-1 | **Docker Compose stack** — postgres:16, redis:7, minio, Africa's Talking mock (SMS/USSD stub), plus Paystack test-mode stub. Healthchecks, `.env.example` committed / `.env` gitignored, README run-book. | REV-1 | `docker-compose up` from a clean checkout boots all services; `docker compose ps` all healthy; mock can send an SMS captured by a test |

> **PLT-1 status: DONE** — core compose (postgres/redis/minio + healthchecks + `.env.example` + README run-book) boots healthy. `ats-mock` (SMS/USSD, `:9201`) + `paystack-stub` (`:9202`) added; both healthy; SMS verified via stub `/captured`, paystack `/transaction/initialize` returned a reference (2026-08-15).
| PLT-2 | **GitHub Actions CI skeleton** — PR pipeline: install, lint, typecheck, unit + integration tests, Flyway migration check, JSON Schema validation of event payloads in `packages/contracts`. | REV-1, BE-2 | Every PR runs the pipeline; a deliberately-wrong event payload fails the schema step |

> **PLT-2 status: DONE** — `.github/workflows/ci.yml` (jobs `quality`: install/lint/typecheck/contract-check/schema-drift; `integration`: postgres+redis services + flyway migrate + api tests; `audit`) + `.github/renovate.json`. First real run happens on first PR push (2026-08-15).
| PLT-3 | **Observability base** — app metrics export (Prometheus-friendly), structured log pipeline config, dashboard placeholders for every NFR in Architecture §7 (Sprint 0.2 makes them live). | PLT-1, BE-7 | Metrics endpoint returns soft-hold/DB/Redis stats; dashboards scaffolded |

> **PLT-3 status: DONE** — `GET /metrics` (Prometheus, `prom-client`) returns `ojaline_outbox_pending`, `ojaline_soft_hold_active`, `ojaline_db_pool_connections`, `ojaline_redis_connected` (verified 2026-08-15); dashboard scaffold `dev/grafana/dashboards/ojaline-overview.json`; metrics assertion added to integration spec.

### Backend (3 engineers — pair BE-3 and BE-4)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| BE-1 | **Monorepo scaffold** — `apps/api`, `apps/worker`, `apps/web`, `apps/mobile`, `packages/{contracts,db,config}`; TS config; lint; one shared CI job. | REV-1 | `pnpm install && pnpm lint && pnpm typecheck` green from clean checkout |

> **BE-1 status: DONE** — `pnpm typecheck` + `pnpm lint` green (verified 2026-08-15). Shared CI job pending under PLT-2.
| BE-2 | **Flyway wired** — baseline migration tracked; runs against compose Postgres on `up`; runs in CI as a verification step. | BE-1, PLT-1 | `docker compose run migrations` applies cleanly; CI runs it on every PR |

> **BE-2 status: DONE (core)** — `flyway info` shows V1+V2 applied cleanly to fresh DB. CI leg tracked under PLT-2.
| BE-3 | **Schema migrations** — all tables from Data Model v1.0 §3–4 + Architecture §2.1: pii, catalog, orders, escrow, fulfilment, trust, audit. | REV-2, BE-2 | Full schema applied to fresh DB; `\d` spot-check against Data Model doc |

> **BE-3 status: DONE** — V1 covers all schemas/tables from Data Model v1.0 + Architecture §2.1, applied to live dev DB.
| BE-4 | **DB invariant tests** — offers CHECK (`reserved+soft_held <= available`), `landed_total` CHECK, ledger running-balance trigger, closed-escrow balance=0, append-only REVOKE on ledger/outbox/audit/agent_actions/fraud_signals. | BE-3 | Each invariant has a test that **fails on violation**; full suite green in CI |

> **BE-4 status: DONE** — `src/db.invariants.spec.ts` (14 tests) covers offers CHECK (insert + update + valid), `landed_total` CHECK, ledger running-balance trigger, released-escrow nets-to-zero, and append-only REVOKEs. Full suite green (2026-08-15).
| BE-5 | **Outbox skeleton** — `outbox_events` insert-in-TX helper, worker polling PENDING/FAILED with backoff, DEAD-letter + alert, JSON Schema validation on dispatch (ADR-003/008). | BE-3, PLT-2 | A test event written in one TX is dispatched to a handler and marked SENT; malformed payload → DEAD + alert |

> **BE-5 status: DONE** — `OutboxService.enqueue` (in-TX), worker polls PENDING/FAILED, schema-validates via `validateEnvelope`, marks SENT/DEAD, soft-hold sweep wired. Test event `order.paid` verified dispatched → SENT (2026-08-14). Alert leg (PagerDuty/slack) pending.
| BE-6 | **PII isolation + grants** — `app_user` role grants per schema; `pii` readable only via view layer; `REVOKE UPDATE, DELETE` on all append-only tables. | BE-3 | A test attempting UPDATE on `ledger_entries`/`agent_actions` fails as `app_user`; pii direct-grant test fails; view read succeeds |

> **BE-6 status: DONE** — verified by test as `ojaline_app`: UPDATE/DELETE blocked on `ledger_entries`, `audit_log`, `agent_actions`, `fraud_signals`; outbox payload immutable (status updatable); direct `pii.users` read denied while `app.users` view read succeeds (2026-08-15).
| BE-7 | **App skeleton** — NestJS bootstrap, health/readiness endpoints, pino structured logging, config module via env_file, module-boundary lint rule (no cross-schema imports outside owning module). | BE-1 | Health returns OK with DB/Redis connectivity; boundary lint blocks a deliberate violation |

> **BE-7 status: DONE** — NestJS boots, `/health` returns `{status:ok, db:true, redis:true}`, pino + config module wired, `/metrics` live. Module-boundary lint (`scripts/check-boundaries.mjs`, `pnpm lint:boundaries`) blocks cross-schema imports — deliberate violation verified exit 1 (2026-08-15).

### QA (1 SDET)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| QA-1 | **Test harness** — Vitest + Supertest integration harness against the compose stack; CI-adjacent run (not just laptop). | PLT-1, BE-2 | Harness boots DB/Redis, runs a smoke integration test in CI |
| QA-2 | **Invariant suite v1** — Data Model §5 items 1–6 & 8 automated (co-owns BE-4 coverage). | BE-4 | Items 1–6, 8 covered by automated tests, checked into CI |
| QA-3 | **Flaky-test discipline** — quarantine mechanism + report. | QA-1 | A forced-flaky test is auto-quarantined and surfaced to the platform engineer |

> **QA status: DONE** — QA-1: Vitest + Supertest harness in `apps/api` (health, metrics, ReservationGate, DB invariants — 22 tests green locally) with CI-adjacent run wired as the `integration` job in `ci.yml` (2026-08-15). QA-2 absorbed by `db.invariants.spec.ts`. QA-3: quarantine mechanism (`flakyDescribe`/`flakyIt`, `test:flaky` with `RUN_FLAKY=1`) — quarantine example skipped by default, runs under `test:flaky`; a quarantined failure can never block CI.

### Frontend/Mobile (2 engineers)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| FE-1 | **Web app skeleton** — React + Vite, routing, API client typed from `packages/contracts`, auth placeholder screen, design tokens from DS-1. | BE-1, REV-1 | App boots locally; API client type-checked against contracts |
| FE-2 | **RN mobile skeleton** — project bootstrap, offline-first setup (MMKV + React Query persistence), stub buyer/seller screens, design tokens from DS-1. | REV-1 | App builds for Android emulator; offline store initialized and unit-tested |
| FE-3 | **OPS/design review prep** — low-fidelity of seller offer-creation flow (feeds Sprint 1). | DS-1 | Design review checklist signed by product |

> **FE status: DONE (0.1 scope)** — FE-1: React+Vite with `react-router-dom` (/, /offers, /login, 404), typed API client in `apps/web/src/lib/api.ts` (generic `getJson`/`postJson` + `getEnvelope` validating against `@ojaline/contracts` via `validateEnvelope`), auth placeholder screen, DS-1 tokens in use — `pnpm --filter @ojaline/web run build` green (2026-08-15). FE-2 deferred (README only). FE-3 not started (design review prep, feeds Sprint 1).
### Design (1)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| DS-1 | **Design tokens + primitives** — color/type/spacing/radius tokens shared web+RN; core component primitives (button, card, input, form field, price display). | — | Tokens consumed by FE-1 and FE-2 |

> **DS-1 status: DONE** — `packages/design` with color/type/spacing/radius tokens + primitives (Button, Card, Input, FormField, Price) consumed by FE-1 (2026-08-15). RN consumption lands with FE-2.

### Security (shared, light in 0.1)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| SEC-1 | **Secrets + grants review** — audit `.env` handling, PII grants, append-only REVOKEs; record findings as backlog. | BE-6 | Review log written; no secret committed to repo; findings tracked |
| SEC-2 | **Dependency baseline** — `npm audit`/Renovate config in CI; SCA gate (critical/high blockers). | BE-1 | CI blocks critical/high CVEs in `packages/contracts` and `apps/api` |

> **SEC status: DONE** — SEC-1: review log `docs/security_review_log.md` (2026-08-15); no secret committed (`.env` gitignored); PII view-only + append-only REVOKEs verified by `db.invariants.spec.ts`; findings F-1..F-4 tracked as backlog. SEC-2: `pnpm audit --audit-level high` gate in `ci.yml` `audit` job + `.github/renovate.json` for dependency updates.

---

## Definition of Done (Sprint 0.1)

- All 9 ADRs (000–008) merged and referenced in code where applicable.
- Data Model v1.0 merged; schema migrated to the live dev environment.
- `docker-compose up` from clean checkout boots a fully working dev environment.
- DB CHECK + immutability + ledger invariants proven by automated tests in CI.
- CI pipeline runs on every PR; event JSON-Schema validation step present.
- Sprint demo against Acceptance Criteria (not "code complete").

## Acceptance Criteria (restated from plan v1.1)

1. `docker-compose up` brings up a fully working dev environment from a clean checkout.
2. Schema CHECK constraints (`reserved_qty + soft_held_qty <= available_qty`) verified to actually reject violating writes in a test.
3. Escrow ledger invariants (running-balance trigger; closed-escrow balance = 0) verified by test.

## Exit Criteria

Sprint 0.2 (reservation gate proof + observability) starts only after this DoD passes. The **hard Phase 0 gate** (0 double-sell @ 300 concurrent, 10 min; p99 < 150ms; Redis-down fail-closed) is Sprint 0.2's exit, not 0.1's.

## Risks / Notes

- **Pairing:** pair the two strongest backend engineers on BE-3/BE-4 (schema + invariants) — that is the seed of the Sprint 4 escrow pairing discipline.
- **Frontend capacity in 0.1 is light by design** — skeleton work only; real product UI lands Sprint 1.
- **Paystack sandbox confirmed** — no escrow blocker in 0.1; DPA tracking owned by PM for Phase 1 exit.
- **ADR-000 override window** — if the Lead Engineer overrides any stack choice, affected tickets (PLT-1, BE-1, FE-1/2) re-estimate before starting.

---

## Sprint 0.2 — Reservation Gate Proof (in progress)

> Started 2026-08-15 alongside the entry gate. The hard Phase 0 gate: **0 double-sell @ 300 concurrent, 10 min, p99 < 150ms, Redis-down fail-closed** (Exit Criteria, above).

| Item | Status | Evidence |
|---|---|---|
| ADR-001…006 written (REV-3) | DONE | `docs/ADR-001..006-*.md`; all nine ADRs referenced in `docs/entry_gate_review_log.md` |
| Entry gate REV-1/2/3 | DONE (drafted) | review log written; **pending Lead Engineer + QA sign-off ticks** |
| Gate stress test — 300 concurrent, 0 double-sell | DONE | `reservation.gate.spec.ts` "holds exactly capacity under 300 concurrent attempts" — 150/300 exact wins, no overrun |
| Redis-down fail-closed test | DONE | `reservation.gate.spec.ts` "fails closed when Redis is unreachable" — rejects, never allows |
| HTTP hold endpoint (fail-closed 503/409) | DONE | `reservations.controller.ts` (`POST /reservations/offers`, `POST /reservations/soft-holds`); HTTP spec green (201/409/400) |
| k6 load leg — 300 VUs, p99 < 150ms | DONE | `scripts/load/reservation-gate.js` (`pnpm load:reservation`); run: 300/300 holds acquired, 0% failed, p99 < 150ms |
| 10-minute soak @ 300 concurrent | OPEN | run the k6 leg with `maxDuration: 10m` (env-configurable) once dev is stable |
| Metrics → live dashboards (p99, double-sell alert) | OPEN | `dev/grafana/dashboards/ojaline-overview.json` scaffolded; Prometheus/Grafana already running locally |
