import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { Offer } from '../lib/api';
import { naira } from '@ojaline/design';
import { addToCart } from '../lib/cart';
import { prefetchOffer } from '../lib/api';
import { bargainPriceKobo } from '../lib/bargain';
import { BargainModal } from './BargainModal';
import { Icon } from './icons';

const CHANNEL_LABELS: Record<Offer['channel'], string> = {
  RETAILER: 'Retail',
  WHOLESALE: 'Wholesale',
  DIRECT: 'Direct',
  OPEN: 'Open',
};

const CHANNEL_STYLES: Record<Offer['channel'], string> = {
  RETAILER: 'bg-primary-light text-primary',
  WHOLESALE: 'bg-blue-50 text-blue-700',
  DIRECT: 'bg-amber-50 text-amber-700',
  OPEN: 'bg-neutral-100 text-neutral-600',
};

export interface OfferCardProps {
  offer: Offer;
  onClick?: (offer: Offer) => void;
  wished?: boolean;
  onWishlistToggle?: (offerId: string, wished: boolean) => void;
}

export function OfferCard({ offer, onClick, wished, onWishlistToggle }: OfferCardProps) {
  const [added, setAdded] = useState(false);
  const [bargainOpen, setBargainOpen] = useState(false);
  const ratingRaw = offer.seller_stats?.avg_rating;
  const rating = ratingRaw != null && !Number.isNaN(Number(ratingRaw)) ? Number(ratingRaw) : null;
  const reviewCount = offer.seller_stats?.review_count ?? 0;
  const outOfStock = offer.sellable_qty <= 0;
  const pausable = offer.price_cents == null;
  const hasBargain = bargainPriceKobo(offer) != null;

  const go = () => onClick?.(offer);

  const quickAdd = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (pausable) return;
    addToCart(offer, offer.min_order_qty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
  };

  const openBargain = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setBargainOpen(true);
  };

  const toggleWishlist = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onWishlistToggle?.(offer.id, !wished);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={go}
      onMouseEnter={() => prefetchOffer(offer.id)}
      onPointerDown={() => prefetchOffer(offer.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      }}
      className="group animate-fade-up relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-white transition-all duration-300 hover:-translate-y-[3px] hover:border-primary/30 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)] lg:rounded-[11px]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface">
        {offer.primary_image?.storage_key ? (
          <img
            src={`/api/media/${offer.primary_image.storage_key}`}
            alt={offer.product_name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-surface text-textSecondary">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}

        <span
          className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold shadow-sm ${CHANNEL_STYLES[offer.channel]}`}
        >
          {CHANNEL_LABELS[offer.channel]}
        </span>
        {onWishlistToggle && (
          <button
            type="button"
            onClick={toggleWishlist}
            aria-label={wished ? 'Remove from wishlist' : 'Save to wishlist'}
            className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border shadow-sm transition hover:scale-110 ${
              wished
                ? 'border-[#f5a623] bg-[#f5a623] text-white'
                : 'border-border bg-white/95 text-textSecondary'
            }`}
          >
            <Icon name="heart" size={14} className={wished ? 'fill-current' : ''} />
          </button>
        )}
        {offer.negotiable && (
          <span className="absolute bottom-2 left-2 rounded-md bg-[#f5a623] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
            Negotiable
          </span>
        )}
        {!outOfStock && !pausable && (
          <button
            type="button"
            onClick={quickAdd}
            aria-label="Add to cart"
            className="absolute bottom-2 right-2 hidden h-8 w-8 items-center justify-center rounded-full border border-border bg-white/95 text-primary opacity-0 shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition-all duration-200 hover:scale-110 hover:bg-primary hover:text-white group-hover:opacity-100 lg:flex"
          >
            <Icon name="plus" size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5 lg:p-[11px]">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-text lg:text-[11px]">
          {offer.product_name}
        </h3>

        <div className="flex items-center gap-1.5">
          {rating != null ? (
            <>
              <Icon name="star" size={12} className="fill-current text-secondary" />
              <span className="text-[11px] font-bold text-text lg:text-[10px]">{rating.toFixed(1)}</span>
              <span className="text-[10px] text-textSecondary lg:text-[9px]">({reviewCount})</span>
            </>
          ) : (
            <span className="rounded bg-primary-light px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary lg:text-[8px]">
              New
            </span>
          )}
          <span className="ml-auto truncate pl-1 text-right text-[10px] text-textSecondary lg:text-[9px]">
            {offer.physical_ref}
          </span>
        </div>

        <p className="flex items-center gap-1 text-[11px] text-textSecondary lg:text-[10px]">
          <span className="truncate">{offer.seller_name || 'Verified seller'}</span>
          <Icon name="check" size={12} className="shrink-0 text-primary" />
        </p>

        <div className="mt-auto pt-1">
          {!pausable ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-black tracking-tight text-text lg:text-[15px]">
                  {naira.format(offer.price_cents! / 100)}
                </span>
                {offer.unit ? (
                  <span className="text-[10px] font-medium text-textSecondary lg:text-[9px]">/ {offer.unit}</span>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-1">
                <span className="text-[9px] text-textSecondary lg:text-[8px]">
                  {outOfStock ? 'Out of stock' : `Min order: ${offer.min_order_qty}${offer.unit ? ` ${offer.unit}` : ''}`}
                </span>
                {!outOfStock && hasBargain && (
                  <button
                    type="button"
                    onClick={openBargain}
                    className="flex items-center gap-0.5 bg-transparent text-[10px] font-bold text-[#B7790A] hover:text-[#A36A00] hover:underline lg:text-[9px]"
                  >
                    <Icon name="bolt" size={10} className="fill-current" /> Bargain
                  </button>
                )}
              </div>
            </>
          ) : (
            <span className="text-[11px] font-semibold text-textSecondary">Price on request</span>
          )}
        </div>

        <button
          type="button"
          onClick={quickAdd}
          disabled={outOfStock || pausable}
          className={`mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[11px] font-bold transition-all duration-200 active:scale-[0.98] lg:h-[30px] lg:text-[9px] ${
            added
              ? 'border-primary bg-primary text-white'
              : outOfStock || pausable
                ? 'cursor-not-allowed border-border bg-surface text-textSecondary'
                : 'border-primary bg-white text-primary hover:bg-primary hover:text-white'
          }`}
        >
          {added ? (
            <>
              <Icon name="check" size={12} /> Added
            </>
          ) : outOfStock ? (
            'Out of stock'
          ) : pausable ? (
            'Enquire'
          ) : (
            <>
              <Icon name="cart" size={13} /> Add to cart
            </>
          )}
        </button>
      </div>

      {bargainOpen && <BargainModal offer={offer} onClose={() => setBargainOpen(false)} />}
    </article>
  );
}