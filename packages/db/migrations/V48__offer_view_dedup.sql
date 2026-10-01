-- A product view counts once per viewer per offer per day. `viewer_key` is the
-- signed-in user id (prefix 'u:') or a client-generated anonymous visitor id
-- (prefix 'a:') for guests, so refreshing a page no longer inflates view counts.
CREATE TABLE IF NOT EXISTS catalog.offer_view_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES catalog.offers(id) ON DELETE CASCADE,
  viewer_key text NOT NULL,
  viewed_on date NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS offer_view_events_offer_viewer_day
  ON catalog.offer_view_events (offer_id, viewer_key, viewed_on);

CREATE INDEX IF NOT EXISTS offer_view_events_viewed_on_idx
  ON catalog.offer_view_events (viewed_on);