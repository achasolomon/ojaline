-- Ojaline seed data — realistic products for frontend development
-- Run as ojaline superuser (for pii writes) then ojaline_app (for catalog)
-- Usage: psql -U ojaline -d ojaline -p 5433 -f scripts/seed.sql

BEGIN;

-- ================================================================
-- 1. USERS (pii — superuser required)
-- ================================================================

-- Sellers
INSERT INTO pii.users (id, phone, full_name) VALUES
  ('a1000000-0000-4000-8000-000000000001', '+2348031234567', 'Adebola Akinwale'),
  ('a1000000-0000-4000-8000-000000000002', '+2348057654321', 'Bisi Olatunji'),
  ('a1000000-0000-4000-8000-000000000003', '+2348091112233', 'Chidi Eze')
ON CONFLICT (phone) DO NOTHING;

-- Buyer
INSERT INTO pii.users (id, phone, full_name) VALUES
  ('b1000000-0000-4000-8000-000000000001', '+2348129876543', 'Amaka Okafor')
ON CONFLICT (phone) DO NOTHING;

-- Assign roles
INSERT INTO pii.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM pii.users u, pii.roles r
WHERE u.phone IN ('+2348031234567', '+2348057654321', '+2348091112233')
  AND r.name = 'SELLER'
ON CONFLICT DO NOTHING;

INSERT INTO pii.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM pii.users u, pii.roles r
WHERE u.phone = '+2348129876543'
  AND r.name = 'BUYER'
ON CONFLICT DO NOTHING;

-- ================================================================
-- 2. CATEGORIES
-- ================================================================

INSERT INTO catalog.categories (id, name, perishability_default) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'Fresh Vegetables', 'SHELF_LT_7D'),
  ('c1000000-0000-4000-8000-000000000002', 'Fresh Fruits', 'SHELF_LT_7D'),
  ('c1000000-0000-4000-8000-000000000003', 'Grains & Cereals', 'SHELF_GT_7D'),
  ('c1000000-0000-4000-8000-000000000004', 'Tubers & Roots', 'SHELF_GT_7D'),
  ('c1000000-0000-4000-8000-000000000005', 'Oils & Condiments', 'SHELF_GT_7D')
ON CONFLICT (name) DO NOTHING;

-- Grade standards (minimal)
INSERT INTO catalog.grade_standards (category_id, criteria, ref_photo_required)
SELECT id, '{"min_weight_kg": 1, "max_blemish_pct": 10, "color": "uniform"}'::jsonb, TRUE
FROM catalog.categories
ON CONFLICT (category_id, version) DO NOTHING;

-- ================================================================
-- 3. CLUSTERS (Lagos neighborhoods)
-- ================================================================

INSERT INTO catalog.clusters (id, name, lga, centroid) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Yaba', 'Lagos Mainland', ST_SetSRID(ST_MakePoint(3.3896, 6.5158), 4326)::geography),
  ('d1000000-0000-4000-8000-000000000002', 'Surulere', 'Surulere', ST_SetSRID(ST_MakePoint(3.3574, 6.5269), 4326)::geography),
  ('d1000000-0000-4000-8000-000000000003', 'Ikeja', 'Ikeja', ST_SetSRID(ST_MakePoint(3.3515, 6.6018), 4326)::geography)
ON CONFLICT DO NOTHING;

-- ================================================================
-- 4. MARKETS
-- ================================================================

INSERT INTO catalog.markets (id, cluster_id, name, calendar, order_cutoff, weather_gate_enabled) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Yaba Monday Market', '{"days": ["MON"]}'::jsonb, '18:00', TRUE),
  ('e1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Surulere Wednesday Market', '{"days": ["WED"]}'::jsonb, '18:00', TRUE),
  ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'Ikeja Friday Market', '{"days": ["FRI"]}'::jsonb, '17:00', TRUE)
ON CONFLICT DO NOTHING;

-- ================================================================
-- 5. LOTS (seller inventory)
-- ================================================================

