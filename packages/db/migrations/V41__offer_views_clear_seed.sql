-- V41 — drop simulated view-history rows seeded by the original V39.
-- Views must reflect real buyer page opens only, never fabricated numbers.
TRUNCATE TABLE catalog.offer_views;