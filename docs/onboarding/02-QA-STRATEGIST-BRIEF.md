# Kika — QA Engineer / Business Strategist Role Brief

**Role:** Quality Assurance Engineer **and** Business Strategist (dual-purpose)
**Reports to:** Lead Engineer (Full-Stack)
**Mission this sprint** (two workstreams, one deliverable each next sprint):

1. **Define the "Kika Festive" feature** end-to-end — concept, scope, flows, KPIs — and design the test plan that will verify it.
2. **Produce the test plan for what has already landed** — the buyer journey + Seller Platform Phases 0–4 — so the team knows exactly what is proven today and where the risk is.

> Read `00-KIKA-SYSTEM-ORIENTATION.md` first (runbook, demo accounts, test commands).

---

## 0. What Exists Today (the QA baseline)

**Test inventory already in the repo:**

| Set | Location | Count (approx.) |
|---|---|---|
| API integration (Vitest + Supertest vs Postgres+Redis) | `apps/api/src/**/*.spec.ts` | ~97 green |
| DB invariant suite (CHECK constraints, ledger triggers, append-only REVOKEs, PII isolation) | `apps/api/src/db.invariants.spec.ts` | 14 |
| Reservation gate stress + fail-closed (300 concurrent, 0 double-sell; Redis-down fail-closed) | `apps/api/src/modules/reservation/reservation.gate.spec.ts` | green |
| k6 load legs (300 VUs, p50 < 150ms; 10-min soak) | `scripts/load/reservation-gate.js` | proven |
| Web unit tests | `apps/web/src/**/*.spec.ts` | 14 |
| Quarantine discipline | `flakyDescribe` / `flakyIt`, `test:flaky` (RUN_FLAKY=1) | exists |
| CI pipeline | lint → typecheck → contract drift → integration → audit (`pnpm audit --audit-level high`) | every PR |

**How to run them** (from orientation §5):
```powershell
pnpm --filter @ojaline/api test          # ~97 integration tests
pnpm --filter @ojaline/api test:flaky    # quarantine suite
pnpm --filter @ojaline/web test          # web unit tests
pnpm lint                                # eslint
pnpm lint:boundaries                     # ADR-005 module-boundary lint
pnpm load:reservation                    # k6 load leg
```

**Maturity gaps to be honest about** (your test plan should close or name these):
- No Playwright/E2E browser suite yet (link/flow coverage is manual).
- No Maestro mobile flows (nothing mobile built yet anyway).
- Fulfilment tables (`rider_jobs`, `delivery_attempts`, `otp_verifications`, `weather_gates`) have **no API/UI — nothing to test**, but the state machine rules are documented (Sprint 6 hardening).
- Phase 1 exit-gate requirement: **10/10 "Forbidden in Phase 1" items must each have a failing-by-default test** (see System Doc §11 / Sprint 6) — this is a **listed, unclosed requirement**.

---

## Workstream A — Define "Kika Festive"

**What it is (as far as it is defined):** a Kika festive-season campaign/feature idea discussed with the lead. **You own defining it.** Nothing is coded; no constraints are fixed beyond what the platform can already do.

### A.1 What you can build on (platform primitives that already exist)
- **Marketplace + negotiation + crowd sales** — festive promotions can sit on top of existing buying/haggling flows.
- **Ads system** (TOAST/BANNER, free in v1, `GET /ads/active` on the home feed) — promotional creative + placement; **no billing engine yet** (ADR-009).
- **Banners / content** (`marketing.banners`) — hero and in-page slots.
- **Notifications** — `NotifyService` feed + push (VAPID) + role fan-out — campaign announcements, price-drop alerts, cart reminders.
- **Market days / wholesale** — seasonal/themed market-day tie-ins.
- **Wishlist** — festive "save for later / gift ideas" hooks.
- **Escrow trust message** — buyers are protected (money held until delivery) — a strong festive selling point (gift buying).

### A.2 Deliverable — the Kika Festive Feature Definition
Produce a document (to present next sprint) that covers:

1. **Concept & positioning** — one-line thesis, target segment, why now (season/cadence), festive pillar (e.g., gifts / family staples / wholesale for resellers / market-day celebration).
2. **Scope v1 vs out-of-scope** — explicit; nothing is built yet, so scope is your proposal. Where it attaches to existing flows (offers, negotiation, ads, banners, notifications, wishlist, market days) vs. new UI.
3. **User journeys** — buyer, seller, ops. Step-by-step flows incl. edge cases (gift recipient, out-of-stock, failed payment, festive pricing vs escrow/commission).
4. **Delivery mechanics (recommend, and flag where backend work is needed)**:
   - Pricing/promos (discounts, bundles) — interactions with **commission** (`order_lines.commission_cents`), **escrow amount held**, and **`offer_price_history`** (price changes are audited/immutable).
   - Ad placements + campaign lifecycle (creation → active → expiry → report) — confirm against existing `marketing.ads`/`ad_reports`.
   - Whether festive needs a new `promotions`/`campaigns` table (recommend a shape) or can ride existing tables.
   - Notification campaigns via `NotifyService`.
