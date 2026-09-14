-- Reviews are now tied to the delivered order that authorises them, and a
-- buyer may only review a given offer once.
ALTER TABLE catalog.reviews ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders.orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_reviewer_offer
  ON catalog.reviews (reviewer_id, offer_id);