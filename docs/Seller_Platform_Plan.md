# OJALINE — Seller Platform Plan
### Derived from System Architecture v2.0, Data Model v1.0, and Buyer Platform implementation (Approved)
**Status:** Phase 3 complete (verified) — Phase 4 next
**Date:** 14 Sep 2026

---

## Purpose

This document captures the gap analysis and phased build plan for the seller-side platform. The buyer journey (#1–#8: checkout hookup, delivery fees, order detail, cancellation/refunds, gated reviews, push notifications, wishlist, channel enforcement) is complete and committed (`a48475c`). Phase 3 (sellers payouts end-to-end) is complete and verified — see git log for the Phase 3 commit. The seller operating surface — enabling sellers to manage offers, fulfil orders, receive payouts, and grow their business — continues with Phase 4 next.

The target parity level is Jumia / JiJi / Temu: a full seller center with onboarding, catalogue management, order operations, money/payouts, trust/safety, analytics, and an OPS admin console.

---

## Verified Foundation (code-inspected)

The schema and money path were ADR-designed from day one. The following were verified by direct inspection of migration files, service code, and the live DB.

### Schema (high-grade, most primitives already exist)

| Primitive | Table / Column | Status |
|---|---|---|
| Per-line seller identity | `orders.order_lines.seller_id` | ✅ Exists |
| Offer lifecycle | `catalog.offers.status` — `ACTIVE`, `PAUSED`, `DELISTED` | ✅ Exists |
| Offer stock | `available_qty`, `reserved_qty`, `soft_held_qty` with CHECK invariant | ✅ Exists |
| Offer media | `catalog.offer_media` — `storage_key`, `tiers` JSONB, `is_primary` | ✅ Exists |
| Offer price history | `catalog.offer_price_history` — immutable audit | ✅ Exists |
| Escrow ledger | `escrow.ledger_entries` — `sequence_no`, `running_balance_cents` trigger, `idempotency_key` UNIQUE | ✅ Exists |
| Ledger entry types | `PAYMENT_IN`, `FEE`, `DELIVERY_RELEASE`, `PARTIAL_RELEASE`, `REFUND`, `PAYOUT`, `MANUAL_ADJUSTMENT` | ✅ Exists |
| Settlement batches | `escrow.settlement_batches` — `DRAFT`/`SUBMITTED`/`CONFIRMED`/`PARTIAL`/`FAILED` | ✅ Exists |
| Disputes | `escrow`-area disputes — `OPEN`/`RESOLVED_BUYER`/`RESOLVED_SELLER`/`RESOLVED_PARTIAL`/`DISMISSED` | ✅ Exists |
| Rider shipments + POD | `delivery` area — `OFFERED`/`ACCEPTED`/`REJECTED`/`IN_TRANSIT`/`COMPLETED`/`FAILED`; `pod_status` | ✅ Exists |
| Seller KYC | `pii.seller_kyc` — `PENDING`/`APPROVED`/`REJECTED`; unique `(id_type, id_number)` | ✅ Exists |
| Seller tiers | `catalog.seller_profiles.kyc_tier` — `BASIC`/`FULL` | ✅ Exists |
| Seller risk | `trust.seller_risk_tiers` — `on_time_rate_30d`, `dispute_rate_30d`, `qa_rate`, `ops_override` | ✅ Exists |
| Seller penalties | `catalog.seller_profiles.visibility_penalty`, `tos_warning_count` | ✅ Exists |
| TOS violations | `trust.tos_violations` | ✅ Exists |
| User roles | `pii.user_roles` + `pii.roles` (BUYER, SELLER, RIDER, AGENT, OPS seeded in V2) | ✅ Exists |
| Notifications | Push subscriptions, push notification entries, feed service | ✅ Exists |

### Backend (what works today)

| Surface | Endpoints | Notes |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/register`, `GET /auth/me`, OAuth | Token-based (jose JWT); `AuthUser` carries `seller_type`, `channel`, `roles` |
| Sellers | `GET /sellers/me`, `POST /sellers/register`, `POST /sellers/kyc`, `POST /sellers/:id/approve`, `POST /sellers/:id/reject` | BASIC → FULL tier; OPS approve/reject with role check |
| Catalogue | `GET /catalog/offers` (discover, paginated), `POST /catalog/offers`, `PATCH /catalog/offers/:id/price`, CRUD endpoints | Buyer-side discovery; seller can create and update price |
| Orders | `GET /orders?buyer_id=`, `POST /orders/checkout`, `POST /orders/:id/pay`, `POST /orders/:id/deliver`, `POST /orders/:id/cancel` | **buyer-only list** (see gaps below) |
| Fulfilment | `POST /orders/:id/decide`, `GET /orders/:id/fulfilment` | Buyer decision path; multi-seller partial-fulfilment state machine |
| Escrow | `POST /escrow/release` (ops/scheduled) | Silent 24h release; seller payout ledger entry |
| Notifications | `GET /notifications`, `GET /notifications/unread`, `POST /notifications/mark-read`, push wiring | Buyer notifications on order events |
| Ads | Full CRUD, placement engine | Seller ad campaigns |

### Key design decisions already baked in

- **Escrow is the money backbone**: payment → `HELD` → release → `RELEASED`; ledger is append-only with running balance trigger; idempotency keys on every write.
- **Multi-seller gate**: ≤2 sellers, same cluster, on_time_rate ≥ 0.95 (or ops_override), capacity check.
- **Two-phase holds**: soft hold (TTL 480s) → hard reserve on payment.
- **Channel enforcement**: buyer-channel must match offer-channel (OPEN bypasses).
- **DB-level invariants**: `reserved_qty + soft_held_qty <= available_qty`; ledger `REVOKE UPDATE, DELETE`.

---

## Platform Integrity Gaps (blockers for high-grade)

These must be fixed before (or as the first part of) the seller build. They are not seller-specific; they are platform-wide.

### Gap 1 — No authorization guards (IDOR vulnerability)

Every controller endpoint trusts a client-supplied identity via query param or request body. There are zero NestJS guards in the codebase (confirmed: `UseGuards` grep returns zero auth-related hits). Any caller can read/write any user's orders, wishlist, reviews, or addresses by passing a different `user_id`/`buyer_id`.

**Evidence (file:line):**
- `orders.controller.ts:37` — `list(@Query('buyer_id') buyerId: string)` — no check that token == buyerId
- `catalog.controller.ts:161` — `addToWishlist(@Body body: { user_id: string; offer_id: string })` — user_id from body, not token
- `fulfilment.controller.ts:25` — `buyerDecision(@Param id, @Body body)` — no check caller is the buyer
- `notifications.controller.ts` — `user_id` from query param
- `sellers.controller.ts:12-16` — manual `requireUser` repeated per endpoint (5 times), but no guard or role enforcement on most catalog/order endpoints

**Impact:** In a Jumia/Temu platform, this would be a P0 security bug. Seller money actions (payout requests, fulfilment) cannot be built without trusted identity.

**Fix:** Global `JwtAuthGuard` + `RolesGuard`, `@CurrentUser()` decorator (from `AuthService.verifyToken`), ownership enforcement at service boundary. Demo-mode fallback gated behind `ALLOW_DEMO_IDENTITY=true` env var (default true in dev, false in prod).

### Gap 2 — No platform commission in the money path

The escrow ledger has a `FEE` entry type and a `MANUAL_ADJUSTMENT` type, but the production money path never writes one. On escrow release, `escrow-release.service.ts:61` writes `SELLER_PAYOUT` for the **full held amount** — the platform takes zero commission.

**Evidence (file:line):**
- `orders.service.ts:377-386` — `PAYMENT_IN` = `landed_total_cents` (full buyer payment into escrow)
- `escrow-release.service.ts:59-63` — `SELLER_PAYOUT` = full `amount_held_cents` (no deduction)
- `db.invariants.spec.ts:172` — test inserts a `FEE` entry, confirming the pattern is designed but unused

**Latent bug:** `escrow-release.service.ts:61` inserts `entry_type = 'SELLER_PAYOUT'`, but the live DB CHECK constraint on `escrow.ledger_entries.entry_type` **only allows** `('PAYMENT_IN','FEE','DELIVERY_RELEASE','PARTIAL_RELEASE','REFUND','PAYOUT','MANUAL_ADJUSTMENT')`. No migration ever relaxed this constraint. Any actual escrow release would **fail with a constraint violation**. Verified live: `pg_get_constraintdef` confirms the restrictive list.

**Fix:** Migration V30 adds `SELLER_PAYOUT` to the constraint; adds `commission_cents` / `seller_payable_cents` to `order_lines`; writes `FEE` ledger entries at payment confirm; releases net (held − fees − refunds) to seller.

### Gap 3 — No pagination on seller order lists

`listOrders` (`orders.service.ts:612`) returns all orders for a buyer with no `LIMIT`/`OFFSET`. The discover-offers endpoint has pagination, but order listing does not. This would not scale on a real platform.

**Fix:** Add cursor-based or offset pagination to all list endpoints (orders, future seller orders, notifications, ledger history).

---

## Target Seller Platform — 4 Domains

### Domain 1 — Onboarding & Identity (largely done; needs hardening)

**What exists:** BASIC registration (`POST /sellers/register`), FULL-tier KYC (`POST /sellers/kyc`), OPS approve/reject (`POST /sellers/:id/approve|reject`), TOS enforcement (`/tos` endpoints). CreateOffer page bundles the onboarding UX inline.

**What's needed:**
- Document upload via MinIO (media controller is base64 today; `offer_media.storage_key` already models object storage)
- Bank account + payout method capture during onboarding (gated on FULL KYC)
- Agreement/TOS versioning + acceptance log
- OPS review queue endpoint (list PENDING submissions with pagination)
- Demo OPS user seed (roles exist in V2, no OPS user in V13)

### Domain 2 — Catalogue & Storefront (create exists; management + storefront needed)

**What exists:** `POST /catalog/offers` (create), `PATCH /catalog/offers/:id/price` (price edit), offer price history, offer status ACTIVE/PAUSED/DELISTED, media gallery schema, `GET /catalog/sellers/:id` (public seller profile), `GET /catalog/sellers/top`, reviews on offers.

**What's needed:**
- Owner-scoped `PATCH /catalog/offers/:id` (edit name, qty, channel, fulfilment modes, perishability, category — not just price)
- Pause / delist / reactivate actions
- Low-stock alerts (threshold per seller configurable)
- `GET /catalog/offers/mine` (seller inventory list with status + stock + sales stats)
- Media upload via object storage (replace base64 with MinIO presigned upload or direct upload)
- **Buyer-facing storefront page** (`/seller/:id`): seller profile, aggregated rating/reviews, badges (verified, on-time), product grid, `visibility_penalty` applied in `discoverOffers` ranking
- Seller-level rating (aggregate over `catalog.reviews` or explicit `seller_reviews` table)

### Domain 3 — Orders & Fulfilment (the critical gap; seller action path needed)

**What exists:** Checkout → payment → PAID → buyer confirms delivery → escrow releases silently. Fulfilment state machine handles buyer decisions (CONTINUE/CANCEL/REPLACE_SELLER). `order_lines` have per-line status: `PAID`, `DISPATCHED`, `DELIVERED`, `CANCELLED`, `REFUNDED`, `FAILED`.

**What's needed:**
- `GET /orders?seller_id=&status=` — seller-scoped order list with pagination, search, date range
- `GET /orders/:id` — returns buyer-side view with shipping context (or seller-side view with buyer name/address)
- **Seller fulfilment action path** (extends the existing state machine):
  1. `POST /orders/:id/lines/:line_id/accept` — seller confirms the line is in stock and committed
  2. `POST /orders/:id/lines/:line_id/dispatch` — seller marks dispatched (optional tracking ref); transitions line to `DISPATCHED`, notifies buyer
  3. `POST /orders/:id/lines/:line_id/decline` — out-of-stock; calls `recordLineFailure` (already exists); triggers buyer decision flow
  4. `POST /orders/:id/deliver` — buyer confirms receipt (already exists)
  5. Escrow release after delivery confirm + 24h dispute window
- Seller notifications: new paid order, line declined by buyer, decision result, review received

### Domain 4 — Money & Payouts (ledger exists; full flow needed)

**What exists:** Escrow ledger with `PAYMENT_IN`, `SELLER_PAYOUT` (buggy), `FEE` (unused), `REFUND`, `PARTIAL_RELEASE`, `DELIVERY_RELEASE`, `MANUAL_ADJUSTMENT`. Running balance trigger. Settlement batches table (unused). No payouts API. PayoutsPage is a zero-state.

**What's needed:**
- **Commission model:**
  - `finance.commission_rates` — `channel`, `category_id` (nullable for flat), `percent_bps`, `flat_cents`, `effective_from`/`to`
  - At checkout: snapshot per-line commission (`order_lines.commission_cents`) using the rate effective at order time
  - At payment confirm: write `FEE` ledger entries per line (negative amount, counterparty `PLATFORM`)
  - At release: write `SELLER_PAYOUT` = held − fees − refunds (net, not gross)
  - `order_lines` gets `commission_cents BIGINT NOT NULL DEFAULT 0` and `seller_payable_cents BIGINT NOT NULL`
- **Payout methods:**
  - `finance.seller_bank_accounts` — `user_id`, `bank_code`, `account_number`, `account_name`, `is_primary`
  - Captured at onboarding (KYC FULL gate)
- **Balance & withdrawals:**
  - `GET /sellers/payouts/balance` — available = Σ(SELLER_PAYOUT) − Σ(withdrawn); on-hold = unreleased escrow
  - `GET /sellers/payouts` — ledger history (filtered by seller, paginated, cursor-based)
  - `POST /sellers/payouts/request` — FULL-tier gate; creates `finance.payout_requests` row
  - `POST /sellers/payouts/:id/approve` — OPS action; populates `settlement_batches` (table exists, unused)
  - Ledger `reference` column populated with bank transfer ref on settlement
- **Reconciliation:** daily batch settlement job; reconcile `ledger_entries` vs `settlement_batches` vs bank debits

### Cross-cutting: Returns, Disputes, Trust & OPS Console

**What exists:** Dispute table with statuses, refund ledger paths (`REFUND`, `PARTIAL_RELEASE`), seller risk tiers, `tos_violations`, `visibility_penalty`, `tos_warning_count`, agent/fraud signal tables.

**What's needed:**
- Return/dispute flow: buyer raises → seller respond (accept/reject with reason) → OPS mediate if disputed
- `finance.payout_requests` table for withdrawal tracking
- OPS console: KYC review queue (list PENDING `seller_kyc` + approve/reject), risk actions (suspend, visibility_penalty, tos_warning), dispute mediation, payout approval
- Seller health dashboard: on-time rate, cancellation rate, dispute rate, avg response time
- Seller analytics: revenue, orders, product performance (views, favourites, conversion, ratings)

---

## Phased Roadmap

### Phase 0 — Trust & Money Foundation

**Goal:** Kill IDOR, add commission model, fix the SELLER_PAYOUT bug. Everything seller-facing depends on this.

| Sub-phase | Deliverable | Files |
|---|---|---|
| 0.1 | `JwtAuthGuard` + `@CurrentUser()` decorator using `AuthService.verifyToken` | `apps/api/src/modules/auth/guards/` (new), `decorators/` (new) |
| 0.2 | `RolesGuard` + `@Roles(...)` decorator; role check on OPS endpoints | Same as above |
| 0.3 | Migration V30: add `SELLER_PAYOUT` to ledger CHECK; add `commission_cents`/`seller_payable_cents` to `order_lines`; `finance.commission_rates` table; `finance.seller_bank_accounts` table; `finance.payout_requests` table | `packages/db/migrations/V30__platform_economics.sql` |
| 0.4 | Commission logic: snapshot rate at checkout, write `FEE` at payment, release net at escrow release | `apps/api/src/modules/orders/orders.service.ts`, `apps/api/src/modules/escrow/escrow-release.service.ts` |
| 0.5 | Apply guards to orders, catalog, sellers, notifications, fulfilment, addresses controllers | All controllers |
| 0.6 | Identity resolution: `resolveActor(headers)` helper; demo fallback via `ALLOW_DEMO_IDENTITY` env | `apps/api/src/modules/auth/` |
| 0.7 | Guard unit tests + commission + ledger invariant tests | `apps/api/src/modules/auth/*.spec.ts`, `apps/api/src/modules/orders/orders.service.spec.ts` |

**Implementation notes (all verified 14 Sep 2026):**
- Global `APP_GUARD` = `JwtAuthGuard` (optional-auth: attaches `request.user` when a bearer token is present, anonymous callers stay allowed) + `RolesGuard`. Per-controller `@UseGuards(JwtAuthGuard)` removed as redundant. Invalid tokens **fail closed** (401) — a bogus token must not silently downgrade to anonymous, or it would defeat `assertOwnedOrAnon`.
- IDOR closed by `assertOwnedOrAnon(user, suppliedId, label)` on every identity-bearing handler: notifications, market (wants/negotiations), addresses, tos, chat, push, orders, wishlist, reviews, products. `sellers` controller converted from manual header parsing to `@AuthRequired() + @CurrentUser()`.
- `orders.confirmPayment(input, actor)` now verifies the caller is the buyer (or OPS/AGENT).
- `apps/web/src/lib/api.ts` auto-attaches `Authorization: Bearer` from `getToken()` to every request; `activeBuyerId()` already resolves to the logged-in user id so ownership checks pass for real accounts while the demo fallback keeps the guest marketplace working.
- **V31** (`packages/db/migrations/V31__offer_category_id.sql`) added: `catalog.offers.category_id` (referenced by checkout commission resolution but missing from the schema).
- Integration spec (`orders-commission.spec.ts`) — full money path against live DB — caught **two real bugs now fixed**:
  1. `commission_rates.flat_cents` is `BIGINT` → pg returns a string → `500 + "0"` = `"5000"` (string concat), turning the seller payable to 0. Now coerced with `Number()`.
  2. `escrow-release.service.ts` wrote `SELLER_PAYOUT` as a **positive** signed amount → closed-escrow balance went to `2× gross`, never 0. Now written as `-payableCents` so the ledger nets to exactly 0.

| Sub-phase | Deliverable | Files |
|---|---|---|
| 0.8 | Guard unit tests (`jwt-auth.guard.spec.ts` 4, `roles.guard.spec.ts` 9) | `apps/api/src/modules/auth/*.spec.ts` |

**Acceptance Criteria (verified 14 Sep 2026):**
- All existing buyer tests pass — full api suite: **65 passed / 6 skipped** (quarantine-only)
- `tsc --noEmit` clean (api + web); `eslint apps/api/src` 0 errors
- Commission = 0 at baseline (no rates seeded); FEE ledger entry only when total > 0
- With commission rate seeded: FEE ledger entry = negative amount; SELLER_PAYOUT = PAYMENT_IN + FEE (ledger nets to 0)
- Guard rejects unauthenticated `@AuthRequired` request with 401
- Guard rejects wrong-role request on seller endpoints with 403
- SELLER_PAYOUT constraint violation no longer possible (constraint updated in V30)

### Phase 1 — Seller Orders & Fulfilment

**Goal:** Seller can see their orders, accept/decline lines, dispatch, and trigger the refund/replace flow.

| Deliverable | Files |
|---|---|
| `GET /orders?seller_id=&status=&page=&limit=` | `orders.controller.ts`, `orders.service.ts` |
| `GET /orders/:id` seller-scoped view | Same |
| `POST /orders/:id/lines/:line_id/accept` | `fulfilment.controller.ts`, `fulfilment-state-machine.ts` (extend) |
| `POST /orders/:id/lines/:line_id/dispatch` (w/ tracking ref) | Same |
| `POST /orders/:id/lines/:line_id/decline` (out-of-stock) | Same (calls `recordLineFailure`) |
| Seller notifications (new paid order, decline, dispatch) | `orders.service.ts`, `feed.service.ts`, `push.service.ts` |
| Web: seller order list (OrdersPage role toggle or /seller/orders) | `apps/web/src/pages/OrdersPage.tsx` or new `SellerOrdersPage.tsx` |
| Web: seller line actions UI (accept, dispatch, decline) | Same |
| Integration spec: seller list, accept, dispatch, decline → buyer confirm → release | `apps/api/src/modules/orders/orders.service.spec.ts`, `fulfilment/*.spec.ts` |

**Acceptance Criteria:**
- Seller list returns only their lines (ownership enforced by guard + query)
- Accept transitions line PAID → ACCEPTED (new status, or reuse existing)
- Dispatch transitions line → DISPATCHED, pushes buyer notification
- Decline triggers `recordLineFailure` + buyer notification + decision flow
- Buyer confirmDelivery → escrow releases net (with commission deducted)

**Phase 1 verified (all criteria met):**
- Migrations **V32** (`ACCEPTED` status + `accepted_at`/`dispatched_at`/`tracking_ref`/`decline_reason` on `order_lines` + seller/status index) and **V33/V34** (fixed a latent Phase 0 bug: `stock_holds.paystack_reference` was globally UNIQUE, so multi-line PAYMENT confirm threw on the second hold; now a plain status-gated index — replay protection lives in `charges` + the webhook's status-gated conversion).
- State machine gains `acceptLine` (PAID → ACCEPTED), `dispatchLine` (→ DISPATCHED + tracking, order rolls PAID → PARTIALLY_DISPATCHED/DISPATCHED), `declineLine` (→ CANCELLED + `decline_reason`, order → PARTIALLY_DISPATCHED + 24h `decision_deadline_at`, stock hold released + `reserved_qty` freed). All enforce seller ownership (or OPS/AGENT) inside the transaction.
- `GET /orders?seller_id=&status=&line_status=&limit=&offset=` returns `{ orders, total, limit, offset }` with only the seller's lines + `buyer_name`; `GET /orders/:id` now narrows a non-buyer seller's view to their own lines (cross-seller leak closed).
- Payment confirm notifies every seller with a line on the order (`New paid order`); accept/dispatch/decline notify the buyer (controller).
- `confirmDelivery` now accepts `PARTIALLY_DISPATCHED`/`DISPATCHED` (a seller could otherwise never confirm a dispatched order).
- Web: `SellerOrdersPage.tsx` at `/seller/orders` (RequireAuth) with line-level Accept / Dispatch (tracking ref prompt) / Decline (reason prompt) and filter chips; linked from Account for sellers.
- Integration spec `fulfilment-seller.spec.ts` (2 tests): happy path (list → accept → dispatch → buyer confirm → escrow closes at 0, seller notification) + decline path (line CANCELLED, deadline armed, sibling seller still actionable). Auth negatives covered (other seller / anonymous rejected).
- Full API suite: **67 passed / 6 skipped**; `tsc --noEmit` (api + web) clean; root eslint 0 new errors; contracts `check` passes.

### Phase 2 — Catalogue Management & Storefront

**Goal:** Seller owns their offers; buyer sees a store page with rating/badges.

| Deliverable | Files |
|---|---|
| `GET /catalog/offers/mine` (paginated) | `catalog.controller.ts`, `catalog.service.ts` |
| `PATCH /catalog/offers/:id` (edit name, qty, channel, fulfilment, category) | Same |
| `POST /catalog/offers/:id/pause`, `POST /catalog/offers/:id/reactivate`, `POST /catalog/offers/:id/delist` | Same |
| Offer media attach/detach (reuses existing base64 `POST /media`; `addOfferMedia`/`removeOfferMedia` owner-guarded, primary handling) | `catalog.controller.ts`, `catalog.service.ts` |
| `GET /catalog/sellers/:id/storefront` (profile + offers + aggregated rating) | `catalog.controller.ts`, `catalog.service.ts` |
| Seller-level rating aggregate (avg product rating or explicit table) | `catalog.service.ts` (new method) |
| Web: `/seller` hub page (Overview, Offers, Orders, Payouts tabs) | New `SellerDashboard.tsx` |
| Web: seller-mode nav in BottomNav / DesktopHeader when `user.seller_type` set | `BottomNav.tsx`, `DesktopHeader.tsx` |
| `visibility_penalty` applied in `discoverOffers` ranking | `catalog.service.ts` |
| Integration spec: CRUD + pause/delist, storefront returns correct data | `catalog.service.spec.ts` |

**Acceptance Criteria:**
- Seller can edit, pause, delist, reactivate own offers
- Paused/delisted offers excluded from `discoverOffers` (or penalised)
- Storefront returns aggregated rating, verified badge, product grid
- Media upload via object storage works end-to-end

**Phase 2 verified (all criteria met, 14 Sep 2026):**
- New endpoints: `GET /catalog/offers/mine`, `PATCH /catalog/offers/:id` (name, unit, physical ref, qty, min order, channel, perishability, fulfilment modes, price → `offer_price_history` on change, `FOR UPDATE OF o` + row-lock owner check), `POST /catalog/offers/:id/{pause,reactivate,delist}` (ACTIVE→PAUSED→ACTIVE, DELIST terminal), `GET /catalog/sellers/:id/storefront`, `POST /catalog/offers/:id/media`, `DELETE /catalog/offers/:id/media/:media_id` (`storage_key` regex `/^[0-9a-zA-Z.-]{8,100}\.(jpg|jpeg|png|webp|gif)$/i`).
- `discoverOffers` ORDER BY `sp.visibility_penalty ASC`; ACTIVE-only filter already excludes paused/delisted.
- `getSellerById`/storefront return `business_name`, `kyc_tier`, `verified` (FULL).
- Web: `SellerInventoryPage` (`/seller/products`) — status/search filters, price/stock/sold stats, edit modal, pause/reactivate/delist, media attach; store link in `Account.tsx`; verified badge on `SellerDetail.tsx`.
- Integration spec `catalog-seller.spec.ts` (8 tests) green; full API suite 75 passed / 6 skipped. Media acceptance fulfilled via base64 `POST /media` → object storage + `addOfferMedia` attach (MinIO presign deferred).
- Web: `tsc --noEmit`, vitest (14), eslint clean.

### Phase 3 — Payouts End-to-End ✅ (complete, verified)

**Goal:** Seller sees balance, requests withdrawal, OPS approves, settlement batch is created.

**Delivered:**
- `GET /sellers/payouts/balance`, `GET /sellers/payouts/ledger`, `GET /sellers/payouts/requests`, `POST /sellers/payouts/request`, `POST /sellers/payouts/requests/:id/approve` (OPS), bank account CRUD (`GET/POST /sellers/payouts/bank-accounts`, `PATCH .../:id/primary`, `DELETE .../:id`) — all in `sellers.controller.ts` / `sellers.service.ts`.
- Approve creates `escrow.settlement_batches` (SUBMITTED) + links un-settled `SELLER_PAYOUT` ledger entries via `escrow.settlement_lines` — **not** by writing `reference` on the ledger, since `escrow.ledger_entries` is append-only (REVOKE UPDATE/DELETE in V1 + V16).
- Web: `PayoutsPage.tsx` wired (balance card, withdraw form, bank-account manager, request history, release ledger). Client fns in `apps/web/src/lib/api.ts`.
- Integration spec `sellers-payouts.spec.ts`: balance/on-hold, FULL-tier gate, pending reservation, balance ceiling, OPS approve → batch + settlement_lines, ownership-filtered request list.

**Acceptance Criteria (all met):**
- Balance = Σ(SELLER_PAYOUT) − Σ(approved withdrawals) ✓
- Payout request blocked if tier ≠ FULL ✓
- Settlement batch row created on OPS approve ✓
- Released entries linked to batch via `settlement_lines` (append-only ledger respected) ✓

### Phase 4 — Returns, Disputes, OPS Console & Analytics

**Goal:** Full loop closed: disputes, risk, admin console, analytics.

| Deliverable | Files |
|---|---|
| Return/dispute flow: buyer raises → seller respond → OPS mediate | `fulfilment-state-machine.ts` (extend), new `disputes.controller.ts` |
| `finance.payout_requests` (status tracking) | Already in V30; wire approve/settle |
| OPS console: KYC queue, risk actions, dispute mediation | New `admin.controller.ts` or extend `sellers.controller.ts` |
| Seller health dashboard (on-time, cancellation, dispute rates) | `sellers.service.ts`, new `analytics.service.ts` |
| Seller analytics (revenue, orders, product performance) | Same |
| Notification wiring: new order, dispatch, dispute, payout | `feed.service.ts`, `push.service.ts` |

**Acceptance Criteria:**
- Return request triggers seller notification + response window
- Seller accept/reject → buyer notification + refund or continuation
- Dispute escalation → OPS mediate → resolution recorded
- OPS console lists PENDING KYC, approves/rejects, records note
- Risk tier auto-adjustment based on on-time/cancellation/dispute rates

---

## Dependency Chain

```
Phase 0 (Trust & Money Foundation)
   └─▶ Phase 1 (Seller Orders & Fulfilment)
        ├─▶ Phase 2 (Catalogue & Storefront)
        └─▶ Phase 3 (Payouts End-to-End)
             └─▶ Phase 4 (Disputes, OPS Console, Analytics)
```

Phase 0 is the hard gate. All subsequent phases depend on trusted identity and correct money math.

---

## Out of Scope (deferred)

- **Farmer USSD/SMS path** (ADR-007 — separate thin service, Phase 1 in sprint plan)
- **Rider dispatch** (bid allocation, PoD — separate from seller fulfilment)
- **Bulk CSV upload** (seller inventory mass-import — Phase 4+ / future sprint)
- **Seller mobile app** (React Native — separate build surface)
- **Production cloud provisioning** (AWS deferred per ADR-000)
- **Payment method integration beyond Paystack** (card, USSD, bank transfer — deferred)
