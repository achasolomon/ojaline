# Kika — Frontend Developer Role Brief

**Role:** Frontend Developer
**Reports to:** Lead Engineer (Full-Stack)
**Mission this sprint:** Research and plan the next four front-end build surfaces so that at the **next sprint** you present a mapped, implementation-ready plan. You are **not** asked to build these yet — you are asked to produce an engineering plan we can schedule.

Your four surfaces, in rough priority order: **1) Full Admin Portal → 2) Mobile App (React Native) → 3) Logistics / Rider App → 4) Support System.**

> Read `00-KIKA-SYSTEM-ORIENTATION.md` first. It contains the runbook, demo accounts, and the web front-end architecture you must stay consistent with.

---

## 0. What You Inherit (web front-end today)

All in `apps/web/` (React 19 + TypeScript + Vite 6 + Tailwind v4 + react-router-dom 7):

- **Typed API client** — `src/lib/api.ts` (~1,900 lines): fetch wrappers, automatic Bearer injection, 401 handling, domain-grouped APIs, `mediaUrl()` helper.
- **State pattern** — no Redux/Zustand. Module-level store singletons with `subscribe*` listeners + localStorage persistence + **one shared SSE connection** (`lib/realtime.ts`) feeding cart, wishlist, negotiation, notifications, crowd stores.
- **Central routing** — all routes in `src/App.tsx`; mobile/desktop split via `useMediaQuery(≥1024px)` (separate component trees).
- **Design system** — `packages/design` tokens + primitives (Button, Card, Input, FormField, PriceDisplay); shared tokens are designed to also serve React Native (DS-1).
- **Existing patterns to reuse:** `OpsConsolePage.tsx` (seed for the admin portal), `SellerPortalLayout.tsx` (portal chrome/navigation pattern), `NotificationBell`, CSV export (`lib/csv.ts`), media picker (`MediaPicker`), the SSE store pattern.

**Your style bar:** match existing file structure, use the design package, keep store singletons consistent, keep `@ojaline/contracts` types (zod) as the single source of truth for API shapes. No new state-management library without a written justification.

---

## 1. Surface 1 — Full Admin Portal

**Current state:** only `/ops-console` (`OpsConsolePage.tsx`) — KYC queue, seller risk override, dispute mediation, platform stats, 20s polling. Backend has `Roles('OPS'|'AGENT')` guards and `/disputes/ops/*` + `POST /sellers/:id/approve|reject` + payout-approve endpoints. **There is no full admin surface.**

**What "full" means (hypothesis to validate):**
- **Operations:** the existing OPS console expanded (KYC review, risk tiers, dispute mediation) — already largely server-backed.
- **Finance/Compliance:** commission-rate management (`finance.commission_rates`), payout approval + settlement batches, refund/chargeback manual actions (append-only ledger — be careful what admin actions are even legal).
- **Content & Marketing:** banners (`marketing.banners`), ad moderation (ads are free in v1 — moderation + reporting queue), market-day scheduling.
- **Identity & Trust:** user lookup, role management, seller suspension / visibility penalties / `tos_violations` workflow, fraud-signal triage (`trust.fraud_signals`, `agent_actions` — schema only today).
- **Catalog moderation:** flagged offers, category management (`catalog.categories`, `grade_standards`).
- **Support queue** (ties into Surface 4): ticket triage + SLA dashboard.

**Deliverable this sprint (research pack):**
1. Page inventory + sitemap for the admin portal (routes under `/admin/*`).
2. Table of **API gaps** — which endpoints do NOT exist yet (e.g., list users, list/modify commission rates, banner CRUD, ad moderation queue, category CRUD, fraud-signal list). Name the module/table each maps to.
3. Authorization model: which role(s) for which page (OPS vs a new SUPER_ADMIN role?), consistent with the global `JwtAuthGuard`/`RolesGuard`.
4. New schemas needed (if any) vs. re-use of existing tables.
5. Phasing: (a) expand existing OPS console → (b) finance/content → (c) full admin. Success criteria per phase.
6. Open questions for the lead engineer (each tagged with who must answer).
7. Rough estimate (story points or days) per phase.

