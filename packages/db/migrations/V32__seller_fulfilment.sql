-- ================================================================
-- V32 — Seller fulfilment (Phase 1)
-- 1. order_lines gains an explicit 'ACCEPTED' lifecycle state between
--    PAID and DISPATCHED: the seller confirms the line before shipping.
-- 2. Carrier/tracking metadata + timestamps for the dispatch step.
-- 3. Seller-facing index so the seller dashboard lists are cheap.
-- ================================================================

ALTER TABLE orders.order_lines
  DROP CONSTRAINT order_lines_status_check;

ALTER TABLE orders.order_lines
  ADD CONSTRAINT order_lines_status_check
  CHECK (status IN ('PAID','ACCEPTED','DISPATCHED','DELIVERED','PENDING','REFUNDED','FAILED','CANCELLED'));

ALTER TABLE orders.order_lines
  ADD COLUMN IF NOT EXISTS accepted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_ref     TEXT,
  ADD COLUMN IF NOT EXISTS decline_reason   TEXT;

CREATE INDEX IF NOT EXISTS idx_lines_seller_status
  ON orders.order_lines (seller_id, status);