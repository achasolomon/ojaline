import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import { discoverOffers } from '../lib/api';
import type { Offer } from '../lib/api';
import { useMediaQuery, DESKTOP_BREAKPOINT } from '../lib/useMediaQuery';
import { DesktopHome } from '../components/desktop/DesktopHome';

const CATEGORIES = [
  { name: 'Fresh Vegetables', image: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=120&q=80' },
  { name: 'Fresh Fruits', image: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=120&q=80' },
  { name: 'Grains & Cereals', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=120&q=80' },
  { name: 'Tubers & Roots', image: 'https://images.unsplash.com/photo-1518977676601-b53f82ber40?w=120&q=80' },
  { name: 'Oils & Condiments', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=120&q=80' },
];

const FEATURES = [
  { label: 'Market Day', sublabel: '(Wholesale)', icon: 'calendar' },
  { label: 'Instant', sublabel: 'Delivery', icon: 'bolt' },
  { label: 'Scheduled', sublabel: 'Delivery', icon: 'clock' },
  { label: 'Direct', sublabel: 'From Farm', icon: 'home' },
] as const;

function FeatureIcon({ icon }: { icon: string }) {
  if (icon === 'calendar') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#008A3C" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    );
  }
  if (icon === 'bolt') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#008A3C" strokeWidth="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    );
  }
  if (icon === 'clock') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#008A3C" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#008A3C" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}

export default function Home() {
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);

  if (isDesktop) {
    return <DesktopHome />;
  }

  return <MobileHome />;
}

function MobileHome() {
  const navigate = useNavigate();
  const [picks, setPicks] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    discoverOffers({ limit: 6 })
      .then((res) => {
        if (!cancelled) setPicks(res.offers);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-2 bg-white">
          <div className="flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="24" fill="#008A3C"/>
              <path d="M24 10c-2 4-6 8-6 14 0 4 2.5 7 6 8 3.5-1 6-4 6-8 0-6-4-10-6-14z" fill="#fff"/>
            </svg>
            <span className="text-lg font-bold text-primary tracking-tight">OJALINE</span>
          </div>
          <button type="button" className="relative w-10 h-10 flex items-center justify-center rounded-full">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span className="absolute top-1 right-1 min-w-4 h-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center px-1">
              3
            </span>
          </button>
        </header>

        {/* Location bar */}
        <div className="px-4 pb-2">
          <button type="button" className="flex items-center gap-2 text-left bg-transparent border-none p-0 cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#008A3C" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <div>
              <span className="block text-[11px] text-textSecondary">Deliver to</span>
              <span className="flex items-center gap-1 text-[13px] font-semibold text-text">
                Sabo, Yaba, Lagos
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </span>
            </div>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center bg-surface border border-border rounded-xl px-3 gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="search"
              placeholder="Search for produce, sellers, categories..."
              className="flex-1 border-none bg-transparent text-sm outline-none py-2.5 text-text placeholder:text-[#9CA3AF]"
            />
            <button type="button" className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center border-none cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Hero Banner */}
        <div className="mx-4 mb-4 bg-gradient-to-br from-primary-dark to-primary rounded-2xl p-5 flex items-center min-h-[160px] relative overflow-hidden">
          <div className="flex-1 z-10 text-white">
            <h2 className="text-[22px] font-bold leading-tight mb-1.5">Fresh from<br/>Farm to You</h2>
            <p className="text-[13px] opacity-90 mb-3.5 leading-snug">Trusted sellers. Fair prices.<br/>Real value.</p>
            <button
              type="button"
              onClick={() => navigate('/offers')}
              className="rounded-lg bg-white text-primary text-sm font-semibold px-4 py-2 border-none cursor-pointer"
            >
              Shop Now
            </button>
          </div>
          <div className="w-[120px] h-[120px] rounded-full overflow-hidden shrink-0 border-[3px] border-white/30">
            <img
              src="https://images.unsplash.com/photo-1605000797499-95a51c5269b0?w=400&q=80"
              alt="Farmer with produce"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Feature Row */}
        <div className="flex gap-2 px-4 pb-5">
          {FEATURES.map((f) => (
            <button
              key={f.label}
              type="button"
              className="flex-1 min-w-[72px] flex flex-col items-center gap-1.5 bg-transparent border-none cursor-pointer p-1"
            >
              <span className="w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center">
                <FeatureIcon icon={f.icon} />
              </span>
              <span className="text-[11px] font-medium text-text text-center leading-tight">
                {f.label}<br/>
                <span className="text-textSecondary font-normal">{f.sublabel}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Shop by Category */}
        <div className="pb-5">
          <div className="flex justify-between items-center px-4 pb-3">
            <h3 className="text-base font-semibold">Shop by Category</h3>
            <button type="button" className="text-[13px] font-semibold text-primary bg-transparent border-none cursor-pointer">
              See all
            </button>
          </div>
          <div className="flex gap-4 px-4 overflow-x-auto scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => navigate('/offers')}
                className="flex flex-col items-center gap-1.5 bg-transparent border-none cursor-pointer min-w-16 shrink-0"
              >
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="w-14 h-14 rounded-full object-cover bg-surface border-2 border-border"
                  onError={(e) => { e.currentTarget.src = `https://via.placeholder.com/56?text=${cat.name[0]}`; }}
                />
                <span className="text-xs font-medium text-text">{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Top Picks */}
        <div className="pb-8">
          <div className="flex justify-between items-center px-4 pb-3">
            <h3 className="text-base font-semibold">Top Picks for You</h3>
            <button type="button" onClick={() => navigate('/offers')} className="text-[13px] font-semibold text-primary bg-transparent border-none cursor-pointer">
              See all
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : picks.length === 0 ? (
            <p className="text-sm text-textSecondary text-center py-8 px-4">No offers available yet</p>
          ) : (
            <div className="flex gap-3 px-4 overflow-x-auto scrollbar-none">
              {picks.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => navigate(`/offers/${offer.id}`)}
                  className="min-w-[140px] max-w-[150px] bg-white border border-border rounded-xl overflow-hidden cursor-pointer shrink-0 text-left p-0 transition-shadow hover:shadow-md active:shadow-md"
                >
                  <div className="w-full h-[110px] bg-surface flex items-center justify-center text-textSecondary text-xs">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-30">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <path d="M21 15l-5-5L5 21"/>
                    </svg>
                  </div>
                  <div className="p-2.5">
                    <div className="text-[13px] font-semibold mb-0.5 truncate">{offer.product_name}</div>
                    <div className="text-[11px] text-textSecondary mb-1.5">{offer.physical_ref}</div>
                    <div className="text-sm font-bold text-primary">
                      {offer.price_cents != null ? naira.format(offer.price_cents / 100) : '—'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
