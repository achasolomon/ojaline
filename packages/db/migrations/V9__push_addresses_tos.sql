-- ================================================================
-- V9 — Push Notifications, Saved Addresses, ToS Enforcement
-- ================================================================

CREATE SCHEMA IF NOT EXISTS users;

-- 1. Push notification subscriptions
CREATE TABLE IF NOT EXISTS users.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  device_type text DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON users.push_subscriptions(user_id);

-- 2. Push notification log
CREATE TABLE IF NOT EXISTS users.push_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_notif_user ON users.push_notifications(user_id);

-- 3. Saved addresses
CREATE TABLE IF NOT EXISTS users.saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'Home',
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  lga text,
  landmark text,
  phone_number text NOT NULL,
  is_default boolean DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addr_user ON users.saved_addresses(user_id);

-- 4. ToS enforcement ladder
CREATE TABLE IF NOT EXISTS trust.tos_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  violation_type text NOT NULL,
  severity smallint NOT NULL DEFAULT 1,
  description text,
  action_taken text NOT NULL DEFAULT 'flagged',
  evidence jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tos_user ON trust.tos_violations(user_id);

-- 5. Seller visibility penalty (hidden from ranking when flagged)
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS visibility_penalty boolean DEFAULT FALSE;
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS tos_warning_count int DEFAULT 0;

-- 6. Grant permissions
GRANT USAGE ON SCHEMA users TO ojaline_app;
GRANT SELECT, INSERT ON users.push_subscriptions TO ojaline_app;
GRANT SELECT, INSERT ON users.push_notifications TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON users.saved_addresses TO ojaline_app;
GRANT SELECT, INSERT, UPDATE ON trust.tos_violations TO ojaline_app;

-- 7. Seed default addresses for demo buyer
INSERT INTO users.saved_addresses (user_id, label, address_line1, address_line2, city, state, lga, landmark, phone_number, is_default) VALUES
  ('7c068a1a-fcca-4c91-a3e3-a0a96adfba12', 'Home', '15 Murtala Muhammed Way', '3rd Floor, Room 302', 'Lagos', 'Lagos', 'Yaba', 'Near Yaba Bus Stop', '+2348012345678', true),
  ('7c068a1a-fcca-4c91-a3e3-a0a96adfba12', 'Office', '22 Allen Avenue', NULL, 'Lagos', 'Lagos', 'Ikeja', 'Behind Zenith Bank', '+2348087654321', false);
