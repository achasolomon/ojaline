# ADR-000 — Stack & Platform

**Status:** Proposed (Principal Architect decision — merge after Lead Engineer review; override requires documented justification)
**Date:** 13 August 2026
**Supersedes:** n/a (first stack decision)
**Context:** Architecture v2.0 and the Sprint Plan reference infrastructure (Postgres, Redis, events, CI, secrets) without naming an implementation stack. Sprint 0.1's infrastructure, CI, and migration work cannot start until this is fixed.

---

## Decision

### 1. Repository shape — single monorepo

```
ojaline/
├── apps/
│   ├── api/          # NestJS modular monolith — HTTP surface (one deployable)
│   ├── worker/       # Same codebase, second entrypoint: outbox dispatcher, reconciliation,
│   │                 #   silent-release, weather-gate, expiry sweeps (same container image, two commands)
│   ├── mobile/       # React Native (Android-first; iOS follows)
│   └── web/          # React + Vite — buyer/seller/farmer web + Ops dashboard
├── packages/
│   ├── contracts/    # Shared API + event types (single source of truth for schema_version)
│   ├── db/           # Flyway migrations + seed data
│   └── config/       # Shared runtime config loading
├── docker-compose.yml
├── .github/workflows/
└── docs/
```

One container image with two entrypoints (`api` / `worker`) preserves the "one deployable" modular-monolith decision while separating long-running jobs from HTTP processes.

### 2. Backend

| Concern | Choice | Why |
|---|---|---|
| Language/runtime | TypeScript on Node.js 22 LTS | Single language across API + web + mobile (team is FE/mobile-heavy). Largest JS talent pool, fast iteration for pilot stage. |
| Framework | NestJS | Module/DI structure maps 1:1 onto the five bounded contexts and makes *enforced* module boundaries (Architecture §1) tractable in code review and middleware. |
| DB access | `node-postgres` + Kysely (compile-time typed SQL) | Architecture §2.1 relies on non-ORM-friendly DDL: `GEOGRAPHY`, partial indexes, `CHECK` constraints, `REVOKE`. A full ORM fights these features. Kysely gives type safety without hiding SQL. |
| Migrations | Flyway (SQL) | As planned in Sprint 0.1; DB-invariant-heavy design stays reviewable. |
| Redis | `ioredis` + Lua scripts | Required by Architecture §3.1. |
| Validation | Zod (shared via `contracts`) | Runtime validation + inferred TS types, one source of truth. |
| Payments | Paystack Node SDK | Hosted checkout only — no card data ever on Ojaline servers. |
| SMS/USSD | Africa's Talking SDK | With a local mock adapter in dev (see §5). |

### 3. Mobile & Web

| Concern | Choice | Why |
|---|---|---|
| Mobile | React Native | **Confirmed by product.** Offline browse + offline cart (System Doc §15) via MMKV/AsyncStorage + React Query persistence; offline cart queue with reconnect re-validation. |
| Mobile E2E | Maestro | Significantly lower setup burden than Detox for a small team. |
| Web | React + Vite | Shared TS with mobile; buyer/seller/farmer web + Ops dashboard as routes in one app. |
| Web E2E | Playwright | Mature, CI-friendly. |

### 4. Events — transport change (see ADR-008)

Phase 1 event transport is a **Postgres outbox table + in-monolith dispatcher**, **not Kafka**. The event *contract* discipline from Architecture §4 (JSON Schema + `schema_version` + dead-letter) is unchanged — only the transport differs. ADR-008 records the promotion criteria back to a managed broker.

### 5. Dev environment & infra (Phase 1)

- **Confirmed:** local development via Docker Compose (user decision). Stack: Postgres 16, Redis 7, MinIO (S3-compatible media), Africa's Talking mock (SMS/USSD stub), Paystack test mode.
- Cloud provisioning is **deferred** until production is scheduled; AWS is the recorded default when that decision is made (managed Postgres/Redis, Secrets Manager, object storage).
- **Secrets:** dev uses `docker-compose` `env_file`; `.env.example` is committed, `.env` is gitignored. Production secrets go to a managed secrets manager (provider fixed with the cloud decision) — never images, never `.env` in-repo.

### 6. CI/CD & testing

| Concern | Choice |
|---|---|
| CI | GitHub Actions (assumed provider — no repo yet; revisit if the team standard differs) |
| Unit/component | Vitest |
| API/integration | Vitest + Supertest against the real Compose stack |
| Load | k6 (drives the Sprint 0.2 gate at 3× = 300 concurrent) |
| E2E web | Playwright |
| E2E mobile | Maestro |
| Event contract | JSON Schema validation in CI (as planned) |

---

## Alternatives considered

1. **Go backend** — excellent concurrency/perf, but splits the codebase language away from a FE/mobile-heavy team; no Phase 1 requirement justifies it.
2. **Python (FastAPI/Django)** — Django's admin is attractive for Ops, but same split-language problem and weaker typing fit with the RN/TS team.
3. **Full ORM (Prisma/TypeORM)** — rejected because §2.1 DDL (GEOGRAPHY, partial unique indexes, REVOKE, CHECK invariants) is exactly the class of feature ORMs abstract away or fight.
4. **Kafka now** — rejected; see ADR-008. The doc's own "don't pay infrastructure tax" logic applies to a broker at pilot volume.
5. **Detox** — rejected for Maestro: less setup, adequate coverage at this stage.

## Consequences

- One language across all surfaces; the team can rotate between API/web/mobile without context switches.
- NestJS's structure is an opinion the team must follow — module boundaries are enforced in code review and by a boundary-check lint rule (no cross-schema imports outside the owning module).
- Cloud/secret-management choices are deferred but recorded; adopting AWS later is a lift-and-shift, not a redesign.
- The outbox transport means a worker must be deployed with the API; promotion to Kafka is gated on measured evidence (ADR-008).

## Acceptance

Merged after Lead Engineer review; the Lead Engineer may override specific choices with written justification. This ADR is a Sprint 0.1 input, not a sprint task.
