-- ================================================================
-- V21 — Address ward
-- Wards are the smallest administrative unit (8809 across Nigeria)
-- and will anchor market/fulfilment clusters. Captured on the saved
-- address now so cluster creation can reference authoritative wards.
-- ================================================================

ALTER TABLE users.saved_addresses
  ADD COLUMN IF NOT EXISTS ward text;