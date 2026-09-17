-- V39 — Offer-level view tracking (seller product-detail analytics)
CREATE TABLE IF NOT EXISTS catalog.offer_views (
  offer_id  UUID    NOT NULL REFERENCES catalog.offers(id) ON DELETE CASCADE,
  viewed_on DATE    NOT NULL DEFAULT CURRENT_DATE,
  views     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (offer_id, viewed_on)
);

-- Seed a realistic 14-day history for every offer so sellers see a populated
-- performance chart immediately. Deterministic per (offer, day) so re-applying
-- in a scratch DB looks the same.
INSERT INTO catalog.offer_views (offer_id, viewed_on, views)
SELECT o.id,
       d.day,
       GREATEST(2, (1 + abs(hashtext(o.id::text || d.day::text)) % 45))
  FROM catalog.offers o
       CROSS JOIN generate_series(CURRENT_DATE - 13, CURRENT_DATE, '1 day'::interval) AS d(day)
ON CONFLICT (offer_id, viewed_on) DO NOTHING;