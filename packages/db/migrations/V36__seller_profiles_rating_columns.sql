-- ================================================================
-- V36 — Formalise schema drift: seller_profiles rating columns
-- catalog.service.ts already reads/writes avg_rating and review_count
-- on catalog.seller_profiles, but no prior migration created them.
-- ================================================================

ALTER TABLE catalog.seller_profiles
  ADD COLUMN IF NOT EXISTS avg_rating   NUMERIC(3,2) DEFAULT 4.5,
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
