-- ============================================================================
-- Ojaline — V1__init.sql
-- Faithful to Data Model v1.0 + System Architecture v2.0 §2.1.
-- Runs as the migration superuser (ojaline). Creates the application role
-- ojaline_app with scoped grants; money is BIGINT minor units (kobo) — no floats.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE ROLE ojaline_app LOGIN PASSWORD 'ojaline_app_dev_pw';
-- NOTE: dev-only password. Production creates the role via secrets manager (ADR-000 §5).

-- ---------------------------------------------------------------- schemas
CREATE SCHEMA IF NOT EXISTS pii;          -- Identity (ADR-004: isolated, view-only)
CREATE SCHEMA IF NOT EXISTS catalog;      -- Offer & Catalog
CREATE SCHEMA IF NOT EXISTS orders;       -- Cart / Order
CREATE SCHEMA IF NOT EXISTS escrow;       -- Split-Escrow (money path)
CREATE SCHEMA IF NOT EXISTS fulfilment;   -- Fulfilment
CREATE SCHEMA IF NOT EXISTS trust;        -- Trust
CREATE SCHEMA IF NOT EXISTS audit;        -- Shared audit + outbox
CREATE SCHEMA IF NOT EXISTS app;          -- View layer (pii exposure only)

-- ================================================================ pii
CREATE TABLE pii.users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL UNIQUE,
  full_name  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ           -- soft delete (NDPR)
);

CREATE TABLE pii.roles (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE pii.user_roles (
  user_id    UUID NOT NULL REFERENCES pii.users(id),
  role_id    UUID NOT NULL REFERENCES pii.roles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE pii.phone_verifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL,
  purpose    TEXT NOT NULL CHECK (purpose IN ('LOGIN','POD','PAYOUT_CHECK','PASSWORDLESS')),
  code_hash  TEXT NOT NULL,               -- OTP stored hashed only (Architecture §5)
  expires_at TIMESTAMPTZ NOT NULL,        -- 15-min TTL
  attempts   INT NOT NULL DEFAULT 0,
  used_at    TIMESTAMPTZ
);
CREATE INDEX idx_pv_phone_purpose ON pii.phone_verifications(phone, purpose, expires_at);

CREATE TABLE pii.consents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES pii.users(id),
  scope      TEXT NOT NULL,               -- plain-language scope (NDPR)
  version    INT NOT NULL DEFAULT 1,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE pii.devices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES pii.users(id),
  device_id  TEXT NOT NULL,
  signals    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_devices_user ON pii.devices(user_id);

CREATE TABLE pii.delete_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES pii.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','DENIED')),
  completed_at TIMESTAMPTZ
);

-- ================================================================ catalog
CREATE TABLE catalog.categories (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL UNIQUE,
  perishability_default TEXT NOT NULL CHECK (perishability_default IN ('SHELF_GT_7D','SHELF_LT_7D')),
  parent_id            UUID REFERENCES catalog.categories(id),
  grade_standard_id    UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog.grade_standards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       UUID NOT NULL REFERENCES catalog.categories(id),
  criteria          JSONB NOT NULL,          -- size/weight/blemishes per category (System Doc §11)
  ref_photo_required BOOLEAN NOT NULL DEFAULT TRUE,
  version           INT NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, version)
);

