# Kika — Team Onboarding & System Orientation

**Welcome to the team.** This document is the shared orientation for every member — full-stack, frontend, QA/business strategy, and any future hires. It tells you what Kika is, what already exists in the repo, and how we work.

> **Naming note:** The product is **Kika**. The codebase / GitHub monorepo is still named **ojaline** (legacy), and the in-UI storage keys already use the Kika brand (`kika_session`, `kika_cart`, `kika_wishlist`). When you read code or open PRs, expect "ojaline" — when we talk product, we say "Kika". We are mid-rebrand.

Last updated: 17 Sep 2026 · Owner: Lead Engineer / Full-Stack

---

## 1. The Product

Kika is an African local market platform, launched in Nigeria. Buyers shop from real market vendors — with negotiation/bargaining, wholesale + retail channels, market days, crowd sales, multi-seller carts, escrow payments, and dispute resolution. Sellers get a full vendor portal to run their store. The platform model targets Jumia / JiJi / Temu parity for the seller experience.

**Core trust pillars (non-negotiable):**
- **Two-phase stock reservation** — Redis soft-hold (TTL) → Postgres hard-reserve on payment (ADR-001). Proven at 300 concurrent users with 0 double-sells.
- **Split escrow** — buyer money is held until delivery, ledger is append-only, platform commission + net seller payout on release.
- **IDOR-free API** — every identity-bearing endpoint is guarded; caller identity comes from the JWT, never from the request body/query.
- **Multi-seller gate** — ≤ 2 sellers per order, same cluster, on-time rate ≥ 0.95 (or ops override).
- **Outbox eventing** — Postgres outbox + worker, not Kafka (ADR-008).

---

## 2. Architecture at a Glance

```
┌──────────────────────────  KIKA / ojaline monorepo  ──────────────────────────┐
│                                                                              │
│  apps/api        NestJS 11 modular monolith — HTTP (main.ts) + worker.ts     │
│  apps/web        React 19 + Vite 6 + Tailwind 4  (buyer + seller + ops)      │
│  apps/mobile     React Native — PLANNED ONLY (README)  → FE workstream       │
│  packages/contracts   zod API/event contracts → JSON Schema (CI drift check) │
│  packages/config      zod-validated runtime config                            │
│  packages/db          Flyway migrations V1–V44                                │
│  packages/design      design tokens + primitives (Button, Card, Input, ...)   │
│  dev/ats-mock          Africa's Talking SMS/USSD stub  (:9201)                │
│  dev/paystack-stub     Paystack payment stub          (:9202)                 │
│  dev/grafana           Prometheus dashboards                                   │
│  docs/                 ADRs 000–009, architecture, data model, sprint plans   │
└──────────────────────────────────────────────────────────────────────────────┘
```

One container image, two entrypoints (HTTP + worker). Modular monolith (ADR-005) — not microservices. Local Docker Compose is the dev environment; cloud (AWS) provisioning is deferred.

---

## 3. What Is Already Built (on the ground today)

### Backend — `apps/api` (24 modules)

