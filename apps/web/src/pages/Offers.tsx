import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, naira } from '@ojaline/design';
import { discoverOffers, getCategories } from '../lib/api';
import type { Offer, Channel, Perishability, DiscoverOffersParams, Category } from '../lib/api';
import { OfferCard } from '../components/OfferCard';
import { OfferFilters } from '../components/OfferFilters';
import { MarketBuzz } from '../components/MarketBuzz';
import { Icon } from '../components/icons';
import { useMediaQuery, DESKTOP_BREAKPOINT } from '../lib/useMediaQuery';

const PAGE_SIZE = 20;

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'newest', label: 'New Arrivals' },
  { value: 'cheapest', label: 'Price: Low to High' },
];

const SORT_TITLES: Record<string, string> = {
  popular: 'Most Popular',
  newest: 'New Arrivals',
  cheapest: 'Lowest Price',
};

const CHANNEL_LABELS: Record<Channel, string> = {
  RETAILER: 'Retail',
  WHOLESALE: 'Wholesale',
  DIRECT: 'Direct',
  OPEN: 'Open',
};

const PERISH_LABELS: Record<Perishability, string> = {
  SHELF_GT_7D: 'Shelf 7+ days',
  SHELF_LT_7D: 'Perishable',
};

function OfferSkeletonGrid({ cols }: { cols: string }) {
  return (
    <div className={`grid ${cols}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse-soft overflow-hidden rounded-xl border border-border bg-white lg:rounded-[11px]">
          <div className="aspect-[4/3] shimmer" />
          <div className="space-y-1.5 p-2.5 lg:p-[11px]">
            <div className="h-2.5 w-3/4 rounded bg-surface" />
            <div className="h-2 w-1/2 rounded bg-surface" />
            <div className="mt-2 h-3.5 w-1/3 rounded bg-surface" />
            <div className="h-7 w-full rounded-lg bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-light py-1 pl-2.5 pr-1 text-[10px] font-bold text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="grid h-4 w-4 place-items-center rounded-full bg-primary/15 text-primary transition hover:bg-primary hover:text-white"
      >
        <Icon name="close" size={10} />
      </button>
    </span>
  );
}

function SortSelect({
  value,
  onChange,
  className,
  iconClass,
}: {
  value: string;
  onChange: (value: string) => void;
  className: string;
  iconClass: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none border border-border bg-white font-semibold text-text outline-none transition hover:border-primary/40 focus:border-primary ${className}`}
      >
        <option value="">Sort: Featured</option>
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevronDown"
        size={14}
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-textSecondary ${iconClass}`}
      />
    </div>
  );
}

export default function Offers() {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const urlCategoryId = searchParams.get('category_id') || '';
  const rawSort = searchParams.get('sort') || '';
  const urlSort =
    rawSort === 'newest' || rawSort === 'popular' || rawSort === 'cheapest' ? rawSort : '';

  const [offers, setOffers] = useState<Offer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const [perishabilityFilter, setPerishabilityFilter] = useState<Perishability | ''>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(urlCategoryId || null);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedCategoryId(urlCategoryId || null);
  }, [urlCategoryId]);

  useEffect(() => {
    setOffset(0);
  }, [urlSort]);

  const priceMinKobo =
    priceMin !== '' && Number.isFinite(Number(priceMin)) ? Math.max(0, Number(priceMin)) * 100 : undefined;
  const priceMaxKobo =
    priceMax !== '' && Number.isFinite(Number(priceMax)) ? Math.max(0, Number(priceMax)) * 100 : undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);

      const params: DiscoverOffersParams = { limit: PAGE_SIZE, offset };
      if (channelFilter) params.channel = channelFilter;
      if (perishabilityFilter) params.perishability = perishabilityFilter;
      if (selectedCategoryId) params.category_id = selectedCategoryId;
      if (urlQuery) params.q = urlQuery;
      if (urlSort) params.sort = urlSort;
      if (priceMinKobo != null) params.price_min = priceMinKobo;
      if (priceMaxKobo != null) params.price_max = priceMaxKobo;

      discoverOffers(params)
        .then((res) => {
          if (cancelled) return;
          setOffers(res.offers);
          setTotal(res.total);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Failed to load offers');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [channelFilter, perishabilityFilter, selectedCategoryId, priceMinKobo, priceMaxKobo, offset, urlQuery, urlSort]);

  const category = useMemo(() => {
    if (!selectedCategoryId) return null;
    return (
      categories.find((c) => c.id === selectedCategoryId) ||
      categories.flatMap((c) => c.children ?? []).find((c) => c.id === selectedCategoryId)
    );
  }, [categories, selectedCategoryId]);

  const title = urlQuery
    ? `Search "${urlQuery}"`
    : category
      ? category.name
      : urlSort
        ? SORT_TITLES[urlSort]
        : 'All Products';

  const setSort = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('sort', value);
    else next.delete('sort');
    setSearchParams(next, { replace: true });
  };

  const baseFilters = () => {
    setChannelFilter('');
    setPerishabilityFilter('');
    setSelectedCategoryId(null);
    setPriceMin('');
    setPriceMax('');
    setOffset(0);
  };

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (category) chips.push({ key: 'cat', label: category.name, onRemove: () => setSelectedCategoryId(null) });
  if (channelFilter) chips.push({ key: 'ch', label: CHANNEL_LABELS[channelFilter], onRemove: () => setChannelFilter('') });
  if (perishabilityFilter)
    chips.push({ key: 'per', label: PERISH_LABELS[perishabilityFilter], onRemove: () => setPerishabilityFilter('') });
  if (priceMin !== '' && priceMinKobo != null)
    chips.push({ key: 'pmin', label: `From ${naira.format(Number(priceMin))}`, onRemove: () => setPriceMin('') });
  if (priceMax !== '' && priceMaxKobo != null)
    chips.push({ key: 'pmax', label: `Up to ${naira.format(Number(priceMax))}`, onRemove: () => setPriceMax('') });

  const hasMore = offset + PAGE_SIZE < total;

  const resultMeta = `${total} offer${total === 1 ? '' : 's'}${
    category ? ` in ${category.name}` : urlQuery ? ` for "${urlQuery}"` : ''
  }`;

  const filters = (
    <OfferFilters
      categories={categories}
      channel={channelFilter}
      onChannelChange={(value) => {
        setChannelFilter(value);
        setOffset(0);
      }}
      perishability={perishabilityFilter}
      onPerishabilityChange={(value) => {
        setPerishabilityFilter(value);
        setOffset(0);
      }}
      selectedCategoryId={selectedCategoryId}
      onCategoryChange={(id) => {
        setSelectedCategoryId(id);
        setOffset(0);
      }}
      priceMin={priceMin}
      priceMax={priceMax}
      onPriceMinChange={setPriceMin}
      onPriceMaxChange={setPriceMax}
      onClear={baseFilters}
    />
  );

  const listContent = (
    <>
      {loading ? (
        <OfferSkeletonGrid cols={isDesktop ? 'grid-cols-3 gap-3.5 2xl:grid-cols-4' : 'grid-cols-2 gap-2.5'} />
      ) : error ? (
        <div className="grid place-items-center rounded-xl border border-danger/20 bg-danger/5 px-6 py-14 text-center">
          <p className="text-sm font-bold text-danger">{error}</p>
          <button
            type="button"
            onClick={baseFilters}
            className="mt-4 rounded-lg border border-danger bg-white px-4 py-2 text-xs font-bold text-danger hover:bg-danger hover:text-white"
          >
            Retry with default filters
          </button>
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-xl border border-border bg-white px-6 py-14 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary-light text-primary">
            <Icon name="basket" size={24} />
          </div>
          <p className="text-sm font-bold text-text">No offers found</p>
          <p className="mt-1 text-xs text-textSecondary">Try adjusting your filters or search term.</p>
          <button
            type="button"
            onClick={baseFilters}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white transition hover:bg-primary-dark"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <MarketBuzz offers={offers} />
          <div className={`grid ${isDesktop ? 'grid-cols-3 gap-3.5 2xl:grid-cols-4' : 'grid-cols-2 gap-2.5'}`}>
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} onClick={(o) => navigate(`/offers/${o.id}`)} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                loading={offset > 0 && loading}
              >
                Load more offers
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="min-h-full bg-white lg:bg-surface/40">
      {/* ── Mobile toolbar ── */}
      <div className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <SortSelect
              value={urlSort}
              onChange={setSort}
              className="w-full rounded-lg px-3 py-2 text-sm"
              iconClass="right-2.5"
            />
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-text active:scale-[0.97]"
          >
            <Icon name="settings" size={15} className="text-textSecondary" />
            Filters
            {chips.length > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                {chips.length}
              </span>
            )}
          </button>
        </div>
        {chips.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-2.5 scrollbar-none">
            {chips.map((chip) => (
              <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
            ))}
            <button
              type="button"
              onClick={baseFilters}
              className="shrink-0 text-right text-[10px] font-bold text-textSecondary hover:text-primary"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden lg:block">
        <div className="mx-auto max-w-[1200px] px-6 py-6 pb-12">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[22px] font-black tracking-tight text-text">{title}</h1>
              <p className="mt-1 text-[11px] font-medium text-textSecondary">{resultMeta}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <SortSelect
                value={urlSort}
                onChange={setSort}
                className="rounded-[9px] px-3 py-2.5 text-[11px]"
                iconClass="right-2.5"
              />
              <Button size="sm" onClick={() => navigate('/offers/new')}>
                + New Offer
              </Button>
            </div>
          </div>

          <div className="mt-6 grid items-start gap-6" style={{ gridTemplateColumns: '248px minmax(0,1fr)' }}>
            <aside className="sticky top-[136px] rounded-2xl border border-border bg-white p-4">
              {filters}
            </aside>
            <div className="min-w-0">
              {chips.length > 0 && (
                <div className="mb-3.5 flex flex-wrap items-center gap-2">
                  {chips.map((chip) => (
                    <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
                  ))}
                  <button
                    type="button"
                    onClick={baseFilters}
                    className="text-[10px] font-bold text-textSecondary hover:text-primary"
                  >
                    Clear all
                  </button>
                </div>
              )}
              {listContent}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile content ── */}
      <div className="px-3 pb-6 pt-3 lg:hidden">{listContent}</div>

      {/* ── Mobile filter sheet ── */}
      {sheetOpen &&
        createPortal(
          <div className="fixed inset-0 z-[60] lg:hidden">
            <div className="animate-fade-in absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
            <div className="animate-sheet-up absolute inset-x-0 bottom-0 max-h-[88%] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(20px,env(safe-area-inset-bottom))]">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-base font-bold text-text">Filters</h2>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-surface text-textSecondary"
                  aria-label="Close filters"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
              <p className="mb-1 text-[11px] font-medium text-textSecondary">{resultMeta}</p>
              {filters}
              <Button className="mt-4 w-full" onClick={() => setSheetOpen(false)}>
                Show {total} offer{total === 1 ? '' : 's'}
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}