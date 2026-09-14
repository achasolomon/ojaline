-- ================================================================
-- V23 — Seller KYC tiers
-- Selling now opens at a BASIC tier: the account details already
-- gathered at sign-up plus a short business profile allow listing
-- offers immediately. Full identity KYC (NIN/BVN/documents) becomes a
-- separate, higher tier that unlocks payouts, the "Verified seller"
-- badge and Ad Studio. pii.seller_kyc already holds identity data.
-- ================================================================

ALTER TABLE catalog.seller_profiles
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS lga text,
  ADD COLUMN IF NOT EXISTS kyc_tier text NOT NULL DEFAULT 'BASIC'
    CHECK (kyc_tier IN ('BASIC', 'FULL'));

-- Sellers whose identity was already approved are already at the FULL tier.
UPDATE catalog.seller_profiles sp
SET kyc_tier = 'FULL'
FROM pii.seller_kyc k
WHERE k.user_id = sp.user_id
  AND k.status = 'APPROVED';