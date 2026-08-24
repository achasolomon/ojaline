import type { Offer } from '../lib/api';
import { PriceDisplay } from '@ojaline/design';

const CHANNEL_LABELS: Record<Offer['channel'], string> = {
  RETAILER: 'Retail',
  WHOLESALE: 'Wholesale',
  DIRECT: 'Direct',
  OPEN: 'Open',
};

const CHANNEL_COLORS: Record<Offer['channel'], string> = {
  RETAILER: 'bg-primary-light text-primary',
  WHOLESALE: 'bg-blue-50 text-blue-700',
  DIRECT: 'bg-amber-50 text-amber-700',
  OPEN: 'bg-neutral-100 text-neutral-600',
};

const PERISHABILITY_LABELS: Record<Offer['perishability'], string> = {
  SHELF_GT_7D: 'Shelf 7+ days',
  SHELF_LT_7D: 'Perishable',
};

export interface OfferCardProps {
  offer: Offer;
  onClick?: (offer: Offer) => void;
}

export function OfferCard({ offer, onClick }: OfferCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(offer)}
      className="w-full rounded-xl border border-border bg-white p-3.5 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-text leading-tight">{offer.product_name}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${CHANNEL_COLORS[offer.channel]}`}>
          {CHANNEL_LABELS[offer.channel]}
        </span>
      </div>

      <p className="mb-2 text-xs text-textSecondary">{offer.physical_ref}</p>

      {offer.seller_name && (
        <p className="mb-2 text-xs text-textSecondary">
          Sold by <span className="font-medium text-text">{offer.seller_name}</span>
        </p>
      )}

      <div className="mb-2 flex flex-wrap gap-1.5">
        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-textSecondary">
          Min order: {offer.min_order_qty}
        </span>
        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-textSecondary">
          {PERISHABILITY_LABELS[offer.perishability]}
        </span>
        {offer.fulfilment_modes.map((mode) => (
          <span key={mode} className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-textSecondary">
            {mode.replace('_', ' ')}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-textSecondary">Available: </span>
          <span className="text-sm font-bold text-text">{offer.sellable_qty}</span>
        </div>
        {offer.price_cents != null && (
          <PriceDisplay amount={offer.price_cents / 100} size="sm" />
        )}
      </div>
    </button>
  );
}
