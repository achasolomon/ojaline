-- ================================================================
-- V15 — Marketplace ads (ADR-009)
--
-- Sellers promote their stalls via popup toasts + homepage banners.
-- Free in v1: budget = date window + impression cap + 3-active cap
-- per seller. Live publishing, buyer reporting, auto-remove at 5
-- reports. No money moves (no billing in v1).
-- ================================================================

CREATE SCHEMA IF NOT EXISTS marketing;

-- ---------------------------------------------------------------- ads
CREATE TABLE IF NOT EXISTS marketing.ads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         uuid NOT NULL REFERENCES pii.users(id),
  title             text NOT NULL,
  body              text,
  format            text NOT NULL CHECK (format IN ('TOAST', 'BANNER')),
  image_key         text,
  target_type       text NOT NULL DEFAULT 'NONE'
                      CHECK (target_type IN ('OFFER', 'SELLER', 'NONE')),
  target_id         uuid,
  category_id       uuid REFERENCES catalog.categories(id),
  cluster_id        uuid REFERENCES catalog.clusters(id),
  channel           text CHECK (channel IN ('RETAILER', 'WHOLESALE', 'DIRECT', 'OPEN')),
  status            text NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'PAUSED', 'ENDED', 'REMOVED')),
  starts_at         timestamptz NOT NULL DEFAULT now(),
  ends_at           timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  max_impressions   int CHECK (max_impressions IS NULL OR max_impressions >= 0),
  impressions_shown int NOT NULL DEFAULT 0 CHECK (impressions_shown >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((target_type = 'NONE') = (target_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_ads_active_format ON marketing.ads (format, status)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_ads_seller ON marketing.ads (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_ads_ends_at ON marketing.ads (ends_at)
  WHERE status = 'ACTIVE';

-- -------------------------------------------------------- ad reports
-- One report per (ad, reporter); >4 reports auto-removes the ad.
CREATE TABLE IF NOT EXISTS marketing.ad_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id       uuid NOT NULL REFERENCES marketing.ads(id),
  reporter_id uuid REFERENCES pii.users(id),
  reason      text NOT NULL CHECK (reason IN ('SPAM', 'MISLEADING', 'OFFENSIVE', 'OTHER')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_id, reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_reports_ad ON marketing.ad_reports (ad_id);

-- ---------------------------------------------------------------- grants
GRANT USAGE ON SCHEMA marketing TO ojaline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA marketing TO ojaline_app;