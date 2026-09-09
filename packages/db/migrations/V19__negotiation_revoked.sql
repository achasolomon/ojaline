ALTER TABLE market.negotiations DROP CONSTRAINT negotiations_observable_check;
ALTER TABLE market.negotiations ADD CONSTRAINT negotiations_observable_check
  CHECK (observable = ANY (ARRAY['OPEN'::text, 'SETTLED'::text, 'WALKED'::text, 'REVOKED'::text]));

ALTER TABLE market.negotiation_messages DROP CONSTRAINT negotiation_messages_kind_check;
ALTER TABLE market.negotiation_messages ADD CONSTRAINT negotiation_messages_kind_check
  CHECK (kind = ANY (ARRAY['BUYER_BID'::text, 'SELLER_OFFER'::text, 'SELLER_ACCEPT'::text, 'BUYER_ACCEPT'::text, 'WALK'::text, 'CALLBACK'::text, 'NOTE'::text, 'REVOKE'::text]));