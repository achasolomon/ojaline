-- ================================================================
-- V17 — Content banners, Crowd Market engine, Negotiations, feed
--
-- Turns previously client-side (localStorage) state into real
-- database tables so the marketplace works end-to-end across
-- devices:
--   * marketing.banners        → DB-driven homepage hero slides + cards
--   * market.wants / bids      → buyer "crowd want" + seller bids
--   * market.negotiations ...  → haggling threads, callbacks
--   * users.notifications      → real in-app notification feed
-- ================================================================

CREATE SCHEMA IF NOT EXISTS market;

-- ------------------------------------------------- banners
CREATE TABLE IF NOT EXISTS marketing.banners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot          text NOT NULL DEFAULT 'HERO' CHECK (slot IN ('HERO', 'MARKET_DAY')),
  title         text NOT NULL,
  subtitle      text NOT NULL DEFAULT '',
  cta_label     text NOT NULL DEFAULT 'Shop now',
  cta_href      text NOT NULL DEFAULT '/offers',
  image_key     text,
  gradient      text,
  fallback_icon text NOT NULL DEFAULT 'basket',
  sort_order    int NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_banners_active ON marketing.banners (slot, status, sort_order)
  WHERE status = 'ACTIVE';

-- 4 hero slides + 1 market-day card. Images are wired via media API
-- (image_key) after startup; until then the gradient + fallback icon
-- keep the slide visual distinct.
INSERT INTO marketing.banners
  (slot, title, subtitle, cta_label, cta_href, image_key, gradient, fallback_icon, sort_order)
VALUES
  ('HERO', 'Flash Sale',
    'Time-limited prices on fresh produce. Grab today\u2019s market-day lows before they sell out.',
    'Shop Flash Sale', '/offers?sort=cheapest', NULL,
    'linear-gradient(120deg,#7a1430 0%,#b2233f 45%,#e05a3a 100%)', 'bolt', 1),
  ('HERO', 'Budget Pick',
    'Everyday essentials at wallet-friendly prices from verified local sellers near you.',
    'See Lowest Prices', '/offers?sort=cheapest', NULL,
    'linear-gradient(120deg,#8a4d00 0%,#d77900 45%,#ffb228 100%)', 'tag', 2),
  ('HERO', 'Popular Right Now',
    'The trendiest produce this week, ranked by demand from real market shoppers.',
    'See What''s Hot', '/offers?sort=popular', NULL,
    'linear-gradient(120deg,#056e31 0%,#07883f 45%,#79aa76 100%)', 'star', 3),
  ('HERO', 'New Arrivals',
    'New products from trusted farmers and sellers, listed just in time for this market day.',
    'Discover New Arrivals', '/offers?sort=newest', NULL,
    'linear-gradient(120deg,#3b2f7a 0%,#6b5ae0 45%,#9fa5ff 100%)', 'clock', 4),
  ('MARKET_DAY', 'Wholesale Prices',
    'Save more when you buy in bulk from trusted market sellers.',
    'Shop Market Day', '/market-days', NULL,
    'linear-gradient(120deg,#2e7d32 0%,#54a05c 45%,#9ccc9c 100%)', 'calendar', 0);