CREATE TABLE catalog.clusters (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  lga        TEXT NOT NULL,
  centroid   GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog.markets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id           UUID NOT NULL REFERENCES catalog.clusters(id),
  name                 TEXT NOT NULL,
  calendar             JSONB NOT NULL DEFAULT '{}',   -- rotating market-day calendar
  order_cutoff         TIME NOT NULL,
  weather_gate_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog.lots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    UUID NOT NULL REFERENCES pii.users(id),
  product_name TEXT NOT NULL,
  physical_ref TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lots_seller ON catalog.lots(seller_id);

-- Architecture v2.0 §2.1 (unchanged) + Data Model v1.0 §4.2 (status)
CREATE TABLE catalog.offers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id        UUID NOT NULL REFERENCES pii.users(id),
  channel          TEXT NOT NULL CHECK (channel IN ('RETAILER','WHOLESALE','DIRECT','OPEN')),
  lot_id           UUID NOT NULL REFERENCES catalog.lots(id),
  available_qty    INT NOT NULL CHECK (available_qty >= 0),
  reserved_qty     INT NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  soft_held_qty    INT NOT NULL DEFAULT 0 CHECK (soft_held_qty >= 0),
  min_order_qty    INT NOT NULL DEFAULT 1,
  perishability    TEXT NOT NULL CHECK (perishability IN ('SHELF_GT_7D','SHELF_LT_7D')),
  fulfilment_modes TEXT[] NOT NULL,
  geo              GEOGRAPHY(POINT, 4326) NOT NULL,
  cluster_id       UUID NOT NULL REFERENCES catalog.clusters(id),
  version          INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','DELISTED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reserved_qty + soft_held_qty <= available_qty)   -- DB-level invariant
);
CREATE INDEX idx_offers_channel_cluster ON catalog.offers(channel, cluster_id)
  WHERE available_qty > reserved_qty + soft_held_qty;

CREATE TABLE catalog.offer_media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id    UUID NOT NULL REFERENCES catalog.offers(id),
  kind        TEXT NOT NULL CHECK (kind IN ('REFERENCE_PHOTO','GALLERY')),
  storage_key TEXT NOT NULL,
  tiers       JSONB NOT NULL DEFAULT '{}',      -- compression tiers (low-bandwidth)
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_offer ON catalog.offer_media(offer_id);

CREATE TABLE catalog.offer_price_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id         UUID NOT NULL REFERENCES catalog.offers(id),
  old_price_cents  BIGINT,
  new_price_cents  BIGINT NOT NULL,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_price_history_offer ON catalog.offer_price_history(offer_id, changed_at DESC);

CREATE TABLE catalog.market_day_status (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id         UUID NOT NULL REFERENCES catalog.markets(id),
  market_date       DATE NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('OPEN','DISABLED_WEATHER','CANCELED')),
  precip_probability NUMERIC(5,2),
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, market_date)
);

-- ================================================================ orders
-- Architecture v2.0 §2.1 (unchanged)
CREATE TABLE orders.stock_holds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id         UUID NOT NULL REFERENCES catalog.offers(id),
  user_id          UUID NOT NULL REFERENCES pii.users(id),
  qty              INT NOT NULL CHECK (qty > 0),
  kind             TEXT NOT NULL CHECK (kind IN ('SOFT','HARD')),
  status           TEXT NOT NULL CHECK (status IN ('ACTIVE','CONVERTED','RELEASED','EXPIRED')),
  expires_at       TIMESTAMPTZ NOT NULL,
  order_id         UUID,
  paystack_reference TEXT,
  idempotency_key  TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_holds_expiry ON orders.stock_holds(expires_at) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX idx_holds_paystack_ref ON orders.stock_holds(paystack_reference)
  WHERE paystack_reference IS NOT NULL;         -- webhook replay guard

