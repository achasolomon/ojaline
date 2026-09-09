-- ================================================================
-- V10 — Authentication: passwords, email, reset tokens, admin seed
-- ================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- 1. Add credential columns to pii.users
ALTER TABLE pii.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON pii.users(email)
  WHERE email IS NOT NULL;

-- 2. Reset tokens
CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES pii.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'password_reset',
  expired_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES pii.users(id),
  UNIQUE (user_id, purpose, token_hash)
);
CREATE INDEX IF NOT EXISTS idx_prt_token ON auth.password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user ON auth.password_reset_tokens(user_id);

-- 3. Permissions for the API role
GRANT USAGE ON SCHEMA auth TO ojaline_app;
GRANT SELECT, UPDATE ON pii.users TO ojaline_app;
GRANT SELECT, INSERT, UPDATE ON auth.password_reset_tokens TO ojaline_app;

-- 4. Seed an admin user + OPS role assignment.
--    Password: Admin@1234 (bcrypt hash below, cost 10)
INSERT INTO pii.users (id, phone, full_name, email, password_hash, status)
VALUES (
  '00000000-0000-4000-8000-0000000000a1',
  '+2348000000001',
  'Ojaline Admin',
  'admin@ojaline.com',
  '$2b$10$h1UPB61lKGVfu2DoMsuZPOlzLv/QYjrnNXVv1LtMc2xffdpKQCp0a',
  'ACTIVE'
)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO pii.user_roles (user_id, role_id)
SELECT '00000000-0000-4000-8000-0000000000a1', id
FROM pii.roles
WHERE name IN ('OPS', 'AGENT')
ON CONFLICT DO NOTHING;
