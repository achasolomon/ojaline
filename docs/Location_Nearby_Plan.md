# Location-Smart / Nearby Plan

Goal: make the platform location-first. Every market belongs to a ward; wards and
markets carry coordinates; products are suggested nearest-first using the user's
location — signed-in or anonymous — and the same point math later powers
logistics routing and delivery tracking for agents.

## Current state (verified)

- `catalog.wards`: 8,809 wards, each with `latitude` / `longitude` (V43, from
  `data/wards.json`). Served by `GET /catalog/locations/wards`.
- `catalog.clusters`: market areas with a PostGIS `centroid` point; offers bind
  to `cluster_id` (and optionally `market_id`); `catalog.offers.geo` is a
  PostGIS point copied from the cluster centroid.
- Gap: nothing links a cluster/market to a ward, so selecting a ward cannot
  drive "markets nearby."

## Step 1 — Cluster ↔ ward linkage (migration V45)

- `ALTER TABLE catalog.clusters ADD COLUMN ward_id UUID NULL REFERENCES catalog.wards(id)` + index.
- One-time backfill: assign every cluster to its **nearest ward in the same LGA**
  via `ST_Distance(centroid, ward point)` (V44's clusters tie exactly; legacy
  clusters get their closest ward). Markets inherit their ward through the cluster.
- Leave `ward_id` NULL-safe: admin-registered clusters attach a ward explicitly.

## Step 2 — API

- `getClusters(state, lga, ward_id?)`: filter by ward; order by distance to the ward point when given.
- `getMarkets` accepts `ward_id` (markets whose cluster is in that ward) and/or `lat`/`lon` (nearest markets first).
- `discoverOffers` accepts optional `lat`/`lon`: orders by `ST_Distance(offer.geo, point)`
  first, still constrained by channel / cluster / category / seller-visibility. Endpoints stay public (no auth).

## Step 3 — Location picker (web)

- Order: **State → LGA → Ward → Market area → Market** (Ward uses the new picker).
- Show "≈ N km from you" labels on wards/markets when the user's geo is known.

## Step 4 — Crowd market (later phase, needs go-ahead)

- Capture bid/want geo; rank responding sellers nearest-first;
  pre-filter the must-match seller feed by the categories the seller actually sells.

## Step 5 — Guest location layer (anonymous users)

- **A. Exact:** consent prompt via the browser Geolocation API; guest sends
  `lat`/`lon` on the same public endpoints → nearest-first, no account required.
- **B. Fallback:** one-time manual State → LGA → Ward pick stored in
  `localStorage` (device only, never server); used as the "nearby" pivot.
- **C. Last resort:** opt-in IP-based state hint that only pre-fills the picker
  (never treated as an exact coordinate).
- Policy: never store a guest's coordinates server-side without consent.
- UX decision: a "Near me" toggle, default-on for guests, switchable.
  Keeps normal sort available so ranking stays transparent.

## Unlocks later (design intent, no code yet)

- Logistics: nearest-delivery-agent assignment and route distance reuse
  `offer.geo` ↔ delivery coordinates; order tracking on the same points.
- Geo fences per ward/market for demand/supply nudges.

## Sequencing

Build order: Step 1 → Step 2 → Step 3 → Step 5 (rides on 2/3). Step 4 deferred.