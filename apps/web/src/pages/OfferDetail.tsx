import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@ojaline/design';
import { naira } from '@ojaline/design';
import { getOfferById, getSimilarOffers, getReviews, trackView, createConversation } from '../lib/api';
import type { Offer, FulfilmentMode, Review } from '../lib/api';
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
  const [similar, setSimilar] = useState<Offer[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

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
        trackView(found.id);
        getSimilarOffers(found.id, 4).then((s) => {
          if (!cancelled) setSimilar(s);
        }).catch(() => {});
        getReviews(found.id).then((r) => {
          if (!cancelled) setReviews(r);
        }).catch(() => {});
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
        {offer.negotiable && (
          <span className="rounded-full bg-[#f5a623] text-white px-2.5 py-0.5 text-xs font-semibold">Negotiable</span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHANNEL_COLORS[offer.channel]}`}>
          {CHANNEL_LABELS[offer.channel]}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {offer.primary_image?.storage_key && (
          <div className="mb-4 rounded-xl overflow-hidden h-48">
            <img
              src={`/api/media/${offer.primary_image.storage_key}`}
              alt={offer.product_name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

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

        {/* Seller Info */}
        <div className="mb-4 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-lg">👤</div>
              <div>
                <div className="text-sm font-bold text-text">{offer.seller_name}</div>
                {offer.market_name && (
                  <div className="text-xs text-textSecondary">{offer.stall_number}, {offer.market_name}</div>
                )}
              </div>
            </div>
            <span className="text-primary text-xs font-semibold">✓ Verified</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-textSecondary">
            {offer.years_in_market && <span>{offer.years_in_market} years in market</span>}
            {offer.member_since && <span>Since {new Date(offer.member_since).getFullYear()}</span>}
            {offer.seller_stats && (
              <span className="flex items-center gap-1">
                <span className="text-[#d48d09]">★</span>
                {Number(offer.seller_stats.avg_rating ?? 0).toFixed(1)} ({offer.seller_stats.review_count} reviews)
              </span>
            )}
          </div>
        </div>

        {/* Buyer Protection notice */}
        <div className="mb-4 rounded-lg border border-primary/20 bg-primaryLight p-3">
          <p className="text-xs text-primary font-medium">
            🔒 Buyer Protection: Orders paid through Ojaline are fully protected.
            Orders paid outside the platform forfeit refund and dispute support.
          </p>
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

        {/* Reviews */}
        {reviews.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-bold text-text mb-3">Reviews ({reviews.length})</h3>
            <div className="flex flex-col gap-3">
              {reviews.map((review) => (
                <div key={review.id} className="bg-surface rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {review.reviewer_name.charAt(0)}
                      </div>
                      <span className="text-xs font-semibold text-text">{review.reviewer_name}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={`text-xs ${i < review.rating ? 'text-[#d48d09]' : 'text-gray-300'}`}>★</span>
                      ))}
                    </div>
                  </div>
                  {review.review_text && (
                    <p className="text-xs text-textSecondary mt-1">{review.review_text}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Similar products */}
        {similar.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-bold text-text mb-3">Similar products</h3>
            <div className="grid grid-cols-2 gap-3">
              {similar.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/offers/${item.id}`)}
                  className="bg-surface border border-border rounded-xl overflow-hidden text-left cursor-pointer hover:shadow-sm transition"
                >
                  <div className="h-20 bg-cover bg-center">
                    {item.primary_image?.storage_key ? (
                      <img
                        src={`/api/media/${item.primary_image.storage_key}`}
                        alt={item.product_name}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-bold text-text truncate">{item.product_name}</div>
                    <div className="text-[11px] text-textSecondary mt-0.5">{item.seller_name}</div>
                    {item.price_cents != null && (
                      <div className="text-sm font-black text-primary mt-1">
                        {naira.format(item.price_cents / 100)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      <div className="border-t border-border bg-white px-4 py-4 flex gap-3">
        <button
          type="button"
          onClick={async () => {
            try {
              const conv = await createConversation('b1000000-0000-4000-8000-000000000001', offer.seller_id, offer.id);
              navigate(`/chat/${conv.id}`);
            } catch { /* skip */ }
          }}
          className="flex-1 h-12 rounded-lg border border-primary bg-white text-primary text-sm font-semibold cursor-pointer flex items-center justify-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Chat with Seller
        </button>
        <Button
          size="lg"
          className="flex-[2]"
          onClick={() => navigate('/checkout', { state: { offerId: offer.id, qty, deliveryMode } })}
        >
          Proceed to checkout
        </Button>
      </div>
    </div>
  );
}
