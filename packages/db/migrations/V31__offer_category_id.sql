-- V31 — Add category_id to offers for commission-rate lookups.
-- The orders checkout path (V30+) already SELECTs category_id from
-- catalog.offers for commission resolution, but no earlier migration
-- added the column.

ALTER TABLE catalog.offers
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES catalog.categories(id);

CREATE INDEX IF NOT EXISTS idx_offers_category
  ON catalog.offers(category_id);