| Area | Endpoints (key) | Notes |
|---|---|---|
| **Auth** | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, OAuth (Google/FB) | JWT (jose) + bcryptjs; roles BUYER, SELLER, RIDER, AGENT, OPS; global `JwtAuthGuard` + `RolesGuard` |
| **Catalog** | `GET /offers`, `GET /categories`, `POST /catalog/offers` (KYC-gated), `GET /catalog/offers/mine`, `PATCH/DELETE`, pause/reactivate/delist, `GET /catalog/sellers/:id/storefront` | channels RETAIL/WHOLESALE/OPEN, perishability, negotiation flag, price history |
| **Sellers** | `POST /sellers/register`, `POST /sellers/kyc`, `POST /sellers/:id/approve\reject`, `GET /sellers/me`, appearance | BASIC → FULL tier; KYC types NIN/BVN/Driver's Licence/Passport/Voters' Card |
| **Orders** | `POST /orders/checkout`, `POST /orders/confirm`, `POST /orders/:id/pay`, `GET /orders`, `GET /orders/:id`, POST `/orders/:id/pay` | cart → soft holds → checkout session → Paystack → PAID; buyer + seller-scoped listing (paginated) |
| **Fulfilment** | `POST /orders/:id/decide`, line `accept`/`dispatch`/`decline`, buyer `confirmDelivery` | state machine: PAID→ACCEPTED→DISPATCHED→DELIVERED; partial-fulfilment + decision deadline |
| **Escrow** | `POST /escrow/release` | ledger append-only (REVOKE UPDATE/DELETE), running-balance trigger, commission `FEE` entry, net `SELLER_PAYOUT`, clawbacks |
| **Payouts** | `GET /sellers/payouts/balance`, `ledger`, `requests`, `POST /request`, `POST /requests/:id/approve`, bank-account CRUD | approval creates `settlement_batches` (SUBMITTED) + `settlement_lines` |
| **Disputes/Returns** | buyer raise, seller accept/reject, escalate, OPS mediate; `GET/POST /disputes/ops/*` (KYC queue, risk tiers, platform stats) | return refund off HELD escrow; advisory locks |
| **Market engine** | `POST /wants`, bids, negotiations + messages, crowd sales | "Oya"/Pidgin haggling UX, frozen prices, walk-away callbacks |
| **Ads** | CRUD + `GET /ads/active`, report | TOAST / BANNER formats; **free in v1, no billing** (ADR-009) |
| **Chat** | conversations, messages, read-state, proxy numbers | in-app buyer↔seller chat with circumvention log |
| **Notifications** | feed, unread, mark-read; `POST /push/subscribe` (VAPID) | `NotifyService` feeds + push; role fan-out |
| **Content** | banners, market-day info | marketing content |
| **Realtime** | WS gateway `/ws/market`, SSE feed `/events/stream` | drives live stores on the web |
| **Media** | `POST /media` (base64), `GET /media/:key` | flat-file local storage today; object-storage presign deferred |
| **Supporting** | health, metrics (Prometheus), geo (states/LGAs/wards + OSM proxy), addresses, ToS, outbox worker | — |

### Database — Flyway V1–V44, 14 schemas

`pii` (identity), `catalog`, `orders`, `escrow`, `fulfilment`, `trust`, `audit`, `auth`, `market`, `marketing`, `finance`, `chat`, `users`, `app` (view layer). Key facts:

- Money path: `orders.order_lines (commission_cents, seller_payable_cents)` → `escrow.ledger_entries` (append-only, running-balance trigger) → `finance.settlement_batches` / `payout_requests`.
- Reservation: `catalog.offers.available_qty / reserved_qty / soft_held_qty` with CHECK `reserved+soft_held <= available`; Redis Lua scripts `acquire_soft / convert_soft_to_hard / release_soft`.
- Fulfilment tables exist but are **unused**: `fulfilment.rider_jobs`, `delivery_attempts`, `otp_verifications`, `weather_gates` — planned, not built.
- Dev/test environment uses a full 300-concurrent load-tested reservation gate.

### Web Frontend — `apps/web` (~45 pages)

- **Buyer:** Home, Offers (+filters), OfferDetail, Categories, MarketDays, SellerDetail/Storefront, Cart, Checkout, Orders, Wishlist, Negotiations, Chat, CrowdMarket, Notifications, Returns, Help, Account.
- **Seller Centre (`/seller/*`):** Dashboard, Orders (accept/dispatch/decline + CSV), Products (inventory CRUD + media + CSV), Payouts, Analytics (+CSV), Returns, Crowd, Ads (AdStudio), Storefront, Appearance, Account, Help.
- **Ops:** single `/ops-console` route — KYC queue, seller risk, dispute mediation, platform stats (20s auto-refresh). **This is a seed, not the full admin portal.**
- **Architecture notes:** no Redux/Zustand — module-level store singletons (`lib/cart.ts`, `lib/session.ts`, `lib/negotiation.ts`, …) with subscribe APIs + localStorage + one shared SSE connection (`lib/realtime.ts`). Typed API client in `lib/api.ts` with automatic Bearer injection + 401 handling. Tailwind v4 theming (`#22A34A` primary, Nunito font). Mobile/desktop breakpoint split via `useMediaQuery(≥1024px)`.

### Not started / deferred (your future work)

| Surface | Status today |
|---|---|
| **Full admin portal** | Only `/ops-console` route; no user/moderation/finance/content admin pages |
| **Support system** | Minimal — buyer/seller Help pages + ToS + notifications; no ticket system, no SLA tracking |
| **Mobile app (RN)** | `apps/mobile/README.md` only; deferred from Sprint 0.1 FE-2 |
| **Logistics / rider app** | RIDER role + `rider_jobs`/`delivery_attempts`/`otp_verifications` schema only — **no API, no UI** |

---

## 4. How to Run the System Locally

> Powershell. Root scripts are `pnpm` (root `package.json`).

```powershell
pnpm install                                 # workspace deps
Copy-Item .env.example .env                  # env defaults
docker compose up -d postgres redis minio    # core stack
pnpm db:migrate                              # Flyway migrations (V1–V44)
pnpm typecheck                               # all packages typecheck
```