CREATE TABLE orders.checkout_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id      UUID NOT NULL REFERENCES pii.users(id),
  status        TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','EXPIRED','ABANDONED')),
  items         JSONB NOT NULL DEFAULT '[]',
  soft_hold_ids UUID[] NOT NULL DEFAULT '{}',
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data Model v1.0 §3.3
CREATE TABLE orders.orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id            UUID NOT NULL REFERENCES pii.users(id),
  channel             TEXT NOT NULL CHECK (channel IN ('RETAILER','WHOLESALE','DIRECT','OPEN')),
  status              TEXT NOT NULL CHECK (status IN ('CHECKOUT','PENDING_PAYMENT','PAID','PARTIALLY_DISPATCHED','DISPATCHED','DELIVERED','PARTIALLY_REFUNDED','REFUNDED','CANCELLED','FAILED')),
  multi_seller        BOOLEAN NOT NULL DEFAULT FALSE,
  checkout_session_id UUID,
  item_total_cents    BIGINT NOT NULL CHECK (item_total_cents >= 0),
  delivery_fee_cents  BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  landed_total_cents  BIGINT NOT NULL CHECK (landed_total_cents = item_total_cents + delivery_fee_cents),
  currency            TEXT NOT NULL DEFAULT 'NGN',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders.order_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders.orders(id),
  offer_id        UUID NOT NULL REFERENCES catalog.offers(id),
  seller_id       UUID NOT NULL REFERENCES pii.users(id),
  qty             INT NOT NULL CHECK (qty > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0),
  status          TEXT NOT NULL CHECK (status IN ('PAID','DISPATCHED','DELIVERED','PENDING','REFUNDED','FAILED')),
  stock_hold_id   UUID REFERENCES orders.stock_holds(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lines_order ON orders.order_lines(order_id);
CREATE INDEX idx_lines_offer ON orders.order_lines(offer_id);

CREATE TABLE orders.cart_price_change_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders.orders(id),
  offer_id        UUID NOT NULL REFERENCES catalog.offers(id),
  old_price_cents BIGINT NOT NULL,
  new_price_cents BIGINT NOT NULL,
  notified_at     TIMESTAMPTZ
);
CREATE INDEX idx_cpce_order ON orders.cart_price_change_events(order_id);

-- ================================================================ escrow (money path — Data Model v1.0 §3.4)
CREATE TABLE escrow.escrow_orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL UNIQUE REFERENCES orders.orders(id),
  status               TEXT NOT NULL CHECK (status IN ('PENDING_PAYMENT','HELD','RELEASING','RELEASED','REFUNDED','DISPUTED')),
  amount_held_cents    BIGINT NOT NULL DEFAULT 0 CHECK (amount_held_cents >= 0),
  release_scheduled_at TIMESTAMPTZ,           -- set at delivery.verified = now() + 24h
  released_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_escrow_release_due ON escrow.escrow_orders(release_scheduled_at) WHERE status = 'HELD';

CREATE TABLE escrow.ledger_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_order_id      UUID NOT NULL REFERENCES escrow.escrow_orders(id),
  sequence_no          INT NOT NULL,
  entry_type           TEXT NOT NULL CHECK (entry_type IN ('PAYMENT_IN','FEE','DELIVERY_RELEASE','PARTIAL_RELEASE','REFUND','PAYOUT','MANUAL_ADJUSTMENT')),
  amount_cents         BIGINT NOT NULL,       -- signed
  running_balance_cents BIGINT NOT NULL,
  currency             TEXT NOT NULL DEFAULT 'NGN',
  counterparty_type    TEXT NOT NULL CHECK (counterparty_type IN ('SELLER','BUYER','OPS','PLATFORM')),
  counterparty_id      UUID,
  reference            TEXT,                  -- Paystack transfer ref / settlement batch id
  idempotency_key      TEXT NOT NULL UNIQUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (escrow_order_id, sequence_no)
);
CREATE INDEX idx_ledger_escrow ON escrow.ledger_entries(escrow_order_id, sequence_no);

-- running_balance invariant: derived from prior entries
CREATE OR REPLACE FUNCTION escrow.trg_ledger_running_balance() RETURNS trigger AS $$
BEGIN
  NEW.sequence_no := COALESCE((SELECT MAX(sequence_no) FROM escrow.ledger_entries
                               WHERE escrow_order_id = NEW.escrow_order_id), 0) + 1;
  NEW.running_balance_cents := COALESCE((SELECT running_balance_cents FROM escrow.ledger_entries
                               WHERE escrow_order_id = NEW.escrow_order_id
                               ORDER BY sequence_no DESC LIMIT 1), 0) + NEW.amount_cents;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_running_balance
  BEFORE INSERT ON escrow.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION escrow.trg_ledger_running_balance();

