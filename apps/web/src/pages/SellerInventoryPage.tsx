import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  getMyOffers,
  getSellerAnalytics,
  setOfferStatus,
  type MyOffer,
  type OfferStatus,
  type SellerAnalytics,
  type SellerOfferAnalytics,
  type OfferDailyViews,
} from '../lib/api';
import { getUserId, getUser } from '../lib/session';
import { Icon } from '../components/icons';
import { mediaUrl } from '../lib/api';
import { EditOfferModal } from '../components/seller/EditOfferModal';
import { toCSV, downloadCSV } from '../lib/csv';

const fmt = (kobo: number | null) => (kobo == null ? '—' : naira.format(kobo / 100));

const EXPORT_COLS = [
  { key: 'product_name', header: 'Product' },
  { key: 'status', header: 'Status' },
  { key: 'unit', header: 'Unit' },
  { key: 'price', header: 'Price' },
  { key: 'available_qty', header: 'Available qty' },
  { key: 'sellable_qty', header: 'Sellable qty' },
  { key: 'reserved_qty', header: 'Reserved qty' },
  { key: 'sold_qty', header: 'Sold' },
  { key: 'delivered_qty', header: 'Delivered' },
  { key: 'created_at', header: 'Created' },
];

function flattenOffers(offers: MyOffer[]): Record<string, unknown>[] {
  return offers.map((o) => ({
    product_name: o.product_name,
    status: o.status,
    unit: o.unit ?? '',
    price: fmt(o.price_cents),
    available_qty: o.available_qty,
    sellable_qty: o.sellable_qty,
    reserved_qty: o.reserved_qty ?? '',
    sold_qty: o.sold_qty,
    delivered_qty: o.delivered_qty ?? '',
    created_at: o.created_at,
  }));
}

const STATUS_FILTERS: Array<{ id: 'ALL' | OfferStatus; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'PAUSED', label: 'Paused' },
  { id: 'DELISTED', label: 'Delisted' },
];

