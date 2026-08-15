# OJALINE — Sprint 0.1 Task Board
### Foundations: Infra, Data, CI, Observability scaffolding
**Derived from:** Sprint & Phase Plan v1.1 · ADR-000/001–008 · Data Model v1.0
**Team:** 3 backend, 1 platform, 2 frontend/mobile, 1 QA/SDET, 1 design
**Sprint goal:** Provision the systems that the reservation gate (§3) and events (§4) depend on, and freeze the core schema.

---

## Entry Gate (first 2 days — must pass before core tickets start)

- [ ] **REV-1** — Lead Engineer reviews ADR-000 (stack) · ADR-007 (USSD shape) · ADR-008 (outbox transport). Overrides, if any, written with justification and merged.
- [ ] **REV-2** — Lead Engineer + QA review Data Model v1.0 (money-path DDL, entity map, invariant list §5). Sign-off recorded.
- [ ] **REV-3** — Backend confirms ADR-001…006 (already-planned design ADRs) written and referenced.

**Exit:** any ADR requiring rework is re-issued before dependent tickets start; no ticket blocks on a merged-but-questioned decision.

---

## Backlog (all tasks; single-track dependencies shown)

### Infra — Platform (1 engineer)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| PLT-1 | **Docker Compose stack** — postgres:16, redis:7, minio, Africa's Talking mock (SMS/USSD stub), plus Paystack test-mode stub. Healthchecks, `.env.example` committed / `.env` gitignored, README run-book. | REV-1 | `docker-compose up` from a clean checkout boots all services; `docker compose ps` all healthy; mock can send an SMS captured by a test |
| PLT-2 | **GitHub Actions CI skeleton** — PR pipeline: install, lint, typecheck, unit + integration tests, Flyway migration check, JSON Schema validation of event payloads in `packages/contracts`. | REV-1, BE-2 | Every PR runs the pipeline; a deliberately-wrong event payload fails the schema step |
| PLT-3 | **Observability base** — app metrics export (Prometheus-friendly), structured log pipeline config, dashboard placeholders for every NFR in Architecture §7 (Sprint 0.2 makes them live). | PLT-1, BE-7 | Metrics endpoint returns soft-hold/DB/Redis stats; dashboards scaffolded |

### Backend (3 engineers — pair BE-3 and BE-4)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| BE-1 | **Monorepo scaffold** — `apps/api`, `apps/worker`, `apps/web`, `apps/mobile`, `packages/{contracts,db,config}`; TS config; lint; one shared CI job. | REV-1 | `pnpm install && pnpm lint && pnpm typecheck` green from clean checkout |
| BE-2 | **Flyway wired** — baseline migration tracked; runs against compose Postgres on `up`; runs in CI as a verification step. | BE-1, PLT-1 | `docker compose run migrations` applies cleanly; CI runs it on every PR |
| BE-3 | **Schema migrations** — all tables from Data Model v1.0 §3–4 + Architecture §2.1: pii, catalog, orders, escrow, fulfilment, trust, audit. | REV-2, BE-2 | Full schema applied to fresh DB; `\d` spot-check against Data Model doc |
| BE-4 | **DB invariant tests** — offers CHECK (`reserved+soft_held <= available`), `landed_total` CHECK, ledger running-balance trigger, closed-escrow balance=0, append-only REVOKE on ledger/outbox/audit/agent_actions/fraud_signals. | BE-3 | Each invariant has a test that **fails on violation**; full suite green in CI |
| BE-5 | **Outbox skeleton** — `outbox_events` insert-in-TX helper, worker polling PENDING/FAILED with backoff, DEAD-letter + alert, JSON Schema validation on dispatch (ADR-003/008). | BE-3, PLT-2 | A test event written in one TX is dispatched to a handler and marked SENT; malformed payload → DEAD + alert |
| BE-6 | **PII isolation + grants** — `app_user` role grants per schema; `pii` readable only via view layer; `REVOKE UPDATE, DELETE` on all append-only tables. | BE-3 | A test attempting UPDATE on `ledger_entries`/`agent_actions` fails as `app_user`; pii direct-grant test fails; view read succeeds |
| BE-7 | **App skeleton** — NestJS bootstrap, health/readiness endpoints, pino structured logging, config module via env_file, module-boundary lint rule (no cross-schema imports outside owning module). | BE-1 | Health returns OK with DB/Redis connectivity; boundary lint blocks a deliberate violation |

### QA (1 SDET)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| QA-1 | **Test harness** — Vitest + Supertest integration harness against the compose stack; CI-adjacent run (not just laptop). | PLT-1, BE-2 | Harness boots DB/Redis, runs a smoke integration test in CI |
| QA-2 | **Invariant suite v1** — Data Model §5 items 1–6 & 8 automated (co-owns BE-4 coverage). | BE-4 | Items 1–6, 8 covered by automated tests, checked into CI |
| QA-3 | **Flaky-test discipline** — quarantine mechanism + report. | QA-1 | A forced-flaky test is auto-quarantined and surfaced to the platform engineer |

### Frontend/Mobile (2 engineers)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| FE-1 | **Web app skeleton** — React + Vite, routing, API client typed from `packages/contracts`, auth placeholder screen, design tokens from DS-1. | BE-1, REV-1 | App boots locally; API client type-checked against contracts |
| FE-2 | **RN mobile skeleton** — project bootstrap, offline-first setup (MMKV + React Query persistence), stub buyer/seller screens, design tokens from DS-1. | REV-1 | App builds for Android emulator; offline store initialized and unit-tested |
| FE-3 | **OPS/design review prep** — low-fidelity of seller offer-creation flow (feeds Sprint 1). | DS-1 | Design review checklist signed by product |

### Design (1)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| DS-1 | **Design tokens + primitives** — color/type/spacing/radius tokens shared web+RN; core component primitives (button, card, input, form field, price display). | — | Tokens consumed by FE-1 and FE-2 |

### Security (shared, light in 0.1)

| ID | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| SEC-1 | **Secrets + grants review** — audit `.env` handling, PII grants, append-only REVOKEs; record findings as backlog. | BE-6 | Review log written; no secret committed to repo; findings tracked |
| SEC-2 | **Dependency baseline** — `npm audit`/Renovate config in CI; SCA gate (critical/high blockers). | BE-1 | CI blocks critical/high CVEs in `packages/contracts` and `apps/api` |

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
