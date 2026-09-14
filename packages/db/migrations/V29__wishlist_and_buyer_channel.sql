-- wishlist (buyer favourites) + buyer channel for checkout channel-matching.

-- ---------------------------------------------------------------- wishlist
CREATE TABLE IF NOT EXISTS catalog.wishlist_items (
  user_id    uuid        NOT NULL REFERENCES pii.users(id) ON DELETE CASCADE,
  offer_id   uuid        NOT NULL REFERENCES catalog.offers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offer_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user_created
  ON catalog.wishlist_items (user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON catalog.wishlist_items TO ojaline_app;

-- ---------------------------------------------------------------- buyer channel
-- Channel of a buyer-facing account. 'OPEN' buyers can purchase on any channel.
ALTER TABLE pii.users ADD COLUMN IF NOT EXISTS channel text;

UPDATE pii.users
   SET channel = CASE WHEN id = '7c068a1a-fcca-4c91-a3e3-a0a96adfba12' THEN 'OPEN' ELSE 'RETAILER' END
 WHERE channel IS NULL;

ALTER TABLE pii.users
  ALTER COLUMN channel SET DEFAULT 'RETAILER',
  ALTER COLUMN channel SET NOT NULL;

ALTER TABLE pii.users
  DROP CONSTRAINT IF EXISTS ck_users_channel;

ALTER TABLE pii.users
  ADD CONSTRAINT ck_users_channel CHECK (channel IN ('RETAILER','WHOLESALE','DIRECT','OPEN'));