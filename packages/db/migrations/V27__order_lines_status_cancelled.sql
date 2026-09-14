-- Buyer cancellation writes 'CANCELLED' to order_lines.status, but the
-- Data Model v1.0 CHECK on that column never allowed it.
ALTER TABLE orders.order_lines
  DROP CONSTRAINT order_lines_status_check;

ALTER TABLE orders.order_lines
  ADD CONSTRAINT order_lines_status_check
  CHECK (status IN ('PAID','DISPATCHED','DELIVERED','PENDING','REFUNDED','FAILED','CANCELLED'));