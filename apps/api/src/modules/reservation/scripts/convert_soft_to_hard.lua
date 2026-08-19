-- Convert a soft hold to a hard reservation.
-- Moves qty from soft_held to reserved in the offer hash.
-- Returns 1 on success.
--
-- Parameters: offer_key (offer identifier), qty
convert_soft_to_hard = function(key offer_id, qty)
  local softHeld = tonumber(redis.call('HGET', offer_id, 'soft_held') or '0')
  if softHeld < qty then return 0 end
  redis.call('HSET', offer_id, 'soft_held', softHeld - qty)
  redis.call('HSET', offer_id, 'reserved', (tonumber(redis.call('HGET', offer_id, 'reserved') or '0')) + qty)
  return 1
end