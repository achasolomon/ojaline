import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@ojaline/design';
import { naira } from '@ojaline/design';
import { getOfferById, getSimilarOffers, getReviews, trackView, createConversation, getSellerById, discoverOffers, getBatchOffers, getRecentlyViewedIds, addToWishlist, removeFromWishlist } from '../lib/api';
import type { Offer, FulfilmentMode, Review, OfferImage } from '../lib/api';
import { LandedCost } from '../components/LandedCost';
import { OfferCard } from '../components/OfferCard';
import { BargainModal } from '../components/BargainModal';
import { Icon } from '../components/icons';
import { addToCart, getCartItems } from '../lib/cart';
import { bargainPriceKobo, bargainFloorKobo } from '../lib/bargain';
import { activeBuyerId, getUser } from '../lib/session';
import { isWished, upsertWishlist, dropWishlist } from '../lib/wishlist';
import { nextDeliveryDates, DELIVERY_WINDOWS } from '../lib/delivery';
import type { DeliveryWindow } from '../lib/delivery';
import { DELIVERY_FEE_CENTS } from '@ojaline/contracts';
import { PageTopBar } from '../components/PageTopBar';

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

const DELIVERY_OPTIONS: FulfilmentMode[] = ['INSTANT', 'SCHEDULED', 'MARKET_DAY'];

