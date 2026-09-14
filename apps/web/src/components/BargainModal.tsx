import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Offer } from '../lib/api';
import { naira } from '@ojaline/design';
import { addToCart } from '../lib/cart';
import { volumePerUnitKobo, sellerTitle } from '../lib/bargain';
import {
  createOfferNegotiation,
  ensureLoaded,
  findOfferNegotiation,
  subscribeNegotiations,
  getNegotiations,
  type Negotiation,
} from '../lib/negotiation';
import { NegotiationChat } from './NegotiationChat';

export function BargainModal({
  offer,
  initialQty,
  onClose,
  onDeal,
}: {
  offer: Offer;
  initialQty?: number;
  onClose: () => void;
  onDeal?: (agreedKobo: number) => void;
}) {
  const [negId, setNegId] = useState<string | null>(null);
  const [thread, setThread] = useState<Negotiation | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const off = subscribeNegotiations((items) => {
      setNegId((currentId) => {
        if (!currentId) return currentId;
        const cur = items.find((n) => n.id === currentId);
        if (cur) {
          setThread((prev) => (prev && prev.updated_at === cur.updated_at ? prev : cur));
          return currentId;
        }
        if (currentId.startsWith('draft:')) {
          // First bid promoted the draft to a real thread: keep the modal on
          // it. If the draft vanished without a real sibling (ended / failed),
          // the bargain never happened — close.
          const real = items.find((n) => !n.draft && n.basis.type === 'OFFER' && n.basis.offer.id === offer.id);
          if (real) setThread((prev) => (prev && prev.updated_at === real.updated_at ? prev : real));
          else onCloseRef.current?.();
        }
        return currentId;
      });
    });

    void (async () => {
      try {
        await ensureLoaded();
        if (cancelled) return;
        const existing =
          findOfferNegotiation(offer.id, ['OPEN', 'ENDED']) ??
          (await createOfferNegotiation(offer, 'customer', initialQty));
        if (cancelled) return;
        setNegId(existing.id);
        setThread(existing);
      } catch {
        /* store stays empty while the API is unreachable */
      }
    })();

    return () => {
      cancelled = true;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id]);

  const fresh = getNegotiations().find((n) => n.id === negId);
  const current = fresh ?? thread;

  const singleAsk = volumePerUnitKobo(offer, 1) ?? offer.price_cents;
  const fmt = (kobo: number) => naira.format(kobo / 100);

  if (singleAsk == null || offer.price_cents == null) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade-in absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="animate-sheet-up sm:animate-scale-in relative flex h-[88vh] max-h-[680px] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.3)] sm:rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-secondary to-[#F5A623] px-5 py-4 text-[#6B4A00]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#8A5F00]">
                Negotiate · {sellerTitle(offer)}
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-xl font-black tracking-tight text-[#5B4300]">{fmt(singleAsk)}</span>
                <span className="text-[12px] font-semibold text-[#8A5F00]/70 line-through">{fmt(offer.price_cents)}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] font-medium text-[#6B4A00]">
                per {offer.unit?.trim() || 'unit'} · {offer.product_name}
              </p>
            </div>
          </div>
        </div>

        {/* Thread */}
        {current ? (
          <NegotiationChat
            negotiation={current}
            onSettle={(qty, perUnit) => {
              addToCart(offer, qty, perUnit, undefined, current.id);
              onDeal?.(perUnit);
            }}
          />
        ) : null}

        {/* Footer */}
        <div className="border-t border-border bg-white px-5 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-[11px] font-semibold text-textSecondary hover:text-text"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}