-- ================================================================
-- V13 — Dev passwords for seeded market sellers
-- Enables real seller login (and therefore live "seller online"
-- presence, offer creation, price-change market feed events).
-- Password for all three: Seller@1234 (bcrypt cost 10)
-- ================================================================

UPDATE pii.users
SET password_hash = '$2b$10$Er7w7bBDiPYcV5IZqHJWdusPjnDFarUq9e8rMGIcZwFbhQ72vEaSK'
WHERE id IN (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003'
);

-- Make sure sellers carry a SELLER role so their sessions are sellers.
INSERT INTO pii.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM pii.users u
CROSS JOIN pii.roles r
WHERE u.id IN (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003'
)
AND r.name = 'SELLER'
ON CONFLICT DO NOTHING;