CREATE TABLE escrow.settlement_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','CONFIRMED','PARTIAL','FAILED')),
  total_cents   BIGINT NOT NULL CHECK (total_cents >= 0),
  currency      TEXT NOT NULL DEFAULT 'NGN',
  submitted_at  TIMESTAMPTZ,
  confirmed_at  TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE escrow.settlement_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID NOT NULL REFERENCES escrow.settlement_batches(id),
  ledger_entry_id     UUID NOT NULL REFERENCES escrow.ledger_entries(id),
  seller_id           UUID NOT NULL REFERENCES pii.users(id),
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  paystack_transfer_ref TEXT,
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUBMITTED','CONFIRMED','FAILED','RECONCILED')),
  UNIQUE (batch_id, ledger_entry_id)
);
CREATE INDEX idx_settlement_lines_batch ON escrow.settlement_lines(batch_id);

CREATE TABLE escrow.disputes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders.orders(id),
  opened_by      TEXT NOT NULL CHECK (opened_by IN ('BUYER','SELLER','RIDER','OPS')),
  type           TEXT NOT NULL CHECK (type IN ('QUALITY','DELIVERY','MISSING','FRAUD','OTHER')),
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED_BUYER','RESOLVED_SELLER','RESOLVED_PARTIAL','DISMISSED')),
  decision_notes TEXT,
  decided_at     TIMESTAMPTZ,
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_disputes_order ON escrow.disputes(order_id);

-- ================================================================ fulfilment
CREATE TABLE fulfilment.capacity_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id   UUID NOT NULL REFERENCES catalog.clusters(id),
  window_start TIMESTAMPTZ NOT NULL,
  window_end   TIMESTAMPTZ NOT NULL,
  capacity     INT NOT NULL CHECK (capacity >= 0),
  booked       INT NOT NULL DEFAULT 0 CHECK (booked <= capacity),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_capacity_cluster_window ON fulfilment.capacity_slots(cluster_id, window_start, window_end);

CREATE TABLE fulfilment.rider_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders.orders(id),
  rider_id        UUID NOT NULL REFERENCES pii.users(id),
  allocation_score NUMERIC(5,4),               -- weighted 0.7 performance / 0.3 exploration
  status          TEXT NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED','ACCEPTED','REJECTED','IN_TRANSIT','COMPLETED','FAILED')),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rider_jobs_rider ON fulfilment.rider_jobs(rider_id, status);
CREATE INDEX idx_rider_jobs_order ON fulfilment.rider_jobs(order_id);

CREATE TABLE fulfilment.delivery_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders.orders(id),
  rider_id         UUID NOT NULL REFERENCES pii.users(id),
  photo_storage_key TEXT,
  gps              JSONB,                      -- {lat, lng, accuracy, captured_at}
  pod_status       TEXT NOT NULL DEFAULT 'ATTEMPTED' CHECK (pod_status IN ('ATTEMPTED','POD_SUBMITTED','VERIFIED','OFFLINE_FALLBACK','UNDER_REVIEW')),
  submitted_at     TIMESTAMPTZ,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_attempts_order ON fulfilment.delivery_attempts(order_id);

CREATE TABLE fulfilment.otp_verifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_attempt_id UUID REFERENCES fulfilment.delivery_attempts(id),
  purpose             TEXT NOT NULL DEFAULT 'POD' CHECK (purpose = 'POD'),
  code_hash           TEXT NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL,    -- 15-min TTL
  renewal_actor       TEXT NOT NULL CHECK (renewal_actor IN ('BUYER','RIDER')),  -- rider-only renewal prohibited
  used_at             TIMESTAMPTZ
);
CREATE INDEX idx_otp_attempt ON fulfilment.otp_verifications(delivery_attempt_id);

CREATE TABLE fulfilment.weather_gates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id         UUID NOT NULL REFERENCES catalog.markets(id),
  gate_date         DATE NOT NULL,
  precip_probability NUMERIC(5,2) NOT NULL,
  threshold         NUMERIC(5,2) NOT NULL DEFAULT 70,
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, gate_date)
);

-- ================================================================ trust
CREATE TABLE trust.agent_actions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL,
  farmer_id  UUID NOT NULL,
  action     TEXT NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_actions_farmer ON trust.agent_actions(farmer_id, created_at DESC);

