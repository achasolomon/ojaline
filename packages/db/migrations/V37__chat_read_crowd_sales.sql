-- ================================================================
-- V37 — Chat read-state + seller crowd sales
--
--   * chat.conversations gains per-participant read marks so the UI
--     can badge unread messages and mark them read on open.
--   * market.crowd_sales  → sellers post bulk "crowd sales" that
--     buyers can shop (mirror of buyer wants, seller-initiated).
-- ================================================================

-- ------------------------------------------------- chat read state
ALTER TABLE chat.conversations
  ADD COLUMN IF NOT EXISTS buyer_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_last_read_at timestamptz;

-- --------------------------------------------- seller crowd sales
CREATE TABLE IF NOT EXISTS market.crowd_sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       uuid NOT NULL REFERENCES pii.users(id),
  offer_id        uuid NOT NULL REFERENCES catalog.offers(id),
  product_name    text NOT NULL,
  unit            text,
  unit_price_kobo int NOT NULL CHECK (unit_price_kobo > 0),
  qty_available   int NOT NULL CHECK (qty_available > 0),
  min_qty         int NOT NULL DEFAULT 1 CHECK (min_qty > 0),
  note            text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  ends_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crowd_sales_open ON market.crowd_sales (status, created_at DESC)
  WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_crowd_sales_seller ON market.crowd_sales (seller_id, created_at DESC);

GRANT USAGE ON SCHEMA market TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA market TO ojaline_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA market TO ojaline_app;