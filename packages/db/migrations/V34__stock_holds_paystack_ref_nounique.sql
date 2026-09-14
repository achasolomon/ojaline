-- ================================================================
-- V34 — stock hold paystack reference is not unique on stock_holds
-- V33 tried a (paystack_reference, order_id) UNIQUE as a replay guard,
-- but a single payment legitimately stamps the same reference on every
-- stock hold of its order, so even that composite collides on
-- multi-line checkouts (orders.confirmPayment converts ALL of an
-- order's holds under the one reference).
-- Replay protection properly lives in `charges.paystack_reference`
-- (UNIQUE) and in the webhook's status-gated conversion path. Here we
-- keep a plain status-gated index for the webhook lookup.
-- ================================================================

DROP INDEX orders.idx_holds_paystack_ref;

CREATE INDEX idx_holds_paystack_ref
  ON orders.stock_holds (paystack_reference)
  WHERE paystack_reference IS NOT NULL AND status = 'ACTIVE';