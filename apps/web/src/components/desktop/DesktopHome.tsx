import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  discoverOffers, getCategories, getBatchOffers, mediaUrl, prefetchOffer,
  getRecentlyViewedIds, ACTIVE_CITIES,
  type Offer, type Category, type Channel,
} from '../../lib/api';
import { naira } from '@ojaline/design';
import { addToCart } from '../../lib/cart';
import { DesktopHero } from './DesktopHero';
import { ServiceBenefits } from './ServiceBenefits';
import { MarketBuzz } from '../MarketBuzz';
import { ProductSkeletonGrid } from '../Loading';
import { HomeAdBanner } from '../HomeAdBanner';
import { Icon, type IconName } from '../icons';

const CATEGORY_PLACEHOLDER_BG: Record<string, string> = {
  'Fresh Vegetables': 'linear-gradient(145deg,#e8f5e9,#c8e6c9)',
  'Fresh Fruits': 'linear-gradient(145deg,#fce4ec,#f8bbd0)',
  'Grains & Cereals': 'linear-gradient(145deg,#fff8e1,#ffecb3)',
  'Tubers & Roots': 'linear-gradient(145deg,#fff3e0,#ffe0b2)',
  'Oils & Condiments': 'linear-gradient(145deg,#fffde7,#fff9c4)',
};

const CHANNEL_FILTERS: { label: string; value: Channel | 'ALL' }[] = [
  { label: 'All Categories', value: 'ALL' },
  { label: 'Retail', value: 'RETAILER' },
  { label: 'Wholesale (Market Day)', value: 'WHOLESALE' },
];

const LOCATION_FILTERS = [
  { label: 'All Locations', value: 'ALL' },
  { label: 'Within 2km', value: '2km' },
  { label: 'Within 5km', value: '5km' },
  { label: 'Within 10km', value: '10km' },
];

