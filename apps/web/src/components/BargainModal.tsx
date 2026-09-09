import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Offer } from '../lib/api';
import { naira } from '@ojaline/design';
import { addToCart } from '../lib/cart';
import { bargainPriceKobo, bargainFloorKobo, sellerTitle } from '../lib/bargain';
import { Icon } from './icons';

type Stage = 'buyer' | 'thinking' | 'accepted' | 'floor' | 'added';

const roundTo50 = (kobo: number) => Math.max(50, Math.round(kobo / 50) * 50);

export function BargainModal({ offer, onClose, onDeal }: { offer: Offer; onClose: () => void; onDeal?: (agreedKobo: number) => void }) {
  const [stage, setStage] = useState<Stage>('buyer');
  const [input, setInput] = useState('');
  const [agreed, setAgreed] = useState<number | null>(null);

  const seller = sellerTitle(offer);
  const ask = bargainPriceKobo(offer);
  const floor = bargainFloorKobo(offer);
  const original = offer.price_cents;

  if (ask == null || floor == null || original == null) return null;

  const fmt = (kobo: number) => naira.format(kobo / 100);

  const chipOptions = [
    { label: `−5% · ${fmt(roundTo50(ask * 0.95))}`, value: roundTo50(ask * 0.95) },
    { label: `−10% · ${fmt(roundTo50(ask * 0.9))}`, value: roundTo50(ask * 0.9) },
  ];

  const parseInput = (): number | null => {
    const n = Number(input.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return roundTo50(Math.round(n * 100));
  };

  const sendOffer = () => {
    const counter = parseInput();
    if (counter == null) return;
    setStage('thinking');
    window.setTimeout(() => {
      if (counter >= ask) {
        setAgreed(ask);
        setStage('accepted');
      } else if (counter >= floor) {
        setAgreed(counter);
        setStage('accepted');
      } else {
        setAgreed(floor);
        setStage('floor');
      }
    }, 900);
  };

  const deal = () => {
    if (agreed == null) return;
    addToCart(offer, offer.min_order_qty, agreed);
    onDeal?.(agreed);
    setStage('added');
    window.setTimeout(onClose, 1100);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade-in absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="animate-sheet-up sm:animate-scale-in relative w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-[0_24px_60px_rgba(0,0,0,0.3)] sm:rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-secondary to-[#F5A623] px-5 py-4 text-[#6B4A00]">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#8A5F00]">
            Negotiate · {seller}
          </div>
          <div className="mt-2 flex items-end gap-2.5">
            <span className="text-2xl font-black tracking-tight text-[#5B4300]">{fmt(ask)}</span>
            <span className="text-[13px] font-semibold text-[#8A5F00]/70 line-through">{fmt(original)}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] font-medium text-[#6B4A00]">for {offer.product_name}</p>
        </div>

        {/* Body */}
        <div className="max-h-[46vh] overflow-y-auto px-5 py-4">
          {stage === 'buyer' && (
            <>
              <p className="mb-2 text-[13px] font-semibold text-text">Your offer (₦)</p>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-white px-3 transition focus-within:border-primary">
                <span className="text-sm font-bold text-textSecondary">₦</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  placeholder={`e.g. ${Math.round(ask / 100)}`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendOffer()}
                  autoFocus
                  className="h-11 min-w-0 flex-1 bg-transparent text-base font-bold text-text outline-none"
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {chipOptions.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => {
                      setInput(String(chip.value / 100));
                      setStage('thinking');
                      window.setTimeout(() => {
                        setAgreed(chip.value);
                        setStage('accepted');
                      }, 900);
                    }}
                    className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-text transition hover:border-[#D99E00] hover:text-[#A36A00]"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={sendOffer}
                  disabled={parseInput() == null}
                  className="h-11 flex-1 rounded-xl bg-secondary text-[13px] font-bold text-primary-dark transition hover:bg-[#F0BE1F] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Send offer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAgreed(ask);
                    setStage('accepted');
                  }}
                  className="h-11 rounded-xl border border-[#E3B21F] px-4 text-[13px] font-semibold text-[#A36A00] transition hover:bg-[#FFF6DA]"
                >
                  Accept {fmt(ask)}
                </button>
              </div>
              <p className="mt-3 text-[10px] font-medium text-textSecondary">
                Sellers usually settle around {fmt(floor)} · market promo, today only
              </p>
            </>
          )}

          {stage === 'thinking' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-light text-primary">
                <Icon name="clock" size={20} className="animate-pulse" />
              </span>
              <p className="text-[13px] font-semibold text-text">{seller} dey think about your offer…</p>
            </div>
          )}

          {stage === 'accepted' && agreed != null && (
            <>
              <div className="rounded-xl bg-primary-light px-4 py-3">
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-primary">
                  <Icon name="check" size={15} /> Deal! {seller} agree.
                </p>
                <p className="mt-1 text-[12px] text-text">
                  You go take am at <span className="font-bold">{fmt(agreed)}</span>
                  <span className="text-textSecondary"> ({fmt(ask)} original drop)</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={deal}
                className="mt-4 h-11 w-full rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-dark active:scale-[0.98]"
              >
                Deal! Add to cart · {fmt(agreed)}
              </button>
            </>
          )}

          {stage === 'floor' && agreed != null && (
            <>
              <div className="rounded-xl bg-surface px-4 py-3">
                <p className="text-[13px] font-semibold text-text">
                  {seller}: <span className="italic">"Hmm… e don reach my final. {fmt(agreed)} only."</span>
                </p>
                <p className="mt-1 text-[11px] text-textSecondary">That's the lowest they can go today.</p>
              </div>
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={deal}
                  className="h-11 flex-1 rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-dark active:scale-[0.98]"
                >
                  Deal at {fmt(agreed)}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-xl border border-border px-4 text-sm font-semibold text-textSecondary transition hover:bg-surface"
                >
                  Too high
                </button>
              </div>
            </>
          )}

          {stage === 'added' && (
            <div className="flex items-center justify-center gap-2 py-10">
              <p className="flex items-center gap-2 text-[14px] font-bold text-primary">
                <Icon name="check" size={18} /> Added to cart
              </p>
            </div>
          )}
        </div>

        {stage !== 'added' && (
          <div className="border-t border-border px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="w-full text-center text-[11px] font-semibold text-textSecondary hover:text-text"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}