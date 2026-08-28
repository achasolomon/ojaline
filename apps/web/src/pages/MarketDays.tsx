import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMarkets, type Market } from '../lib/api';
import { LocationFilter } from '../components/LocationFilter';

const DAY_LABELS: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
  THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
};

const SELLER_TYPE_LABELS: Record<string, string> = {
  FARMER: 'Farmers',
  MARKET_WOMAN: 'Market Women',
  STORE: 'Stores',
  PROCESSOR: 'Processors',
};

function getDayTabs(): Array<{ label: string; date: string; isToday: boolean }> {
  const now = new Date();
  const tabs: Array<{ label: string; date: string; isToday: boolean }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dow = d.getDay();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${dayNames[dow]}, ${d.getDate()} ${monthNames[d.getMonth()]}`;
    tabs.push({
      label,
      date: d.toISOString().split('T')[0],
      isToday: i === 0,
    });
  }
  return tabs;
}

export default function MarketDays() {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);

  const dayTabs = useMemo(() => getDayTabs(), []);

  useEffect(() => {
    setLoading(true);
    getMarkets(undefined, selectedDate)
      .then(setMarkets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const filteredMarkets = useMemo(() => {
    let result = markets;
    if (selectedClusterId) {
      result = result.filter((m) => m.cluster_id === selectedClusterId);
    } else if (selectedLga) {
      result = result.filter((m) => m.lga === selectedLga);
    } else if (selectedState) {
      result = result.filter((m) => m.state === selectedState);
    }
    return result;
  }, [markets, selectedClusterId, selectedLga, selectedState]);

  const handleLocationSelect = (filters: { state: string | null; lga: string | null; cluster_id: string | null }) => {
    setSelectedState(filters.state);
    setSelectedLga(filters.lga);
    setSelectedClusterId(filters.cluster_id);
  };

  return (
    <div className="max-w-[1480px] mx-auto px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
        <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/')}>Home</span>
        <span>/</span>
        <span className="text-text font-medium">Market Days</span>
      </div>
      <h1 className="text-2xl font-black text-text mb-1">Market Days</h1>
      <p className="text-sm text-text-secondary mb-6">
        Discover open markets, meet sellers, shop fresh produce.
      </p>

      <div className="flex gap-6">
        {/* ── SIDEBAR ── */}
        <aside className="w-[260px] shrink-0 hidden lg:block">
          <div className="bg-white border border-border rounded-xl p-4 sticky top-4">
            <LocationFilter
              selectedState={selectedState}
              selectedLga={selectedLga}
              selectedClusterId={selectedClusterId}
              onSelect={handleLocationSelect}
            />
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 min-w-0">
          {/* Day tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none pb-1">
            {dayTabs.map((tab) => (
              <button
                key={tab.date}
                type="button"
                onClick={() => setSelectedDate(tab.date)}
                className={`shrink-0 px-4 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${
                  selectedDate === tab.date
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-text hover:bg-surface'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Results header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-text">
              Markets on {dayTabs.find((t) => t.date === selectedDate)?.label || selectedDate}
            </h2>
            <span className="text-xs text-text-secondary">{filteredMarkets.length} markets</span>
          </div>

          {/* Market cards */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white border border-border rounded-xl p-5 animate-pulse">
                  <div className="h-5 bg-surface rounded w-3/4 mb-3" />
                  <div className="h-3 bg-surface rounded w-1/2 mb-4" />
                  <div className="flex gap-2 mb-3">
                    <div className="h-6 bg-surface rounded-full w-16" />
                    <div className="h-6 bg-surface rounded-full w-20" />
                  </div>
                  <div className="h-3 bg-surface rounded w-full" />
                </div>
              ))}
            </div>
          ) : filteredMarkets.length === 0 ? (
            <div className="bg-white border border-border rounded-xl p-12 text-center">
              <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-surface flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="1.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <path d="M9 22V12h6v10" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-text mb-1">No markets found</p>
              <p className="text-xs text-text-secondary">
                {selectedClusterId || selectedLga || selectedState
                  ? 'Try adjusting your location filters or choosing a different day.'
                  : 'No markets are open on this day.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredMarkets.map((market) => {
                const sellerTypes = [...new Set(market.sellers.map((s) => s.seller_type ?? '').filter(Boolean))];
                return (
                  <article
                    key={market.id}
                    className="bg-white border border-border rounded-xl p-5 hover:shadow-md transition cursor-pointer"
                    onClick={() => navigate(`/market-days/${market.id}`)}
                  >
                    {/* Market header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h3 className="text-sm font-bold text-text leading-tight">{market.name}</h3>
                        <p className="text-[11px] text-text-secondary">{market.cluster_name}, {market.lga}</p>
                      </div>
                      {market.is_open_today && (
                        <span className="shrink-0 rounded-full bg-primary text-white text-[9px] font-bold px-2 py-0.5">
                          TODAY
                        </span>
                      )}
                    </div>

                    {/* Operating days */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-[10px] text-text-secondary">
                        Every {market.operating_days.map((d) => DAY_LABELS[d]).join(', ')}
                      </span>
                      {market.next_date && (
                        <span className="text-[10px] text-primary font-semibold">
                          · Next: {new Date(market.next_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Seller type pills */}
                    {sellerTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {sellerTypes.map((type) => (
                          <span
                            key={type}
                            className="text-[9px] font-semibold bg-primary-light text-primary rounded-full px-2 py-0.5"
                          >
                            {SELLER_TYPE_LABELS[type as keyof typeof SELLER_TYPE_LABELS] || type}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-text-secondary">
                          {market.sellers.length} sellers
                        </span>
                        <span className="text-[10px] text-text-secondary">
                          {market.product_count} products
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-primary">View →</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── MOBILE: location filter + day tabs ── */}
      <div className="lg:hidden space-y-4 mt-6">
        <LocationFilter
          selectedState={selectedState}
          selectedLga={selectedLga}
          selectedClusterId={selectedClusterId}
          onSelect={handleLocationSelect}
        />
      </div>
    </div>
  );
}
