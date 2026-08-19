-- Acquire a soft hold on an offer.
-- Returns 1 on success, 0 if insufficient available quantity.
-- Parameters: offer_key, hold_key, qty, ttl_seconds
-- The hold is automatically released after ttl_seconds via expiry.
--
-- Success: soft_held incremented, hold_key set with TTL
-- Failure: available - reserved - soft_held < qty, no state change
--
-- Idempotency: repeated calls with the same hold_key are safe;
-- the TTL renews on each successful acquire.
--
-- Relies on the DB CHECK (reserved_qty + soft_held_qty <= available_qty)
-- as the authoritative backstop; the Redis gate is the fast path.
--
-- Fail-closed: if Redis is unreachable, the calling code must refuse
-- the hold (never allow). This script assumes Redis is available.
acquire_soft = function(key offer_key, key hold_key, qty, ttl)
  local available = tonumber(redis.call('HGET', offer_key, 'available') or '0')
  local reserved = tonumber(redis.call('HGET', offer_key, 'reserved') or '0')
  local softHeld = tonumber(redis.call('HGET', offer_key, 'soft_held') or '0')
  if available - reserved - softHeld < qty then
    return 0
  end
  redis.call('HSET', offer_key, 'soft_held', softHeld + qty)
  redis.call('SET', hold_key, offer_key, 'EX', ttl)
  return 1
end