-- Get the current counters for an offer.
-- Returns available, reserved, soft_held as strings.
get_counters = function(key offer_id)
  local available = redis.call('HGET', offer_id, 'available')
  local reserved = redis.call('HGET', offer_id, 'reserved')
  local softHeld = redis.call('HGET', offer_id, 'soft_held')
  return available, reserved, softHeld
end