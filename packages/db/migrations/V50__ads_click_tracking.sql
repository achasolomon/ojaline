-- Ad performance: track taps on served ads so sellers can see engagement.
-- The existing table-level grants on marketing.ads (V15) cover this new column.

ALTER TABLE marketing.ads
  ADD COLUMN IF NOT EXISTS clicks_shown integer NOT NULL DEFAULT 0
  CHECK (clicks_shown >= 0);