function ProductCard({ offer, index = 0 }: { offer: Offer; index?: number }) {
  const navigate = useNavigate();
  const go = () => navigate(`/offers/${offer.id}`);
  return (
    <article
      onClick={go}
      role="button"
      tabIndex={0}
      onMouseEnter={() => prefetchOffer(offer.id)}
      onPointerDown={() => prefetchOffer(offer.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
      className="bg-white border border-border rounded-[11px] overflow-hidden relative group hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] hover:-translate-y-[2px] transition-all duration-300 animate-fade-up cursor-pointer"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      <button type="button" onClick={(e) => e.stopPropagation()} className="absolute right-2 top-[7px] z-10 border-none bg-white/90 backdrop-blur rounded-full w-[26px] h-[26px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-sm cursor-pointer hover:scale-[1.15] hover:text-danger transition-all duration-200 opacity-0 group-hover:opacity-100">
        <Icon name="heart" size={14} className="text-textSecondary" />
      </button>
      {offer.price_cents != null && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); addToCart(offer, offer.min_order_qty); }}
          className="absolute right-[7px] bottom-[118px] z-10 border-none bg-primary text-white rounded-full w-[26px] h-[26px] shadow-[0_2px_8px_rgba(0,0,0,0.15)] flex items-center justify-center cursor-pointer hover:bg-primary-dark hover:scale-[1.15] transition-all duration-200 opacity-0 group-hover:opacity-100"
          aria-label="Add to cart"
        >
          <Icon name="plus" size={14} />
        </button>
      )}
      {offer.negotiable && (
        <div className="absolute left-0 top-[7px] bg-[#f5a623] text-white text-[8px] font-bold px-2 py-0.5 rounded-r shadow-sm">Negotiable</div>
      )}
      <div className="h-[145px] bg-cover bg-center overflow-hidden">
        {offer.primary_image?.storage_key ? (
          <img src={`/api/media/${offer.primary_image.storage_key}`} alt={offer.product_name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full bg-surface flex items-center justify-center">
            <svg className="w-8 h-8 text-textSecondary opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              <circle cx="15" cy="13" r="3" />
            </svg>
          </div>
        )}
      </div>
      <div className="p-[11px]">
        <div className="text-[11px] font-extrabold text-text leading-snug line-clamp-2">{offer.product_name}</div>
        <div className="text-[8px] text-text-secondary mt-0.5">{offer.physical_ref}</div>
        {offer.price_cents != null && (
          <div className="text-[14px] font-black text-text mt-2 mb-0 tracking-tight">
            {naira.format(offer.price_cents / 100)}
            {offer.unit ? <span className="text-[9px] font-semibold text-textSecondary"> / {offer.unit}</span> : null}
          </div>
        )}
        <div className="text-[8px] text-text-secondary mt-1">{offer.seller_name || 'Seller'} <span className="text-primary"><Icon name="check" size={9} /></span></div>
        <div onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={go}
            className="w-full mt-2 h-[30px] border border-primary rounded-[6px] bg-white text-primary text-[9px] font-extrabold cursor-pointer hover:bg-primary hover:text-white transition-all duration-200 active:scale-[0.98]">
            View Details
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductRail({ offers }: { offers: Offer[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const scrollPrev = () => {
    const el = ref.current;
    if (el) el.scrollBy({ left: -el.clientWidth * 0.85, behavior: 'smooth' });
  };
  const scrollNext = () => {
    const el = ref.current;
    if (el) el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div ref={ref} className="flex gap-[11px] overflow-x-auto scrollbar-none pb-1">
        {offers.map((o, i) => (
          <div key={o.id} className="w-[205px] shrink-0">
            <ProductCard offer={o} index={i} />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={scrollPrev}
        aria-label="Scroll left"
        className="absolute left-[-8px] top-[54%] -translate-y-1/2 z-10 w-8 h-8 rounded-full border border-border bg-white text-text shadow-[0_4px_14px_rgba(0,0,0,0.12)] flex items-center justify-center cursor-pointer hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
      >
        <Icon name="chevronRight" size={16} className="rotate-180" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        aria-label="Scroll right"
        className="absolute right-[-8px] top-[54%] -translate-y-1/2 z-10 w-8 h-8 rounded-full border border-border bg-white text-text shadow-[0_4px_14px_rgba(0,0,0,0.12)] flex items-center justify-center cursor-pointer hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
      >
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  );
}

function ProductRailSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-[11px] overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-[205px] shrink-0 bg-white border border-border rounded-[11px] overflow-hidden animate-pulse-soft">
          <div className="h-[145px] shimmer" />
          <div className="p-[11px]">
            <div className="h-2.5 bg-surface rounded w-3/4 mb-1.5" />
            <div className="h-2 bg-surface rounded w-1/2 mb-2" />
            <div className="h-3 bg-surface rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, subtitle, onSeeAll }: { title: string; subtitle?: string; onSeeAll?: () => void }) {
  return (
    <div className="flex justify-between items-end mb-[11px] animate-fade-up">
      <div>
        <h2 className="text-lg font-black m-0 text-text">{title}</h2>
        {subtitle && <p className="text-[10px] text-text-secondary mt-1 mb-0">{subtitle}</p>}
      </div>
      {onSeeAll && <span className="text-[10px] text-primary font-extrabold cursor-pointer hover:underline inline-flex items-center gap-0.5" onClick={onSeeAll}>See all <Icon name="arrowRight" size={11} /></span>}
    </div>
  );
}

export function DesktopHome() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [deals, setDeals] = useState<Offer[]>([]);
  const [wholesale, setWholesale] = useState<Offer[]>([]);
  const [newArrivals, setNewArrivals] = useState<Offer[]>([]);
  const [recommended, setRecommended] = useState<Offer[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<Channel | 'ALL'>('ALL');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [filterApplied, setFilterApplied] = useState(false);
  const [resultCount, setResultCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const rvIds = getRecentlyViewedIds();

    Promise.all([
      getCategories(),
      discoverOffers({ channel: 'WHOLESALE', limit: 6 }),
      discoverOffers({ sort: 'newest', limit: 6 }),
      discoverOffers({ limit: 6 }),
      discoverOffers({ limit: 10 }),
      rvIds.length > 0 ? getBatchOffers(rvIds.slice(0, 8)) : Promise.resolve([]),
    ]).then(([cats, ws, newest, rec, popular, rv]) => {
      if (cancelled) return;
      setCategories(cats);
      setDeals(rec.offers.slice(0, 5));
      setWholesale(ws.offers);
      setNewArrivals(newest.offers);
      setRecommended(rec.offers.slice(0, 5));
      setOffers(popular.offers);
      setRecentlyViewed(rv);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setTimeout(() => setLoading(false), 650);
    });
    return () => { cancelled = true; };
  }, []);

  const applyFilters = async () => {
    setFilterApplied(true);
    try {
      const params: Parameters<typeof discoverOffers>[0] = { limit: 10 };
      if (channelFilter !== 'ALL') params.channel = channelFilter;
      if (selectedCategoryId) params.category_id = selectedCategoryId;
      if (priceMin) params.price_min = Number(priceMin) * 100;
      if (priceMax) params.price_max = Number(priceMax) * 100;
      const res = await discoverOffers(params);
      setOffers(res.offers);
      setResultCount(res.total ?? res.offers.length);
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { /* skip */ }
    setTimeout(() => setFilterApplied(false), 1200);
  };
  const clearFilters = () => {
    setChannelFilter('ALL'); setSelectedCategoryId(null); setLocationFilter('ALL'); setPriceMin(''); setPriceMax('');
    setResultCount(null);
    discoverOffers({ limit: 10 }).then((res) => setOffers(res.offers)).catch(() => {});
  };

  const activeFilterChips: string[] = [];
  if (channelFilter !== 'ALL') activeFilterChips.push(CHANNEL_FILTERS.find((f) => f.value === channelFilter)?.label ?? '');
  if (selectedCategoryId) activeFilterChips.push(categories.find((c) => c.id === selectedCategoryId)?.name ?? '');
  if (priceMin) activeFilterChips.push(`From ₦${priceMin}`);
  if (priceMax) activeFilterChips.push(`Up to ₦${priceMax}`);
  const filtersActive = activeFilterChips.length > 0;

  return (
    <div>
      <DesktopHero />
      <ServiceBenefits />

      {/* Coverage Strip */}
      <div className="bg-white border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center gap-4">
          <span className="text-[10px] font-extrabold text-text-secondary uppercase tracking-wide shrink-0">Now in</span>
          <div className="flex gap-4 flex-wrap">
            {ACTIVE_CITIES.map((city) => (
              <span key={city.name} className="flex items-center gap-1.5 text-[10px] text-text">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                {city.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Live market buzz */}
      <div className="max-w-[1200px] mx-auto px-6 pt-5">
        <MarketBuzz offers={deals.concat(wholesale, newArrivals).slice(0, 9)} />
      </div>

      <div className="max-w-[1200px] mx-auto px-6 pb-[45px]">
        <div className="grid gap-[19px]" style={{ gridTemplateColumns: '220px minmax(0,1fr)' }}>
        {/* ── LEFT SIDEBAR ── */}
        <aside id="filter" className="bg-white border border-border rounded-[11px] p-4 flex flex-col self-start sticky top-[135px]">
          <div className="flex justify-between text-[12px] font-black text-text">
            <span>Filter Categories</span>
            <button type="button" onClick={clearFilters} className="text-primary text-[9px] bg-transparent border-none cursor-pointer font-extrabold hover:underline">Clear all</button>
          </div>

          <h4 className="text-[10px] font-extrabold text-text-secondary mt-[18px] mb-2.5">Category Type</h4>
          {CHANNEL_FILTERS.map((f) => (
            <label key={f.value} className="flex items-center gap-1.5 text-[10px] text-[#475149] my-1.5 cursor-pointer select-none">
              <input type="radio" name="category" checked={channelFilter === f.value && !selectedCategoryId}
                onChange={() => { setChannelFilter(f.value); setSelectedCategoryId(null); }} className="accent-primary" />
              {f.label}
            </label>
          ))}

          <h4 className="text-[10px] font-extrabold text-text-secondary mt-[16px] mb-2.5">Product Category</h4>
          <div className="max-h-[220px] overflow-y-auto scrollbar-none pr-1">
            {categories.map((cat) => (
              <label key={cat.id} className="flex items-center gap-1.5 text-[10px] text-[#475149] my-1.5 cursor-pointer select-none">
                <input type="radio" name="product_category" checked={selectedCategoryId === cat.id}
                  onChange={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)} className="accent-primary" />
                <span className="truncate">{cat.name}</span> <span className="text-text-secondary shrink-0">({cat.offer_count})</span>
              </label>
            ))}
          </div>

          <h4 className="text-[10px] font-extrabold text-text-secondary mt-[16px] mb-2.5">Location</h4>
          {LOCATION_FILTERS.map((f) => (
            <label key={f.value} className="flex items-center gap-1.5 text-[10px] text-[#475149] my-1.5 cursor-pointer select-none">
              <input type="radio" name="location" checked={locationFilter === f.value}
                onChange={() => setLocationFilter(f.value)} className="accent-primary" />
              {f.label}
            </label>
          ))}

          <h4 className="text-[10px] font-extrabold text-text-secondary mt-[16px] mb-2.5">Price Range (₦)</h4>
          <div className="grid grid-cols-2 gap-1.5">
            <input type="number" placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)}
              className="w-full h-[30px] border border-border rounded-[5px] px-[7px] text-[9px] text-text focus:border-primary outline-none transition" />
            <input type="number" placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)}
              className="w-full h-[30px] border border-border rounded-[5px] px-[7px] text-[9px] text-text focus:border-primary outline-none transition" />
          </div>
          <button type="button" onClick={applyFilters}
            className="w-full border-none bg-primary text-white rounded-[6px] py-[10px] mt-3 text-[10px] font-extrabold cursor-pointer hover:bg-primary-dark transition-all duration-200 active:scale-[0.98]">
            {filterApplied ? <span className="inline-flex items-center gap-1"><Icon name="check" size={13} /> Filters Applied</span> : 'Apply Filters'}
          </button>

          {/* ── Sidebar trust / help panel fills remaining space ── */}
          <div className="mt-auto pt-4 border-t border-border">
            <div className="bg-primary-light rounded-[9px] p-3">
              <div className="text-[10px] font-extrabold text-primary mb-1">Need help?</div>
              <p className="text-[9px] text-text-secondary leading-relaxed mb-2">Can't find what you need? Chat with our local markets team for help sourcing fresh produce.</p>
              <button type="button" onClick={() => navigate('/chat')}
                className="w-full border-none bg-primary text-white rounded-[6px] py-2 text-[9px] font-extrabold cursor-pointer hover:bg-primary-dark transition">
                Talk to us
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              <span className="text-[9px] text-text-secondary">Free delivery over ₦25k</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              <span className="text-[9px] text-text-secondary">Fresh from local farms</span>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div>
          <div className="mb-[19px]">
            <HomeAdBanner />
          </div>

          {/* Crowd Market banner */}
          <button
            type="button"
            onClick={() => navigate('/crowd-market')}
            className="relative mb-[19px] block w-full overflow-hidden rounded-2xl text-left cursor-pointer border-none text-white"
          >
            <img src="/api/media/banner-market-day.jpeg" alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#056e31] via-[#07883f]/85 to-[#07883f]/30" />
            <div className="relative z-[2] px-8 py-7">
              <span className="inline-block rounded-[5px] bg-white/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[1px] text-white/90">
                Crowd Market
              </span>
              <h3 className="mt-3 max-w-[560px] text-[24px] font-extrabold leading-[1.15] tracking-tight text-white">
                Nothing no fit you? Post am — make sellers fight for your order.
              </h3>
              <p className="mt-2 max-w-[480px] text-[13px] leading-relaxed text-white/85">
                Add wetin you need, sellers go pitch, you fit bargain, walk away — and dem fit call you back with better price.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#F5A623] px-4 py-2 text-[12px] font-bold text-[#4A2D00]">
                Post a want <Icon name="arrowRight" size={13} />
              </span>
            </div>
          </button>

          {/* Shop by Category */}
          <SectionHeader title="Shop by Category" subtitle="Browse fresh products from trusted local sellers" />
          {loading ? (
            <div className="grid grid-cols-8 gap-[9px]">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white border border-border rounded-[10px] p-[9px] animate-pulse-soft">
                  <div className="h-[64px] rounded-[7px] mb-[7px] shimmer" />
                  <div className="h-3 bg-surface rounded w-3/4 mb-1.5" />
                  <div className="h-2 bg-surface rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-8 gap-[9px]">
            {categories.map((cat, i) => (
              <button key={cat.id} type="button" onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                className={`bg-white border rounded-[10px] p-[9px] text-center cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-200 animate-fade-up ${selectedCategoryId === cat.id ? 'border-primary shadow-md' : 'border-border hover:border-primary/40'}`}
                style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}>
                <div className="h-[64px] rounded-[7px] mb-[7px] overflow-hidden">
                  {cat.image_url ? (
                    <img src={mediaUrl(cat.image_url) ?? ''} alt={cat.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" style={{ background: CATEGORY_PLACEHOLDER_BG[cat.name] || 'linear-gradient(145deg,#f1f6ea,#dcebd1)' }} />
                  )}
                </div>
                <b className="block text-[9px] text-text leading-tight line-clamp-1">{cat.name}</b>
                <span className="text-[8px] text-text-secondary">{cat.offer_count}+ items</span>
              </button>
            ))}
          </div>
          )}

          {/* ── Deals / Flash Sales ── */}
          <div className="mt-6">
            <SectionHeader title="Deals & Offers" subtitle="Hot deals from trusted sellers" onSeeAll={() => navigate('/offers')} />
            <div className="bg-gradient-to-r from-[#ff4d4d] to-[#ff7b00] rounded-[9px] px-4 py-3 mb-3 inline-flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span className="text-white text-[11px] font-bold">Ends in 02:34:17</span>
            </div>
            {loading ? (
              <ProductRailSkeleton count={5} />
            ) : deals.length > 0 ? (
              <ProductRail offers={deals} />
            ) : null}
          </div>

          {/* ── Market Day / Wholesale Picks ── */}
          <div className="mt-6">
            <SectionHeader title="Market Day Picks" subtitle="Wholesale prices on bulk orders" onSeeAll={() => navigate('/market-days')} />
            {loading ? (
              <ProductRailSkeleton count={5} />
            ) : wholesale.length > 0 ? (
              <ProductRail offers={wholesale} />
            ) : null}
          </div>

          {/* ── New Arrivals ── */}
          <div className="mt-6">
            <SectionHeader title="New Arrivals" subtitle="Freshly listed produce" onSeeAll={() => navigate('/offers')} />
            {loading ? (
              <ProductRailSkeleton count={5} />
            ) : newArrivals.length > 0 ? (
              <ProductRail offers={newArrivals} />
            ) : null}
          </div>

          {/* ── Recently Viewed ── */}
          {recentlyViewed.length > 0 && (
            <div className="mt-6">
              <SectionHeader title="Recently Viewed" />
              <ProductRail offers={recentlyViewed} />
            </div>
          )}

          {/* ── Recommended for You ── */}
          <div className="mt-6">
            <SectionHeader title="Recommended for You" subtitle="Based on popular items" onSeeAll={() => navigate('/offers')} />
            {loading ? (
              <ProductRailSkeleton count={5} />
            ) : recommended.length > 0 && (
              <ProductRail offers={recommended} />
            )}
          </div>

          {/* Popular Near You (filtered view) */}
          <div className="mt-6" id="products">
            <div className="flex items-center justify-between mb-[11px]">
              <div>
                <h2 className="text-lg font-black m-0 text-text">Explore Products</h2>
                <p className="text-[10px] text-text-secondary mt-1 mb-0">
                  {filtersActive && resultCount != null ? `${resultCount} product${resultCount === 1 ? '' : 's'} found` : 'Top rated products from trusted sellers in your area'}
                </p>
              </div>
            </div>

            {filtersActive && (
              <div className="flex flex-wrap items-center gap-2 mb-3 animate-fade-up">
                {activeFilterChips.map((chip) => (
                  chip ? (
                    <span key={chip} className="inline-flex items-center gap-1.5 bg-primary-light text-primary text-[9px] font-bold px-2.5 py-1 rounded-full">
                      {chip}
                    </span>
                  ) : null
                ))}
                <button type="button" onClick={clearFilters} className="text-[9px] text-text-secondary font-semibold cursor-pointer hover:text-primary transition bg-transparent border-none">
                  Clear filters
                </button>
              </div>
            )}

            {loading ? (
              <ProductSkeletonGrid />
            ) : offers.length === 0 ? (
              <div className="bg-white border border-border rounded-[11px] p-10 text-center animate-scale-in">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-primary-light text-primary flex items-center justify-center"><Icon name="basket" size={24} /></div>
                <p className="text-[12px] font-bold text-text">No products found</p>
                <p className="text-[10px] text-text-secondary mt-1 mb-4">Try adjusting your filters or search for something else.</p>
                <button type="button" onClick={clearFilters} className="bg-primary text-white text-[10px] font-extrabold rounded-[6px] px-4 py-2 border-none cursor-pointer hover:bg-primary-dark transition">
                  Clear all filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-[11px]">{offers.map((o, i) => <ProductCard key={o.id} offer={o} index={i} />)}</div>
            )}
          </div>

          {/* Trust Bottom */}
          <div className="mt-5 bg-[#eef8f2] rounded-[11px] px-5 py-[17px]">
            <div className="grid grid-cols-5 gap-4">
              {[
                { icon: 'lock' as IconName, label: 'Secure Payments', sub: 'Your payments are protected' },
                { icon: 'check' as IconName, label: 'Verified Sellers', sub: 'Trusted marketplace sellers' },
                { icon: 'shield' as IconName, label: 'Buyer Protection', sub: 'Support when you need it' },
                { icon: 'star' as IconName, label: 'Quality Guarantee', sub: 'Fresh produce, fair value' },
                { icon: 'help' as IconName, label: '24/7 Support', sub: 'We are here to help' },
              ].map((item) => (
                <div key={item.label} className="flex gap-2.5 items-center">
                  <span className="text-primary w-5 h-5 grid place-items-center shrink-0"><Icon name={item.icon} size={17} /></span>
                  <div>
                    <strong className="block text-[10px] text-text">{item.label}</strong>
                    <span className="text-[8px] text-text-secondary">{item.sub}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Payment Methods */}
            <div className="mt-4 pt-3 border-t border-primary/20 flex items-center gap-5">
              <span className="text-[9px] font-extrabold text-text-secondary uppercase tracking-wide">Accepted Payments</span>
              <div className="flex gap-3 items-center">
                {[
                  { label: 'Bank Transfer', icon: 'bank' as IconName },
                  { label: 'USSD', icon: 'smartphone' as IconName },
                  { label: 'Paystack', icon: 'card' as IconName },
                  { label: 'Card', icon: 'card' as IconName },
                ].map((p) => (
                  <span key={p.label} className="flex items-center gap-1 text-[9px] text-text bg-white px-2.5 py-1 rounded border border-border">
                    <Icon name={p.icon} size={12} className="text-textSecondary" /> {p.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
