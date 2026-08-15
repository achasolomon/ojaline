-- Seed the five Ojaline roles (System Doc — actors). V2 runs idempotently.
INSERT INTO pii.roles (name) VALUES
  ('BUYER'),
  ('SELLER'),
  ('RIDER'),
  ('AGENT'),
  ('OPS')
ON CONFLICT (name) DO NOTHING;
