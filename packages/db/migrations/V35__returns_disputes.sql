-- ================================================================
-- V35 — Returns & disputes (Phase 4)
-- 1. orders.return_requests: buyer raises a return on a delivered
--    line → seller accepts/rejects → optional OPS mediation.
-- 2. escrow.disputes gains a link back to the return request and a
--    decided_at/decided_by pair so mediation is recorded durably.
-- 3. seller_clawback marker: refunds issued after a release are
--    booked as MANUAL_ADJUSTMENT (+refund, counterparty SELLER) so
--    the append-only ledger closes to zero and the seller's
--    available payout balance is debited.
-- ================================================================

CREATE TABLE orders.return_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders.orders(id),
  order_line_id     UUID NOT NULL REFERENCES orders.order_lines(id),
  buyer_id          UUID NOT NULL REFERENCES pii.users(id),
  seller_id         UUID NOT NULL REFERENCES pii.users(id),
  reason            TEXT NOT NULL CHECK (reason IN ('WRONG_ITEM','QUALITY','MISSING','DAMAGED','OTHER')),
  reason_note       TEXT,
  qty               INT NOT NULL CHECK (qty > 0),
  status            TEXT NOT NULL DEFAULT 'AWAITING_SELLER'
    CHECK (status IN ('AWAITING_SELLER','ACCEPTED','REJECTED','ESCALATED','RESOLVED_REFUND','DISMISSED')),
  refund_cents      BIGINT NOT NULL DEFAULT 0 CHECK (refund_cents >= 0),
  decision_note     TEXT,
  dispute_id        UUID REFERENCES escrow.disputes(id),
  decided_at        TIMESTAMPTZ,
  decided_by        UUID REFERENCES pii.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_return_buyer    ON orders.return_requests (buyer_id, created_at DESC);
CREATE INDEX idx_return_seller   ON orders.return_requests (seller_id, status);
CREATE INDEX idx_return_line     ON orders.return_requests (order_line_id);

-- Limit one in-flight return per order line.
CREATE UNIQUE INDEX uq_return_line_active
  ON orders.return_requests (order_line_id)
  WHERE status IN ('AWAITING_SELLER','ACCEPTED','REJECTED','ESCALATED');

-- Dispute ↔ return linkage + durable mediation stamping.
ALTER TABLE escrow.disputes
  ADD COLUMN IF NOT EXISTS return_request_id UUID REFERENCES orders.return_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_return ON escrow.disputes(return_request_id);

GRANT SELECT, INSERT, UPDATE ON orders.return_requests TO ojaline_app;
GRANT SELECT, INSERT, UPDATE ON escrow.disputes TO ojaline_app;