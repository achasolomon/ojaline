# OJALINE — Sprint & Phase Plan
### Derived from System Architecture v2.0 (Approved)
**Status:** Ready for team execution
**Cadence assumption:** 2-week sprints, team composition per engineering-lead plan (3 backend, 1 platform, 2 frontend/mobile, 1 QA/SDET, 1 design)

---

## Change Log (v1.1 — 13 Aug 2026)

Incorporates the Architecture-Ready gate decisions:

- **ADR-000 (Stack & Platform):** TypeScript monorepo — NestJS API + worker (one image, two entrypoints), React Native mobile, React/Vite web, Flyway + Kysely, GitHub Actions, Vitest/k6/Playwright/Maestro. Local Docker Compose is the Phase 1 dev environment; cloud provisioning deferred (AWS the recorded default).
- **ADR-007:** USSD/SMS adapter is a **separate thin service** from day one (resolves the v2.0 §1 vs. plan conflict — justified extraction for carrier-trust isolation, not scaling).
- **ADR-008:** Event transport is a **Postgres outbox + worker**, **not Kafka**. Event *contract* discipline unchanged. Kafka promotion is gated on measured evidence.
- **Confirmed decisions:** mobile = React Native (offline cache is Phase 1 in-scope); pilot ceiling = **~100 concurrent → Sprint 0.2 load test at 3× = 300 concurrent**, sustained 10 min; **Paystack sandbox access confirmed** (DPA still pending — only external escrow blocker left).
- **Data Model v1.0** (escrow ledger, order path, outbox, audit, entity map) must be merged before the Sprint 0.1 schema freeze is valid.

---

## Architecture-Ready Gate (pre-Sprint 0.1)

Sprint 0.1 does not start until:
- [ ] ADR-000, ADR-007, ADR-008 reviewed and merged (stack, USSD shape, event transport)
- [ ] Data Model v1.0 reviewed and merged (money path + order path + entity map)
- [ ] Lead Engineer confirms no open architecture question blocks provisioning the local Docker stack

---

## Governance Rules for This Board

- No sprint starts work that depends on an unmerged ADR or an unresolved Open Question from the architecture doc.
- Every sprint ends with a demo against its **Acceptance Criteria**, not against "code complete."
- Phase gates (§ Engineering Gates below) are hard stops. A phase does not advance on schedule pressure alone — it advances on evidence.

---

## PHASE 0 — Foundations
**Duration:** 2 sprints (4 weeks)
**Goal:** Nothing user-facing ships. Every subsequent sprint is de-risked by this phase.

### Sprint 0.1 — Infrastructure & Data Foundations

**Sprint Goal:** Provision the systems that Architecture §3 and §4 depend on, and freeze the core schema.

| Track | Tasks |
|---|---|
| Infra | Postgres (primary + read replica) provisioned in Docker Compose; Redis provisioned; **outbox table + worker skeleton** (ADR-008 — no Kafka); MinIO (media) provisioned; Africa's Talking SMS/USSD mock wired to the ADR-007 adapter skeleton |
| Backend | Schema from Data Model v1.0 + Architecture §2.1 migrated (offers, stock_holds, orders, order_lines, **escrow ledger, settlements, disputes, outbox, audit**, agent_actions, fraud_signals + all §4 entities); migration tooling (Flyway) wired into CI |
| Platform | CI/CD pipeline skeleton (GitHub Actions, ADR-000); JSON Schema validation step in CI for event payloads |
| Security | Secrets handling per ADR-000 (`.env` gitignored, `.env.example` committed; env_file for Compose); PII schema isolation (Architecture §2.2) implemented at the DB grant level |
| QA | Test harness scaffolded for the invariant-test suite (Data Model §5 — incl. ledger-immutability and outbox-append-only) |
| Docs | ADR-000 (stack), ADR-001 (Redis Lua reservation gate), ADR-002 (webhook idempotency two-layer), ADR-003 (event schema versioning), ADR-004 (data residency), ADR-005 (modular monolith deployment shape), ADR-006 (agent_actions immutability), ADR-007 (USSD deploy shape), ADR-008 (outbox transport) — all written and merged |

**Definition of Done:** All 9 ADRs merged. Data Model v1.0 merged. Schema migrated to the live dev environment. CI pipeline runs on every PR.

