import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMarkets, type Market } from '../lib/api';
import { LocationFilter } from '../components/LocationFilter';
import { Icon, type IconName } from '../components/icons';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_SHORT_MAP: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

const SELLER_TYPE_LABELS: Record<string, string> = {
  FARMER: 'Farmers',
  MARKET_WOMAN: 'Market women',
  STORE: 'Stores',
  PROCESSOR: 'Processors',
};

const SELLER_TYPE_ICONS: Record<string, IconName> = {
  FARMER: 'leaf',
  MARKET_WOMAN: 'basket',
  STORE: 'store',
  PROCESSOR: 'settings',
};

const MARKET_TYPE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'DAILY', label: 'Daily markets' },
  { key: 'WEEKLY', label: 'Weekly markets' },
  { key: 'FARMERS', label: 'Farmers markets' },
  { key: 'PROCESSING', label: 'Processing markets' },
];

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'most_products', label: 'Most products' },
  { value: 'most_sellers', label: 'Most sellers' },
  { value: 'name', label: 'Name A–Z' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['value'];
type ViewKey = 'list' | 'grid';

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmt(n: number): string {
  return n.toLocaleString('en-NG');
}

function fmtTime(t: string): string {
  const [, hh, mm] = t.match(/^(\d{1,2}):(\d{2})/) ?? [null, '8', '0'];
  const date = new Date();
  date.setHours(Number(hh), Number(mm), 0, 0);
  return date.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}

interface DayTab {
  dateKey: string;
  title: string;
  weekday: string;
  dayNum: number;
  month: string;
  isToday: boolean;
}

function getDayTabs(): DayTab[] {
  const now = new Date();
  const tabs: DayTab[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dow = d.getDay();
    const title = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DAY_SHORT[dow]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
    tabs.push({
      dateKey: formatDateKey(d),
      title,
      weekday: DAY_SHORT[dow],
      dayNum: d.getDate(),
      month: MONTH_SHORT[d.getMonth()],
      isToday: i === 0,
    });
  }
  return tabs;
}

/* Fields the listing can render when the API grows them — all optional and hidden when absent. */
interface RenderedMarket extends Market {
  image_url?: string;
  tags?: string[];
  order_cutoff?: string;
  popular_products?: Array<{ name?: string; image?: string }>;
}

interface MarketFiltersProps {
  selectedState: string | null;
  selectedLga: string | null;
  selectedClusterId: string | null;
  onLocationSelect: (f: { state: string | null; lga: string | null; cluster_id: string | null }) => void;
  marketTypes: string[];
  onMarketTypesChange: (keys: string[]) => void;
  availability: { openNow: boolean; hasSellers: boolean; hasProducts: boolean };
  onAvailabilityChange: (a: { openNow: boolean; hasSellers: boolean; hasProducts: boolean }) => void;
  onClearAll: () => void;
}

function MarketFiltersPanel({
  selectedState,
  selectedLga,
  selectedClusterId,
  onLocationSelect,
  marketTypes,
  onMarketTypesChange,
  availability,
  onAvailabilityChange,
  onClearAll,
}: MarketFiltersProps) {
  const toggleType = (key: string) => {
    onMarketTypesChange(marketTypes.includes(key) ? marketTypes.filter((k) => k !== key) : [...marketTypes, key]);
  };

  const toggleAvail = (key: 'openNow' | 'hasSellers' | 'hasProducts') => {
    onAvailabilityChange({ ...availability, [key]: !availability[key] });
  };

  return (
    <div className="space-y-4">
      <LocationFilter
        selectedState={selectedState}
        selectedLga={selectedLga}
        selectedClusterId={selectedClusterId}
        onSelect={onLocationSelect}
      />

      <div className="border-t border-border pt-4">
        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-textSecondary">Market type</h4>
        {MARKET_TYPE_OPTIONS.map((opt) => (
          <label key={opt.key} className="flex items-center gap-2 py-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={marketTypes.includes(opt.key)}
              onChange={() => toggleType(opt.key)}
              className="h-3.5 w-3.5 shrink-0 rounded-sm border-border accent-primary"
            />
            <span className="text-[12px] text-text">{opt.label}</span>
          </label>
        ))}
        {marketTypes.length > 0 && (
          <p className="mt-1.5 text-[10px] leading-snug text-textSecondary">
            Market-type tagging is rolling out — for now, all types are shown.
          </p>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-textSecondary">Availability</h4>
        <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={availability.openNow}
            onChange={() => toggleAvail('openNow')}
            className="h-3.5 w-3.5 shrink-0 rounded-sm border-border accent-primary"
          />
          <span className="text-[12px] text-text">Open now</span>
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={availability.hasSellers}
            onChange={() => toggleAvail('hasSellers')}
            className="h-3.5 w-3.5 shrink-0 rounded-sm border-border accent-primary"
          />
          <span className="text-[12px] text-text">Has sellers</span>
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={availability.hasProducts}
            onChange={() => toggleAvail('hasProducts')}
            className="h-3.5 w-3.5 shrink-0 rounded-sm border-border accent-primary"
          />
          <span className="text-[12px] text-text">Has products</span>
        </label>
      </div>

      <button
        type="button"
        onClick={onClearAll}
        className="w-full rounded-lg border border-border px-3 py-2 text-[11px] font-semibold text-text transition hover:border-primary hover:text-primary cursor-pointer"
      >
        Clear filters
      </button>
    </div>
  );
}

function MarketMedia({ market }: { market: RenderedMarket }) {
  if (market.image_url) {
    return <img src={market.image_url} alt={market.name} className="h-full w-full object-cover" />;
  }
  return (
    <div className="grid h-full w-full place-items-center bg-primary-light text-primary/50">
      <Icon name="store" size={22} />
    </div>
  );
}

function ListViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function MarketDays() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [daysData, setDaysData] = useState<Record<string, Market[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(formatDateKey(new Date()));
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recommended');
  const [view, setView] = useState<ViewKey>('list');
  const [marketTypes, setMarketTypes] = useState<string[]>([]);
  const [availability, setAvailability] = useState({ openNow: false, hasSellers: false, hasProducts: false });
  const [sellerTypeFilter, setSellerTypeFilter] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const dayTabs = useMemo(() => getDayTabs(), []);
  const dayKeys = useMemo(() => dayTabs.map((t) => t.dateKey), [dayTabs]);

  /* ── Hydrate state from the URL (once) ── */
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const s = searchParams;
    const date = s.get('date');
    if (date && dayKeys.includes(date)) setSelectedDate(date);
    const st = s.get('state');
    if (st) setSelectedState(st);
    const lga = s.get('lga');
    if (lga) setSelectedLga(lga);
    const cl = s.get('cluster');
    if (cl) setSelectedClusterId(cl);
    const q = s.get('q');
    if (q) setSearch(q);
    const srt = s.get('sort');
    if (srt && SORT_OPTIONS.some((o) => o.value === srt)) setSort(srt as SortKey);
    const v = s.get('view');
    if (v === 'list' || v === 'grid') setView(v);
  }, [searchParams, dayKeys]);

  /* ── Push the current view state into the URL ── */
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const pushParams = (overrides: Record<string, string | null | undefined>, replace?: boolean) => {
    const p = new URLSearchParams();
    const put = (k: string, v?: string | null) => {
      if (v) p.set(k, v);
    };
    put('date', selectedDate);
    put('state', selectedState);
    put('lga', selectedLga);
    put('cluster', selectedClusterId);
    put('q', search || null);
    put('sort', sort);
    put('view', view);
    for (const [k, v] of Object.entries(overrides)) put(k, v as string | null | undefined);
    setSearchParams(p, { replace });
  };

  useEffect(() => {
    setLoading(true);
    Promise.all(dayTabs.map((t) => getMarkets(undefined, t.dateKey).catch(() => [] as Market[])))
      .then((results) => {
        const map: Record<string, Market[]> = {};
        dayTabs.forEach((t, i) => {
          map[t.dateKey] = results[i];
        });
        setDaysData(map);
      })
      .finally(() => setLoading(false));
  }, [dayTabs]);

  const selectedTab = dayTabs.find((t) => t.dateKey === selectedDate);

  const dayMarkets = useMemo(() => daysData?.[selectedDate] ?? [], [daysData, selectedDate]);

  const dayCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of dayTabs) {
      counts[t.dateKey] = daysData?.[t.dateKey]?.length ?? 0;
    }
    return counts;
  }, [daysData, dayTabs]);

  const maxDayCount = useMemo(
    () => Math.max(1, ...dayTabs.map((t) => dayCounts[t.dateKey] ?? 0)),
    [dayTabs, dayCounts]
  );

  const dayStats = useMemo(() => {
    let sellers = 0;
    let products = 0;
    for (const m of dayMarkets) {
      sellers += m.sellers?.length ?? 0;
      products += m.product_count ?? 0;
    }
    return { markets: dayMarkets.length, sellers, products };
  }, [dayMarkets]);

  const nextMarketTab = useMemo(() => {
    return dayTabs.find((t, i) => i > 0 && (dayCounts[t.dateKey] ?? 0) > 0) ?? null;
  }, [dayTabs, dayCounts]);

  const filteredMarkets = useMemo(() => {
    let result = dayMarkets;

    if (selectedClusterId) {
      result = result.filter((m) => m.cluster_id === selectedClusterId);
    } else if (selectedLga) {
      result = result.filter((m) => m.lga === selectedLga);
    } else if (selectedState) {
      result = result.filter((m) => m.state === selectedState);
    }

    if (availability.openNow) {
      result = result.filter((m) => m.is_open_on_date !== false);
    }
    if (availability.hasSellers) {
      result = result.filter((m) => (m.sellers?.length ?? 0) > 0);
    }
    if (availability.hasProducts) {
      result = result.filter((m) => (m.product_count ?? 0) > 0);
    }

    if (sellerTypeFilter) {
      result = result.filter((m) => (m.sellers ?? []).some((s) => s.seller_type === sellerTypeFilter));
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((m) =>
        [m.name, m.cluster_name, m.lga, m.state ?? '', ...(m.sellers ?? []).map((s) => s.full_name)]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }

    return result;
  }, [dayMarkets, selectedClusterId, selectedLga, selectedState, availability, sellerTypeFilter, search]);

  const sortedMarkets = useMemo(() => {
    const arr = [...filteredMarkets];
    if (sort === 'most_products') {
      arr.sort((a, b) => (b.product_count ?? 0) - (a.product_count ?? 0));
    } else if (sort === 'most_sellers') {
      arr.sort((a, b) => (b.sellers?.length ?? 0) - (a.sellers?.length ?? 0));
    } else if (sort === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return arr;
  }, [filteredMarkets, sort]);

  const sellerTypeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of sortedMarkets) {
      const types = new Set((m.sellers ?? []).map((s) => s.seller_type).filter(Boolean) as string[]);
      for (const t of types) map[t] = (map[t] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [sortedMarkets]);

  const activeFilterCount =
    (selectedState ? 1 : 0) +
    (selectedLga ? 1 : 0) +
    (selectedClusterId ? 1 : 0) +
    marketTypes.length +
    (availability.openNow ? 1 : 0) +
    (availability.hasSellers ? 1 : 0) +
    (availability.hasProducts ? 1 : 0) +
    (search ? 1 : 0);

  const headerDate = useMemo(() => new Date(selectedDate + 'T12:00:00'), [selectedDate]);
  const headerDateStr = headerDate.toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const handleLocationSelect = (f: { state: string | null; lga: string | null; cluster_id: string | null }) => {
    setSelectedState(f.state);
    setSelectedLga(f.lga);
    setSelectedClusterId(f.cluster_id);
    pushParams({ state: f.state, lga: f.lga, cluster: f.cluster_id });
  };

  const clearAll = () => {
    setSelectedState(null);
    setSelectedLga(null);
    setSelectedClusterId(null);
    setSearch('');
    setMarketTypes([]);
    setAvailability({ openNow: false, hasSellers: false, hasProducts: false });
    setSellerTypeFilter(null);
    setSort('recommended');
    pushParams({ state: null, lga: null, cluster: null, q: null, sort: null });
  };

  const filtersProps: MarketFiltersProps = {
    selectedState,
    selectedLga,
    selectedClusterId,
    onLocationSelect: handleLocationSelect,
    marketTypes,
    onMarketTypesChange: setMarketTypes,
    availability,
    onAvailabilityChange: setAvailability,
    onClearAll: clearAll,
  };

  /* Popular discovery chips (real data, only when nothing is being searched/filtered) */
  const discovery = useMemo(() => {
    if (search || selectedState || selectedLga || selectedClusterId) return null;
    const lgaMap: Record<string, number> = {};
    for (const m of dayMarkets) lgaMap[m.lga] = (lgaMap[m.lga] ?? 0) + 1;
    const lgas = Object.entries(lgaMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const markets = [...dayMarkets].sort((a, b) => (b.product_count ?? 0) - (a.product_count ?? 0)).slice(0, 3);
    if (lgas.length === 0 && markets.length === 0) return null;
    return { lgas, markets };
  }, [search, selectedState, selectedLga, selectedClusterId, dayMarkets]);

  /* Mobile sheet: scroll lock + Escape */
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheetOpen]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 lg:py-8">
      {/* Breadcrumb */}
      <div className="hidden lg:flex items-center gap-2 text-[11px] text-text-secondary mb-6">
        <span className="cursor-pointer hover:text-primary transition" onClick={() => navigate('/')}>Home</span>
        <span className="text-border">/</span>
        <span className="text-text font-medium">Market Days</span>
      </div>

      {/* Masthead */}
      <h1 className="text-[22px] font-bold tracking-tight text-text sm:text-[28px]">Market Days</h1>
      <p className="mt-1.5 hidden max-w-[620px] text-sm leading-relaxed text-textSecondary sm:block">
        Find markets trading today and discover the sellers and products available around you.
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-textSecondary sm:mt-3 sm:text-[13px]">
        <Icon name="calendar" size={14} className="text-primary" />
        <span className="font-semibold text-text">{headerDateStr}</span>
        <span>·</span>
        <span>
          <span className="font-semibold text-text">{fmt(dayStats.markets)}</span>
          {` market${dayStats.markets === 1 ? '' : 's'} trading ${selectedTab?.isToday ? 'today' : 'that day'}`}
        </span>
      </p>

      {/* Market banner */}
      <section className="relative mt-6 overflow-hidden rounded-[14px] bg-gradient-to-br from-[#056e31] via-[#07883f] to-[#79aa76] text-white lg:mt-7">
        <img
          src="/images/market-day.jpeg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#056e31] via-[#07883f]/75 to-transparent" />
        <button
          type="button"
          onClick={() => document.getElementById('market-directory')?.scrollIntoView({ behavior: 'smooth' })}
          className="relative z-[2] flex w-full items-center gap-3 px-5 py-4 text-left cursor-pointer lg:hidden"
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
            <Icon name="basket" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-extrabold uppercase tracking-[1px] text-white/80">Market day</span>
            <span className="mt-0.5 block text-[13px] font-bold leading-snug text-white">
              Shop wholesale at the market — direct from local sellers
            </span>
          </span>
          <Icon name="chevronRight" size={18} className="shrink-0 text-white/80" />
        </button>

        <div className="relative z-[2] hidden px-10 py-10 lg:block">
          <span className="inline-block rounded-[5px] bg-white/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[1px]">
            Trading days
          </span>
          <h2 className="mt-3 max-w-[460px] text-[26px] font-extrabold leading-[1.12] tracking-tight sm:text-[32px]">
            Shop wholesale at the market, direct from local sellers
          </h2>
          <p className="mt-2.5 max-w-[430px] text-[13px] leading-relaxed text-[#e9f7ed]">
            Verified sellers, wholesale prices and same-day order cutoffs at every trading day.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => document.getElementById('market-directory')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-[7px] bg-white px-[17px] py-[11px] text-[11px] font-extrabold text-[#07883f] transition hover:shadow-md cursor-pointer"
            >
              Browse today's markets
            </button>
            <button
              type="button"
              onClick={() => {
                if (dayTabs[1]) {
                  setSelectedDate(dayTabs[1].dateKey);
                  pushParams({ date: dayTabs[1].dateKey }, false);
                }
              }}
              className="rounded-[7px] border border-white px-[17px] py-[11px] text-[11px] font-extrabold text-white transition hover:bg-white/10 cursor-pointer"
            >
              See tomorrow's market day
            </button>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-white/15 pt-4 text-[11px] font-medium text-white/85">
            {[
              { icon: 'check' as const, label: 'Verified sellers' },
              { icon: 'tag' as const, label: 'Wholesale prices' },
              { icon: 'bolt' as const, label: 'Same-day pickup' },
              { icon: 'shield' as const, label: 'Secure payments' },
            ].map((t) => (
              <span key={t.label} className="flex items-center gap-1.5">
                <Icon name={t.icon} size={12} />
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-8 flex flex-col lg:flex-row gap-8">
        {/* ── FILTERS SIDEBAR (desktop) ── */}
        <aside className="w-[240px] shrink-0 hidden lg:block">
          <div className="bg-white border border-border rounded-lg px-4 py-5">
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-text">Filters</h2>
            <MarketFiltersPanel {...filtersProps} />
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 min-w-0">
          {/* Day selector — mobile: compact sticky rail */}
          <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-white lg:hidden">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 py-2.5">
              {dayTabs.map((tab) => {
                const active = selectedDate === tab.dateKey;
                const count = dayCounts[tab.dateKey] ?? 0;
                return (
                  <button
                    key={tab.dateKey}
                    type="button"
                    onClick={() => {
                      setSelectedDate(tab.dateKey);
                      pushParams({ date: tab.dateKey }, false);
                    }}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition cursor-pointer ${
                      active
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white text-text hover:border-primary/40'
                    }`}
                  >
                    {tab.isToday ? 'Today' : tab.weekday}
                    <span className="font-bold">{tab.dayNum}</span>
                    {loading ? (
                      <span className="text-[10px] font-medium opacity-60">…</span>
                    ) : count > 0 ? (
                      <span className={`text-[10px] font-medium ${active ? 'text-white/80' : 'text-textSecondary'}`}>
                        · {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day selector — desktop: full date cards */}
          <div className="hidden gap-2 overflow-x-auto scrollbar-none pb-1 lg:flex">
            {dayTabs.map((tab) => {
              const active = selectedDate === tab.dateKey;
              const count = dayCounts[tab.dateKey] ?? 0;
              const barPct = count > 0 ? Math.max(6, (count / maxDayCount) * 100) : 0;
              return (
                <button
                  key={tab.dateKey}
                  type="button"
                  onClick={() => {
                    setSelectedDate(tab.dateKey);
                    pushParams({ date: tab.dateKey }, false);
                  }}
                  className={`shrink-0 w-[84px] rounded-lg px-2 py-2.5 text-center border transition cursor-pointer ${
                    active
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-white text-text hover:border-primary/40'
                  }`}
                >
                  <span
                    className={`block text-[8.5px] font-bold uppercase tracking-wider ${
                      active ? 'text-white/80' : 'text-textSecondary'
                    }`}
                  >
                    {tab.isToday ? 'Today' : tab.weekday}
                  </span>
                  <span className="mt-0.5 block text-base font-semibold leading-none">{tab.dayNum}</span>
                  <span className={`mt-0.5 block text-[9px] font-medium ${active ? 'text-white/70' : 'text-textSecondary'}`}>
                    {tab.month}
                  </span>
                  <span
                    className={`mt-1.5 block rounded-full px-1.5 py-0.5 text-[8px] font-bold ${
                      active ? 'bg-white/15 text-white' : 'bg-surface text-textSecondary'
                    }`}
                  >
                    {loading ? '…' : `${fmt(count)} markets`}
                  </span>
                  <span className={`mt-1.5 block h-[3px] w-full overflow-hidden rounded-full ${active ? 'bg-white/20' : 'bg-surface'}`}>
                    <span
                      className={`block h-full rounded-full ${active ? 'bg-white' : 'bg-primary/60'}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Day summary */}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border py-3.5 text-[12px] text-textSecondary">
            <span className="flex items-center gap-1.5">
              <Icon name="calendar" size={13} className="text-primary" />
              <span className="font-semibold text-text">{fmt(dayStats.markets)}</span> Markets open
            </span>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span className="hidden items-center gap-1.5 sm:flex">
              <Icon name="user" size={13} className="text-primary" />
              <span className="font-semibold text-text">{fmt(dayStats.sellers)}</span> Seller{dayStats.sellers === 1 ? '' : 's'} trading
            </span>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span className="hidden items-center gap-1.5 sm:flex">
              <Icon name="box" size={13} className="text-primary" />
              <span className="font-semibold text-text">{fmt(dayStats.products)}</span> Products available
            </span>
            {nextMarketTab && (
              <>
                <span className="h-3 w-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(nextMarketTab.dateKey);
                    pushParams({ date: nextMarketTab.dateKey }, false);
                  }}
                  className="flex items-center gap-1.5 font-medium text-primary hover:underline cursor-pointer"
                >
                  Next: {nextMarketTab.weekday} {nextMarketTab.dayNum} {nextMarketTab.month} · {fmt((dayCounts[nextMarketTab.dateKey] ?? 0))} markets
                </button>
              </>
            )}
          </div>

          {/* Search + sort + view + count */}
          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1 md:max-w-[380px]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  pushParams({ q: e.target.value || null });
                }}
                placeholder="Search markets, sellers or products…"
                className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-[13px] text-text outline-none placeholder:text-textSecondary focus:border-primary transition"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 md:ml-auto">
              <div className="flex items-center gap-0.5 rounded-lg border border-border bg-white p-0.5">
                <button
                  type="button"
                  title="List view"
                  onClick={() => {
                    setView('list');
                    pushParams({ view: 'list' });
                  }}
                  className={`grid h-7 w-7 place-items-center rounded-md transition cursor-pointer ${
                    view === 'list' ? 'bg-primary text-white' : 'text-textSecondary hover:text-text'
                  }`}
                >
                  <ListViewIcon />
                </button>
                <button
                  type="button"
                  title="Grid view"
                  onClick={() => {
                    setView('grid');
                    pushParams({ view: 'grid' });
                  }}
                  className={`grid h-7 w-7 place-items-center rounded-md transition cursor-pointer ${
                    view === 'grid' ? 'bg-primary text-white' : 'text-textSecondary hover:text-text'
                  }`}
                >
                  <Icon name="grid" size={14} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="lg:hidden flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-[12px] font-semibold text-text transition cursor-pointer"
              >
                <Icon name="pin" size={13} className="text-primary" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[9px] font-bold text-white">{activeFilterCount}</span>
                )}
              </button>

              <div className="flex items-center gap-2">
                <label htmlFor="market-sort" className="hidden text-[11px] font-medium text-textSecondary sm:inline">Sort</label>
                <div className="relative">
                  <select
                    id="market-sort"
                    value={sort}
                    onChange={(e) => {
                      const v = e.target.value as SortKey;
                      setSort(v);
                      pushParams({ sort: v });
                    }}
                    className="appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-8 text-[12px] font-semibold text-text outline-none focus:border-primary transition cursor-pointer"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-textSecondary">
                    <Icon name="chevronDown" size={12} />
                  </span>
                </div>
              </div>

              <span className="hidden lg:inline text-[12px] text-textSecondary">
                <span className="font-semibold text-text">{fmt(filteredMarkets.length)}</span> markets
              </span>
            </div>
          </div>

          {/* Discovery chips */}
          {discovery && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">Popular</span>
              {discovery.lgas.map(([lga, count]) => (
                <button
                  key={lga}
                  type="button"
                  onClick={() => {
                    setSelectedLga(lga);
                    setSelectedState(null);
                    setSelectedClusterId(null);
                    pushParams({ lga, state: null, cluster: null });
                  }}
                  className="flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-text transition hover:border-primary hover:text-primary cursor-pointer"
                >
                  <Icon name="pin" size={10} /> {lga} · {count}
                </button>
              ))}
              {discovery.markets.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => navigate(`/market-days/${m.id}`)}
                  className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-text transition hover:border-primary hover:text-primary cursor-pointer"
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}

          {/* Seller-type quick chips */}
          {sellerTypeCounts.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSellerTypeFilter(null)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition cursor-pointer ${
                  !sellerTypeFilter
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-text hover:border-primary hover:text-primary'
                }`}
              >
                All
              </button>
              {sellerTypeCounts.map(([type, count]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSellerTypeFilter(sellerTypeFilter === type ? null : type)}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition cursor-pointer ${
                    sellerTypeFilter === type
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-white text-text hover:border-primary hover:text-primary'
                  }`}
                >
                  <Icon name={SELLER_TYPE_ICONS[type] ?? 'user'} size={11} />
                  {SELLER_TYPE_LABELS[type] ?? type} · {count}
                </button>
              ))}
            </div>
          )}

          {/* Market directory */}
          {loading ? (
            view === 'grid' ? (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-border bg-white p-4 animate-pulse">
                    <div className="aspect-[16/10] w-full rounded-md bg-surface" />
                    <div className="mt-3 h-4 bg-surface rounded w-3/4 mb-2" />
                    <div className="h-3 bg-surface rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 bg-white border border-border rounded-lg divide-y divide-border">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-4 px-4 sm:px-5 py-4 animate-pulse">
                    <div className="w-[96px] sm:w-[150px] shrink-0 rounded-md bg-surface aspect-[16/10]" />
                    <div className="flex-1 py-1">
                      <div className="h-4 bg-surface rounded w-2/5 mb-2.5" />
                      <div className="h-3 bg-surface rounded w-1/3 mb-2.5" />
                      <div className="h-3 bg-surface rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : sortedMarkets.length === 0 ? (
            <div className="mt-5 bg-white border border-border rounded-lg px-6 py-14 text-center">
              <p className="text-sm font-semibold text-text">No markets listed</p>
              <p className="mt-1 text-xs text-textSecondary">
                {activeFilterCount > 0
                  ? 'Try widening your filters or clearing the search.'
                  : 'No markets are open on this day.'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="mt-4 rounded-lg border border-border px-4 py-2 text-[11px] font-semibold text-text hover:border-primary hover:text-primary transition cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : view === 'grid' ? (
            <div id="market-directory" className="mt-5 grid scroll-mt-14 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:scroll-mt-6">
              {sortedMarkets.map((market) => {
                const m = market as RenderedMarket;
                return (
                  <article
                    key={m.id}
                    className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-white p-4 transition hover:bg-surface/60"
                    onClick={() => navigate(`/market-days/${m.id}`)}
                  >
                    <div className="relative overflow-hidden rounded-md">
                      <div className="aspect-[16/10] w-full">
                        <MarketMedia market={m} />
                      </div>
                      {(m.is_open_on_date || m.is_open_today) && (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          <span className="h-1 w-1 rounded-full bg-primary" />
                          Open now
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 truncate text-[14px] font-semibold text-text group-hover:text-primary transition">
                      {m.name}
                    </h3>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-textSecondary">
                      <Icon name="pin" size={10} className="shrink-0 text-primary/60" />
                      <span className="truncate">{m.cluster_name}, {m.lga}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-textSecondary">
                      <span className="flex items-center gap-1">
                        <Icon name="user" size={10} /> {m.sellers?.length ?? 0} seller{(m.sellers?.length ?? 0) === 1 ? '' : 's'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="box" size={10} /> {fmt(m.product_count ?? 0)} products
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-textSecondary">
                      <span className="font-semibold text-text">Trading days</span>
                      <span className="mx-1.5 text-border">·</span>
                      {(m.operating_days ?? []).map((d) => DAY_SHORT_MAP[d] ?? d).join(' · ')}
                    </p>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <span className="flex items-center gap-1 text-[12px] font-semibold text-primary">
                        View market
                        <Icon name="arrowRight" size={13} className="transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div id="market-directory" className="mt-5 scroll-mt-14 bg-white border border-border rounded-lg divide-y divide-border lg:scroll-mt-6">
              {sortedMarkets.map((market) => {
                const m = market as RenderedMarket;
                const hasPreview = (m.popular_products?.length ?? 0) > 0;
                return (
                  <article
                    key={m.id}
                    className="group flex gap-4 sm:gap-5 px-4 sm:px-5 py-3.5 sm:py-4 transition cursor-pointer hover:bg-surface/60"
                    onClick={() => navigate(`/market-days/${m.id}`)}
                  >
                    {/* Market image / fallback */}
                    <div className="w-[80px] sm:w-[150px] shrink-0">
                      <div className="aspect-square sm:aspect-[16/10] w-full overflow-hidden rounded-md">
                        <MarketMedia market={m} />
                      </div>
                    </div>

                    {/* Market information */}
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-[14px] font-semibold text-text sm:text-[15px] group-hover:text-primary transition">
                          {m.name}
                        </h3>
                        {(m.is_open_on_date || m.is_open_today) && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            Open now
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-textSecondary">
                        <Icon name="pin" size={11} className="shrink-0 text-primary/60" />
                        <span className="truncate">
                          {m.cluster_name}, {m.lga}{m.state ? `, ${m.state}` : ''}
                        </span>
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-textSecondary">
                        <span className="flex items-center gap-1">
                          <Icon name="user" size={11} />
                          {m.sellers?.length ?? 0} seller{(m.sellers?.length ?? 0) === 1 ? '' : 's'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="box" size={11} />
                          {fmt(m.product_count ?? 0)} products
                        </span>
                        {m.order_cutoff && (
                          <span className="flex items-center gap-1">
                            <Icon name="clock" size={11} />
                            Closes {fmtTime(m.order_cutoff)}
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 text-[11px] text-textSecondary">
                        <span className="font-semibold text-text">Trading days</span>
                        <span className="mx-1.5 text-border">·</span>
                        {(m.operating_days ?? []).map((d) => DAY_SHORT_MAP[d] ?? d).join(' · ')}
                      </p>

                      {m.tags && m.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-text"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center gap-1 text-[12px] font-semibold text-primary">
                        View market
                        <Icon name="arrowRight" size={13} className="transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>

                    {/* Popular products rail (renders only when the API supplies previews) */}
                    {hasPreview && (
                      <div className="hidden md:flex w-[150px] shrink-0 flex-col justify-center gap-2 border-l border-border pl-5">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-textSecondary">
                          Popular products
                        </span>
                        <div className="flex gap-1.5">
                          {m.popular_products!.slice(0, 3).map((p, i) => (
                            <div
                              key={i}
                              className="aspect-square w-10 overflow-hidden rounded-md bg-surface"
                              title={p.name}
                            >
                              {p.image ? (
                                <img src={p.image} alt={p.name ?? ''} className="h-full w-full object-cover" />
                              ) : (
                                <div className="grid h-full w-full place-items-center text-primary/50">
                                  <Icon name="box" size={14} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {/* Mobile count */}
          <p className="mt-4 text-center text-[12px] text-textSecondary lg:hidden">
            <span className="font-semibold text-text">{fmt(filteredMarkets.length)}</span> markets
          </p>
        </main>
      </div>

      {/* ── MOBILE FILTER BOTTOM SHEET ── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[84vh] animate-sheet-up overflow-y-auto rounded-t-2xl bg-white">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-5 py-3.5">
              <h3 className="text-sm font-bold text-text">Filters</h3>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-textSecondary">{activeFilterCount} active</span>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="grid h-7 w-7 place-items-center rounded-md text-textSecondary transition hover:bg-surface hover:text-text cursor-pointer"
                  aria-label="Close filters"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            </div>
            <div className="px-5 py-4">
              <MarketFiltersPanel {...filtersProps} />
            </div>
            <div className="sticky bottom-0 border-t border-border bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="w-full rounded-lg bg-primary py-3 text-[13px] font-bold text-white transition hover:bg-primary-dark cursor-pointer"
              >
                Show {fmt(filteredMarkets.length)} markets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}