---

## 2. Surface 2 — Mobile App (React Native)

**Current state:** `apps/mobile/README.md` only — the planned stack is already decided:
> **React Native, Android-first · offline-first: MMKV + React Query persistence · offline cart queue with reconnect re-validation** (System Doc §15, Phase 1 in-scope).

Deferred from Sprint 0.1 (FE-2) because the native toolchain wasn't verified then.

**Scope of research this sprint (do NOT init the project with a library inside the repo — see the README rule: "use the framework CLI during the FE-2 ticket so generated native projects stay canonical"):**
1. **Build a feasibility spike OUTSIDE the repo**: verify the RN toolchain on your machine (Node ≥22, Android SDK/emulator). Document versions + known Windows gotchas. If the environment blocks you, say so explicitly — this is exactly the blocker the FE-2 deferral flagged.
2. **Screen map / user flows** to port from the web buyer journey: home, offers/filters, offer detail + bargaining, cart + checkout (Paystack), orders + fulfilment status, negotiation chat, crowd market, wishlist, notifications, seller storefront, account/addresses.
3. **Guiding architecture decisions** to validate:
   - Navigation library (recommend one and justify — e.g., expo-router vs react-navigation).
   - Expo vs bare RN — confirm against offline-first + Paystack SDK requirements.
   - MMKV + React Query persistence layout, offline cart queue with reconnect re-validation (this is a Kika differentiator — design it deliberately).
   - Realtime: the web app uses SSE (`/events/stream`). Confirm feasibility on RN (SSE works via fetch streams) or plan WS fallback (`/ws/market`).
   - Maps: web uses Leaflet — RN needs react-native-maps / MapLibre; check licensing + offline tiles for the market/ward picker.
   - Design tokens: `packages/design` must be imported into RN (verify metro/bundle compatibility and what to split out).
   - Push: VAPID web-push exists for web; RN needs FCM/APNs — note the server change (`POST /push/subscribe` payloads) and the gap.
4. **Auth on mobile**: JWT session reuse, biometrics optional, token refresh behavior consistent with `session.ts`.
5. **Phasing + effort**: core buyer MVP → offline flows → negotiation/chat → seller-lite. Success criteria per phase.
6. **Open questions** for backend/lead (e.g., pagination contracts already exist — reuse; webhook/return URLs on mobile).
7. Deliverable: a written **Mobile App Plan** (stack confirmation, screen map, APIs used, phasing, risks, estimates) presented next sprint.

---

## 3. Surface 3 — Logistics / Rider App

**Current state:** the **RIDER role exists** (seeded), and schema exists that is **unused by any code**: `fulfilment.rider_jobs` (status OFFERED/ACCEPTED/REJECTED/IN_TRANSIT/COMPLETED/FAILED), `delivery_attempts` (`pod_status`), `otp_verifications`, `weather_gates`, `capacity_slots`. **No rider API, no rider UI.** Delivery today is seller-run (accept / dispatch with tracking ref / buyer confirms) — the "how does it actually get to the buyer" leg is unbuilt.

**Scope of research this sprint (design + research, not build):**
1. **Rider job lifecycle design**: define the states and transitions required end-to-end — job offered → accepted/rejected → pickup → in-transit → delivered (PoD) → failed, including the OTP proof-of-delivery rule (**15-min TTL, buyer-initiated renewal only; rider-only renewal must be rejected** — this is a Phase 1 hardening requirement, see Sprint 6).
2. **API surface proposal** (for the lead engineer to approve): e.g., `GET /rider/jobs`, `POST /rider/jobs/:id/accept|reject|start|complete`, `POST /rider/jobs/:id/pod` (OTP verify). Map each to existing tables + `escrow.release` interaction (delivery-verified release gate currently: `POST /escrow/release`).
3. **Allocation/scoring requirements** (feeds future backend): weighted allocation scorer (0.7 performance / 0.3 exploration) — see Phase 1.5; note data already available in `seller_risk_tiers` / rider stats.
4. **Rider app design**: screen map (job feed, accept, route/navigation to market, pickup scan, delivery OTP/PoD screen, earnings), platform (React Native reuse from Surface 2 vs lightweight web/PWA — recommend one with justification), GPS/permissions, offline job queue.
5. **Operational constraints to flag**: insurance (per-delivery, Phase 1.5), contractor terms (legal, Phase 1.5), the deploy gate that rider count must not scale past pilot until Phase 1.5 items are live.
6. **Phasing + estimate + open questions** → present next sprint.

