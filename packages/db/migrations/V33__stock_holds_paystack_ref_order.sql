-- ================================================================
-- V33 — stock hold paystack reference is unique per order
-- A single payment converts every stock hold on its order, so the
-- replay-guard index must be (paystack_reference, order_id), not
-- globally unique on the reference: a multi-line order would otherwise
-- violate the unique index on the second hold (bug: PAYMENT confirm
-- threw for any multi-seller checkout).
-- ================================================================

DROP INDEX IF EXISTS orders.idx_holds_paystack_ref;

CREATE UNIQUE INDEX idx_holds_paystack_ref
  ON orders.stock_holds (paystack_reference, order_id)
  WHERE paystack_reference IS NOT NULL AND order_id IS NOT NULL;