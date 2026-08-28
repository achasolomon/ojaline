-- V7: Market Days location hierarchy + seller types + market-level sellers
-- Adds: state on clusters, seller_type on users, market_id on offers, market_sellers junction

BEGIN;

-- 1. Add state to clusters
ALTER TABLE catalog.clusters ADD COLUMN state TEXT NOT NULL DEFAULT 'Lagos';
CREATE INDEX idx_clusters_state_lga ON catalog.clusters(state, lga);

-- Update existing seed clusters
UPDATE catalog.clusters SET state = 'Lagos' WHERE state = 'Lagos';

-- 2. Add seller_type to pii.users
ALTER TABLE pii.users ADD COLUMN seller_type TEXT
  CHECK (seller_type IN ('FARMER','MARKET_WOMAN','STORE','PROCESSOR'));

-- 3. Add market_id to offers (links offer to specific market)
ALTER TABLE catalog.offers ADD COLUMN market_id UUID REFERENCES catalog.markets(id);
CREATE INDEX idx_offers_market ON catalog.offers(market_id) WHERE status = 'ACTIVE';

-- 4. Market-sellers junction (which sellers sell at which markets)
CREATE TABLE catalog.market_sellers (
  market_id  UUID NOT NULL REFERENCES catalog.markets(id),
  seller_id  UUID NOT NULL REFERENCES pii.users(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, seller_id)
);
CREATE INDEX idx_market_sellers_seller ON catalog.market_sellers(seller_id);

-- 5. seller_profiles for catalog access (non-PII seller info)
CREATE TABLE catalog.seller_profiles (
  user_id     UUID PRIMARY KEY REFERENCES pii.users(id),
  seller_type TEXT NOT NULL CHECK (seller_type IN ('FARMER','MARKET_WOMAN','STORE','PROCESSOR')),
  bio         TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Ensure app role can access new tables and seller_type column
GRANT SELECT ON pii.users TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalog TO ojaline_app;

COMMIT;
