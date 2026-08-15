# ADR-005 — Modular Monolith Deployment Shape

**Status:** Proposed (Principal Architect decision — merge after Lead Engineer review)
**Date:** 15 August 2026

---

## Context

Architecture §1 commits Phase 1 to a modular monolith: five bounded contexts (Catalog, Orders, Escrow, Fulfilment, Trust) plus Identity and Audit — each as a module with its own schema, inside **one deployable**. The operational details were left open: is "one deployable" one process, one container, one repo? When (if ever) do contexts split into services? ADR-007 already carved out the one justified early exception (the USSD/SMS adapter).

## Decision

**One repository, one container image, two entrypoints — `api` and `worker` — for the five market contexts. No microservices in Phase 1.**

1. **Deployable:** a single container image. `api` serves HTTP; `worker` runs the outbox dispatcher, reconciliation, silent-release, weather-gate and expiry sweeps. Both are entrypoints on the same codebase (ADR-000 §1).
2. **Boundary rule:** cross-schema access is prohibited except through the owning module's public interface. Enforced by the boundary lint rule (`scripts/check-boundaries.mjs`), code review, and the DB grant model (each schema is granted to the app role, so enforcement is at module level, not schema level).
3. **In-process dispatch:** events are delivered to handlers in-process (ADR-008). The handler interface is a seam, so any context can later become a consumer of a broker without rewriting producers.
4. **Split triggers (measured, not anticipated):** a context splits into its own deployable only when the Architecture §6-style evidence exists — e.g. sustained CPU/GC pressure from one module affecting others, or a genuinely independent scaling profile. Anticipating that today would trade a known coordination cost for an imagined one.
5. **ADR-007 adapter is not a precedent:** it extracts carrier-trust isolation, not scaling (ADR-007 §"What this is NOT").

## Alternatives considered

1. **Microservices from day one** — rejected: N contexts × (deploy, CI, secrets, observability, data access) with a 6–8 person team and pilot volume is the anti-pattern the plan's "don't pay infrastructure tax" rule exists to prevent.
2. **Two repositories (app + shared packages published)** — rejected: same monorepo with workspace packages gives the separation without the publish/version coordination tax.

## Consequences

- The NestJS module tree mirrors the context map; the boundary lint is part of CI (`pnpm lint:boundaries`).
- Schema grants must be reviewed when a new context is added — the grant model is part of the migration, not an app-level concern.
- Sprint 0.2's concurrency gate runs against the single monolith; the Redis gate (ADR-001) is inside it.

## Acceptance

Merge after review. ADR-007 and the Sprint Plan cite this ADR as the deployment shape authority.