const STATUS_BADGE: Record<OfferStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-[#D6F5E7] text-[#087A38]' },
  PAUSED: { label: 'Paused', cls: 'bg-[#FFF6DA] text-[#A36A00]' },
  DELISTED: { label: 'Delisted', cls: 'bg-danger/10 text-danger' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MiniBarChart({ points }: { points: OfferDailyViews[] }) {
  const max = Math.max(...points.map((p) => p.views), 1);
  return (
    <span className="flex h-5 w-14 items-end gap-[1px]">
      {points.map((p) => {
        const pct = p.views > 0 ? Math.max((p.views / max) * 100, 8) : 0;
        return (
          <span
            key={p.date}
            className="flex-1 rounded-sm bg-primary/40"
            style={{ height: `${pct}%` }}
            title={`${p.date}: ${p.views} view${p.views === 1 ? '' : 's'}`}
          />
        );
      })}
    </span>
  );
}

export default function SellerInventoryPage() {
  const navigate = useNavigate();
  const user = getUser();
  const sellerId = getUserId() ?? '';
  const isSeller = Boolean(user?.seller_type);

  const [offers, setOffers] = useState<MyOffer[] | null>(null);
  const [analytics, setAnalytics] = useState<SellerAnalytics | null>(null);
  const [filter, setFilter] = useState<'ALL' | OfferStatus>('ALL');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<MyOffer | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isSeller || !sellerId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const page = await getMyOffers(sellerId, {
          status: filter === 'ALL' ? undefined : filter,
          q: q.trim() || undefined,
          limit: 100,
        });
        if (!cancelled) setOffers(page.offers);
      } catch {
        /* offline — keep last snapshot */
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isSeller, sellerId, filter, q, reloadToken]);

  useEffect(() => {
    if (!isSeller || !sellerId) return;
    let cancelled = false;
    getSellerAnalytics(sellerId)
      .then((a) => {
        if (!cancelled) setAnalytics(a);
      })
      .catch(() => {
        /* analytics are optional — the list still renders */
      });
    return () => {
      cancelled = true;
    };
  }, [isSeller, sellerId, reloadToken]);

  const analyticsMap = useMemo(() => {
    const map = new Map<string, SellerOfferAnalytics>();
    for (const a of analytics?.offers ?? []) map.set(a.offer_id, a);
    return map;
  }, [analytics]);

  if (!isSeller) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
          <Icon name="store" size={24} />
        </span>
        <p className="mt-3 text-sm font-bold text-text">You're not registered as a seller</p>
        <p className="mt-1 text-xs text-textSecondary">Register a seller profile to start listing products.</p>
        <button
          type="button"
          onClick={() => navigate('/seller/products/new')}
          className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
        >
          Set up seller profile
        </button>
      </div>
    );
  }

  const reload = () => setReloadToken((t) => t + 1);

  const handlePause = async (offer: MyOffer) => {
    const key = `${offer.id}:pause`;
    setBusyKey(key);
    try {
      await setOfferStatus(offer.id, 'pause');
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not pause offer');
    } finally {
      setBusyKey(null);
    }
  };

  const handleReactivate = async (offer: MyOffer) => {
    const key = `${offer.id}:reactivate`;
    setBusyKey(key);
    try {
      await setOfferStatus(offer.id, 'reactivate');
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not reactivate offer');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelist = async (offer: MyOffer) => {
    if (!window.confirm(`Delist "${offer.product_name}"? Buyers will no longer see this offer.`)) return;
    const key = `${offer.id}:delist`;
    setBusyKey(key);
    try {
      await setOfferStatus(offer.id, 'delist');
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delist offer');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-white px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-text transition hover:bg-surface"
          aria-label="Go back"
        >
          <Icon name="arrowRight" size={19} className="rotate-180" />
        </button>
        <h1 className="flex-1 truncate text-[15px] font-extrabold text-text">My Products</h1>
        {offers && offers.length > 0 && (
          <button
            type="button"
            onClick={() => downloadCSV(`seller-inventory-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(flattenOffers(offers), EXPORT_COLS))}
            className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[10px] font-bold text-textSecondary transition hover:border-primary/40 hover:text-primary"
          >
            Export CSV
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/seller/products/new')}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-primary-dark"
        >
          <Icon name="plus" size={13} /> Add product
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        {offers == null ? (
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-xs font-medium text-textSecondary">Loading your products…</p>
          </div>
        ) : offers.length === 0 && !q.trim() && filter === 'ALL' ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
              <Icon name="tag" size={24} />
            </span>
            <p className="mt-3 text-sm font-bold text-text">You have no products yet</p>
            <p className="mt-1 text-xs text-textSecondary">List your first offer to start selling on Kika.</p>
            <button
              type="button"
              onClick={() => navigate('/seller/products/new')}
              className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
            >
              Create an offer
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            {analytics && (
              <div className="mb-4 rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-bold text-text">Performance</p>
                  {analytics.totals.conversion_rate_7d != null && (
                    <span className="shrink-0 rounded-full bg-[#E8EEFF] px-2 py-0.5 text-[10px] font-bold text-[#2A4BD7]">
                      {analytics.totals.conversion_rate_7d}% conversion
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-[#E8EEFF]/70 p-3">
                    <p className="truncate text-lg font-black tracking-tight text-text">{analytics.totals.total_views}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Views</p>
                    <p className="text-[10px] font-medium text-gray-400">+{analytics.totals.views_7d} this week</p>
                  </div>
                  <div className="rounded-xl bg-[#D6F5E7]/70 p-3">
                    <p className="truncate text-lg font-black tracking-tight text-text">{analytics.totals.sold_qty}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Purchases</p>
                    <p className="text-[10px] font-medium text-gray-400">{analytics.totals.delivered_qty} delivered</p>
                  </div>
                  <div className="rounded-xl bg-[#FFF6DA]/70 p-3">
                    <p className="truncate text-lg font-black tracking-tight text-text">{fmt(analytics.totals.revenue_cents)}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Revenue</p>
                  </div>
                  <div className="rounded-xl bg-surface/70 p-3">
                    <p className="truncate text-lg font-black tracking-tight text-text">{analytics.totals.total_views > 0 ? analytics.totals.views_14d : 0}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Views · 14d</p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${filter === item.id ? 'bg-primary text-white' : 'border border-border bg-white text-textSecondary hover:border-primary/40'}`}
                >
                  {item.label}
                </button>
              ))}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products…"
                className="ml-auto w-full rounded-lg border border-border bg-white px-3 py-1.5 text-[12px] outline-none focus:border-primary sm:w-52"
              />
            </div>

            {offers.length === 0 ? (
              <div className="rounded-2xl bg-white px-5 py-10 text-center">
                <p className="text-sm font-bold text-text">
                  No {filter === 'ALL' ? '' : `${filter.toLowerCase()} `}products match
                </p>
                <p className="mt-1 text-xs text-textSecondary">Try a different filter or search term.</p>
              </div>
            ) : (
              offers.map((o) => {
                const badge = STATUS_BADGE[o.status];
                return (
                  <div
                    key={o.id}
                    className="mb-4 flex flex-col gap-3 rounded-2xl bg-white px-4 py-3.5 sm:flex-row sm:items-center"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/seller/products/${o.id}`)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    >
                      {o.primary_image ? (
                        <img
                          src={mediaUrl(o.primary_image.storage_key) ?? undefined}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-2xl border border-border object-cover bg-surface"
                        />
                      ) : (
                        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-surface text-textSecondary">
                          <Icon name="tag" size={22} />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-bold text-text">{o.product_name}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${badge.cls}`}>{badge.label}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] font-medium text-textSecondary">
                          {fmt(o.price_cents)} {o.unit ? `· ${o.unit}` : ''} · {timeAgo(o.created_at)}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-textSecondary">
                          Stock {o.sellable_qty}/{o.available_qty} · {o.sold_qty} sold{typeof o.delivered_qty === 'number' && o.delivered_qty !== o.sold_qty ? ` (${o.delivered_qty} delivered)` : ''}
                        </span>
                      </span>
                      {(() => {
                        const a = analyticsMap.get(o.id);
                        if (!a) return null;
                        return (
                          <span className="flex shrink-0 items-center gap-1.5">
                            <MiniBarChart points={a.views} />
                            <span className="whitespace-nowrap text-[10px] font-bold text-gray-500">{a.total_views}</span>
                          </span>
                        );
                      })()}
                      <Icon name="chevronRight" size={16} className="ml-auto shrink-0 text-textSecondary" />
                    </button>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => setEditing(o)}
                        className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-[11px] font-bold text-text transition hover:border-primary/40 hover:text-primary sm:flex-none"
                      >
                        Edit
                      </button>
                      {o.status === 'ACTIVE' && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => handlePause(o)}
                          className={`flex-1 rounded-lg border border-[#A36A00] bg-white px-3 py-2 text-[11px] font-bold text-[#A36A00] transition sm:flex-none ${busyKey === `${o.id}:pause` ? 'opacity-60' : 'hover:bg-[#FFF6DA]'}`}
                        >
                          {busyKey === `${o.id}:pause` ? 'Pausing…' : 'Pause'}
                        </button>
                      )}
                      {o.status === 'PAUSED' && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => handleReactivate(o)}
                          className={`flex-1 rounded-lg bg-[#087A38] px-3 py-2 text-[11px] font-bold text-white transition sm:flex-none ${busyKey === `${o.id}:reactivate` ? 'opacity-60' : 'hover:bg-[#065e2c]'}`}
                        >
                          {busyKey === `${o.id}:reactivate` ? 'Reactivating…' : 'Reactivate'}
                        </button>
                      )}
                      {o.status !== 'DELISTED' && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => handleDelist(o)}
                          className={`flex-1 rounded-lg border border-danger bg-white px-3 py-2 text-[11px] font-bold text-danger transition sm:flex-none ${busyKey === `${o.id}:delist` ? 'opacity-60' : 'hover:bg-danger/5'}`}
                        >
                          {busyKey === `${o.id}:delist` ? 'Delisting…' : 'Delist'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {editing && (
        <EditOfferModal
          offer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}