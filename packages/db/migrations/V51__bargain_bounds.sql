-- ================================================================
-- V51 — Bounded haggle: round caps, deadlines, reopen cap
--
-- Every bargain is now guaranteed to end:
--   · max 3 buyer bids and 3 seller counters (enforced in service)
--   · an OPEN thread that sits idle 24h auto-freezes (prices pinned)
--   · a frozen price lasts 24h, then the thread is closed for good
--   · a thread can be reopened at most once (continueBargain)
-- Service-side sweeps drive the deadlines; this migration only adds
-- the two tiny bookkeeping columns they need.
-- ================================================================

ALTER TABLE market.negotiations
  ADD COLUMN IF NOT EXISTS reopen_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_freeze_reminded_at timestamptz;

-- System-generated messages (auto-freeze / expiry notices) carry no actor,
-- so widen the message side enum to admit 'SYSTEM'.
ALTER TABLE market.negotiation_messages DROP CONSTRAINT IF EXISTS negotiation_messages_side_check;
ALTER TABLE market.negotiation_messages ADD CONSTRAINT negotiation_messages_side_check
  CHECK (side = ANY (ARRAY['BUYER'::text, 'SELLER'::text, 'SYSTEM'::text]));