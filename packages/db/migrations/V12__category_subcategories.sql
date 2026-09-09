-- ================================================================
-- V12 — Category subcategories (parent_id + menu_section)
--        powers the marketplace mega-menu navigation.
-- ================================================================

-- Section heading a subcategory belongs to inside its parent's mega menu.
ALTER TABLE catalog.categories ADD COLUMN IF NOT EXISTS menu_section text;

-- Seed fine-grained subcategories under each parent. Leaf names are unique
-- (categories.name has a UNIQUE constraint) so they can be shopped directly.
INSERT INTO catalog.categories (id, name, perishability_default, image_url, parent_id, menu_section) VALUES
  -- ===================== Fresh Vegetables =====================
  ('c3000000-0000-4000-8000-000000000001', 'Fresh Tomatoes',       'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Tomatoes & Peppers'),
  ('c3000000-0000-4000-8000-000000000002', 'Scotch Bonnet Peppers','SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Tomatoes & Peppers'),
  ('c3000000-0000-4000-8000-000000000003', 'Bell Peppers',         'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Tomatoes & Peppers'),
  ('c3000000-0000-4000-8000-000000000004', 'Ugu Leaves',           'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Leafy Greens'),
  ('c3000000-0000-4000-8000-000000000005', 'Spinach',              'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Leafy Greens'),
  ('c3000000-0000-4000-8000-000000000006', 'Cabbage',              'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Leafy Greens'),
  ('c3000000-0000-4000-8000-000000000007', 'Onions',               'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Bulbs & Roots'),
  ('c3000000-0000-4000-8000-000000000008', 'Carrots',              'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Bulbs & Roots'),
  ('c3000000-0000-4000-8000-000000000009', 'Beetroot',             'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Bulbs & Roots'),
  ('c3000000-0000-4000-8000-000000000010', 'Okra',                 'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Pods & Fruits'),
  ('c3000000-0000-4000-8000-000000000011', 'Garden Egg',           'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Pods & Fruits'),
  ('c3000000-0000-4000-8000-000000000012', 'Cucumber',             'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000001', 'Pods & Fruits'),
  -- ===================== Fresh Fruits =====================
  ('c3000000-0000-4000-8000-000000000013', 'Oranges',              'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Citrus'),
  ('c3000000-0000-4000-8000-000000000014', 'Tangerines',           'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Citrus'),
  ('c3000000-0000-4000-8000-000000000015', 'Lemons',               'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Citrus'),
  ('c3000000-0000-4000-8000-000000000016', 'Bananas',              'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Bananas & Plantains'),
  ('c3000000-0000-4000-8000-000000000017', 'Plantain',             'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Bananas & Plantains'),
  ('c3000000-0000-4000-8000-000000000018', 'Mangoes',              'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Mangoes & Melons'),
  ('c3000000-0000-4000-8000-000000000019', 'Pawpaw',               'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Mangoes & Melons'),
  ('c3000000-0000-4000-8000-000000000020', 'Watermelon',           'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Mangoes & Melons'),
  ('c3000000-0000-4000-8000-000000000021', 'Apples',               'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Apples & Berries'),
  ('c3000000-0000-4000-8000-000000000022', 'Pears',                'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Apples & Berries'),
  ('c3000000-0000-4000-8000-000000000023', 'Grapes',               'SHELF_LT_7D', NULL, 'c1000000-0000-4000-8000-000000000002', 'Apples & Berries'),
  -- ===================== Grains & Cereals =====================
  ('c3000000-0000-4000-8000-000000000024', 'Ofada Rice',           'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Rice'),
  ('c3000000-0000-4000-8000-000000000025', 'Local Rice',           'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Rice'),
  ('c3000000-0000-4000-8000-000000000026', 'Basmati Rice',         'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Rice'),
  ('c3000000-0000-4000-8000-000000000027', 'Honey Beans',          'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Beans & Pulses'),
  ('c3000000-0000-4000-8000-000000000028', 'Brown Beans',          'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Beans & Pulses'),
  ('c3000000-0000-4000-8000-000000000029', 'Groundnut',            'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Beans & Pulses'),
  ('c3000000-0000-4000-8000-000000000030', 'Sweet Corn',           'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Corn & Maize'),
  ('c3000000-0000-4000-8000-000000000031', 'Dry Maize',            'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Corn & Maize'),
  ('c3000000-0000-4000-8000-000000000032', 'Millet',               'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Corn & Maize'),
  ('c3000000-0000-4000-8000-000000000033', 'Garri',                'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Flours & Starch'),
  ('c3000000-0000-4000-8000-000000000034', 'Corn Flour',           'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Flours & Starch'),
  ('c3000000-0000-4000-8000-000000000035', 'Wheat Flour',          'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000003', 'Flours & Starch'),
  -- ===================== Tubers & Roots =====================
  ('c3000000-0000-4000-8000-000000000036', 'White Yam',            'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000004', 'Yam'),
  ('c3000000-0000-4000-8000-000000000037', 'Water Yam',            'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000004', 'Yam'),
  ('c3000000-0000-4000-8000-000000000038', 'Cassava',              'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000004', 'Cassava & Starch'),
  ('c3000000-0000-4000-8000-000000000039', 'Cocoyam',              'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000004', 'Cassava & Starch'),
  ('c3000000-0000-4000-8000-000000000040', 'Sweet Potatoes',       'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000004', 'Potatoes'),
  ('c3000000-0000-4000-8000-000000000041', 'Irish Potatoes',       'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000004', 'Potatoes'),
  -- ===================== Oils & Condiments =====================
  ('c3000000-0000-4000-8000-000000000042', 'Palm Oil',             'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000005', 'Vegetable Oils'),
  ('c3000000-0000-4000-8000-000000000043', 'Groundnut Oil',        'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000005', 'Vegetable Oils'),
  ('c3000000-0000-4000-8000-000000000044', 'Coconut Oil',          'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000005', 'Vegetable Oils'),
  ('c3000000-0000-4000-8000-000000000045', 'Tomato Paste',         'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000005', 'Condiments'),
  ('c3000000-0000-4000-8000-000000000046', 'Locust Beans (Iru)',   'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000005', 'Condiments'),
  ('c3000000-0000-4000-8000-000000000047', 'Groundnut Paste',      'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000005', 'Condiments'),
  -- ===================== Swallow & Soup Ingredients =====================
  ('c3000000-0000-4000-8000-000000000048', 'Semovita',             'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Swallow Staples'),
  ('c3000000-0000-4000-8000-000000000049', 'Poundo Yam',           'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Swallow Staples'),
  ('c3000000-0000-4000-8000-000000000050', 'Eba Mix',              'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Swallow Staples'),
  ('c3000000-0000-4000-8000-000000000051', 'Ogbono',               'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Soup Thickeners'),
  ('c3000000-0000-4000-8000-000000000052', 'Egusi Melon',          'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Soup Thickeners'),
  ('c3000000-0000-4000-8000-000000000053', 'Achi',                 'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Soup Thickeners'),
  ('c3000000-0000-4000-8000-000000000054', 'Crayfish',             'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Broth & Base'),
  ('c3000000-0000-4000-8000-000000000055', 'Stockfish Pieces',     'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Broth & Base'),
  ('c3000000-0000-4000-8000-000000000056', 'Ogiri',                'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000006', 'Broth & Base'),
  -- ===================== Smoked & Dried Foods =====================
  ('c3000000-0000-4000-8000-000000000057', 'Smoked Catfish',       'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000007', 'Smoked Fish'),
  ('c3000000-0000-4000-8000-000000000058', 'Smoked Titus',         'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000007', 'Smoked Fish'),
  ('c3000000-0000-4000-8000-000000000059', 'Kilishi',              'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000007', 'Dried Meats'),
  ('c3000000-0000-4000-8000-000000000060', 'Dried Meat',           'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000007', 'Dried Meats'),
  ('c3000000-0000-4000-8000-000000000061', 'Stockfish',            'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000007', 'Dried & Preserved'),
  ('c3000000-0000-4000-8000-000000000062', 'Dried Pepper',         'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000007', 'Dried & Preserved'),
  ('c3000000-0000-4000-8000-000000000063', 'Dried Vegetables',     'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000007', 'Dried & Preserved'),
  -- ===================== Spices & Seasonings =====================
  ('c3000000-0000-4000-8000-000000000064', 'Ginger',               'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000008', 'Root Spices'),
  ('c3000000-0000-4000-8000-000000000065', 'Garlic',               'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000008', 'Root Spices'),
  ('c3000000-0000-4000-8000-000000000066', 'Turmeric',             'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000008', 'Root Spices'),
  ('c3000000-0000-4000-8000-000000000067', 'Pepper Powder',        'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000008', 'Powdered Spices'),
  ('c3000000-0000-4000-8000-000000000068', 'Curry Powder',         'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000008', 'Powdered Spices'),
  ('c3000000-0000-4000-8000-000000000069', 'Thyme',                'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000008', 'Powdered Spices'),
  ('c3000000-0000-4000-8000-000000000070', 'Seasoning Powder',     'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000008', 'Seasonings'),
  ('c3000000-0000-4000-8000-000000000071', 'Sea Salt',             'SHELF_GT_7D', NULL, 'c1000000-0000-4000-8000-000000000008', 'Seasonings')
