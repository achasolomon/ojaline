-- ================================================================
-- V20 — Delivery-grade addresses
-- Adds the fields a real dispatch needs: who receives, the
-- neighbourhood/area, rider instructions, and coordinates.
-- ================================================================

ALTER TABLE users.saved_addresses
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Backfill existing rows: recipient = the account holder, area = the LGA
-- that was already being used as a neighbourhood ("Yaba", "Ikeja", ...).
UPDATE users.saved_addresses a
   SET recipient_name = u.full_name,
       area = COALESCE(NULLIF(a.lga, ''), a.area)
  FROM pii.users u
 WHERE a.user_id = u.id
   AND a.recipient_name IS NULL;