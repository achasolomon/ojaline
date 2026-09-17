-- V38 — Seller storefront appearance (profile photo + banner)
ALTER TABLE catalog.seller_profiles ADD COLUMN IF NOT EXISTS banner_url text;