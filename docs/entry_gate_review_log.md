# Sprint 0.1 — Entry Gate Review Log (REV-1 / REV-2 / REV-3)

**Date:** 15 August 2026
**Reviewer:** Lead Engineer (drafted; sign-off box below)
**Gate criteria:** `Sprint_0.1_Task_Board.md` Entry Gate — must pass before core tickets start.

---

## REV-1 — ADR-000 (Stack) · ADR-007 (USSD shape) · ADR-008 (Outbox transport)

| ADR | Decision | Review outcome |
|---|---|---|
| ADR-000 | TS monorepo; NestJS API + worker (one image, two entrypoints); React/Vite web; RN mobile; Flyway + Kysely; GitHub Actions; Docker Compose dev; AWS deferred default; `.env.example` committed / `.env` gitignored | **No override.** Implemented and verified: monorepo, CI (green), compose stack healthy, secrets handling per §5. |
| ADR-007 | USSD/SMS adapter is a separate thin service for carrier-trust isolation (owns no schema; talks to monolith APIs only) | **No override.** Sprint 1 concern; the `ats-mock` stub + adapter interface in `dev/` is consistent with this shape. |
| ADR-008 | Phase 1 event transport = Postgres outbox + worker, not Kafka; contract discipline retained; promotion gated on measured evidence | **No override.** Implemented: `audit.outbox_events`, `OutboxService`, worker dispatch, `validateEnvelope`, DEAD-letter. |

**Overrides:** none.
**Note for REV-3:** ADR-003/004/005/006 (referenced by code/migrations) were numbered in code before all ADR documents existed; the review confirms the *content* of each numbered ADR now matches its references (ADR-004 in `V1` = PII isolation, which ADR-004 covers alongside residency).

---

## REV-2 — Data Model v1.0 (money-path DDL, entity map, invariant list §5)

**Scope reviewed:** §3 critical DDL (outbox, audit, orders, escrow ledger), §4 entity map, §5 invariants.

| Item | Finding | Verification |
|---|---|---|
| Money as BIGINT minor units; no floats | Binding convention in §1 | `V1__init.sql` uses `BIGINT ..._cents` throughout; no `FLOAT/REAL/NUMERIC` in schema (spot-check). |
| Outbox immutability + column-level grant | Matches ADR-008 §3.1 | `V1` line 501 column-level `UPDATE (status, attempts, dispatched_at, last_attempt_at)`; `REVOKE UPDATE, DELETE` line 59. |
| Escrow running-balance trigger | §3.4 | Implemented `escrow.trg_ledger_running_balance()`; tested in `db.invariants.spec.ts`. |
| Closed-escrow balance = 0 | §5.2 | Tested in `db.invariants.spec.ts`. |
| offers CHECK `reserved+soft_held <= available` | §5.1 | Implemented + tested (insert/update rejection + valid path). |
| `landed_total_cents = item_total + delivery_fee` CHECK | §5.4 | Implemented + tested. |
| Append-only REVOKEs (ledger/audit/agent_actions/fraud_signals) | §5.6 | Implemented in `V1` + tested (BE-4/BE-6). |
| Invariant §5.7 (settlement transfer ref), §5.9 (escrow release requires VERIFIED PoD or silent release) | Implementation-time invariants | Not yet automated — carried as Sprint 1+ QA items, tracked on board. |
| Entity map completeness (pii/catalog/orders/escrow/fulfilment/trust/audit tables) | §4 vs `V1` | All schemas/tables present in `V1__init.sql` (BE-3 DONE). |

**Sign-off:** Data Model v1.0 approved as the schema-freeze baseline. Open items §7 (category content, deletion-cascade map, archive policy) are non-blocking and tracked.

---

## REV-3 — ADR-001…006 written and referenced

All nine ADRs now exist and are referenced:

| ADR | Title | Referenced by |
|---|---|---|
| ADR-000 | Stack & Platform | repo, CI, compose, SEC-1 log |
| ADR-001 | Redis Lua Reservation Gate | Sprint 0.2 gate plan (this sprint) |
| ADR-002 | Webhook Idempotency (Two-Layer) | hold `idempotency_key`, ledger/settlement keys |
| ADR-003 | Event Schema Versioning | `packages/contracts`, BE-5, CI schema-drift |
| ADR-004 | Data Residency & PII Isolation | `V1` grants + view layer, `db.invariants.spec.ts` |
| ADR-005 | Modular Monolith Deployment Shape | ADR-007, module-boundary lint |
| ADR-006 | Agent Actions & Append-Only Immutability | `V1` REVOKEs, `db.invariants.spec.ts` |
| ADR-007 | USSD/SMS Adapter Deploy Shape | Sprint Plan, `dev/ats-mock` |
| ADR-008 | Outbox over Kafka | `audit.outbox_events`, worker, contracts |

**ADR-001/002 remain implementation-pending** (their mechanisms land in Sprint 0.2 with the reservation gate and webhook handlers); the decisions themselves are merged at this gate.

---

## Sign-off

- [ ] REV-1 approved (Lead Engineer)
- [ ] REV-2 approved (Lead Engineer + QA)
- [ ] REV-3 approved (Backend)

**Verdict:** no ADR requires rework; gate passes pending the three sign-off ticks.
