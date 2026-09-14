-- ================================================================
-- V22 — Seller identity (KYC)
-- Becoming a seller now requires identity verification (NIN/BVN/...).
-- POST /catalog/offers is gated on an APPROVED pii.seller_kyc row so
-- every offer a buyer sees comes from a known, reviewed seller.
-- ================================================================

CREATE TABLE IF NOT EXISTS pii.seller_kyc (
  user_id       UUID PRIMARY KEY REFERENCES pii.users(id) ON DELETE CASCADE,
  id_type       TEXT NOT NULL CHECK (id_type IN ('NIN','BVN','DRIVERS_LICENCE','PASSPORT','VOTERS_CARD')),
  id_number     TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  address_line1 TEXT NOT NULL,
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  review_note   TEXT,
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   UUID REFERENCES pii.users(id),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ID number may verify at most one seller account.
CREATE UNIQUE INDEX IF NOT EXISTS seller_kyc_id_unique ON pii.seller_kyc(id_type, id_number);

GRANT SELECT, INSERT, UPDATE ON pii.seller_kyc TO ojaline_app;

-- Dev reviewer account so the KYC pipeline can be exercised end-to-end
-- (password for all seeded dev accounts: Seller@1234, bcrypt cost 10).
INSERT INTO pii.users (id, phone, full_name) VALUES
  ('f7f7f7f7-0000-4000-8000-000000000001', '+2348000000099', 'Ops Reviewer')
ON CONFLICT (phone) DO NOTHING;

UPDATE pii.users
SET password_hash = '$2b$10$Er7w7bBDiPYcV5IZqHJWdusPjnDFarUq9e8rMGIcZwFbhQ72vEaSK'
WHERE id = 'f7f7f7f7-0000-4000-8000-000000000001';

INSERT INTO pii.user_roles (user_id, role_id)
SELECT 'f7f7f7f7-0000-4000-8000-000000000001', id
FROM pii.roles
WHERE name IN ('OPS', 'SELLER')
ON CONFLICT DO NOTHING;

-- Pre-verify the seeded demo sellers so existing dev flows (home page,
-- live feed, price changes) keep working untouched.
INSERT INTO pii.seller_kyc
  (user_id, id_type, id_number, date_of_birth, address_line1, city, state, status, reviewed_at, reviewed_by)
SELECT
  u.id,
  'BVN',
  '00' || substr(replace(u.id::text, '-', ''), -8),
  '1990-01-01'::date,
  'Demo address',
  'Lagos',
  'Lagos',
  'APPROVED',
  now(),
  'f7f7f7f7-0000-4000-8000-000000000001'
FROM pii.users u
WHERE u.seller_type IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;