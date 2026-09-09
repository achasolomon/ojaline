-- ================================================================
-- V11 — Offer measurement/unit capture
-- ================================================================

-- Sellers sell local measures: basket of yam, trailer of plantain,
-- crate of tomatoes, bag of rice, bunch of vegetables, etc.
ALTER TABLE catalog.offers ADD COLUMN IF NOT EXISTS unit text;

COMMENT ON COLUMN catalog.offers.unit IS
  'Local measurement unit for the offer, e.g. basket, trailer, crate, bag, bunch';

-- Seed representative units on existing offers so the UI can show them
UPDATE catalog.offers o
SET unit = CASE
  WHEN l.product_name ILIKE '%tomato%' THEN 'crate'
  WHEN l.product_name ILIKE '%yam%' THEN 'basket'
  WHEN l.product_name ILIKE '%plantain%' THEN 'bunch'
  WHEN l.product_name ILIKE '%palm%' THEN 'bottle'
  WHEN l.product_name ILIKE '%pepper%' THEN 'basket'
  WHEN l.product_name ILIKE '%rice%' THEN 'bag'
  WHEN l.product_name ILIKE '%maize%' OR l.product_name ILIKE '%corn%' THEN 'bag'
  WHEN l.product_name ILIKE '%garri%' THEN 'bag'
  WHEN l.product_name ILIKE '%onion%' THEN 'bag'
  WHEN l.product_name ILIKE '%melon%' THEN 'measure'
  ELSE 'unit'
END
FROM catalog.lots l
WHERE l.id = o.lot_id AND o.unit IS NULL;