-- -------------------------------------------------- crowd wants
CREATE TABLE IF NOT EXISTS market.wants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id        uuid NOT NULL REFERENCES pii.users(id),
  product_name    text NOT NULL,
  qty             int NOT NULL CHECK (qty > 0),
  unit            text,
  ceiling_kobo    int CHECK (ceiling_kobo IS NULL OR ceiling_kobo > 0),
  note            text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'CLOSED', 'EXPIRED')),
  chosen_bid_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wants_buyer ON market.wants (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wants_status ON market.wants (status, created_at DESC)
  WHERE status = 'OPEN';

-- --------------------------------------------------- crowd bids
CREATE TABLE IF NOT EXISTS market.bids (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  want_id              uuid NOT NULL REFERENCES market.wants(id) ON DELETE CASCADE,
  seller_id            uuid NOT NULL REFERENCES pii.users(id),
  offer_id             uuid NOT NULL REFERENCES catalog.offers(id),
  product_name         text NOT NULL,
  unit                 text,
  market_name          text,
  stall_number         text,
  rating               numeric(2,1),
  review_count         int NOT NULL DEFAULT 0,
  quote_per_unit_kobo  int NOT NULL CHECK (quote_per_unit_kobo > 0),
  quote_total_kobo     int NOT NULL CHECK (quote_total_kobo > 0),
  pitch                text NOT NULL DEFAULT '',
  chosen               boolean NOT NULL DEFAULT FALSE,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bids_want ON market.bids (want_id, quote_per_unit_kobo);
CREATE INDEX IF NOT EXISTS idx_bids_seller ON market.bids (seller_id);

ALTER TABLE market.wants
  ADD CONSTRAINT fk_wants_chosen_bid FOREIGN KEY (chosen_bid_id) REFERENCES market.bids (id);

-- --------------------------------------------- negotiation threads
CREATE TABLE IF NOT EXISTS market.negotiations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id            uuid NOT NULL REFERENCES pii.users(id),
  seller_id           uuid NOT NULL REFERENCES pii.users(id),
  basis_type          text NOT NULL CHECK (basis_type IN ('OFFER', 'REQUEST')),
  offer_id            uuid REFERENCES catalog.offers(id),
  want_id             uuid REFERENCES market.wants(id),
  ask_per_unit_kobo   int NOT NULL CHECK (ask_per_unit_kobo > 0),
  floor_per_unit_kobo int NOT NULL CHECK (floor_per_unit_kobo > 0),
  qty                 int NOT NULL CHECK (qty > 0),
  observable          text NOT NULL DEFAULT 'OPEN' CHECK (observable IN ('OPEN', 'SETTLED', 'WALKED')),
  demeanor            text NOT NULL DEFAULT 'fair' CHECK (demeanor IN ('easy', 'fair', 'tough')),
  dropped_at          timestamptz,
  callback_at         timestamptz,
  callback_sent       boolean NOT NULL DEFAULT FALSE,
  unseen_callbacks    int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((basis_type = 'OFFER') = (want_id IS NULL)),
  CHECK ((offer_id IS NOT NULL) = (basis_type = 'OFFER'))
);
CREATE INDEX IF NOT EXISTS idx_neg_buyer ON market.negotiations (buyer_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_neg_offer_buyer ON market.negotiations (offer_id, buyer_id)
  WHERE basis_type = 'OFFER';

-- ----------------------------------------- negotiation messages
CREATE TABLE IF NOT EXISTS market.negotiation_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_id   uuid NOT NULL REFERENCES market.negotiations(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN
    ('BUYER_BID','SELLER_OFFER','SELLER_ACCEPT','BUYER_ACCEPT','WALK','CALLBACK','NOTE')),
  side             text NOT NULL CHECK (side IN ('BUYER', 'SELLER')),
  qty              int NOT NULL CHECK (qty > 0),
  per_unit_kobo    int CHECK (per_unit_kobo IS NULL OR per_unit_kobo > 0),
  message          text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_neg ON market.negotiation_messages (negotiation_id, created_at);

-- ---------------------------------------------- in-app feed table
CREATE TABLE IF NOT EXISTS users.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES pii.users(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('order', 'chat', 'market', 'deal', 'system')),
  title      text NOT NULL,
  body       text,
  deep_link  text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON users.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON users.notifications (user_id)
  WHERE read_at IS NULL;

-- -------------------------------------------------------- grants
GRANT USAGE ON SCHEMA market TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA market TO ojaline_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA market TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON marketing.banners TO ojaline_app;
GRANT SELECT, INSERT, UPDATE ON users.notifications TO ojaline_app;