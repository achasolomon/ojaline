# ADR-009 — Marketplace Advertising (Sellers → Popup Toasts + Homepage Banners)

**Status:** Proposed (Principal Architect decision — merge after Lead Engineer review)
**Date:** 08 September 2026

---

## Context

Sellers need a way to promote their stalls beyond organic product discovery. The marketplace already has the delivery vehicle for buyer-facing promotion: the `MarketActivityFeed` toast system (realtime, SSE/WS over Redis) and the homepage promo carousel. This ADR defines how market sellers create ads and how those ads surface to buyers, without introducing billing or an ad auction in v1.

## Decisions

**v1 scope (binding):**

1. **Formats:** two surfaces only — **popup toasts** (reuse `MarketActivityFeed` presentation, new `AD` kind) and **homepage banners** (dedicated `HomeAdBanner` slot on mobile `Home` + desktop `DesktopHome`).
2. **Publishing:** ads go live immediately on create (`status = 'ACTIVE'`). No OPS approval gate in v1. Buyers can **report** an ad; at 5 reports the ad is auto-removed. Ops can remove manually via the API (status `REMOVED`/`ENDED`).
3. **Billing:** **free** in v1. Budget is enforced by date range (`starts_at`/`ends_at`) + per-ad impression cap + a hard cap of **3 ACTIVE ads per seller**. No money moves; monetization is a later ADR.
4. **Targeting:** room-wide by default; optionally scoped by `cluster_id` (location), `category_id`, or `channel`. No buyer-profile targeting in v1.
5. **Surface cadence:** a visitor sees **at most one toast ad per session** (deduped client-side via `ad_id`); the homepage banner rotates one active banner per load. Impressions are counted server-side best-effort and are advisory (no billing).
6. **Lifecycle events** are first-class outbox events (`marketing.ad_published`, `marketing.ad_removed`) so the realtime feed can surface newly published ads to connected visitors and Ops tooling can observe removals (ADR-003/008).

## Data model

New `marketing` schema (V15 migration):

- `marketing.ads` — `id`, `seller_id`, `title`, `body`, `format ('TOAST'|'BANNER')`, `image_key`, `target_type ('OFFER'|'SELLER'|'NONE')`, `target_id`, optional targeting (`category_id`, `cluster_id`, `channel`), `status ('ACTIVE'|'PAUSED'|'ENDED'|'REMOVED')`, `starts_at`/`ends_at` (default now → +7d), `max_impressions`, `impressions_shown`, timestamps. Partial index on `(format, status)` where `status='ACTIVE'`.
- `marketing.ad_reports` — `id`, `ad_id`, `reporter_id` (nullable), `reason ('SPAM'|'MISLEADING'|'OFFENSIVE'|'OTHER')`, `created_at`, `UNIQUE (ad_id, reporter_id)`.

## API

Management endpoints (seller-scoped, resolved from the `seller_id` query param consistent with existing prototype controllers):

- `POST /ads` — create (validates format/target/window; enforces 3-active cap; publishes `marketing.ad_published`)
- `GET /ads` — list own ads
- `PATCH /ads/:id` — edit / pause / resume (status transitions restricted to `ACTIVE`/`PAUSED`)
- `DELETE /ads/:id` — soft delete → `ENDED`, publishes `marketing.ad_removed`

Public endpoints:

- `GET /ads/active?format=&cluster_id=&category_id=` — eligible ACTIVE ads (window + impression cap), optional filters, increments `impressions_shown`, caps response
- `POST /ads/:id/report` — rate-limited (1/ad/user), auto-`REMOVED` at 5 reports, publishes `marketing.ad_removed`

Supporting: `POST /media` — image upload (JSON base64 body; allowlisted mime types; size-capped) so ads can carry artwork. Storage reuses the flat `storage/` dir already served by `GET /media/:key`.

## Web (frontend, later slice)

- `lib/api.ts`: ad types + client methods (`listMyAds`, `createAd`, `updateAdStatus`, `deleteAd`, `getActiveAds`, `reportAd`) + localStorage `muteAd(adId)` / `seenToast(adId)`.
- New **Ad Studio** page (`/ads`, RequireAuth + seller) — create/list/pause/delete own ads.
- `MarketActivityFeed` — new `AD` toast kind (gold "Sponsored" styling); fetches `getActiveAds({format:'TOAST'})` once per session and renders one, deduped by `ad_id`; realtime `marketing.ad_published` pushes live ads to connected visitors; dismiss stores seen; menu offers "Report ad".
- New `HomeAdBanner` rendered on mobile `Home` + `DesktopHome`, fed by `GET /ads/active?format=BANNER`.

## Alternatives considered

1. **Ad auction / paid placement** — rejected for v1; no billing infra or demand calibration yet.
2. **OPS pre-approval queue** — rejected; slow path adds friction for a moderate-risk surface. Report + auto-remove keeps the blast radius small.
3. **Multipart media upload** — rejected for v1; JSON base64 avoids a new dependency while the prototype is single-process and storage stays flat.
4. **Push ads over SSE only** — rejected; served `GET /ads/active` is the source of truth so ads reach every visitor, not just those connected at publish time. Realtime adds immediacy, not correctness.

## Consequences

- Ads are content-addressed via outbox events; any future budget/auction needs a new event schema version or new event types (ADR-003).
- Impression counts are best-effort and must never gate money in v1 (no billing).
- The 3-active cap is a product guardrail, not an exploit-proof mechanism; enforcing it transactionally (row lock per seller) prevents races.

## Acceptance

- Migration V15 applies cleanly; contracts include the two `marketing.*` events with generated JSON schemas.
- Ads service integration spec covers: create + cap, eligibility (window/status/impressions), filters, ownership on PATCH/DELETE, report rate-limit + auto-remove.
- `pnpm --filter @ojaline/contracts check`, API `typecheck`/`build`, and web `typecheck` pass.