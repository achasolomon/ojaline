-- ================================================================
-- V24 — Bargain "end" (either party), frozen prices, no callbacks
--
-- Haggling becomes symmetric: the buyer OR the seller can end a
-- bargain at any time. Ending freezes the last price each side put
-- on the table:
--   frozen_seller_per_unit_kobo — the buyer can "Pay this"
--   frozen_buyer_per_unit_kobo  — the seller can "Sell for this"
-- Either party can reopen the thread with "Continue bargain".
-- The automatic walk-away callback machinery (callback_at,
-- callback_sent, unseen_callbacks, dropped_at) is removed: a seller
-- no longer gets an automatic nudge.
-- ================================================================

-- 1. New 'END' message kind. 'WALK'/'CALLBACK' stay in the enum for
--    historical rows; the service stops emitting them.
ALTER TABLE market.negotiation_messages DROP CONSTRAINT negotiation_messages_kind_check;
ALTER TABLE market.negotiation_messages ADD CONSTRAINT negotiation_messages_kind_check
  CHECK (kind = ANY (ARRAY['BUYER_BID'::text, 'SELLER_OFFER'::text, 'SELLER_ACCEPT'::text, 'BUYER_ACCEPT'::text, 'WALK'::text, 'CALLBACK'::text, 'NOTE'::text, 'REVOKE'::text, 'END'::text]));

-- 2. WALKED becomes ENDED (constraint must be dropped first so the
--    re-cast is accepted).
ALTER TABLE market.negotiations DROP CONSTRAINT negotiations_observable_check;
UPDATE market.negotiations SET observable = 'ENDED' WHERE observable = 'WALKED';
ALTER TABLE market.negotiations ADD CONSTRAINT negotiations_observable_check
  CHECK (observable = ANY (ARRAY['OPEN'::text, 'ENDED'::text, 'SETTLED'::text, 'REVOKED'::text]));

-- 3. Freeze + actor columns.
ALTER TABLE market.negotiations
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by text,
  ADD COLUMN IF NOT EXISTS frozen_seller_per_unit_kobo int,
  ADD COLUMN IF NOT EXISTS frozen_buyer_per_unit_kobo int,
  ADD COLUMN IF NOT EXISTS freeze_expires_at timestamptz;

ALTER TABLE market.negotiations
  ADD CONSTRAINT chk_negotiations_ended_by
  CHECK (ended_by IS NULL OR ended_by IN ('BUYER', 'SELLER'))
  NOT VALID;

-- 4. Remove the automatic callback machinery entirely.
ALTER TABLE market.negotiations
  DROP COLUMN IF EXISTS callback_at,
  DROP COLUMN IF EXISTS callback_sent,
  DROP COLUMN IF EXISTS unseen_callbacks,
  DROP COLUMN IF EXISTS dropped_at;