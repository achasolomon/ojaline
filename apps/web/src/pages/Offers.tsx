import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@ojaline/design';
import { discoverOffers } from '../lib/api';
import type { Offer, Channel, Perishability, DiscoverOffersParams } from '../lib/api';
import { OfferCard } from '../components/OfferCard';

const CHANNEL_FILTERS: { value: Channel | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'RETAILER', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DIRECT', label: 'Direct' },
  { value: 'OPEN', label: 'Open' },
];

const PERISHABILITY_FILTERS: { value: Perishability | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'SHELF_GT_7D', label: 'Shelf 7+ days' },
  { value: 'SHELF_LT_7D', label: 'Perishable' },
];

const PAGE_SIZE = 20;

export default function Offers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const urlCategoryId = searchParams.get('category_id') || '';

  const [offers, setOffers] = useState<Offer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<Channel | ''>('');
  const [perishabilityFilter, setPerishabilityFilter] = useState<Perishability | ''>('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: DiscoverOffersParams = {
      limit: PAGE_SIZE,
      offset,
    };
    if (channelFilter) params.channel = channelFilter;
    if (perishabilityFilter) params.perishability = perishabilityFilter;
    if (urlQuery) params.q = urlQuery;
    if (urlCategoryId) params.category_id = urlCategoryId;

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

    return () => {
      cancelled = true;
    };
  }, [channelFilter, perishabilityFilter, offset, urlQuery, urlCategoryId]);

  const hasMore = offset + PAGE_SIZE < total;

  return (
    <div className="flex flex-col h-full bg-white">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold text-text">
          {urlQuery ? `Search: "${urlQuery}"` : 'Browse Offers'}
        </h1>
        <Button size="sm" onClick={() => navigate('/offers/new')}>+ New Offer</Button>
      </header>

      <div className="border-b border-border px-4 py-3">
        <div className="flex gap-1.5 overflow-x-auto">
          {CHANNEL_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setChannelFilter(f.value); setOffset(0); }}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                channelFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-surface text-textSecondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {PERISHABILITY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setPerishabilityFilter(f.value); setOffset(0); }}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${
                perishabilityFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-surface text-textSecondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            {error}
          </div>
        ) : offers.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-12 text-center">
            <p className="text-sm font-medium text-text">No offers found</p>
            <p className="text-xs text-textSecondary">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-textSecondary">{total} offers</p>
            <div className="flex flex-col gap-3">
              {offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} onClick={(o) => navigate(`/offers/${o.id}`)} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  loading={loading}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