Run services:

```powershell
pnpm --filter @ojaline/api dev               # API on :3000 (tsx watch)
pnpm --filter @ojaline/web dev               # Web on :5173, /api + /ws proxied to :3000
pnpm --filter @ojaline/api worker            # outbox dispatcher worker
```

Infra you may also need:

```powershell
docker compose up -d ats-mock paystack-stub  # SMS/USSD stub (:9201), Paystack stub (:9202)
docker compose run --rm flyway info          # migration status
```

### Demo accounts (seeded)

| Role | Credential |
|---|---|
| Admin | `admin@ojaline.com` / `Admin@1234` |
| Seller × 3 (Yaba/Surulere/Ikeja) | `Seller@1234` (IDs `a1000000…1..3`) |
| OPS reviewer | `f7f7f7f7-0000-4000-8000-000000000001` |
| Anonymous buyer | demo buyer id used when logged out (dev only, gated `ALLOW_DEMO_IDENTITY`) |

---

## 5. Test Command Reference

```powershell
pnpm lint                          # eslint root
pnpm lint:boundaries               # module-boundary lint (ADR-005)
# API tests (Vitest + Supertest, Postgres + Redis)
pnpm --filter @ojaline/api test
pnpm --filter @ojaline/api test:flaky    # quarantine suite (RUN_FLAKY=1)
# Web tests
pnpm --filter @ojaline/web test
pnpm --filter @ojaline/web run build
# Contracts schema drift check
pnpm generate:schemas   # regenerate JSON schemas; CI fails on drift
# k6 load leg (reservation gate proof)
pnpm load:reservation   # 300 VUs
```

**Test inventory today:** ~97 API integration tests green, 14 web unit tests, DB invariant suite (14), reservation-gate stress + fail-closed, k6 soak proven. Quarantine discipline: flaky tests go behind `flakyDescribe`/`flakyIt` and never block CI.

---

## 6. CI & Working Agreements

- **CI (`.github/workflows/ci.yml`):** lint → typecheck → contract validation (JSON-Schema drift) → integration (Postgres + Redis, Flyway migrate, API tests) → audit (`pnpm audit --audit-level high`). Renovate keeps deps patched.
- **Commit style:** conventional commits (`feat:`, `fix:`, …) with a concrete subject, matching history (see `git log`).
- **PRs:** every PR runs the pipeline; a deliberately-wrong event payload must fail the schema step.
- **Branching:** short-lived feature branches off `main`; you are being added as a collaborator to the GitHub repo.
- **Ownership discipline:** schema boundaries are enforced by `scripts/check-boundaries.mjs` — a module may not touch another schema outside its owning module. Keep it that way.
- **Do not commit secrets** — `.env` is gitignored; `.env.example` is the committed template.

---

## 7. Documentation Map (read these)

| Doc | What it is |
|---|---|
| `docs/ADR-000..009` | Decisions: stack, reservation gate, webhook idempotency, event versioning, PII isolation, modular monolith, agent_actions, USSD shape, outbox, ads |
| `docs/Ojaline_System_Architecture_v2.0.md` | Bounded contexts: Offer & Catalog, Cart-Order, Split-Escrow, Fulfilment, Trust |
| `docs/Ojaline_Data_Model_v1.0.md` | Schema + money-path + invariants |
| `docs/Ojaline_Sprint_Phase_Plan.md` | Roadmap v1.1 (Phases 0 → 1.5) |
| `docs/Seller_Platform_Plan.md` | Seller-side build record — **Phases 0–4 complete & verified** |
| `docs/Sprint_0.1_Task_Board.md` | Sprint record incl. Sprint 1 checkout end-to-end |

---

## 8. Where Your Role Fits (next-sprint focus)

Two workstreams are open for this team, both to be **researched/planned this sprint and presented next sprint**:

1. **Frontend developer** → read `01-FRONTEND-DEV-BRIEF.md`. Scope: Full Admin Portal, Mobile App (React Native), Logistics/Rider app, Support system. Produce a research pack per surface: scope, phasing, API gaps, success criteria, open questions.
2. **QA / Business Strategist** → read `02-QA-STRATEGIST-BRIEF.md`. Scope: define the **Kika Festive** campaign feature end-to-end, plus produce the test plan for everything that has landed (buyer journey + Seller Phases 0–4).

You both own a deliverable:** a plan presented at the next sprint for mapping into implementation. The full-stack lead owns the API/business layer and coordinates reviews.