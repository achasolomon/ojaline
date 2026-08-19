-- V4: Multi-seller gate support
-- Adds on_time_rate_30d to seller_risk_tiers for gate checks.

ALTER TABLE trust.seller_risk_tiers
  ADD COLUMN on_time_rate_30d NUMERIC(5,4) DEFAULT 1.0000;

-- New sellers default to 1.0000 (perfect) until delivery data exists.
UPDATE trust.seller_risk_tiers SET on_time_rate_30d = 1.0000 WHERE on_time_rate_30d IS NULL;

ALTER TABLE trust.seller_risk_tiers
  ALTER COLUMN on_time_rate_30d SET NOT NULL;

-- Capacity: add a unique constraint so we don't double-book a window.
CREATE UNIQUE INDEX IF NOT EXISTS idx_capacity_cluster_window_unique
  ON fulfilment.capacity_slots(cluster_id, window_start, window_end);
