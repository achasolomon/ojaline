ALTER TABLE orders.orders
  ADD COLUMN delivery_mode text NOT NULL DEFAULT 'SCHEDULED',
  ADD CONSTRAINT orders_delivery_mode_check CHECK (delivery_mode IN ('INSTANT', 'SCHEDULED', 'MARKET_DAY'));