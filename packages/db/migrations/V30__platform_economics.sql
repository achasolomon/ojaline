-- ================================================================
-- V30 — Platform economics (Phase 0 money foundation)
-- 1. Ledger: allow the SELLER_PAYOUT entry type that the escrow
--    release path already writes (constraint bug — releases would
--    otherwise fail with a CHECK violation).
-- 2. Orders: snapshot per-line platform commission and the
--    seller-payable amount at checkout time (immutable at order
--    creation, so later rate changes never rewrite history).
-- 3. finance schema: commission rate config, seller bank accounts
--    (payout method, gated on FULL KYC), payout requests.
-- ================================================================

-- ---------- 1. Ledger entry types ---------------------------------
ALTER TABLE escrow.ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;

ALTER TABLE escrow.ledger_entries
  ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (entry_type IN (
    'PAYMENT_IN', 'FEE', 'DELIVERY_RELEASE', 'PARTIAL_RELEASE',
    'REFUND', 'SELLER_PAYOUT', 'PAYOUT', 'MANUAL_ADJUSTMENT'
  ));

-- ---------- 2. Per-line commission snapshot -----------------------
ALTER TABLE orders.order_lines
  ADD COLUMN IF NOT EXISTS commission_cents    BIGINT NOT NULL DEFAULT 0 CHECK (commission_cents >= 0),
  ADD COLUMN IF NOT EXISTS seller_payable_cents BIGINT NOT NULL DEFAULT 0 CHECK (seller_payable_cents >= 0);

-- Backfill: existing lines pre-date the commission model, so the
-- whole landed line amount was payable to the seller.
UPDATE orders.order_lines
   SET seller_payable_cents = unit_price_cents * qty;

-- ---------- 3. finance schema -------------------------------------
CREATE SCHEMA IF NOT EXISTS finance;

CREATE TABLE finance.commission_rates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       TEXT NOT NULL CHECK (channel IN ('RETAILER','WHOLESALE','DIRECT','OPEN')),
  category_id   UUID REFERENCES catalog.categories(id),   -- NULL = applies to all categories on the channel
  percent_bps   INT NOT NULL DEFAULT 0 CHECK (percent_bps >= 0),   -- basis points (0.01%)
  flat_cents    BIGINT NOT NULL DEFAULT 0 CHECK (flat_cents >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  UNIQUE (channel, category_id, effective_from)
);
CREATE INDEX idx_commission_channel_category
  ON finance.commission_rates (channel, category_id, effective_from);

CREATE TABLE finance.seller_bank_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES pii.users(id),
  bank_code      TEXT NOT NULL,
  bank_name      TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name   TEXT NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_number)
);
CREATE INDEX idx_bank_accounts_user ON finance.seller_bank_accounts(user_id);

CREATE TABLE finance.payout_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         UUID NOT NULL REFERENCES pii.users(id),
  amount_cents      BIGINT NOT NULL CHECK (amount_cents > 0),
  status            TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','PROCESSING','SENT','FAILED')),
  bank_account_id   UUID REFERENCES finance.seller_bank_accounts(id),
  batch_id          UUID REFERENCES escrow.settlement_batches(id),
  transfer_reference TEXT,
  reviewed_by       UUID REFERENCES pii.users(id),
  review_note       TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payout_requests_seller ON finance.payout_requests(seller_id, status);
CREATE INDEX idx_payout_requests_status ON finance.payout_requests(status);

GRANT USAGE ON SCHEMA finance TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA finance TO ojaline_app;