function ProductSection({
  title,
  subtitle,
  offers,
  onNavigate,
}: {
  title: string;
  subtitle?: string;
  offers: Offer[];
  onNavigate: (id: string) => void;
}) {
  if (offers.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-lg font-black text-text">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-textSecondary">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
        {offers.map((item) => (
          <OfferCard key={item.id} offer={item} onClick={(o) => onNavigate(o.id)} />
        ))}
      </div>
    </section>
  );
}

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
  const [sellerProducts, setSellerProducts] = useState<Offer[]>([]);
  const [suggested, setSuggested] = useState<Offer[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Offer[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [added, setAdded] = useState(false);
  const [bargainOpen, setBargainOpen] = useState(false);
  const [agreedKobo, setAgreedKobo] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [deliverySlot, setDeliverySlot] = useState<DeliveryWindow | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [wishSaving, setWishSaving] = useState(false);
  const [wished, setWished] = useState(false);

  // Escape + scroll lock while the image lightbox is open.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [lightboxOpen]);

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
        getSellerById(found.seller_id).then((seller) => {
          if (!cancelled) setSellerProducts(seller.products.filter((p) => p.id !== found.id).slice(0, 8));
        }).catch(() => {});
        const picks = found.category_id != null
          ? discoverOffers({ category_id: found.category_id, limit: 4 })
          : discoverOffers({ limit: 4 });
        picks.then((res) => {
          if (!cancelled) setSuggested(res.offers.filter((o) => o.id !== found.id).slice(0, 4));
        }).catch(() => {});
        const rvIds = getRecentlyViewedIds().filter((seenId) => seenId !== found.id);
        getBatchOffers(rvIds.slice(0, 6)).then((offers) => {
          if (!cancelled) setRecentlyViewed(offers);
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

  // If a bargained price or a delivery schedule for this offer is already in the cart, respect it.
  useEffect(() => {
    if (!offer) return;
    const item = getCartItems().find((i) => i.offer_id === offer.id);
    const original = offer.price_cents;
    if (item && original != null && item.unit_price_kobo !== original) {
      setAgreedKobo(item.unit_price_kobo);
    }
    if (item) {
      setDeliveryDate(item.delivery_date);
      setDeliverySlot(item.delivery_window);
    }
  }, [offer]);

  // Reset gallery position whenever the offer changes.
  useEffect(() => {
    if (offer) setActiveIdx(0);
  }, [offer]);

  // Reflect saved-wishlist state whenever the offer loads.
  useEffect(() => {
    if (!offer) return;
    setWished(isWished(activeBuyerId(), offer.id));
  }, [offer]);

  const toggleWishlist = async () => {
    if (!offer || wishSaving) return;
    setWishSaving(true);
    const buyerId = activeBuyerId();
    const next = !wished;
    try {
      if (next) {
        await addToWishlist(buyerId, offer.id);
        upsertWishlist(buyerId, { offer_id: offer.id, wished_at: new Date().toISOString(), offer });
      } else {
        await removeFromWishlist(buyerId, offer.id);
        dropWishlist(buyerId, offer.id);
      }
      setWished(next);
    } catch {
      // wishlist service unavailable — keep current state
    } finally {
      setWishSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-6 py-6 pb-10">
        <div className="mb-5 h-3 w-40 animate-pulse rounded bg-surface" />
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <div className="mx-auto w-full max-w-[440px] lg:max-w-[480px]">
              <div className="relative aspect-square overflow-hidden bg-surface shimmer lg:aspect-[4/3]" />
            </div>
            <div className="rounded-2xl border border-border bg-white p-5 lg:p-6">
              <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
              <div className="mt-3 h-7 w-3/4 animate-pulse rounded bg-surface" />
              <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-surface" />
              <div className="mt-6 space-y-3">
                <div className="h-3 w-full animate-pulse rounded bg-surface" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-surface" />
              </div>
            </div>
          </div>
          <aside className="animate-pulse rounded-2xl border border-border bg-white p-5 md:sticky md:top-[136px] md:p-6">
            <div className="h-7 w-2/3 rounded bg-surface" />
            <div className="mt-5 h-[52px] w-full rounded-xl bg-surface" />
            <div className="mt-3 h-10 w-full rounded-lg bg-surface" />
            <div className="mt-4 h-24 w-full rounded-xl bg-surface" />
            <div className="mt-5 h-[52px] w-full rounded-xl bg-surface" />
          </aside>
        </div>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center justify-center px-6 py-24 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary">
          <Icon name="basket" size={24} />
        </span>
        <p className="text-sm font-medium text-danger">{error ?? 'Offer not found.'}</p>
        <p className="mt-1 mb-5 text-xs text-textSecondary">It may have been removed by the seller.</p>
        <Button variant="secondary" size="sm" onClick={() => navigate('/offers')}>
          Back to offers
        </Button>
      </div>
    );
  }

  const originalKobo = offer.price_cents ?? 0;
  const buyerChannel = getUser()?.channel ?? 'OPEN';
  const buyerCanBuy = offer.channel === 'OPEN' || buyerChannel === 'OPEN' || offer.channel === buyerChannel;
  const unitKobo = agreedKobo ?? originalKobo;
  const deliveryFee = DELIVERY_FEE_CENTS[deliveryMode];
  const ratingRaw = offer.seller_stats?.avg_rating;
  const rating = ratingRaw != null && !Number.isNaN(Number(ratingRaw)) ? Number(ratingRaw) : null;
  const askKobo = bargainPriceKobo(offer);
  const floorKobo = bargainFloorKobo(offer);
  const hasBargain = askKobo != null;
  const isAgreed = offer.price_cents != null && agreedKobo != null && agreedKobo !== offer.price_cents;
  const fmt = (kobo: number) => naira.format(kobo / 100);
  const cartOverride = offer.price_cents != null ? unitKobo : undefined;
  const galleryImages: OfferImage[] =
    offer.images && offer.images.length > 0
      ? offer.images
      : offer.primary_image
        ? [offer.primary_image]
        : [];
  const activeImage = galleryImages[activeIdx] ?? null;
  const dates = nextDeliveryDates(5);
  const effectiveDate = deliveryDate ?? dates[0]?.date ?? null;
  const effectiveSlot = deliverySlot ?? DELIVERY_WINDOWS[1].slot;
  const schedule = deliveryMode === 'SCHEDULED' && effectiveDate
    ? { date: effectiveDate, window: effectiveSlot }
    : { date: null, window: null };

  const quickAdd = () => {
    addToCart(offer, qty, cartOverride, schedule);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1500);
  };

  const startChat = async () => {
    try {
      const conv = await createConversation(activeBuyerId(), offer.seller_id, offer.id);
      navigate(`/chat/${conv.id}`);
    } catch { /* skip */ }
  };

  return (
    <div className="min-h-full bg-white lg:bg-surface/60">
      <PageTopBar
          title="Item details"
          action={
            <button
              type="button"
              onClick={toggleWishlist}
              disabled={wishSaving}
              aria-label={wished ? 'Remove from wishlist' : 'Save to wishlist'}
              className={`grid h-9 w-9 place-items-center rounded-full border transition active:scale-95 ${
                wished ? 'border-[#f5a623] bg-[#f5a623] text-white' : 'border-border text-text'
              }`}
            >
              <Icon name="heart" size={18} className={wished ? 'fill-current' : ''} />
            </button>
          }
        />
    <div className="mx-auto w-full max-w-[1200px] px-4 py-4 pb-28 sm:px-6 sm:py-6 sm:pb-10">
      {/* Breadcrumb */}
      <div className="mb-5 hidden items-center gap-2 text-xs text-textSecondary lg:flex">
        <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/')}>Home</span>
        <span>/</span>
        <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/offers')}>Offers</span>
        <span>/</span>
        <span className="max-w-[320px] truncate text-text font-medium">{offer.product_name}</span>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        {/* ── LEFT COLUMN ── */}
        <div className="min-w-0 space-y-6">
          {/* Image gallery */}
          <div className="mx-auto w-full max-w-[440px] lg:max-w-[480px]">
            <div className="relative aspect-[1.05/1] overflow-hidden rounded-2xl bg-surface lg:aspect-[4/3] lg:rounded-none">
              {activeImage?.storage_key ? (
                <img
                  src={`/api/media/${activeImage.storage_key}`}
                  alt={offer.product_name}
                  decoding="async"
                  onClick={() => setLightboxOpen(true)}
                  className="h-full w-full cursor-zoom-in object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-surface text-textSecondary">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
              )}

              {galleryImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveIdx((i) => (i === 0 ? galleryImages.length - 1 : i - 1))}
                    className="absolute left-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center bg-white/85 text-text shadow-[0_2px_10px_rgba(0,0,0,0.15)] backdrop-blur-sm transition hover:bg-white cursor-pointer"
                    aria-label="Previous image"
                  >
                    <Icon name="chevronRight" size={16} className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveIdx((i) => (i + 1) % galleryImages.length)}
                    className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center bg-white/85 text-text shadow-[0_2px_10px_rgba(0,0,0,0.15)] backdrop-blur-sm transition hover:bg-white cursor-pointer"
                    aria-label="Next image"
                  >
                    <Icon name="chevronRight" size={16} />
                  </button>
                </>
              )}

              {galleryImages.length > 1 && (
                <span className="absolute bottom-2.5 right-2.5 bg-black/50 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                  {activeIdx + 1} / {galleryImages.length}
                </span>
              )}
            </div>

            {galleryImages.length > 1 && (
              <div className="mt-3 flex justify-center gap-2">
                {galleryImages.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`h-14 w-14 shrink-0 overflow-hidden transition cursor-pointer ${
                      i === activeIdx ? 'ring-2 ring-primary' : 'opacity-70 hover:opacity-100'
                    }`}
                    aria-label={`View image ${i + 1}`}
                  >
                    <img
                      src={`/api/media/${img.storage_key}`}
                      alt={`${offer.product_name} ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Offer info */}
          <div className="rounded-2xl border border-border bg-white p-4 sm:p-5 lg:p-6">
            <div className="flex flex-col items-start justify-between gap-x-4 gap-y-3 sm:flex-row">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm ${CHANNEL_COLORS[offer.channel]}`}>
                    {CHANNEL_LABELS[offer.channel]}
                  </span>
                  {offer.negotiable && (
                    <span className="rounded-md bg-[#f5a623] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                      Negotiable
                    </span>
                  )}
                </div>
                <h1 className="mt-2.5 text-[22px] font-black tracking-tight text-text lg:text-2xl lg:leading-snug">
                  {offer.product_name}
                </h1>
              </div>
              <div className="text-left sm:text-right">
                {originalKobo > 0 ? (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:justify-end">
                      <span className="text-[26px] font-black tracking-tight text-text lg:text-[28px]">{fmt(unitKobo)}</span>
                      {isAgreed && (
                        <span className="text-sm font-medium text-textSecondary line-through">{fmt(originalKobo)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:justify-end">
                      {offer.unit && <div className="text-[11px] text-textSecondary">per {offer.unit}</div>}
                      {isAgreed && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-primary-dark">
                          Agreed price
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-base font-bold text-text">Price on request</div>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-4">
              <span className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-textSecondary">
                Min order: {offer.min_order_qty}{offer.unit ? ` ${offer.unit}` : ''}
              </span>
              <span className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-textSecondary">
                Available: {offer.sellable_qty}{offer.unit ? ` ${offer.unit}` : ''}
              </span>
              <span className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-textSecondary">
                {PERISHABILITY_LABELS[offer.perishability]}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 md:hidden">
              {offer.fulfilment_modes.slice(0, 3).map((mode) => (
                <span key={mode} className="flex min-w-0 flex-col items-center rounded-lg border border-border bg-white px-1 py-2 text-center text-[9px] font-bold text-text">
                  <Icon name={mode === 'INSTANT' ? 'bolt' : mode === 'MARKET_DAY' ? 'calendar' : 'clock'} size={13} className="mb-1 text-primary" />
                  {DELIVERY_LABELS[mode]}
                </span>
              ))}
            </div>
          </div>

          {/* Description */}
          {offer.physical_ref && (
            <div className="rounded-2xl border border-border bg-white p-5 lg:p-6">
              <h2 className="mb-2 text-base font-black text-text">Description</h2>
              <p className="text-sm leading-relaxed text-textSecondary">{offer.physical_ref}</p>
            </div>
          )}

          {/* Seller card */}
          <div className="rounded-2xl border border-border bg-white p-5 lg:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
                  <Icon name="user" size={24} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-text">{offer.seller_name}</span>
                    {rating != null && (
                      <span className="flex items-center gap-0.5 rounded bg-surface px-1.5 py-0.5 text-[11px] font-bold text-[#B7790A]">
                        <Icon name="star" size={11} fill="#d48d09" stroke="none" />
                        {rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-textSecondary">
                    <Icon name="check" size={13} className="text-primary" />
                    Verified seller
                    {offer.market_name && <span>· {offer.stall_number ? `${offer.stall_number}, ` : ''}{offer.market_name}</span>}
                  </div>
                  {offer.years_in_market != null && (
                    <div className="mt-0.5 text-xs text-textSecondary">
                      {offer.years_in_market} year{offer.years_in_market === 1 ? '' : 's'} in market
                      {offer.seller_stats?.review_count != null && ` · ${offer.seller_stats.review_count} review${offer.seller_stats.review_count === 1 ? '' : 's'}`}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/sellers/${offer.seller_id}`)}
                className="h-9 rounded-lg border border-primary bg-white px-4 text-xs font-bold text-primary transition hover:bg-primary hover:text-white cursor-pointer"
              >
                View seller
              </button>
            </div>
          </div>

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="rounded-2xl border border-border bg-white p-5 lg:p-6">
              <h2 className="mb-4 text-base font-black text-text">
                Reviews <span className="ml-1 text-sm font-normal text-textSecondary">({reviews.length})</span>
              </h2>
              <div className="flex flex-col gap-3">
                {reviews.map((review) => (
                  <div key={review.id} className="rounded-xl bg-surface p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {review.reviewer_name.charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate text-xs font-semibold text-text">{review.reviewer_name}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className="inline-grid place-items-center w-4">
                            <Icon name="star" size={12} fill={i < review.rating ? '#d48d09' : '#d1d5db'} stroke="none" />
                          </span>
                        ))}
                      </div>
                    </div>
                    {review.review_text && (
                      <p className="mt-1.5 text-xs leading-relaxed text-textSecondary">{review.review_text}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── BUY BOX ── */}
        <aside className="hidden self-start rounded-2xl border border-border bg-white p-4 md:sticky md:top-[136px] md:block md:p-6">
          <div className="flex items-baseline justify-between gap-2">
            {originalKobo > 0 ? (
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-black tracking-tight text-text">{fmt(unitKobo)}</span>
                {offer.unit && <span className="text-sm text-textSecondary"> / {offer.unit}</span>}
                {isAgreed && (
                  <span className="text-sm font-medium text-textSecondary line-through">{fmt(originalKobo)}</span>
                )}
              </div>
            ) : (
              <span className="text-base font-bold text-text">Price on request</span>
            )}
            <span className="text-[11px] text-textSecondary">incl. delivery</span>
          </div>

          {isAgreed && (
            <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-secondary/20 px-3 py-2 text-[12px] font-bold text-[#A36A00]">
              <Icon name="check" size={14} /> Agreed with seller at {fmt(unitKobo)}
            </p>
          )}

          {/* Bargain + chat seller — kept above the buying controls */}
          <div className="mt-4 flex gap-2.5">
            {hasBargain ? (
              <>
                <button
                  type="button"
                  onClick={() => setBargainOpen(true)}
                  className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-secondary to-[#F5A623] text-sm font-bold text-primary-dark shadow-[0_6px_16px_rgba(217,158,0,0.22)] transition hover:from-[#F0BE1F] hover:to-[#F0A21F] active:scale-[0.99] cursor-pointer"
                >
                  <Icon name="bolt" size={16} className="fill-current" />
                  Bargain · from {fmt(askKobo!)}
                </button>
                <button
                  type="button"
                  onClick={startChat}
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border-2 border-border bg-white text-primary transition hover:border-primary hover:bg-primary-light/40 cursor-pointer"
                  aria-label="Chat with seller"
                >
                  <Icon name="message" size={20} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startChat}
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border-2 border-primary bg-white text-sm font-bold text-primary transition hover:bg-primary hover:text-white cursor-pointer"
              >
                <Icon name="message" size={17} /> Chat with seller
              </button>
            )}
          </div>
          {hasBargain && (
            <p className="mt-1.5 text-[10px] font-medium text-textSecondary">
              Sellers usually settle around {fmt(floorKobo!)} · bigger order, cheaper per {offer.unit?.trim() || 'unit'}
            </p>
          )}

          {/* Quantity */}
          <div className="mt-4">
            <label className="mb-2 block text-xs font-bold text-text">Quantity</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(offer.min_order_qty, q - 1))}
                className="h-10 w-10 rounded-lg border border-border bg-white text-lg font-bold text-primary transition hover:border-primary cursor-pointer"
                aria-label="Decrease quantity"
              >
                <Icon name="minus" size={14} />
              </button>
              <span className="min-w-[36px] text-center text-lg font-bold text-text">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(offer.sellable_qty, q + 1))}
                className="h-10 w-10 rounded-lg border border-border bg-white text-lg font-bold text-primary transition hover:border-primary cursor-pointer"
                aria-label="Increase quantity"
              >
                <Icon name="plus" size={14} />
              </button>
              <span className="ml-1 text-[11px] text-textSecondary">
                min {offer.min_order_qty}{offer.unit ? ` ${offer.unit}` : ''}
              </span>
            </div>
          </div>

          {/* Delivery mode */}
          <div className="mt-5">
            <label className="mb-2 block text-xs font-bold text-text">Delivery Mode</label>
            <div className="flex flex-col gap-2">
              {DELIVERY_OPTIONS.map((mode) => {
                const offered = offer.fulfilment_modes.includes(mode);
                const active = deliveryMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!offered}
                    onClick={() => setDeliveryMode(mode)}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-left transition ${
                      active ? 'border-primary bg-primary-light/50' : 'border-border bg-white'
                    } ${offered ? 'cursor-pointer hover:border-primary/40' : 'cursor-not-allowed opacity-55'}`}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-text">
                        {DELIVERY_LABELS[mode]}
                        {!offered && (
                          <span className="rounded bg-surface px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-textSecondary">
                            Not offered for this listing
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-textSecondary">{DELIVERY_TIMES[mode]}</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold text-text">{naira.format(DELIVERY_FEE_CENTS[mode] / 100)}</span>
                  </button>
                );
              })}
            </div>

            {deliveryMode === 'SCHEDULED' && (
              <div className="mt-3 rounded-xl bg-surface p-3">
                <p className="mb-2 text-[11px] font-bold text-text">Pick a date & time window</p>
                <div className="mb-2 flex gap-1.5 overflow-x-auto">
                  {dates.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setDeliveryDate(d.date)}
                      className={`flex shrink-0 flex-col items-center rounded-lg border px-3 py-1.5 transition cursor-pointer ${
                        (deliveryDate ?? dates[0]?.date) === d.date
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-white text-text hover:border-primary/40'
                      }`}
                    >
                      <span className="text-[10px] font-bold">{d.label}</span>
                      <span className="text-[9px] opacity-80">{d.day}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {DELIVERY_WINDOWS.map((w) => (
                    <button
                      key={w.slot}
                      type="button"
                      onClick={() => setDeliverySlot(w.slot)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-center transition cursor-pointer ${
                        (deliverySlot ?? DELIVERY_WINDOWS[1].slot) === w.slot
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-white text-text hover:border-primary/40'
                      }`}
                      aria-label={`Deliver ${w.label}, ${w.hours}`}
                    >
                      <span className="block text-[10px] font-bold">{w.label}</span>
                      <span className="block text-[9px] opacity-80">{w.hours}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Landed cost */}
          <LandedCost unitPriceKobo={unitKobo} qty={qty} deliveryFeeKobo={deliveryFee} />

          {/* Actions */}
          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={quickAdd}
              className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border-2 text-primary transition active:scale-[0.99] cursor-pointer ${
                added ? 'border-primary bg-primary text-white' : 'border-primary bg-white hover:bg-primary hover:text-white'
              }`}
              aria-label="Add to cart"
            >
              {added ? <Icon name="check" size={20} /> : <Icon name="cart" size={20} />}
            </button>
            <button
              type="button"
              onClick={() => { addToCart(offer, qty, cartOverride, schedule); navigate('/checkout'); }}
              className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold tracking-tight text-white transition hover:bg-primary-dark active:scale-[0.99] cursor-pointer"
            >
              Buy Now · {fmt(unitKobo)}
            </button>
          </div>

          {/* Trust notices */}
          <div className="mt-5 rounded-xl border border-primary/20 bg-primary-light/50 p-3">
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-primary">
              <Icon name="shield" size={14} className="mt-0.5 shrink-0" />
              Buyer Protection: Orders paid through Kika are fully protected. Payments outside the platform forfeit refund and dispute support.
            </p>
          </div>
          <p className="mt-2.5 text-[10px] leading-relaxed text-textSecondary">
            This offer is listed on the {CHANNEL_LABELS[offer.channel]} channel.
            {buyerCanBuy
              ? ' Your buyer channel matches, so you can purchase this now.'
              : ` Your account is on ${CHANNEL_LABELS[buyerChannel]}. To buy, your buyer role must match — sellers on ${CHANNEL_LABELS[offer.channel]} can only sell to that channel. Save it to your wishlist while you arrange access.`}
          </p>
        </aside>
      </div>

      {/* Suggested products */}
      <ProductSection
        title="Suggested for you"
        subtitle="Handpicked finds from the market"
        offers={suggested}
        onNavigate={(o) => navigate(`/offers/${o}`)}
      />

      {/* Other products from the seller */}
      <ProductSection
        title={`More from ${offer.seller_name?.split(' ')[0] ?? 'this seller'}`}
        subtitle="Other products listed by this seller"
        offers={sellerProducts}
        onNavigate={(o) => navigate(`/offers/${o}`)}
      />

      {/* Related products */}
      <ProductSection
        title="Related products"
        subtitle="Other fresh picks you might like"
        offers={similar}
        onNavigate={(o) => navigate(`/offers/${o}`)}
      />

      {/* Recently viewed */}
      <ProductSection
        title="Recently viewed"
        subtitle="Pick up where you left off"
        offers={recentlyViewed}
        onNavigate={(o) => navigate(`/offers/${o}`)}
      />

      {bargainOpen && (
        <BargainModal
          offer={offer}
          initialQty={qty}
          onClose={() => setBargainOpen(false)}
          onDeal={(k) => setAgreedKobo(k)}
        />
      )}

      {lightboxOpen && activeImage?.storage_key && (
        <div className="fixed inset-0 z-[80] bg-black/95">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <span className="max-w-[60%] truncate text-sm font-semibold text-white">{offer.product_name}</span>
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="flex h-10 w-10 items-center justify-center bg-white/10 text-white transition hover:bg-white/20 cursor-pointer"
              aria-label="Close viewer"
            >
              <Icon name="close" size={20} />
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 sm:px-20">
            {galleryImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveIdx((i) => (i === 0 ? galleryImages.length - 1 : i - 1))}
                  className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/10 text-white transition hover:bg-white/20 cursor-pointer"
                  aria-label="Previous image"
                >
                  <Icon name="chevronRight" size={20} className="rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIdx((i) => (i + 1) % galleryImages.length)}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center bg-white/10 text-white transition hover:bg-white/20 cursor-pointer"
                  aria-label="Next image"
                >
                  <Icon name="chevronRight" size={20} />
                </button>
              </>
            )}
            <img
              key={activeImage.storage_key}
              src={`/api/media/${activeImage.storage_key}`}
              alt={offer.product_name}
              className="max-h-[calc(100vh-140px)] max-w-full object-contain"
            />
          </div>

          <div className="flex items-center justify-between px-4 py-4 sm:px-6">
            <span className="text-xs font-semibold text-white/70">
              {activeIdx + 1} / {galleryImages.length}
            </span>
            {galleryImages.length > 1 && (
              <div className="flex gap-2">
                {galleryImages.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`h-14 w-14 overflow-hidden transition cursor-pointer ${
                      i === activeIdx ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-90'
                    }`}
                    aria-label={`View image ${i + 1}`}
                  >
                    <img
                      src={`/api/media/${img.storage_key}`}
                      alt={`${offer.product_name} ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-[64px] z-30 border-t border-border bg-white px-4 py-3 shadow-[0_-5px_18px_rgba(15,48,28,0.10)] md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0"><p className="text-[10px] text-textSecondary">{offer.unit ? `per ${offer.unit}` : 'Price'}</p><p className="text-lg font-black tracking-tight text-text">{fmt(unitKobo)}</p></div>
          <button type="button" onClick={quickAdd} className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition ${added ? 'bg-primary-light text-primary' : 'bg-primary text-white hover:bg-primary-dark'}`}>
            <Icon name={added ? 'check' : 'cart'} size={17} /> {added ? 'Added to cart' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
}