INSERT INTO catalog.lots (id, seller_id, product_name, physical_ref, category_id) VALUES
  -- Adebola Farms
  ('f1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Fresh Tomatoes', 'Grade A, Ibadan origin', (SELECT id FROM catalog.categories WHERE name = 'Fresh Vegetables')),
  ('f1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Ripe Plantain', 'Foreign plantain, premium', (SELECT id FROM catalog.categories WHERE name = 'Fresh Fruits')),
  ('f1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'White Yam', 'Oyo State yam, large tubers', (SELECT id FROM catalog.categories WHERE name = 'Tubers & Roots')),
  -- Iya Bisi Foods
  ('f1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002', 'Local Rice (Ofada)', 'Ofada rice, short grain', (SELECT id FROM catalog.categories WHERE name = 'Grains & Cereals')),
  ('f1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', 'Palm Oil', 'Borno State red palm oil', (SELECT id FROM catalog.categories WHERE name = 'Oils & Condiments')),
  ('f1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000002', 'Fresh Peppers', 'Scotch bonnet & habanero mix', (SELECT id FROM catalog.categories WHERE name = 'Fresh Vegetables')),
  -- Green Valley Farms
  ('f1000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000003', 'Mixed Vegetables', 'Carrot, green bean, cabbage mix', (SELECT id FROM catalog.categories WHERE name = 'Fresh Vegetables')),
  ('f1000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000003', 'Ofada Rice', 'Direct from Ogun farms', (SELECT id FROM catalog.categories WHERE name = 'Grains & Cereals'))
ON CONFLICT DO NOTHING;

-- ================================================================
-- 6. OFFERS (varied channels, perishability, fulfilment)
-- ================================================================

INSERT INTO catalog.offers (id, seller_id, channel, lot_id, available_qty, min_order_qty, perishability, fulfilment_modes, geo, cluster_id) VALUES
  -- Fresh Tomatoes — RETAILER, perishable, instant+scheduled
  ('11000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'RETAILER', 'f1000000-0000-4000-8000-000000000001', 500, 5, 'SHELF_LT_7D', ARRAY['INSTANT','SCHEDULED'], ST_SetSRID(ST_MakePoint(3.3896, 6.5158), 4326)::geography, 'd1000000-0000-4000-8000-000000000001'),

  -- Ripe Plantain — DIRECT, perishable, instant
  ('11000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'DIRECT', 'f1000000-0000-4000-8000-000000000002', 200, 10, 'SHELF_LT_7D', ARRAY['INSTANT'], ST_SetSRID(ST_MakePoint(3.3896, 6.5158), 4326)::geography, 'd1000000-0000-4000-8000-000000000001'),

  -- White Yam — RETAILER, shelf-stable, market day
  ('11000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'RETAILER', 'f1000000-0000-4000-8000-000000000003', 300, 10, 'SHELF_GT_7D', ARRAY['MARKET_DAY','SCHEDULED'], ST_SetSRID(ST_MakePoint(3.3896, 6.5158), 4326)::geography, 'd1000000-0000-4000-8000-000000000001'),

  -- Local Rice — WHOLESALE, shelf-stable, all modes
  ('11000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002', 'WHOLESALE', 'f1000000-0000-4000-8000-000000000004', 1000, 50, 'SHELF_GT_7D', ARRAY['INSTANT','SCHEDULED','MARKET_DAY'], ST_SetSRID(ST_MakePoint(3.3574, 6.5269), 4326)::geography, 'd1000000-0000-4000-8000-000000000002'),

  -- Palm Oil — WHOLESALE, shelf-stable, market day+scheduled
  ('11000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', 'WHOLESALE', 'f1000000-0000-4000-8000-000000000005', 800, 20, 'SHELF_GT_7D', ARRAY['MARKET_DAY','SCHEDULED'], ST_SetSRID(ST_MakePoint(3.3574, 6.5269), 4326)::geography, 'd1000000-0000-4000-8000-000000000002'),

  -- Fresh Peppers — RETAILER, perishable, instant
  ('11000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000002', 'RETAILER', 'f1000000-0000-4000-8000-000000000006', 150, 2, 'SHELF_LT_7D', ARRAY['INSTANT'], ST_SetSRID(ST_MakePoint(3.3574, 6.5269), 4326)::geography, 'd1000000-0000-4000-8000-000000000002'),

  -- Mixed Vegetables — OPEN, perishable, instant+scheduled
  ('11000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000003', 'OPEN', 'f1000000-0000-4000-8000-000000000007', 400, 3, 'SHELF_LT_7D', ARRAY['INSTANT','SCHEDULED'], ST_SetSRID(ST_MakePoint(3.3515, 6.6018), 4326)::geography, 'd1000000-0000-4000-8000-000000000003'),

  -- Ofada Rice — DIRECT, shelf-stable, market day
  ('11000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000003', 'DIRECT', 'f1000000-0000-4000-8000-000000000008', 600, 25, 'SHELF_GT_7D', ARRAY['MARKET_DAY'], ST_SetSRID(ST_MakePoint(3.3515, 6.6018), 4326)::geography, 'd1000000-0000-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

-- ================================================================
-- 7. PRICE HISTORY (current prices in kobo)
-- ================================================================

INSERT INTO catalog.offer_price_history (offer_id, new_price_cents) VALUES
  ('11000000-0000-4000-8000-000000000001', 120000),   -- Fresh Tomatoes: ₦1,200/kg
  ('11000000-0000-4000-8000-000000000002', 80000),    -- Ripe Plantain: ₦800/bunch
  ('11000000-0000-4000-8000-000000000003', 250000),   -- White Yam: ₦2,500/tuber
  ('11000000-0000-4000-8000-000000000004', 450000),   -- Local Rice: ₦4,500/25kg bag
  ('11000000-0000-4000-8000-000000000005', 320000),   -- Palm Oil: ₦3,200/5L
  ('11000000-0000-4000-8000-000000000006', 150000),   -- Fresh Peppers: ₦1,500/kg
  ('11000000-0000-4000-8000-000000000007', 180000),   -- Mixed Vegetables: ₦1,800/kg
  ('11000000-0000-4000-8000-000000000008', 350000);   -- Ofada Rice: ₦3,500/10kg

COMMIT;
