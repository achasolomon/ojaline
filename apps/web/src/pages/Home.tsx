import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  discoverOffers, getCategories, getBatchOffers, getRecentlyViewedIds, mediaUrl,
  prefetchOffer,
  ACTIVE_CITIES,
  type Offer, type Category,
} from '../lib/api';
import { formatMarketDayDate, promoImageUrl, useMarketDay, usePromos } from '../lib/promos';
import { useMediaQuery, DESKTOP_BREAKPOINT } from '../lib/useMediaQuery';
import { DesktopHome } from '../components/desktop/DesktopHome';
import { MarketBuzz } from '../components/MarketBuzz';
import { MobileProductSkeleton } from '../components/Loading';
import { HomeAdBanner } from '../components/HomeAdBanner';
import { Icon, type IconName } from '../components/icons';

const FEATURES = [
  { label: 'Market Day', sublabel: '(Wholesale)', icon: 'calendar' },
  { label: 'Instant', sublabel: 'Delivery', icon: 'bolt' },
  { label: 'Scheduled', sublabel: 'Delivery', icon: 'clock' },
  { label: 'Direct', sublabel: 'From Farm', icon: 'home' },
] as const;

function categoryIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (n.includes('fruit') || n.includes('vegetable')) return 'leaf';
  if (n.includes('grains') || n.includes('smoked') || n.includes('dried')) return 'box';
  if (n.includes('tuber') || n.includes('root') || n.includes('swallow') || n.includes('soup')) return 'basket';
  if (n.includes('oil')) return 'tag';
  if (n.includes('spice')) return 'star';
  return 'grid';
}

function CategoryImage({ src, icon }: { src: string; icon: IconName }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) return <Icon name={icon} size={22} />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