**Acceptance Criteria:**
- `docker-compose up` brings up a fully working dev environment from a clean checkout
- Schema CHECK constraints (§2.1: `reserved_qty + soft_held_qty <= available_qty`) verified to actually reject violating writes in a test
- Escrow ledger invariants (running-balance trigger; closed-escrow balance = 0) verified by test

---

### Sprint 0.2 — Reservation Gate Proof + Observability

**Sprint Goal:** Prove the concurrency design (Architecture §3.1) works before any product feature is built on top of it.

| Track | Tasks |
|---|---|
| Backend | Redis Lua script for soft-hold acquire/release implemented; Postgres reconciliation job (5-min sweep) implemented |
| Platform | Observability dashboards live for every NFR in Architecture §7 (soft-hold p99, hard-reserve TX p99, double-sell counter, stock propagation lag, Redis fail-closed events) |
| Security | Threat-model workshop held: double-sell, channel arbitrage, escrow early-release, OTP replay, rider GPS spoofing — findings logged as backlog items, not ignored |
| QA | Load test harness built: simulate concurrent checkout on a single hot offer at **3× the confirmed pilot ceiling = 300 concurrent** |

**Definition of Done:** Load test runs in CI-adjacent environment, not just a laptop.

**Acceptance Criteria (Phase 0 Exit Gate — hard stop):**
- ✅ Load test proves **0 double-sell incidents** at 300 concurrent (3× of confirmed 100 ceiling), sustained 10 minutes
- ✅ Soft-hold acquire p99 < 150ms under that same load
- ✅ Redis-down scenario tested: checkout correctly fails closed (returns clean error, does not silently allow oversell)
- ✅ All 9 ADRs merged and referenced in code (not just written)

**If this gate fails:** Phase 1 does not start. This is the one place I will delay the roadmap without negotiation — the whole system's integrity depends on this proof existing before a single product feature touches it.

---

## PHASE 1 — Core Marketplace MVP
**Duration:** 6 sprints (12 weeks)
**Goal:** Pilot-ready marketplace: channel-enforced offers, working two-phase holds, escrow, gated multi-seller, farmer USSD path, offline buyer cache.

### Sprint 1 — Offer & Catalog Foundation

**Sprint Goal:** Sellers can list offers with enforced channel + perishability rules.

| Track | Tasks |
|---|---|
| Backend | Offer CRUD API; channel CHECK enforcement; `lot_id` partial-channel split support (System Doc §2) |
| Backend | Channel-change API: reserved+soft=0 required, 7-day rate limit, audit log entry on every change |
| Frontend | Seller offer-creation flow (web/app) — channel selector, min-qty, perishability class |
| QA | Test: channel-change attempt while reserved_qty > 0 → rejected. Test: partial-channel split (300 RETAILER + 200 DIRECT) maintains independent qty correctly |
| Design | Offer card UI showing min-qty in discovery (System Doc §7 — must be visible in discovery, not only detail) |

**Acceptance Criteria:**
- Seller can create an offer, split it across channels, and see independent qty tracked per channel
- Channel-change API rejects when reserved+soft ≠ 0, with audit log entry produced on every successful change

---

### Sprint 2 — Channel Enforcement at Checkout + Discovery

**Sprint Goal:** Buyer role vs. offer channel is enforced at the point of checkout, not just at listing.

| Track | Tasks |
|---|---|
| Backend | Checkout endpoint validates buyer role vs. offer.channel → 409 on mismatch |
| Backend | Discovery/search API (filter by channel, cluster, perishability) |
| Frontend | Buyer discovery UI; landed-cost transparency display (System Doc §2 — consumer value via transparency, not undercutting) |
| QA | Adversarial test: every buyer-role × channel combination that should be rejected, is rejected (100% of matrix, not spot-checked) |
| Security | Arbitrage-pattern flag stub wired to `fraud_signals` table (rapid buy→list detection — minimal ruleset per Architecture §5) |

**Acceptance Criteria:**
- Full role×channel rejection matrix passes as an automated test, checked into CI permanently
- Fraud signal record is created (not yet actioned) when a rapid buy→list pattern is simulated in test

---

### Sprint 3 — Two-Phase Holds (Cart/Order)

**Sprint Goal:** Soft hold on checkout start, backed by the Redis gate proven in Sprint 0.2.

