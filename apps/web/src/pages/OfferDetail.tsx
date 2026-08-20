import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@ojaline/design';
import { naira } from '@ojaline/design';
import { getOfferById } from '../lib/api';
import type { Offer, FulfilmentMode } from '../lib/api';
import { LandedCost } from '../components/LandedCost';

const DELIVERY_FEES: Record<FulfilmentMode, number> = {
  INSTANT: 120000,
  SCHEDULED: 80000,
  MARKET_DAY: 50000,
};

const DELIVERY_LABELS: Record<FulfilmentMode, string> = {
  INSTANT: 'Instant (2-3h)',
  SCHEDULED: 'Scheduled',
  MARKET_DAY: 'Market Day',
};

const DELIVERY_TIMES: Record<FulfilmentMode, string> = {
  INSTANT: 'Delivered in 2-3 hours',
  SCHEDULED: 'Choose your delivery window',
  MARKET_DAY: 'Next market day (Mon, Wed, Fri)',
};

const CHANNEL_LABELS: Record<Offer['channel'], string> = {
  RETAILER: 'Retail',
  WHOLESALE: 'Wholesale',
  DIRECT: 'Direct',
  OPEN: 'Open',
};

const CHANNEL_COLORS: Record<Offer['channel'], string> = {
  RETAILER: 'bg-primaryLight text-primary',
  WHOLESALE: 'bg-blue-50 text-blue-700',
  DIRECT: 'bg-amber-50 text-amber-700',
  OPEN: 'bg-neutral-100 text-neutral-600',
};

const PERISHABILITY_LABELS: Record<Offer['perishability'], string> = {
  SHELF_GT_7D: 'Shelf 7+ days',
  SHELF_LT_7D: 'Perishable (< 7 days)',
};

export default function OfferDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deliveryMode, setDeliveryMode] = useState<FulfilmentMode>('INSTANT');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);

    getOfferById(id)
      .then((found) => {
        if (cancelled) return;
        setOffer(found);
        setQty(found.min_order_qty);
        if (found.fulfilment_modes.length > 0) {
          setDeliveryMode(found.fulfilment_modes[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load offer');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <p className="text-sm font-medium text-danger">{error ?? 'Offer not found'}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/offers')}>
          Back to offers
        </Button>
      </div>
    );
  }

  const priceKobo = offer.price_cents ?? 0;
  const deliveryFee = DELIVERY_FEES[deliveryMode];

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold flex-1">{offer.product_name}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHANNEL_COLORS[offer.channel]}`}>
          {CHANNEL_LABELS[offer.channel]}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {/* Offer info */}
        <div className="mb-4 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap gap-1.5 mb-3">
            <span className="rounded bg-white border border-border px-2 py-0.5 text-xs font-medium text-textSecondary">
              Min order: {offer.min_order_qty}
            </span>
            <span className="rounded bg-white border border-border px-2 py-0.5 text-xs font-medium text-textSecondary">
              {PERISHABILITY_LABELS[offer.perishability]}
            </span>
            <span className="rounded bg-white border border-border px-2 py-0.5 text-xs font-medium text-textSecondary">
              Available: {offer.sellable_qty}
            </span>
          </div>
          <p className="text-xs text-textSecondary">{offer.physical_ref}</p>
        </div>

        {/* Channel enforcement notice */}
        <div className="mb-4 rounded-lg border border-primary/20 bg-primaryLight p-3">
          <p className="text-xs text-primary font-medium">
            This offer is listed on the {CHANNEL_LABELS[offer.channel]} channel.
            Your buyer role must match to purchase.
          </p>
        </div>

        {/* Quantity selector */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-text mb-2">Quantity</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(offer.min_order_qty, q - 1))}
              className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-lg font-bold text-primary"
            >
              -
            </button>
            <span className="min-w-[40px] text-center text-lg font-bold">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(offer.sellable_qty, q + 1))}
              className="w-10 h-10 rounded-lg border border-border flex items-center justify-center text-lg font-bold text-primary"
            >
              +
            </button>
            <span className="text-xs text-textSecondary ml-2">
              (min {offer.min_order_qty})
            </span>
          </div>
        </div>

        {/* Delivery mode selector */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-text mb-2">Delivery Mode</label>
          <div className="flex flex-col gap-2">
            {offer.fulfilment_modes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDeliveryMode(mode)}
                className={`flex items-center justify-between rounded-lg border p-3 text-left transition ${
                  deliveryMode === mode ? 'border-primary bg-primaryLight' : 'border-border'
                }`}
              >
                <div>
                  <p className="text-sm font-medium">{DELIVERY_LABELS[mode]}</p>
                  <p className="text-xs text-textSecondary">{DELIVERY_TIMES[mode]}</p>
                </div>
                <span className="text-sm font-semibold text-text">
                  {naira.format(DELIVERY_FEES[mode] / 100)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Landed cost transparency — Sprint 2 core requirement */}
        <LandedCost
          unitPriceKobo={priceKobo}
          qty={qty}
          deliveryFeeKobo={deliveryFee}
        />

        <p className="mt-3 text-[10px] text-textSecondary text-center leading-relaxed">
          Landed cost = item total + delivery fee. Final amount confirmed at checkout.
        </p>
      </main>

      <div className="border-t border-border bg-white px-4 py-4">
        <Button
          size="lg"
          onClick={() => navigate('/checkout', { state: { offerId: offer.id, qty, deliveryMode } })}
        >
          Proceed to checkout
        </Button>
      </div>
    </div>
  );
}
