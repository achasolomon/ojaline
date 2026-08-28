import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  discoverOffers, getCategories, getBatchOffers, getTopSellers,
  getRecentlyViewedIds, ACTIVE_CITIES,
  type Offer, type Category, type Channel, type TopSeller,
} from '../../lib/api';
import { naira } from '@ojaline/design';
import { DesktopHero } from './DesktopHero';
import { ServiceBenefits } from './ServiceBenefits';
import { MeetFarmers } from '../MeetFarmers';

const PRODUCT_PLACEHOLDER_BG = 'radial-gradient(circle at 30% 45%,#e34e32 0 12%,transparent 12.5%),radial-gradient(circle at 58% 62%,#d8442f 0 13%,transparent 13.5%),radial-gradient(circle at 72% 33%,#f0a21f 0 9%,transparent 9.5%),radial-gradient(circle at 45% 25%,#69a03b 0 12%,transparent 12.5%),linear-gradient(145deg,#f4f7ef,#dfead8)';

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
  return (
    <article
      className="bg-white border border-border rounded-[11px] overflow-hidden relative group hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)] hover:-translate-y-[2px] transition-all duration-300 animate-fade-up"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      <button type="button" className="absolute right-2 top-[7px] z-10 border-none bg-white/90 backdrop-blur rounded-full w-[26px] h-[26px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] text-sm cursor-pointer hover:scale-[1.15] hover:text-danger transition-all duration-200 opacity-0 group-hover:opacity-100">♡</button>
      {offer.negotiable && (
        <div className="absolute left-0 top-[7px] bg-[#f5a623] text-white text-[8px] font-bold px-2 py-0.5 rounded-r shadow-sm">Negotiable</div>
      )}
      <div className="h-[145px] bg-cover bg-center overflow-hidden">
        {offer.primary_image?.storage_key ? (
          <img src={`/api/media/${offer.primary_image.storage_key}`} alt={offer.product_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full" style={{ background: PRODUCT_PLACEHOLDER_BG }} />
        )}
      </div>
      <div className="p-[11px]">
        <div className="text-[11px] font-extrabold text-text leading-snug line-clamp-2">{offer.product_name}</div>
        <div className="text-[8px] text-text-secondary mt-0.5">{offer.physical_ref}</div>
        {offer.price_cents != null && (
          <div className="text-[14px] font-black text-text mt-2 mb-0 tracking-tight">{naira.format(offer.price_cents / 100)}</div>
        )}
        <div className="text-[8px] text-text-secondary mt-1">{offer.seller_name || 'Seller'} <span className="text-primary">✓</span></div>
        <button type="button" onClick={() => navigate(`/offers/${offer.id}`)}
          className="w-full mt-2 h-[30px] border border-primary rounded-[6px] bg-white text-primary text-[9px] font-extrabold cursor-pointer hover:bg-primary hover:text-white transition-all duration-200 active:scale-[0.98]">
          View Details
        </button>
      </div>
    </article>
  );
}

