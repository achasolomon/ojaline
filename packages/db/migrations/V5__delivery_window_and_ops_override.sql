-- V5: Delivery window on orders + ops_override for seller gate + buyer decision timeout
-- Stores the requested delivery window so capacity can be released on cancellation/timeout.

ALTER TABLE orders.orders
  ADD COLUMN window_start TIMESTAMPTZ,
  ADD COLUMN window_end TIMESTAMPTZ,
  ADD COLUMN decision_deadline_at TIMESTAMPTZ;

-- Ops override flag: new sellers need an explicit Ops flag to bypass on_time_rate check.
ALTER TABLE trust.seller_risk_tiers
  ADD COLUMN ops_override BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for the buyer decision timeout sweep.
CREATE INDEX idx_orders_partial_dispatched
  ON orders.orders(updated_at)
  WHERE status = 'PARTIALLY_DISPATCHED';
