-- ================================================================
-- V18 — Asynchronous seller replies in negotiation threads
--
-- Buyer bids no longer get an instant seller reply. The response is
-- parked on the thread (reply_* columns); a 3s sweep inserts it a few
-- seconds later and pushes an SSE event + an in-app notification so
-- the buyer can leave the chat, keep shopping, and come back when the
-- seller answers.
-- ================================================================

ALTER TABLE market.negotiations
  ADD COLUMN IF NOT EXISTS reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_kind text,
  ADD COLUMN IF NOT EXISTS reply_per_unit_kobo int,
  ADD COLUMN IF NOT EXISTS reply_qty int,
  ADD COLUMN IF NOT EXISTS reply_text text;

ALTER TABLE market.negotiations
  ADD CONSTRAINT chk_negotiations_reply_kind
  CHECK (reply_kind IS NULL OR reply_kind IN ('SELLER_OFFER', 'SELLER_ACCEPT'))
  NOT VALID;