function SellerCard({ seller }: { seller: TopSeller }) {
  const navigate = useNavigate();
  const typeEmoji: Record<string, string> = { FARMER: '🌾', MARKET_WOMAN: '🧺', STORE: '🏪' };
  return (
    <button type="button" onClick={() => navigate(`/sellers/${seller.id}`)}
      className="min-w-[180px] bg-white border border-border rounded-[9px] p-4 cursor-pointer shrink-0 text-left hover:shadow-md transition">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-lg">
          {typeEmoji[seller.seller_type] || '👤'}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold text-text truncate">{seller.name}</div>
          <div className="text-[9px] text-text-secondary">{seller.seller_type?.replace('_', ' ')}</div>
          {seller.market_name && (
            <div className="text-[8px] text-text-secondary truncate">{seller.stall_number}, {seller.market_name}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-[#d48d09]">★ {Number(seller.avg_rating).toFixed(1)}</span>
        <span className="text-[9px] text-text-secondary">({seller.review_count} reviews)</span>
      </div>
      {seller.member_since && (
        <div className="text-[8px] text-text-secondary mt-1">Regular since {new Date(seller.member_since).getFullYear()}</div>
      )}
      {seller.completion_rate != null && (
        <div className="text-[8px] text-primary mt-0.5">{seller.completion_rate}% in-app completion</div>
      )}
    </button>
  );
}

function SectionHeader({ title, subtitle, onSeeAll }: { title: string; subtitle?: string; onSeeAll?: () => void }) {
  return (
    <div className="flex justify-between items-end mb-[11px] animate-fade-up">
      <div>
        <h2 className="text-lg font-black m-0 text-text">{title}</h2>
        {subtitle && <p className="text-[10px] text-text-secondary mt-1 mb-0">{subtitle}</p>}
      </div>
      {onSeeAll && <span className="text-[10px] text-primary font-extrabold cursor-pointer hover:underline" onClick={onSeeAll}>See all →</span>}
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
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
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
      getTopSellers(5),
      discoverOffers({ limit: 6 }),
      discoverOffers({ limit: 10 }),
      rvIds.length > 0 ? getBatchOffers(rvIds.slice(0, 8)) : Promise.resolve([]),
    ]).then(([cats, ws, newest, sellers, rec, popular, rv]) => {
      if (cancelled) return;
      setCategories(cats);
      setDeals(rec.offers.slice(0, 5));
      setWholesale(ws.offers);
      setNewArrivals(newest.offers);
      setTopSellers(sellers);
      setRecommended(rec.offers.slice(0, 5));
      setOffers(popular.offers);
      setRecentlyViewed(rv);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
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
        <div className="max-w-[1480px] mx-auto px-6 py-3 flex items-center gap-4">
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

      <div className="max-w-[1480px] mx-auto px-6 pb-[45px]">
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
            {filterApplied ? 'Filters Applied ✓' : 'Apply Filters'}
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
          {/* Shop by Category */}
          <SectionHeader title="Shop by Category" subtitle="Browse fresh products from trusted local sellers" />
          <div className="grid grid-cols-8 gap-[9px]">
            {categories.map((cat, i) => (
              <button key={cat.id} type="button" onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                className={`bg-white border rounded-[10px] p-[9px] text-center cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-200 animate-fade-up ${selectedCategoryId === cat.id ? 'border-primary shadow-md' : 'border-border hover:border-primary/40'}`}
                style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}>
                <div className="h-[64px] rounded-[7px] mb-[7px] overflow-hidden">
                  {cat.image_url ? (
                    <img src={`/api/media/${cat.image_url}`} alt={cat.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" style={{ background: CATEGORY_PLACEHOLDER_BG[cat.name] || 'linear-gradient(145deg,#f1f6ea,#dcebd1)' }} />
                  )}
                </div>
                <b className="block text-[9px] text-text leading-tight line-clamp-1">{cat.name}</b>
                <span className="text-[8px] text-text-secondary">{cat.offer_count}+ items</span>
              </button>
            ))}
          </div>

          {/* ── Deals / Flash Sales ── */}
          <div className="mt-6">
            <SectionHeader title="Deals & Offers" subtitle="Hot deals from trusted sellers" onSeeAll={() => navigate('/offers')} />
            <div className="bg-gradient-to-r from-[#ff4d4d] to-[#ff7b00] rounded-[9px] px-4 py-3 mb-3 inline-flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span className="text-white text-[11px] font-bold">Ends in 02:34:17</span>
            </div>
            {deals.length > 0 ? (
              <div className="grid grid-cols-5 gap-[11px]">{deals.map((o, i) => <ProductCard key={o.id} offer={o} index={i} />)}</div>
            ) : null}
          </div>

          {/* ── Market Day / Wholesale Picks ── */}
          <div className="mt-6">
            <SectionHeader title="Market Day Picks" subtitle="Wholesale prices on bulk orders" onSeeAll={() => navigate('/market-days')} />
            {wholesale.length > 0 ? (
              <div className="grid grid-cols-5 gap-[11px]">{wholesale.map((o, i) => <ProductCard key={o.id} offer={o} index={i} />)}</div>
            ) : null}
          </div>

          {/* ── New Arrivals ── */}
          <div className="mt-6">
            <SectionHeader title="New Arrivals" subtitle="Freshly listed produce" onSeeAll={() => navigate('/offers')} />
            {newArrivals.length > 0 ? (
              <div className="grid grid-cols-5 gap-[11px]">{newArrivals.map((o, i) => <ProductCard key={o.id} offer={o} index={i} />)}</div>
            ) : null}
          </div>

          {/* ── Top Sellers ── */}
          <div className="mt-6">
            <SectionHeader title="Top Sellers" subtitle="Highest rated in your area" />
            {topSellers.length > 0 && (
              <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">{topSellers.map((s) => <SellerCard key={s.id} seller={s} />)}</div>
            )}
          </div>

          {/* ── Meet Our Sellers ── */}
          <div className="mt-6">
            <MeetFarmers sellers={topSellers} />
          </div>

          {/* ── Recently Viewed ── */}
          {recentlyViewed.length > 0 && (
            <div className="mt-6">
              <SectionHeader title="Recently Viewed" />
              <div className="grid grid-cols-5 gap-[9px]">{recentlyViewed.map((o, i) => <ProductCard key={o.id} offer={o} index={i} />)}</div>
            </div>
          )}

          {/* ── Recommended for You ── */}
          <div className="mt-6">
            <SectionHeader title="Recommended for You" subtitle="Based on popular items" onSeeAll={() => navigate('/offers')} />
            {recommended.length > 0 && (
              <div className="grid grid-cols-5 gap-[9px]">{recommended.map((o, i) => <ProductCard key={o.id} offer={o} index={i} />)}</div>
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
              <div className="grid grid-cols-5 gap-[9px]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-white border border-border rounded-[9px] overflow-hidden animate-pulse">
                    <div className="h-[145px] bg-surface" />
                    <div className="p-[9px]"><div className="h-3 bg-surface rounded w-3/4 mb-2" /><div className="h-3 bg-surface rounded w-1/2" /></div>
                  </div>
                ))}
              </div>
            ) : offers.length === 0 ? (
              <div className="bg-white border border-border rounded-[11px] p-10 text-center animate-scale-in">
                <div className="text-3xl mb-2">🧺</div>
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
                { icon: '▣', label: 'Secure Payments', sub: 'Your payments are protected' },
                { icon: '✓', label: 'Verified Sellers', sub: 'Trusted marketplace sellers' },
                { icon: '♢', label: 'Buyer Protection', sub: 'Support when you need it' },
                { icon: '★', label: 'Quality Guarantee', sub: 'Fresh produce, fair value' },
                { icon: '◷', label: '24/7 Support', sub: 'We are here to help' },
              ].map((item) => (
                <div key={item.label} className="flex gap-2.5 items-center">
                  <span className="text-primary text-[18px] shrink-0">{item.icon}</span>
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
                  { label: 'Bank Transfer', icon: '🏦' },
                  { label: 'USSD', icon: '📱' },
                  { label: 'Paystack', icon: '💳' },
                  { label: 'Card', icon: '💳' },
                ].map((p) => (
                  <span key={p.label} className="flex items-center gap-1 text-[9px] text-text bg-white px-2.5 py-1 rounded border border-border">
                    <span>{p.icon}</span> {p.label}
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
