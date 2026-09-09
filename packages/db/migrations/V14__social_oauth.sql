-- ================================================================
-- V14 — Social login (OAuth): Google & Facebook
--
-- Social providers don't return a phone number, so phone becomes
-- optional. The existing UNIQUE index still applies (Postgres allows
-- multiple NULLs), so email-first accounts can add a phone later
-- from Account settings (ADR: "prompt later" for social users).
-- ================================================================

-- 1. Phone is no longer mandatory; social accounts join with email only.
ALTER TABLE pii.users
  ALTER COLUMN phone DROP NOT NULL;

-- 2. Provider accounts linked to users (one user may link several).
CREATE TABLE IF NOT EXISTS auth.oauth_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            text NOT NULL CHECK (provider IN ('google', 'facebook')),
  provider_account_id text NOT NULL,
  user_id             uuid NOT NULL REFERENCES pii.users(id) ON DELETE CASCADE,
  email               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON auth.oauth_accounts(user_id);

-- 3. API role permissions.
--    Register/oauth create users — V10 only granted SELECT, UPDATE on
--    pii.users (V3 revoked ALL), so this closes that gap, plus the
--    BUYER role row for new accounts.
GRANT INSERT ON pii.users TO ojaline_app;
GRANT INSERT ON pii.user_roles TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.oauth_accounts TO ojaline_app;