| Track | Tasks |
|---|---|
| Backend | Checkout-start → Redis Lua gate → `stock_holds` INSERT (SOFT, TTL 8min) wired end-to-end |
| Backend | Payment-init → soft TTL extension + idempotency key binding |
| Frontend | Checkout flow with optional countdown UI (System Doc §3) |
| QA | Concurrent-checkout test: two buyers racing the last unit → exactly one wins, one gets clean stock-unavailable error |
| Platform | Reconciliation job deployed to staging, sweeping expired holds every 5 min |

**Acceptance Criteria:**
- Race-condition test (2 concurrent buyers, 1 unit remaining) produces exactly one successful hold, zero double-sell, in 100/100 repeated test runs
- Expired soft holds are released (both Postgres and Redis) within one reconciliation cycle

---

### Sprint 4 — Split-Escrow (Paystack Integration)

**Sprint Goal:** Payment confirmation converts soft→hard reserve atomically; escrow timing rules are live. **Pair strongest two backend engineers here.**

| Track | Tasks |
|---|---|
| Backend | Paystack webhook receiver with signature verification (mandatory before any DB write, per Architecture §5) |
| Backend | Two-layer idempotency: `paystack_reference` dedup (replay guard) + `idempotency_key` (submission guard) per Architecture §3.2 |
| Backend | Soft→hard conversion TX: `reserved_qty += qty`, order → PAID, event emitted to `order.events` |
| Backend | Partial-pay handling: hard-reserve only the paid quantity, remainder stays available |
| Backend | 24h silent-release job + PoD gate stub (full PoD logic lands Sprint 5–6, but escrow can't release without *some* gate existing first) |
| QA | Webhook replay test: same reference delivered 3× → exactly one hard reservation, order never double-created |
| QA | Payment-fail/timeout test: hold released correctly, stock returns to available within SLA |

**Acceptance Criteria:**
- Webhook replay (3× same reference) produces exactly one PAID order — verified by automated test, not manual check
- Partial-quantity payment correctly reserves only paid units; remainder immediately purchasable by another buyer

---

### Sprint 5 — Multi-Seller Gate + Fulfilment Capacity

**Sprint Goal:** Multi-seller orders only proceed when all gates pass; capacity is enforced.

| Track | Tasks |
|---|---|
| Backend | Multi-seller gate service: ≤2 sellers, same cluster_id, each seller on_time_rate_30d ≥ 0.95 (or ops_override), capacity check |
| Backend | Capacity counters in Redis (per cluster/window), read at gate-check time |
| Backend | Partial-fulfilment state machine (System Doc §5): buyer choice of continue/cancel/replace when one line fails — this needs an explicit state machine with timeouts, not implicit logic |
| Frontend | Per-line order status UI (Paid/Dispatched/Delivered/Pending/Refunded) always visible |
| QA | Test: 3-seller cart attempt → forced split to single-seller checkouts, not silently allowed |

**Acceptance Criteria:**
- Gate correctly blocks a multi-seller order when any single gate condition fails (tested per-gate, not just end-to-end)
- Partial-fulfilment flow: buyer's continue/cancel/replace choice is durably recorded and drives correct downstream state, including a defined timeout if buyer doesn't respond

---

### Sprint 6 — Trust: PoD, OTP, Market-Day/Weather

**Sprint Goal:** Full escrow release logic live; market-day eligibility enforced by perishability + weather.

| Track | Tasks |
|---|---|
| Backend | OTP: 15-min TTL, buyer-initiated renewal only — rider-only renewal attempt explicitly tested and rejected |
| Backend | `delivery.verified` → schedule release; 24h silent-release finalized; dispute-window logic |
| Backend | Market-day matching: refuse `SHELF_LT_7D` + `MARKET_DAY` combination; weather-gate job (forecast pull, writes `market_day_status`) |
| Backend | QA-rate lookup from `seller_risk_tier` applied at order time |
| Frontend | Escrow timeline shown at checkout (System Doc §11) |
| QA | Full run of the **Forbidden-in-Phase-1 test suite** (see Phase 1 Exit Gate below) — every one of the 10 items gets its own failing-by-default test |

**Acceptance Criteria:**
- OTP renewal by rider-identity alone → rejected in 100% of test attempts
- `MARKET_DAY` + `SHELF_LT_7D` combination → rejected in 100% of test attempts
- Escrow release without valid PoD or 24h-silent log entry → rejected in 100% of test attempts

---

### Running in Parallel Across Sprints 1–6 (not deferred, per System Doc §15)

| Workstream | Owner track | Notes |
|---|---|---|
| Offline buyer cache (offer cards TTL+ETag, offline cart queue + reconnect re-validation) | Frontend/Mobile — **React Native** (ADR-000) | Explicitly not a nice-to-have — built alongside core flows |
| Grade standards + reference-photo pipeline (compression tiers for low-bandwidth) | Frontend + Design | Feeds `grade_standards.ref_photo_required` |
| Farmer USSD/SMS adapter (`SOLD <sku> <qty>` parser, ≤5-screen core flow, async SMS accept/reject) | Backend (dedicated thin service, **per ADR-007**) | Separate deploy unit — carrier-trust isolation; owns no schema (reads/writes monolith APIs only) |
| NDPR consent flow + DPAs (Paystack, Africa's Talking) | Backend + Legal/Product | Blocks Phase 1 exit if incomplete |
| Agent price-guidance alerts (SMS/push when listing <85% of guidance low) | Backend | Feeds `agent_actions` |

---

## PHASE 1 EXIT GATE (hard stop — no schedule override)

All of the following must be true before Phase 1.5 begins:

- [ ] Every item in System Doc §11 / "Forbidden in Phase 1 Code" has a corresponding automated test proving it's rejected — 10/10 items covered
- [ ] Ops runbooks tabletop-exercised at least once: Paystack outage, rider no-show, quality dispute, offline buyer, multi-seller partial fail, weather cancel
- [ ] NDPR consent flow live; DPAs signed with Paystack and Africa's Talking
- [ ] Support SLA staffing roster confirmed (critical ≤2h, standard ≤24h) across in-app/SMS/USSD/WhatsApp channels
- [ ] **Backup & recovery evidence: PITR in place (RPO ≤ 5 min, RTO ≤ 60 min) and a restore drill completed** (Data Model §6 — added to the exit gate)
- [ ] Load test re-run at pilot-scale traffic estimate (not just synthetic 3×) with 0 double-sell incidents

**If any item is unmet:** the gate does not pass. State explicitly: what's blocking, why it matters, who owns it, what evidence closes it. Do not soft-launch around an unmet gate.

---

## PHASE 1.5 — Hardening (before rider count scales)
**Duration:** 2 sprints

| Track | Tasks |
|---|---|
| Legal | Signed independent-contractor terms for riders finalized |
| Partnerships | Per-delivery insurance product live |
| Backend | Weighted allocation scorer (0.7 performance / 0.3 exploration) in production, replacing any placeholder allocation |
| QA | Allocation fairness test: new/lower-rated riders receive non-zero job share over a simulated window |

**Deploy gate:** rider count does not scale past pilot cohort until all three items above are live. This is enforced as a literal deploy check, not a policy reminder.

---

## Dependency Chain (critical path)

```
Sprint 0.1 (schema+infra) 
   └─▶ Sprint 0.2 (reservation gate proof) — HARD GATE
        └─▶ Sprint 1 (catalog/channel)
             └─▶ Sprint 2 (checkout enforcement)
                  └─▶ Sprint 3 (holds) ──┐
                                          ├─▶ Sprint 4 (escrow) — needs Paystack sandbox/DPA ready by Sprint 3 end
                                          └─▶ Sprint 5 (multi-seller/capacity)
                                                └─▶ Sprint 6 (PoD/OTP/market-day)
                                                     └─▶ PHASE 1 EXIT GATE
                                                          └─▶ Phase 1.5 (rider hardening)
```

**External dependencies:** Paystack sandbox access **confirmed** — Sprint 4 is unblocked on access. The **Paystack DPA remains the only open escrow dependency**; it must be signed before Phase 1 exit and should be in progress now. Rider contractor-terms legal review is Phase 1.5's critical-path item. Production cloud platform decision is deferred (local Docker until production scheduling; AWS the recorded default).

---

## Open Items Still Needing Input (updated v1.1)

1. **Resolved:** Pilot ceiling confirmed at ~100 concurrent → load baseline fixed at 300.
2. **Resolved:** Paystack sandbox access confirmed. **Open:** Paystack DPA signing timeline (only external blocker on Sprint 4).
3. Rider contractor-terms legal review timeline — sits on Phase 1.5's critical path.
4. Production cloud platform + cost bracket — deferred until production is scheduled (local Docker now; AWS the recorded default).

None of these block starting Sprint 0.1 once the Architecture-Ready gate (ADR-000/007/008 + Data Model v1.0) passes.
