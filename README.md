# Ojaline

African local market platform. Phase 1 = modular monolith (ADR-005), Postgres outbox eventing (ADR-008), two-tier stock reservation (ADR-001).

## Quick start (dev)

Prerequisites: Docker, Node ≥ 22, pnpm ≥ 10.

```sh
pnpm install
Copy-Item .env.example .env          # PowerShell (or: cp .env.example .env)
docker compose up -d postgres redis minio
pnpm db:migrate                       # runs Flyway (creates schemas + ojaline_app role)
pnpm typecheck
```

`docker compose up -d` starts the core stack. Flyway runs as a one-shot service:

```sh
docker compose run --rm flyway info      # migration status
```

## Structure

```
apps/
  api/        NestJS modular monolith — HTTP entrypoint (src/main.ts) and
              worker entrypoint (src/worker.ts) share one codebase/image (ADR-000 §1)
  web/        React + Vite (buyer/seller/farmer web + Ops dashboard)
  mobile/     React Native (init deferred to Sprint 0.1 FE-2)
packages/
  contracts/  Shared event + API contracts (zod) → JSON Schema for CI validation (ADR-003/008)
  config/     Shared runtime config loading
  db/         Flyway SQL migrations (Data Model v1.0)
```

## Governance

See `docs/` — System Documentation v1.3-FINAL, Architecture v2.0, Data Model v1.0,
ADRs 000–008, Sprint & Phase Plan v1.1, Sprint 0.1 Task Board.
