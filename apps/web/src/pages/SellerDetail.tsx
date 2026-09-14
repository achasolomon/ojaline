import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSellerById, type Seller } from '../lib/api';
import { Icon, type IconName } from '../components/icons';
import { OfferCard } from '../components/OfferCard';

const SELLER_TYPE_LABELS: Record<string, string> = {
  FARMER: 'Farmer',
  MARKET_WOMAN: 'Market Woman',
  STORE: 'Store',
  PROCESSOR: 'Processor',
};

const SELLER_TYPE_ICONS: Record<string, IconName> = {
  FARMER: 'leaf',
  MARKET_WOMAN: 'basket',
  STORE: 'store',
  PROCESSOR: 'settings',
};

interface Stat {
  icon: IconName;
  label: string;
  value: string;
}

function buildStats(seller: Seller): Stat[] {
  const stats: Stat[] = [];
  if (seller.avg_rating != null) {
    const rating = Number(seller.avg_rating);
    if (!Number.isNaN(rating)) {
      stats.push({
        icon: 'star',
        label: 'Rating',
        value: seller.review_count != null ? `${rating.toFixed(1)} (${seller.review_count})` : rating.toFixed(1),
      });
    }
  }
  if (seller.years_in_market != null) {
    stats.push({ icon: 'calendar', label: 'In market', value: `${seller.years_in_market} yr${seller.years_in_market === 1 ? '' : 's'}` });
  }
  if (seller.completed_orders != null) {
    stats.push({ icon: 'basket', label: 'Orders complete', value: String(seller.completed_orders) });
  }
  if (seller.completion_rate != null) {
    stats.push({ icon: 'check', label: 'Completion rate', value: `${seller.completion_rate}%` });
  }
  return stats;
}

export default function SellerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSellerById(id)
      .then(setSeller)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
        <div className="h-5 w-40 animate-pulse rounded bg-surface" />
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white">
          <div className="h-24 animate-pulse bg-surface" />
          <div className="px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 animate-pulse rounded-full bg-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-48 animate-pulse rounded bg-surface" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface" />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-surface" />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 h-5 w-52 animate-pulse rounded bg-surface" />
        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
        <p className="text-sm text-textSecondary">Seller not found.</p>
      </div>
    );
  }

  const type = seller.seller_type || seller.profile_type || '';
  const stats = buildStats(seller);
  const hasLocation = seller.market_name || seller.stall_number;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-textSecondary mb-5">
        <span className="cursor-pointer hover:text-primary" onClick={() => navigate('/')}>Home</span>
        <span>/</span>
        <span className="text-text font-medium">{seller.full_name}</span>
      </div>

      {/* Seller profile */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-white">
        <div className="h-20 bg-gradient-to-r from-primary to-primary-dark lg:h-28" />
        <div className="px-5 pb-6 lg:px-8">
          <div className="-mt-9 flex items-end gap-4 lg:-mt-11 lg:gap-5">
            <div className="w-[104px] shrink-0 lg:w-[140px]">
              <div className="aspect-square rounded-full bg-white p-1.5 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-primary-light text-primary">
                  <Icon name={SELLER_TYPE_ICONS[type] || 'user'} size={44} />
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 pb-0.5">
              <h1 className="truncate text-xl font-black text-text lg:text-2xl">{seller.full_name}</h1>
              <p className="text-xs font-semibold text-primary lg:text-sm">
                {SELLER_TYPE_LABELS[type] || type || 'Seller'}
              </p>
              {seller.verified && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#D6F5E7] px-2.5 py-1 text-[10px] font-bold text-[#087A38]">
                  <Icon name="shield" size={12} /> Verified
                </span>
              )}
              {seller.markets.length > 0 && (
                <div className="mt-2 flex max-h-8 flex-wrap gap-1.5 overflow-hidden">
                  {seller.markets.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigate(`/market-days/${m.id}`); }}
                      className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10px] font-semibold text-textSecondary transition hover:bg-primary-light hover:text-primary cursor-pointer"
                    >
                      <Icon name="map" size={11} /> {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {seller.bio && (
            <p className="mt-4 max-w-[680px] text-xs leading-relaxed text-textSecondary lg:mt-5 lg:text-sm">
              {seller.bio}
            </p>
          )}

          {hasLocation && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-textSecondary">
              {seller.market_name && (
                <span className="flex items-center gap-1.5">
                  <Icon name="store" size={14} className="text-primary" />
                  {seller.market_name}
                </span>
              )}
              {seller.stall_number && (
                <span className="flex items-center gap-1.5">
                  <Icon name="pin" size={14} className="text-primary" />
                  Stall {seller.stall_number}
                </span>
              )}
            </div>
          )}

          {stats.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-5 lg:grid-cols-4 lg:gap-4">
              {stats.map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
                    <Icon name={s.icon} size={15} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-text">{s.value}</div>
                    <div className="truncate text-[10px] text-textSecondary">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Products */}
      <h2 className="mb-4 text-lg font-black text-text">
        Products by {seller.full_name}
        <span className="ml-2 text-sm font-normal text-textSecondary">({seller.products.length})</span>
      </h2>

      {seller.products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-12 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary">
            <Icon name="basket" size={24} />
          </span>
          <p className="text-sm font-bold text-text">No products listed yet</p>
          <p className="mx-auto mt-1 max-w-[320px] text-xs text-textSecondary">
            This seller has not listed any products yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 lg:gap-3.5">
          {seller.products.map((product) => (
            <OfferCard key={product.id} offer={product} onClick={(o) => navigate(`/offers/${o.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}