CREATE TABLE trust.fraud_signals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('SELLER','RIDER','BUYER','DEVICE')),
  subject_id   UUID NOT NULL,
  signal_type  TEXT NOT NULL,          -- 'RAPID_BUY_LIST','DEVICE_REUSE','DISPUTE_VELOCITY',...
  severity     SMALLINT NOT NULL,
  evidence     JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','DISMISSED','ACTIONED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fraud_status ON trust.fraud_signals(status, created_at);

CREATE TABLE trust.seller_risk_tiers (
  seller_id       UUID PRIMARY KEY REFERENCES pii.users(id),
  tier            TEXT NOT NULL CHECK (tier IN ('NEW','ELEVATED','VERIFIED_LOW')),
  dispute_rate_30d NUMERIC(5,4),
  qa_rate         NUMERIC(5,4),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trust.qa_pool_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders.orders(id),
  seller_id    UUID NOT NULL REFERENCES pii.users(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  rate         NUMERIC(5,4) NOT NULL,
  entered_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qa_pool_seller ON trust.qa_pool_entries(seller_id, entered_at DESC);

CREATE TABLE trust.reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id UUID NOT NULL REFERENCES pii.users(id),
  subject_id  UUID NOT NULL REFERENCES pii.users(id),
  order_id    UUID NOT NULL REFERENCES orders.orders(id),
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text        TEXT,
  flags       JSONB NOT NULL DEFAULT '{}',     -- self-dealing detection
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_subject ON trust.reviews(subject_id);

-- ================================================================ audit (ADR-008 outbox; immutable)
CREATE TABLE audit.outbox_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL,
  schema_version  INT NOT NULL,
  aggregate_id    UUID NOT NULL,
  payload         JSONB NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','DEAD')),
  attempts        INT NOT NULL DEFAULT 0,
  dedup_key       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at   TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  UNIQUE (dedup_key)
);
CREATE INDEX idx_outbox_pending ON audit.outbox_events(status, created_at) WHERE status IN ('PENDING','FAILED');

CREATE TABLE audit.audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       UUID,
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('USER','RIDER','AGENT','OPS','SYSTEM')),
  action         TEXT NOT NULL,                -- 'CHANNEL_CHANGE','ESCROW_OVERRIDE',...
  entity_type    TEXT NOT NULL,
  entity_id      UUID NOT NULL,
  before_payload JSONB,
  after_payload  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit.audit_log(entity_type, entity_id, created_at DESC);

-- ================================================================ view layer (pii exposure only)
CREATE OR REPLACE VIEW app.users AS
  SELECT id, phone, full_name, status, created_at FROM pii.users;

CREATE OR REPLACE VIEW app.user_roles AS
  SELECT user_id, role_id, granted_at FROM pii.user_roles;

-- ================================================================ grants
-- pii: no direct grants — readable only through the app view layer (ADR-004)
GRANT USAGE ON SCHEMA pii TO ojaline_app;
GRANT USAGE ON SCHEMA app TO ojaline_app;
GRANT SELECT ON app.users, app.user_roles TO ojaline_app;

-- transactional schemas: full CRUD for application code
GRANT USAGE ON SCHEMA catalog, orders, escrow, fulfilment, trust, audit TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalog TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA orders TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA escrow TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA fulfilment TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA trust TO ojaline_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA audit TO ojaline_app;
-- Outbox: payload is immutable, but the worker owns the status lifecycle (ADR-008).
GRANT UPDATE (status, attempts, dispatched_at, last_attempt_at) ON audit.outbox_events TO ojaline_app;

-- immutability at the DB level — append-only, not convention (Architecture §2.1, Data Model §1)
REVOKE UPDATE, DELETE ON escrow.ledger_entries FROM ojaline_app;
REVOKE UPDATE, DELETE ON audit.audit_log FROM ojaline_app;
REVOKE UPDATE, DELETE ON trust.agent_actions FROM ojaline_app;
REVOKE UPDATE, DELETE ON trust.fraud_signals FROM ojaline_app;

-- trigger/function ownership stays with the migration role; app may call through inserts only
REVOKE ALL ON FUNCTION escrow.trg_ledger_running_balance() FROM ojaline_app;
