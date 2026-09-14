-- ================================================================
-- V25 — Dev risk tiers for the seeded market sellers
-- Lets the checkout MultiSellerGate pass for the 3 demo sellers
-- (tier + on_time_rate from trust.seller_risk_tiers).
-- ================================================================

INSERT INTO trust.seller_risk_tiers (seller_id, tier, on_time_rate_30d, dispute_rate_30d, qa_rate, ops_override)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'VERIFIED_LOW', 0.9800, 0.0100, 0.9900, false),
  ('a1000000-0000-4000-8000-000000000002', 'VERIFIED_LOW', 0.9600, 0.0200, 0.9700, false),
  ('a1000000-0000-4000-8000-000000000003', 'VERIFIED_LOW', 0.9500, 0.0200, 0.9600, false)
ON CONFLICT (seller_id) DO NOTHING;