function MobileHero() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const slides = usePromos();
  const slide = slides[index % slides.length];
  const src = promoImageUrl(slide);

  const goTo = (i: number) => setIndex(((i % slides.length) + slides.length) % slides.length);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <div
      className="mx-4 mb-4 rounded-2xl overflow-hidden relative min-h-[180px] text-white"
      style={{ background: slide.gradient }}
    >
      <div className="absolute inset-0">
        {failed[slide.id] || !src ? (
          <div className="w-full h-full grid place-items-center bg-white/10">
            <Icon name={slide.fallbackIcon} size={44} className="text-white/45" />
          </div>
        ) : (
          <img
            src={src}
            alt={slide.image?.alt ?? ''}
            decoding="async"
            onError={() => setFailed((f) => ({ ...f, [slide.id]: true }))}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Subtle fade so the action buttons stay legible */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.4))' }}
      />

      {/* Action buttons */}
      <div className="absolute left-4 bottom-4 z-[3] flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(slide.href)}
          className="rounded-lg bg-white text-primary text-xs font-semibold px-3.5 py-2 border-none cursor-pointer"
        >
          {slide.cta}
        </button>
        <button
          type="button"
          onClick={() => navigate('/market-days')}
          className="rounded-lg bg-secondary text-tertiary text-xs font-semibold px-3.5 py-2 border-none cursor-pointer"
        >
          Explore Market Day
        </button>
      </div>

      {/* Arrows */}
      <button
        type="button"
        aria-label="Previous promo"
        onClick={() => goTo(index - 1)}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 z-[5] w-7 h-7 rounded-full bg-white/15 border border-white/30 text-white grid place-items-center cursor-pointer backdrop-blur-sm transition hover:bg-white/30"
      >
        <Icon name="chevronDown" size={14} className="rotate-90" />
      </button>
      <button
        type="button"
        aria-label="Next promo"
        onClick={() => goTo(index + 1)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 z-[5] w-7 h-7 rounded-full bg-white/15 border border-white/30 text-white grid place-items-center cursor-pointer backdrop-blur-sm transition hover:bg-white/30"
      >
        <Icon name="chevronDown" size={14} className="-rotate-90" />
      </button>

      {/* Dots */}
      <div className="absolute z-[5] bottom-2.5 right-3 flex gap-1">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Go to ${s.title}`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all cursor-pointer border-none ${
              i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function FeatureIcon({ icon }: { icon: string }) {
  if (icon === 'calendar') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22A34A" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  if (icon === 'bolt') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22A34A" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    );
  }
  if (icon === 'clock') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22A34A" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22A34A" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

/* ── Horizontal product scroll ── */
function ProductScroll({ offers, onNavigate }: { offers: Offer[]; onNavigate: (id: string) => void }) {
  return (
    <div className="flex gap-3 px-4 overflow-x-auto scrollbar-none">
      {offers.map((offer) => (
        <button
          key={offer.id}
          type="button"
          onClick={() => onNavigate(offer.id)}
          onMouseEnter={() => prefetchOffer(offer.id)}
          onPointerDown={() => prefetchOffer(offer.id)}
          className="min-w-[140px] max-w-[150px] bg-white border border-border rounded-xl overflow-hidden cursor-pointer shrink-0 text-left p-0 transition-shadow hover:shadow-md relative"
        >
          {offer.negotiable && (
            <div className="absolute left-0 top-[6px] bg-[#f5a623] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-r z-10">Negotiable</div>
          )}
          <div className="w-full h-[110px] bg-surface overflow-hidden">
            {offer.primary_image?.storage_key ? (
              <img src={`/api/media/${offer.primary_image.storage_key}`} alt={offer.product_name} decoding="async" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-textSecondary text-xs">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              </div>
            )}
          </div>
          <div className="p-2.5">
            <div className="text-[13px] font-semibold mb-0.5 truncate">{offer.product_name}</div>
            <div className="text-[11px] text-textSecondary mb-1">{offer.seller_name || 'Seller'}</div>
            <div className="text-sm font-bold text-primary">
              {offer.price_cents != null ? naira.format(offer.price_cents / 100) : '—'}
              {offer.unit ? <span className="text-[11px] font-normal text-textSecondary"> / {offer.unit}</span> : null}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ── Section header ── */
function SectionHeader({ title, subtitle, onSeeAll }: { title: string; subtitle?: string; onSeeAll?: () => void }) {
  return (
    <div className="flex justify-between items-center px-4 pb-3">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-[11px] text-textSecondary mt-0.5">{subtitle}</p>}
      </div>
      {onSeeAll && (
        <button type="button" onClick={onSeeAll} className="text-[13px] font-semibold text-primary bg-transparent border-none cursor-pointer">
          See all
        </button>
      )}
    </div>
  );
}

export default function Home() {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  if (isDesktop) return <DesktopHome />;
  return <MobileHome />;
}

function MobileHome() {
  const navigate = useNavigate();
  const marketDay = useMarketDay();
  const [categories, setCategories] = useState<Category[]>([]);
  const [deals, setDeals] = useState<Offer[]>([]);
  const [wholesale, setWholesale] = useState<Offer[]>([]);
  const [newArrivals, setNewArrivals] = useState<Offer[]>([]);
  const [recommended, setRecommended] = useState<Offer[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const rvIds = getRecentlyViewedIds();

    Promise.all([
      getCategories(),
      discoverOffers({ channel: 'WHOLESALE', limit: 6 }),
      discoverOffers({ sort: 'newest', limit: 6 }),
      discoverOffers({ limit: 6 }),
      rvIds.length > 0 ? getBatchOffers(rvIds.slice(0, 6)) : Promise.resolve([]),
    ]).then(([cats, ws, newest, rec, rv]) => {
      if (cancelled) return;
      setCategories(cats);
      setDeals(rec.offers.slice(0, 6));
      setWholesale(ws.offers);
      setNewArrivals(newest.offers);
      setRecommended(rec.offers.slice(0, 6));
      setRecentlyViewed(rv);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setTimeout(() => setLoading(false), 650);
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      <main className="flex-1 overflow-y-auto">
        {/* Hero Banner */}
        <MobileHero />

        <div className="mx-4 mb-4">
          <HomeAdBanner />
        </div>

        {/* Market Day card */}
        <div className="mx-4 mb-4 bg-white border border-border rounded-2xl overflow-hidden">
          <div className="p-3">
            <span className="text-[10px] text-textSecondary font-extrabold uppercase tracking-wide">MARKET DAY</span>
            <h3 className="text-primary text-base font-bold mt-0.5 mb-1">Wholesale Prices</h3>
            <p className="text-[11px] text-textSecondary leading-snug mb-2">
              Save more when you buy in bulk from trusted market sellers
              {marketDay?.next_date
                ? ` — ${marketDay.market_count} markets, ${marketDay.product_count} products on ${formatMarketDayDate(marketDay.next_date)}.`
                : '.'}
            </p>
            <button type="button" onClick={() => navigate('/market-days')}
              className="bg-primary text-white text-xs font-bold rounded-lg px-4 py-1.5 border-none cursor-pointer">Shop Market Day</button>
          </div>
          <div className="h-20 bg-cover bg-center" style={{ backgroundImage: marketDay?.banner?.image_key ? `url(/api/media/${marketDay.banner.image_key})` : 'url(/images/market-day.jpeg)', backgroundColor: '#dce9c7' }} />
        </div>

        {/* Crowd Market banner */}
        <button
          type="button"
          onClick={() => navigate('/crowd-market')}
          className="mx-4 mb-4 block rounded-2xl overflow-hidden relative text-left cursor-pointer border-none text-white"
        >
          <img src="/api/media/banner-market-day.jpeg" alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#056e31] via-[#07883f]/85 to-[#07883f]/35" />
          <div className="relative z-[2] p-4">
            <span className="inline-block rounded-[5px] bg-white/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[1px] text-white/90">
              Crowd Market
            </span>
            <h3 className="mt-2 text-[16px] font-extrabold leading-snug text-white">
              Nothing no fit you? Post am — make sellers fight for your order.
            </h3>
            <p className="mt-1 text-[11px] leading-snug text-white/85">
              Bargain, walk away — and dem fit call you back with better price.
            </p>
            <span className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-[#F5A623] px-3.5 py-1.5 text-[11px] font-bold text-[#4A2D00]">
              Post a want <Icon name="arrowRight" size={12} />
            </span>
          </div>
        </button>

        {/* Feature Row */}
        <div className="flex gap-2 px-4 pb-5">
          {FEATURES.map((f) => (
            <button key={f.label} type="button" className="flex-1 min-w-[72px] flex flex-col items-center gap-1.5 bg-transparent border-none cursor-pointer p-1">
              <span className="w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center"><FeatureIcon icon={f.icon} /></span>
              <span className="text-[11px] font-medium text-text text-center leading-tight">
                {f.label}<br/><span className="text-textSecondary font-normal">{f.sublabel}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Coverage Strip */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold text-textSecondary uppercase tracking-wide">Now in</span>
            {ACTIVE_CITIES.map((city) => (
              <span key={city.name} className="flex items-center gap-1 text-[11px] text-text">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                {city.name}
              </span>
            ))}
          </div>
        </div>

        {/* Live market buzz */}
        {!loading && (
          <div className="mb-2">
            <MarketBuzz offers={deals.concat(wholesale, newArrivals).slice(0, 9)} />
          </div>
        )}

        {/* ── 1. Shop by Category ── */}
        <div className="pb-5">
          <SectionHeader title="Shop by Category" />
          <div className="grid grid-cols-4 gap-x-2 gap-y-4 px-4">
            {categories.slice(0, 8).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => navigate(`/offers?category_id=${cat.id}`)}
                aria-label={`Shop ${cat.name}`}
                className="flex flex-col items-center gap-1.5 text-center bg-transparent border-none cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-xl"
              >
                <span className="w-14 h-14 rounded-full bg-primary-light text-primary flex items-center justify-center overflow-hidden">
                  {cat.image_url ? (
                    <CategoryImage src={mediaUrl(cat.image_url) ?? ''} icon={categoryIcon(cat.name)} />
                  ) : (
                    <Icon name={categoryIcon(cat.name)} size={22} />
                  )}
                </span>
                <span className="block w-full text-[11px] font-medium text-text leading-tight truncate">
                  {cat.name}
                </span>
              </button>
            ))}
            {categories.length > 8 && (
              <button
                type="button"
                onClick={() => navigate('/categories')}
                aria-label="See all categories"
                className="flex flex-col items-center gap-1.5 text-center bg-transparent border-none cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-xl"
              >
                <span className="w-14 h-14 rounded-full bg-surface border border-border text-textSecondary flex items-center justify-center">
                  <Icon name="chevronRight" size={20} />
                </span>
                <span className="block w-full text-[11px] font-medium text-textSecondary truncate">
                  See all
                </span>
              </button>
            )}
</div>
        </div>

        {/* ── 2. Deals / Flash Sales ── */}
        <div className="pb-5">
          <SectionHeader title="Deals & Offers" subtitle="Hot deals from trusted sellers" onSeeAll={() => navigate('/offers')} />
          {loading ? (
            <MobileProductSkeleton />
          ) : deals.length > 0 ? (
            <div className="px-4">
              <div className="bg-gradient-to-r from-[#ff4d4d] to-[#ff7b00] rounded-xl px-3 py-2 mb-3 inline-flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                <span className="text-white text-[11px] font-bold">Ends in 02:34:17</span>
              </div>
              <ProductScroll offers={deals} onNavigate={(id) => navigate(`/offers/${id}`)} />
            </div>
          ) : null}
        </div>

        {/* ── 3. Market Day / Wholesale Picks ── */}
        <div className="pb-5">
          <SectionHeader title="Market Day Picks" subtitle="Wholesale prices on bulk orders" onSeeAll={() => navigate('/market-days')} />
          {loading ? (
            <MobileProductSkeleton />
          ) : wholesale.length > 0 ? (
            <ProductScroll offers={wholesale} onNavigate={(id) => navigate(`/offers/${id}`)} />
          ) : (
            <p className="text-xs text-textSecondary text-center py-6">No wholesale offers available</p>
          )}
        </div>

        {/* ── 4. New Arrivals ── */}
        <div className="pb-5">
          <SectionHeader title="New Arrivals" subtitle="Freshly listed produce" onSeeAll={() => navigate('/offers')} />
          {loading ? (
            <MobileProductSkeleton />
          ) : newArrivals.length > 0 ? (
            <ProductScroll offers={newArrivals} onNavigate={(id) => navigate(`/offers/${id}`)} />
          ) : null}
        </div>

        {/* ── 5. Recently Viewed ── */}
        {recentlyViewed.length > 0 && (
          <div className="pb-5">
            <SectionHeader title="Recently Viewed" />
            <ProductScroll offers={recentlyViewed} onNavigate={(id) => navigate(`/offers/${id}`)} />
          </div>
        )}

        {/* ── 7. Recommended for You ── */}
        <div className="pb-5">
          <SectionHeader title="Recommended for You" subtitle="Based on popular items" onSeeAll={() => navigate('/offers')} />
          {loading ? (
            <MobileProductSkeleton />
          ) : recommended.length > 0 ? (
            <ProductScroll offers={recommended} onNavigate={(id) => navigate(`/offers/${id}`)} />
          ) : null}
        </div>

        {/* Trust strip */}
        <div className="mx-4 mb-6 bg-primary-light rounded-xl p-4">
          <div className="grid grid-cols-2 gap-3">
            {([
              { icon: 'check', label: 'Verified Sellers' },
              { icon: 'bolt', label: 'Fast Delivery' },
              { icon: 'lock', label: 'Secure Payments' },
              { icon: 'star', label: 'Quality Guarantee' },
            ] as { icon: IconName; label: string }[]).map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-primary w-5 h-5 grid place-items-center shrink-0"><Icon name={item.icon} size={15} /></span>
                <span className="text-xs font-medium text-text">{item.label}</span>
              </div>
            ))}
          </div>
          {/* Payment Methods */}
          <div className="mt-3 pt-3 border-t border-primary/20">
            <div className="text-[10px] font-extrabold text-textSecondary uppercase tracking-wide mb-2">Accepted Payments</div>
            <div className="flex gap-2 flex-wrap">
              {['Bank Transfer', 'USSD', 'Paystack', 'Card'].map((p) => (
                <span key={p} className="text-[10px] text-text bg-white px-2 py-1 rounded border border-border">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
