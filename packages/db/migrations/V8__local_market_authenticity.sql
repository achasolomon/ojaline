-- ================================================================
-- V8 — Local Market Authenticity + Reviews + Chat Foundation
-- ================================================================

-- 1. New local categories
INSERT INTO catalog.categories (id, name, perishability_default, image_url) VALUES
  ('c1000000-0000-4000-8000-000000000006', 'Swallow & Soup Ingredients', 'SHELF_GT_7D', NULL),
  ('c1000000-0000-4000-8000-000000000007', 'Smoked & Dried Foods', 'SHELF_GT_7D', NULL),
  ('c1000000-0000-4000-8000-000000000008', 'Spices & Seasonings', 'SHELF_GT_7D', NULL)
ON CONFLICT (name) DO NOTHING;

-- 2. Add negotiable flag to offers
ALTER TABLE catalog.offers ADD COLUMN IF NOT EXISTS negotiable boolean DEFAULT FALSE;

-- 3. Extend seller_profiles
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS stall_number text;
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS market_name text;
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS member_since date DEFAULT CURRENT_DATE;
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS profile_photo_url text;
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS years_in_market int DEFAULT 1;

-- 4. Reviews table
CREATE TABLE IF NOT EXISTS catalog.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES catalog.offers(id),
  reviewer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  reviewer_photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_offer ON catalog.reviews(offer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_seller ON catalog.reviews(seller_id);

-- 5. Chat schema
CREATE SCHEMA IF NOT EXISTS chat;

CREATE TABLE IF NOT EXISTS chat.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  offer_id uuid,
  buyer_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_buyer ON chat.conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_conv_seller ON chat.conversations(seller_id);

CREATE TABLE IF NOT EXISTS chat.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat.conversations(id),
  sender_id uuid NOT NULL,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'system')),
  flagged boolean DEFAULT FALSE,
  flag_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON chat.messages(conversation_id);

CREATE TABLE IF NOT EXISTS chat.proxy_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat.conversations(id),
  proxy_number text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.circumvention_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_id uuid REFERENCES chat.messages(id),
  pattern_matched text NOT NULL,
  content_preview text,
  action_taken text NOT NULL DEFAULT 'blocked',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_circ_user ON chat.circumvention_log(user_id);

-- 6. Seed seller profile data
UPDATE catalog.seller_profiles SET
  stall_number = 'Stall 14', market_name = 'Yaba Monday Market',
  member_since = '2019-03-15', years_in_market = 7
WHERE user_id = 'a1000000-0000-4000-8000-000000000001';

UPDATE catalog.seller_profiles SET
  stall_number = 'Stall 27', market_name = 'Surulere Wednesday Market',
  member_since = '2020-06-01', years_in_market = 5
WHERE user_id = 'a1000000-0000-4000-8000-000000000002';

UPDATE catalog.seller_profiles SET
  stall_number = 'Shop 8', market_name = 'Ikeja Friday Market',
  member_since = '2021-01-10', years_in_market = 4
WHERE user_id = 'a1000000-0000-4000-8000-000000000003';

-- 7. Seed negotiable on wholesale offers
UPDATE catalog.offers SET negotiable = TRUE WHERE channel = 'WHOLESALE';

-- 8. Seed reviews
INSERT INTO catalog.reviews (offer_id, reviewer_id, seller_id, rating, review_text) VALUES
  ('11000000-0000-4000-8000-000000000001', '7c068a1a-fcca-4c91-a3e3-a0a96adfba12', 'a1000000-0000-4000-8000-000000000001', 5, 'Fresh tomatoes, well packed. Will buy again!'),
  ('11000000-0000-4000-8000-000000000002', '7c068a1a-fcca-4c91-a3e3-a0a96adfba12', 'a1000000-0000-4000-8000-000000000001', 4, 'Good plantain, delivery was fast.'),
  ('11000000-0000-4000-8000-000000000005', '7c068a1a-fcca-4c91-a3e3-a0a96adfba12', 'a1000000-0000-4000-8000-000000000002', 5, 'Best palm oil I have bought online. Pure and fresh.'),
  ('11000000-0000-4000-8000-000000000006', '7c068a1a-fcca-4c91-a3e3-a0a96adfba12', 'a1000000-0000-4000-8000-000000000002', 4, 'Peppers were fresh and spicy. Good quantity.');

-- 9. Grant permissions
GRANT USAGE ON SCHEMA chat TO ojaline_app;
GRANT SELECT, INSERT, UPDATE ON chat.conversations TO ojaline_app;
GRANT SELECT, INSERT ON chat.messages TO ojaline_app;
GRANT SELECT, INSERT ON chat.proxy_numbers TO ojaline_app;
GRANT SELECT, INSERT ON chat.circumvention_log TO ojaline_app;
GRANT SELECT, INSERT, UPDATE ON catalog.reviews TO ojaline_app;

-- 10. Seller completion tracking
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS completed_orders int DEFAULT 0;
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS total_orders int DEFAULT 0;

-- 11. Seed seller completion stats
UPDATE catalog.seller_profiles SET completed_orders = 47, total_orders = 52 WHERE user_id = 'a1000000-0000-4000-8000-000000000001';
UPDATE catalog.seller_profiles SET completed_orders = 23, total_orders = 28 WHERE user_id = 'a1000000-0000-4000-8000-000000000002';
UPDATE catalog.seller_profiles SET completed_orders = 15, total_orders = 19 WHERE user_id = 'a1000000-0000-4000-8000-000000000003';
