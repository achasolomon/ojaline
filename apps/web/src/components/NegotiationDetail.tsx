import { useEffect, useState } from 'react';
import { naira } from '@ojaline/design';
import {
  createOfferNegotiation,
  type Negotiation,
} from '../lib/negotiation';
import { getCartItems, subscribeCart, addToCart, type CartItem } from '../lib/cart';
import { getOfferById } from '../lib/api';
import { NegotiationChat } from './NegotiationChat';
import { Icon } from './icons';

const fmt = (kobo: number) => naira.format(kobo / 100);

/** The settled deal is currently in the buyer's cart (negotiation-bound, or legacy price match). */
function dealInCart(neg: Negotiation, items: CartItem[]): boolean {
  const bound = items.find((i) => i.negotiation_id === neg.id);
  if (bound) return true;
  if (neg.status === 'SETTLED') {
    const offerId = neg.basis.type === 'OFFER' ? neg.basis.offer.id : neg.basis.offer_ref.offer_id;
    const agreed = [...neg.messages].reverse().find((m) => m.side === 'SELLER' && m.per_unit_kobo != null);
    return (
      offerId != null &&
      agreed != null &&
      items.some((i) => i.offer_id === offerId && !i.negotiation_id && i.unit_price_kobo === agreed.per_unit_kobo)
    );
  }
  return false;
}

export function NegotiationDetail({
  negotiation,
  onRestarted,
}: {
  negotiation: Negotiation;
  onRestarted?: (fresh: Negotiation) => void;
}) {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => getCartItems());
  const [reAdding, setReAdding] = useState(false);

  useEffect(() => subscribeCart(setCartItems), []);

  const agreedMsg = [...negotiation.messages].reverse().find((m) => m.side === 'SELLER' && m.per_unit_kobo != null);
  const agreedPrice = agreedMsg?.per_unit_kobo ?? null;
  const agreedQty = agreedMsg && agreedMsg.qty > 0 ? agreedMsg.qty : negotiation.qty;
  const inCart = dealInCart(negotiation, cartItems);

  const settle = (q: number, perUnit: number) => {
    if (negotiation.basis.type === 'OFFER') {
      addToCart(negotiation.basis.offer, q, perUnit, undefined, negotiation.id);
      return;
    }
    const offerId = negotiation.basis.offer_ref.offer_id;
    if (!offerId) return;
    getOfferById(offerId)
      .then((o) => addToCart(o, q, perUnit, undefined, negotiation.id))
      .catch(() => {});
  };

  const reAdd = async () => {
    if (agreedPrice == null) return;
    setReAdding(true);
    try {
      if (negotiation.basis.type === 'OFFER') {
        addToCart(negotiation.basis.offer, agreedQty, agreedPrice, undefined, negotiation.id);
      } else {
        const offerId = negotiation.basis.offer_ref.offer_id;
        if (!offerId) return;
        const o = await getOfferById(offerId);
        addToCart(o, agreedQty, agreedPrice, undefined, negotiation.id);
      }
    } finally {
      setReAdding(false);
    }
  };

  const restart = async () => {
    if (negotiation.basis.type !== 'OFFER') return;
    const fresh = await createOfferNegotiation(negotiation.basis.offer, negotiation.buyer_name, agreedQty);
    onRestarted?.(fresh);
  };

  return (
    <>
      {negotiation.status === 'SETTLED' && !inCart && (
        <div className="border-b border-border bg-[#FFF6DA] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F5A623]/20 text-[#A36A00]">
              <Icon name="trash" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-[#6B4A00]">You commot am from cart</p>
              <p className="mt-0.5 text-[11px] font-medium text-[#8A5F00]">
                {negotiation.seller.name.split(' ')[0]} don know. E fit reach out to ask why — meantime you fit add am
                back.
              </p>
            </div>
            {agreedPrice != null && (
              <button
                type="button"
                onClick={reAdd}
                disabled={reAdding}
                className="shrink-0 rounded-lg bg-[#A36A00] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#8A5A00] disabled:opacity-50"
              >
                {reAdding ? 'Adding…' : `Add back · ${fmt(agreedPrice)}`}
              </button>
            )}
          </div>
        </div>
      )}

      {negotiation.status === 'REVOKED' && (
        <div className="border-b border-border bg-[#FFF0EC] px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FDE4DC] text-[#8F3A2B]">
              <Icon name="trash" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-[#8F3A2B]">Deal revoke</p>
              <p className="mt-0.5 text-[11px] font-medium text-[#B05645]">
                The seller don know say you commot am. E fit message you to ask why and try reconnect.
              </p>
            </div>
            {negotiation.basis.type === 'OFFER' && (
              <button
                type="button"
                onClick={restart}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-white transition hover:bg-primary-dark"
              >
                Fresh haggle
              </button>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <NegotiationChat negotiation={negotiation} onSettle={settle} />
      </div>
    </>
  );
}