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

const PRODUCT_PLACEHOLDER_BG = 'radial-gradient(circle at 30% 45%,#e34e32 0 12%,transparent 12.5%),radial-gradient(circle at 58% 62%,#d8442f 0 13%,transparent 13.5%),radial-gradient(circle at 72% 33%,#f0a21f 0 9%,transparent 9.5%),radial-gradient(circle at 45% 25%,#69a03b 0 12%,transparent 12.5%),linear-gradient(145deg,#f4f7ef,#dfead8)';

export interface OfferCardProps {
  offer: Offer;
  onClick?: (offer: Offer) => void;
}

export function OfferCard({ offer, onClick }: OfferCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(offer)}
      className="w-full rounded-xl border border-border bg-white text-left shadow-sm transition-shadow hover:shadow-md overflow-hidden"
    >
      <div className="h-32 bg-cover bg-center">
        {offer.primary_image?.storage_key ? (
          <img
            src={`/api/media/${offer.primary_image.storage_key}`}
            alt={offer.product_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full" style={{ background: PRODUCT_PLACEHOLDER_BG }} />
        )}
      </div>

      <div className="p-3.5">
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
      </div>
    </button>
  );
}
