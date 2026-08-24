import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { discoverOffers, getCategories, type Offer, type Category, type Channel } from '../../lib/api';
import { naira } from '@ojaline/design';
import { DesktopHero } from './DesktopHero';
import { ServiceBenefits } from './ServiceBenefits';

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

export function DesktopHome() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<Channel | 'ALL'>('ALL');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [filterApplied, setFilterApplied] = useState(false);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof discoverOffers>[0] = { limit: 10 };
      if (channelFilter !== 'ALL') params.channel = channelFilter;
      if (selectedCategoryId) params.category_id = selectedCategoryId;
      if (priceMin) params.price_min = Number(priceMin) * 100;
      if (priceMax) params.price_max = Number(priceMax) * 100;
      const res = await discoverOffers(params);
      setOffers(res.offers);
    } catch { /* skip */ }
    setLoading(false);
  }, [channelFilter, selectedCategoryId, priceMin, priceMax]);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  const applyFilters = () => {
    setFilterApplied(true);
    setTimeout(() => setFilterApplied(false), 1200);
  };

  const clearFilters = () => {
    setChannelFilter('ALL');
    setSelectedCategoryId(null);
    setLocationFilter('ALL');
    setPriceMin('');
    setPriceMax('');
  };

  return (
    <div>
      <DesktopHero />
      <ServiceBenefits />

      <div className="max-w-[1480px] mx-auto px-6 pb-[45px]">
        <div className="grid gap-[19px]" style={{ gridTemplateColumns: '210px 1fr' }}>
        {/* ── LEFT SIDEBAR ── */}
        <aside id="filter" className="bg-white border border-border rounded-[10px] p-4 h-max sticky top-[135px]">
          <div className="flex justify-between text-[12px] font-black text-text">
            <span>Filter Categories</span>
            <button type="button" onClick={clearFilters} className="text-primary text-[9px] bg-transparent border-none cursor-pointer font-extrabold hover:underline">Clear all</button>
          </div>

          <h4 className="text-[10px] font-extrabold text-text-secondary mt-[18px] mb-2.5">Category Type</h4>
          {CHANNEL_FILTERS.map((f) => (
            <label key={f.value} className="block text-[10px] text-[#475149] my-2 cursor-pointer">
              <input
                type="radio"
                name="category"
                checked={channelFilter === f.value && !selectedCategoryId}
                onChange={() => { setChannelFilter(f.value); setSelectedCategoryId(null); }}
                className="accent-primary mr-1.5"
              />
              {f.label}
            </label>
          ))}

          <h4 className="text-[10px] font-extrabold text-text-secondary mt-[18px] mb-2.5">Product Category</h4>
          {categories.map((cat) => (
            <label key={cat.id} className="block text-[10px] text-[#475149] my-2 cursor-pointer">
              <input
                type="radio"
                name="product_category"
                checked={selectedCategoryId === cat.id}
                onChange={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                className="accent-primary mr-1.5"
              />
              {cat.name} <span className="text-text-secondary">({cat.offer_count})</span>
            </label>
          ))}

          <h4 className="text-[10px] font-extrabold text-text-secondary mt-[18px] mb-2.5">Location</h4>
          {LOCATION_FILTERS.map((f) => (
            <label key={f.value} className="block text-[10px] text-[#475149] my-2 cursor-pointer">
              <input
                type="radio"
                name="location"
                checked={locationFilter === f.value}
                onChange={() => setLocationFilter(f.value)}
                className="accent-primary mr-1.5"
              />
              {f.label}
            </label>
          ))}

          <h4 className="text-[10px] font-extrabold text-text-secondary mt-[18px] mb-2.5">Price Range (₦)</h4>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="number"
              placeholder="Min"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="w-full h-[30px] border border-border rounded-[5px] px-[7px] text-[9px] text-text"
            />
            <input
              type="number"
              placeholder="Max"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="w-full h-[30px] border border-border rounded-[5px] px-[7px] text-[9px] text-text"
            />
          </div>
          <button
            type="button"
            onClick={applyFilters}
            className="w-full border-none bg-primary text-white rounded-[5px] py-[9px] mt-2 text-[10px] font-extrabold cursor-pointer hover:bg-primary-dark transition"
          >
            {filterApplied ? 'Filters Applied ✓' : 'Apply Filters'}
          </button>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div>
          {/* Shop by Category */}
          <div className="flex justify-between items-end mb-[11px]">
            <div>
              <h2 className="text-lg font-black m-0 text-text">Shop by Category</h2>
              <p className="text-[10px] text-text-secondary mt-1 mb-0">Browse fresh products from trusted local sellers</p>
            </div>
            <span className="text-[10px] text-primary font-extrabold cursor-pointer hover:underline">See all categories →</span>
          </div>
          <div className="grid grid-cols-8 gap-[9px]">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                className={`bg-white border rounded-[9px] p-[9px] text-center cursor-pointer hover:shadow-md transition ${selectedCategoryId === cat.id ? 'border-primary shadow-md' : 'border-border'}`}
              >
                <div
                  className="h-[64px] rounded-[7px] mb-[7px]"
                  style={{ background: CATEGORY_PLACEHOLDER_BG[cat.name] || 'linear-gradient(145deg,#f1f6ea,#dcebd1)' }}
                />
                <b className="block text-[9px] text-text">{cat.name}</b>
                <span className="text-[8px] text-text-secondary">{cat.offer_count}+ items</span>
              </button>
            ))}
          </div>

          {/* Popular Near You */}
          <div className="mt-6" id="products">
            <div className="flex justify-between items-end mb-[11px]">
              <div>
                <h2 className="text-lg font-black m-0 text-text">Popular Near You</h2>
                <p className="text-[10px] text-text-secondary mt-1 mb-0">Top rated products from trusted sellers in your area</p>
              </div>
              <span className="text-[10px] text-primary font-extrabold cursor-pointer hover:underline" onClick={() => navigate('/offers')}>See all →</span>
            </div>

            {loading ? (
              <div className="grid grid-cols-5 gap-[9px]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-white border border-border rounded-[9px] overflow-hidden animate-pulse">
                    <div className="h-[145px] bg-surface" />
                    <div className="p-[9px]">
                      <div className="h-3 bg-surface rounded w-3/4 mb-2" />
                      <div className="h-3 bg-surface rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : offers.length === 0 ? (
              <div className="bg-white border border-border rounded-[9px] p-8 text-center">
                <p className="text-[11px] text-text-secondary">No products found. Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-[9px]">
                {offers.map((offer) => (
                  <article
                    key={offer.id}
                    className="bg-white border border-border rounded-[9px] overflow-hidden relative group"
                  >
                    <button
                      type="button"
                      className="absolute right-2 top-[7px] border-none bg-white rounded-full w-[26px] h-[26px] shadow-[0_2px_8px_rgba(0,0,0,0.01)] text-sm cursor-pointer hover:scale-110 transition z-10"
                    >
                      ♡
                    </button>
                    <div
                      className="h-[145px] bg-cover bg-center"
                      style={{
                        backgroundImage: offer.primary_image?.storage_key
                          ? `url(/api/media/${offer.primary_image.storage_key})`
                          : `none`,
                        background: offer.primary_image?.storage_key ? undefined : PRODUCT_PLACEHOLDER_BG,
                      }}
                    />
                    <div className="p-[9px]">
                      <div className="text-[10px] font-extrabold text-text">{offer.product_name}</div>
                      <div className="text-[8px] text-text-secondary">{offer.physical_ref}</div>
                      {offer.price_cents != null && (
                        <div className="text-[13px] font-black text-text mt-1.5 mb-0">
                          {naira.format(offer.price_cents / 100)}
                        </div>
                      )}
                      <div className="text-[8px] text-[#d48d09] mt-1">
                        ★ 4.8 <span className="text-text-secondary">(120)</span>
                      </div>
                      <div className="text-[8px] text-[#566159] mt-1.5">
                        {offer.seller_name || 'Seller'} <span className="text-primary">✓</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/offers/${offer.id}`)}
                        className="w-full mt-2 h-[29px] border border-primary rounded-[5px] bg-white text-primary text-[9px] font-extrabold cursor-pointer hover:bg-primary-light transition"
                      >
                        View Details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Trust Bottom */}
          <div className="mt-5 bg-[#eef8f2] rounded-[11px] px-5 py-[17px] grid grid-cols-5 gap-4">
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
        </div>
      </div>
      </div>
    </div>
  );
}
