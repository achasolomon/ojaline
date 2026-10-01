-- ============================================================================
-- V52 — Per-seller fulfilment legs
--   A buyer may shop any market/cluster freely — even far from the suggested
--   nearest market. Sellers each own their delivery. Forcing one shared
--   cluster+window+deliery-fee across multi-seller carts was therefore wrong:
--   it silently collapsed two sellers' independent delivery choices into one
--   mode and one fee, and rejected carts that honestly crossed clusters.
--
--   Fix (Jumia/Temu split-shipping model): keep ONE order, ONE payment, ONE
--   escrow + landed_total invariant, but break delivery into per-seller
--   fulfilment legs. Each leg owns its own seller, cluster, delivery mode,
--   delivery fee, and window. An order's landed total is the item total plus
--   the SUM of its legs' fees — the existing CHECK
--   (landed_total_cents = item_total_cents + delivery_fee_cents) stays intact
--   because orders.orders.delivery_fee_cents is rolled up from the legs.
--
--   Existing single-seller orders simply get one leg so reads stay uniform.
-- ============================================================================

CREATE TABLE orders.fulfilment_legs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders.orders(id),
  seller_id          UUID NOT NULL REFERENCES pii.users(id),
  cluster_id         UUID NOT NULL REFERENCES catalog.clusters(id),
  delivery_mode      TEXT NOT NULL CHECK (delivery_mode IN ('INSTANT','SCHEDULED','MARKET_DAY')),
  delivery_fee_cents BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  window_start       TIMESTAMPTZ,
  window_end         TIMESTAMPTZ CHECK (window_end > window_start),
  status             TEXT NOT NULL DEFAULT 'PAID'
                     CHECK (status IN ('PAID','DISPATCHED','DELIVERED','PENDING','FAILED','REFUNDED','CANCELLED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fulfilment_legs_order ON orders.fulfilment_legs(order_id);
CREATE INDEX idx_fulfilment_legs_seller ON orders.fulfilment_legs(seller_id);

-- Every line belongs to exactly one fulfilment leg (one seller's "ship-pack").
ALTER TABLE orders.order_lines
  ADD COLUMN fulfilment_leg_id UUID REFERENCES orders.fulfilment_legs(id);
CREATE INDEX idx_order_lines_leg ON orders.order_lines(fulfilment_leg_id);

-- Backfill: each existing order gets one leg per distinct seller in its lines,
-- carrying that order's single historical mode/fee/ffilled window onto the
-- first seller; other sellers' legs take fee 0 and the shared window history
-- is preserved on the first. (Before legs, an order had exactly one delivery
-- fee, so only one leg can own it without re-inventing past prices.)
INSERT INTO orders.fulfilment_legs (order_id, seller_id, cluster_id, delivery_mode,
                                    delivery_fee_cents, window_start, window_end, status)
SELECT o.id,
       ol.seller_id,
       ofr.cluster_id,
       o.delivery_mode,
       CASE WHEN rn = 1 THEN o.delivery_fee_cents ELSE 0 END,
       o.window_start,
       o.window_end,
       CASE WHEN o.status IN ('DELIVERED','PARTIALLY_DISPATCHED','DISPATCHED') THEN o.status ELSE 'PAID' END
  FROM orders.orders o
  JOIN orders.order_lines ol ON ol.order_id = o.id
  JOIN catalog.offers ofr ON ofr.id = ol.offer_id
  JOIN (
    SELECT order_id, seller_id,
           row_number() OVER (PARTITION BY order_id ORDER BY seller_id) AS rn
      FROM (SELECT DISTINCT order_id, seller_id FROM orders.order_lines) d
  ) ranked
    ON ranked.order_id = o.id AND ranked.seller_id = ol.seller_id;

-- Point each line at its seller's leg.
UPDATE orders.order_lines ol
SET fulfilment_leg_id = fl.id
  FROM orders.fulfilment_legs fl
 WHERE fl.order_id = ol.order_id
   AND fl.seller_id = ol.seller_id;

ALTER TABLE orders.order_lines
  ALTER COLUMN fulfilment_leg_id SET NOT NULL;

-- ========== roles / grants ==========
GRANT SELECT, INSERT, UPDATE, DELETE ON orders.fulfilment_legs TO app_api;
GRANT SELECT ON orders.fulfilment_legs TO app_ops;
