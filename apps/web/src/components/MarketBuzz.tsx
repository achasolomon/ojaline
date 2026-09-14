import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Offer } from '../lib/api';
import { naira } from '@ojaline/design';
import { bargainPriceKobo, sellerTitle, firstName } from '../lib/bargain';
import { BargainModal } from './BargainModal';

interface MarketBuzzProps {
  offers: Offer[];
  slice?: number;
}

export function MarketBuzz({ offers, slice = 4 }: MarketBuzzProps) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [bargainOffer, setBargainOffer] = useState<Offer | null>(null);

  const candidates = useMemo(() => {
    if (offers.length === 0) return [];
    const priced = offers.filter((o) => o.price_cents != null);
    const ranked = [...priced].sort((a, b) => {
      const dropA = bargainPriceKobo(a);
      const dropB = bargainPriceKobo(b);
      const ratioA = dropA != null ? dropA / a.price_cents! : 1;
      const ratioB = dropB != null ? dropB / b.price_cents! : 1;
      return ratioA - ratioB;
    });
    const picked: Offer[] = [];
    const seen = new Set<string>();
    for (const item of ranked) {
      if (picked.length >= slice) break;
      if (seen.has(item.seller_id)) continue;
      seen.add(item.seller_id);
      picked.push(item);
    }
    return picked;
  }, [offers, slice]);

  useEffect(() => {
    if (candidates.length < 2 || paused) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % candidates.length), 5000);
    return () => window.clearInterval(t);
  }, [candidates.length, paused]);

  const current = candidates[index % candidates.length];

  if (!current) return null;

  const offer = current;
  const drop = bargainPriceKobo(offer);
  const original = offer.price_cents! / 100;
  const dropped = naira.format((drop ?? offer.price_cents!) / 100);
  const originalLabel = naira.format(original);
  const initials = firstName(offer.seller_name).charAt(0).toUpperCase();
  const pctOff = drop != null ? Math.round((1 - drop / offer.price_cents!) * 100) : null;

  return (
    <div
      className="mb-4 shrink-0 lg:mb-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-4 mb-2 flex items-center justify-between lg:mx-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-textSecondary">
          Today at the market
        </span>
        {candidates.length > 1 && (
          <span className="flex items-center gap-1.5">
            {candidates.map((c, i) => (
              <span
                key={c.id}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === index % candidates.length ? 'w-4 bg-primary' : 'w-1 bg-border'
                }`}
              />
            ))}
          </span>
        )}
      </div>

      <div
        key={offer.id}
        role="button"
        tabIndex={0}
        title={offer.product_name}
        onClick={() => navigate(`/offers/${offer.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/offers/${offer.id}`);
          }
        }}
        className="animate-fade-in relative mx-4 flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-primary-dark px-4 py-3.5 text-white shadow-[0_10px_28px_rgba(26,125,56,0.28)] transition-shadow hover:shadow-[0_14px_34px_rgba(26,125,56,0.36)] lg:mx-0 lg:rounded-[14px]"
      >
        {/* decorative arcs */}
        <span className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-white/10" />
        <span className="pointer-events-none absolute -bottom-16 right-16 h-28 w-28 rounded-full bg-white/10" />

        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 text-sm font-bold text-white backdrop-blur-sm">
          {initials}
        </span>

        <div className="relative min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-white/75">{offer.product_name}</p>
          <p className="truncate text-[10px] text-white/60 lg:hidden">
            {sellerTitle(offer)} · {offer.unit ? `per ${offer.unit}` : 'per unit'}
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[19px] font-black tracking-tight lg:text-[18px]">{dropped}</span>
            {pctOff != null && (
              <>
                <span className="text-[11px] font-medium text-white/60 line-through">{originalLabel}</span>
                <span className="rounded-full bg-white/15 px-1.5 py-px text-[9px] font-bold text-white">
                  −{pctOff}%
                </span>
              </>
            )}
          </div>
        </div>

        <span className="relative hidden truncate text-[10px] font-medium text-white/70 lg:block">
          {sellerTitle(offer)} · {offer.unit ? `per ${offer.unit}` : 'per unit'}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setBargainOffer(offer);
          }}
          className="relative shrink-0 rounded-lg bg-secondary px-3.5 py-2 text-[11px] font-bold text-primary-dark shadow-sm transition hover:bg-[#F0BE1F] active:scale-[0.97]"
        >
          Bargain
        </button>
      </div>

      {bargainOffer && <BargainModal offer={bargainOffer} onClose={() => setBargainOffer(null)} />}
    </div>
  );
}