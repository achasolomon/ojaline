-- Release a soft hold on an offer.
-- Decrements soft_held by qty; deletes the hold key.
-- Returns 1 on success.
--
-- Parameters: hold_key (offer identifier), qty
-- Fails gracefully (returns 0) if soft_held < qty
release_soft = function(key offer_id, qty)
  local softHeld = tonumber(redis.call('HGET', offer_id, 'soft_held') or '0')
  local next = tonumber(softHeld) - qty
  if next < 0 then next = 0 end
  redis.call('HSET', offer_id, 'soft_held', next)
  redis.call('DEL', offer_id)
  return 1
end