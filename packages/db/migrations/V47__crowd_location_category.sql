-- ============================================================================
-- V47 — Location- and category-aware crowd matching
--   A buyer's want now remembers where it was posted (the guest/GPS point or
--   ward picked at creation) and, optionally, a category. market.bids records
--   how far the seller's offer sits from the want so the buyer's bid list can
--   be ordered nearest-first. Matching in the bid-discovery engine also accepts
--   category matches, so a want reaches sellers whose offers share its category
--   even when the product names differ.
-- ============================================================================

ALTER TABLE market.wants
  ADD COLUMN latitude  NUMERIC(9,6),
  ADD COLUMN longitude NUMERIC(9,6),
  ADD COLUMN category_id UUID REFERENCES catalog.categories(id);

CREATE INDEX idx_wants_category ON market.wants(category_id);

ALTER TABLE market.bids
  ADD COLUMN distance_m INTEGER;