ON CONFLICT (name) DO UPDATE SET
  parent_id = EXCLUDED.parent_id,
  menu_section = EXCLUDED.menu_section,
  perishability_default = EXCLUDED.perishability_default,
  image_url = EXCLUDED.image_url;

-- Point seeded lots at the matching leaf categories so subcategory pages
-- return real products (also keeps parent "view all" pages populated via
-- the child-matching rule in discoverOffers).
UPDATE catalog.lots SET category_id = 'c3000000-0000-4000-8000-000000000001' WHERE product_name ILIKE '%tomato%';
UPDATE catalog.lots SET category_id = 'c3000000-0000-4000-8000-000000000002' WHERE product_name ILIKE '%pepper%';
UPDATE catalog.lots SET category_id = 'c3000000-0000-4000-8000-000000000017' WHERE product_name ILIKE '%plantain%';
UPDATE catalog.lots SET category_id = 'c3000000-0000-4000-8000-000000000036' WHERE product_name ILIKE '%yam%';
UPDATE catalog.lots SET category_id = 'c3000000-0000-4000-8000-000000000024' WHERE product_name ILIKE '%rice%';
UPDATE catalog.lots SET category_id = 'c3000000-0000-4000-8000-000000000042' WHERE product_name ILIKE '%palm%';
UPDATE catalog.lots SET category_id = 'c3000000-0000-4000-8000-000000000006' WHERE product_name ILIKE '%vegetable%';