---

## 4. Surface 4 — Support System

**Current state:** minimal. Buyer/Seller `Help` pages (static FAQ-style), ToS endpoints, notifications feed, chat (in-app buyer↔seller). **No ticket system, no support inbox for ops, no SLA tracking.**

**Context you must honor (Phase 1 exit-gate requirement):**
> "Support SLA staffing roster confirmed (critical ≤ 2h, standard ≤ 24h) across in-app/SMS/USSD/WhatsApp channels." — Sprint & Phase Plan, Phase 1 Exit Gate.

**Scope of research this sprint:**
1. **Support channels inventory**: in-app (web, soon mobile), SMS/USSD (ATS mock exists), WhatsApp (external). Define which channels a ticket can originate from and how they converge into one queue.
2. **Ticket model proposal**: fields, status lifecycle (OPEN → TRIAGE → IN_PROGRESS → RESOLVED/ESCALATED/WON'T_FIX), priority + SLA counters (critical ≤ 2h, standard ≤ 24h), related entities (order_id, dispute_id, return id, seller/buyer), channel metadata. Whether this is a new `support` schema or reuses `orders.return_requests` / `escrow.disputes` — recommend and justify.
3. **Which existing surfaces feed support**: disputes/returns already have an OPS escalation path (`escrow.disputes`), ToS reporting has `trust.tos_violations`. Design how tickets link to these instead of duplicating them.
4. **Support agent portal plan** (ties into Surface 1 admin portal): ticket inbox, SLA dashboard, canned responses, escalation, notify buyer/seller via existing `NotifyService`.
5. **Buyer/seller UX plan**: "Help/Contact Support" entry points, ticket creation form, ticket detail + message thread (reuse chat proxy patterns if appropriate), status updates via notification feed + push.
6. **Knowledge base**: FAQ/help-center structure; decide content-source approach (static markdown vs CMS) for now.
7. **Phasing + estimate + open questions** → present next sprint.

---

## 5. One-Week Suggested Plan (9–12 working days of research)

| Day | Focus |
|---|---|
| 1 | Onboarding read (orientation + this brief + `App.tsx` + `lib/api.ts` skim); run the app locally; browser the seller + ops surfaces |
| 2 | Admin portal research; draft sitemap + API-gap table; review with lead engineer |
| 3–4 | RN feasibility spike (outside repo); verify toolchain; draft mobile plan |
| 5 | Mobile plan polish + open questions to backend |
| 6 | Logistics/schema deep-dive (`fulfilment` tables, ADR/architecture docs); draft rider lifecycle + API proposal |
| 7 | Rider app design + operational constraints |
| 8–9 | Support system research (channels, ticket model, existing disputes/TOS hooks); draft design |
| 10 | Consolidate the four research packs into one deck/doc; write the presentation; refine estimates |
| **Next sprint** | **Present. Then we map work items onto the board with the lead engineer.** |

---

## 6. Definition of Done (this sprint's deliverable)

- Four research packs (admin, mobile, logistics, support), each with:
  - Current-state summary · target-state scope · phasing · success criteria per phase · **API gaps mapped to modules/tables** · open questions (tagged) · estimate.
- A single written doc (or deck) you present at the next sprint.
- No production code committed unless explicitly approved (except conducive-for-review notes or your own spike scripts outside the repo).
- You can explain, end-to-end, how each surface reuses the existing API client, stores, design package, and authorization model.

**Rule of thumb:** if you're about to build a screen for one of these surfaces already, pause — you're planning, not building, this sprint. The plan is the deliverable.