5. **KPIs & success metrics** — define north-star + funnel (impressions → adds to cart → paid orders → delivery success → repeat), plus operational KPIs (ad report rate, dispute rate during campaign, settlement/release SLAs).
6. **Risks** — overselling during promo (reservation gate handles at capacity — confirm), support load spike (ties to the Support System workstream), festive bad-actor behaviour, escrow release volume.
7. **Open questions for the lead** (tagged who answers: product? backend? you?).
8. **Phasing + estimate** for v1.

### A.3 QA component of Kika Festive
Design the test plan for the feature you defined:
- What existing invariants protect promo behavior (offer CHECK constraint, ledger running-balance, idempotency, reservation gate).
- What new tests are needed (promo price math, bundle qty vs stock, campaign expiry, ad placement kill-switch, notification blast behavior under limit).
- E2E flows to script once Playwright is in (see Workstream B).

---

## Workstream B — Test Plan for What Has Landed

Goal: a **risk-based test plan** for the buyer journey + Seller Platform Phases 0–4, mapping existing coverage to real user flows and naming what is NOT yet covered.

### B.1 Deliverable — Test Plan document covering
1. **Feature inventory → coverage map.** For each landed surface (auth/register·catalog & offers·negotiation/bargain·cart/soft-hold·checkout/Paystack stub→webhook→PAID→escrow HELD·multi-seller gate·fulfilment accept/dispatch/decline + buyer decision·disputes/returns·payouts/settlements/commission·seller inventory/storefront/analytics·ads·chat·notifications/push·OPS console·bulk CSV), state:
   - What is covered by the unit/integration/invariant suites (cite the spec file).
   - What is **manual-only** (no test).
   - **Risk severity** (what breaks the money path vs cosmetic).
2. **Critical money-path scenarios** as executable test cases (existing integration tests already cover many — enumerate them and add the gaps):
   - Checkout → pay → webhook replay (3× same reference → exactly one PAID) → escrow HELD → release net payouts → ledger nets to 0.
   - Race conditions (2 buyers, 1 unit → one win, zero double-sell; expired soft-hold reconciliation).
   - Multi-seller gate per condition (≤2 sellers, same cluster, on_time_rate ≥ 0.95, capacity).
   - Commission math (rate snapshot at order time; FEE entry sign; seller payable = PAYMENT_IN + FEE).
   - Dispute/return refund off HELD escrow; clawback booking vs SELLER; payout balance math (clawbacks subtracted).
   - IDOR negatives (cross-owner access rejected on orders, offers, notifications, disputes, payouts, chat, wishlist).
   - KYC gating (offer creation blocked until APPROVED; payout blocked until FULL).
3. **E2E / UI gap plan** — propose the Playwright browser suite (buyer + seller + ops journeys), the flows for sprint 0-, the flake-discipline integration with the existing quarantine mechanism, and CI wiring.
4. **The exit-gate preconditions checklist** (map each to a test or a tracked gap):
   - 10/10 "Forbidden in Phase 1" items each with a failing-by-default automated test.
   - Redis-down fail-closed, load re-run at pilot scale (300 VUs), and the invariants suite green.
   - NDPR/consent, DPA, backup-PITR drill — these are process items; flag owner for each.
5. **Bug/defect triage proposal** — how defects are logged, severity definition (P0 money-path/security vs cosmetic), repro format, and where they live (GitHub issues as v2 requirement).

### B.2 Also produce (small, this sprint)
- **Manual test checklist** (smoke pack) the team can run against a local or staging stack in ~30 min per environment — reuse demo accounts (admin / 3 sellers / demo buyer).
- **"QA done before a surface ships" definition** consistent with the existing invariant-first discipline.

---

## 3. One-Week Suggested Plan (9–12 working days)

| Day | Focus |
|---|---|
| 1 | Onboarding read; run full API + web test suites locally; note green baseline |
| 2 | Exercise buyer journey + seller phases manually (demo accounts); log observations; build the coverage map start |
| 3 | Workstream B: write money-path test scenarios + gap list; propose Playwright plan |
| 4 | Workstream B: exit-gate precondition checklist + triage/QA-DoD definitions; review with lead |
| 5 | Workstream A: Kika Festive concept + positioning + journeys + scope draft |
| 6 | Workstream A: delivery mechanics (promos vs commission/escrow/history) + backend questions; KPI funnel |
| 7 | Workstream A: campaign risks + mitigation; festive test plan draft |
| 8–9 | Consolidate both workstreams into two documents; refine estimates |
| **Next sprint** | **Present both. Then we map work items onto the board with the lead engineer.** |

---

## 4. Definition of Done (this sprint's deliverable)

- **Kika Festive Feature Definition** (Workstream A) — concept, scope, journeys, delivery mechanics mapped to platform primitives, backend open-questions, KPIs, risks, phases, estimate, + a festive test plan.
- **QA Test Plan for landed features** (Workstream B) — coverage map, money-path scenarios, E2E/Playwright proposal, exit-gate precondition checklist, triage + DoD definitions, smoke checklist.
- Both presented at the next sprint for mapping into implementation.
- No production code unless approved; your artifacts live in `docs/`.

**Expectation setting:** you are both the quality gate and the product lens. When you present, you should be able to answer "what is proven, what is risky, and what should we build for Kika Festive and in what order."