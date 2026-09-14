import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  getMyOffers,
  setOfferStatus,
  updateOffer,
  type Channel,
  type FulfilmentMode,
  type MyOffer,
  type OfferStatus,
  type Perishability,
} from '../lib/api';
import { getUserId, getUser } from '../lib/session';
import { Icon } from '../components/icons';
import { mediaUrl } from '../lib/api';

const fmt = (kobo: number | null) => (kobo == null ? '—' : naira.format(kobo / 100));

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

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'RETAILER', label: 'Retail' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'DIRECT', label: 'Direct' },
  { value: 'OPEN', label: 'Open' },
];

const PERISHABILITY: { value: Perishability; label: string }[] = [
  { value: 'SHELF_GT_7D', label: 'Shelf 7+ days' },
  { value: 'SHELF_LT_7D', label: 'Perishable (< 7 days)' },
];

const FULFILMENT_MODES: { value: FulfilmentMode; label: string }[] = [
  { value: 'INSTANT', label: 'Instant (2-3h)' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'MARKET_DAY', label: 'Market Day' },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SellerInventoryPage() {
  const navigate = useNavigate();
  const user = getUser();
  const sellerId = getUserId() ?? '';
  const isSeller = Boolean(user?.seller_type);

  const [offers, setOffers] = useState<MyOffer[] | null>(null);
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
          onClick={() => navigate('/offers/new')}
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
    <div className="flex h-full flex-col bg-surface/60">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-lg font-semibold text-text">My Products</h1>
        <button
          type="button"
          onClick={() => navigate('/offers/new')}
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
              onClick={() => navigate('/offers/new')}
              className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
            >
              Create an offer
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
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
              <div className="rounded-2xl border border-border bg-white px-5 py-10 text-center">
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
                    className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-white px-4 py-3.5 shadow-[0_4px_16px_rgba(15,48,28,0.04)] sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {o.primary_image ? (
                        <img
                          src={mediaUrl(o.primary_image.storage_key) ?? undefined}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-xl border border-border object-cover bg-surface"
                        />
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-surface text-textSecondary">
                          <Icon name="tag" size={20} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-bold text-text">{o.product_name}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${badge.cls}`}>{badge.label}</span>
                        </div>
                        <p className="mt-0.5 text-[12px] font-medium text-textSecondary">
                          {fmt(o.price_cents)} {o.unit ? `· ${o.unit}` : ''} · {timeAgo(o.created_at)}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-textSecondary">
                          Stock {o.sellable_qty}/{o.available_qty} · {o.sold_qty} sold{typeof o.delivered_qty === 'number' && o.delivered_qty !== o.sold_qty ? ` (${o.delivered_qty} delivered)` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => setEditing(o)}
                        className="rounded-lg border border-border bg-white px-3 py-1.5 text-[11px] font-bold text-text transition hover:border-primary/40 hover:text-primary"
                      >
                        Edit
                      </button>
                      {o.status === 'ACTIVE' && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => handlePause(o)}
                          className={`rounded-lg border border-[#A36A00] bg-white px-3 py-1.5 text-[11px] font-bold text-[#A36A00] transition ${busyKey === `${o.id}:pause` ? 'opacity-60' : 'hover:bg-[#FFF6DA]'}`}
                        >
                          {busyKey === `${o.id}:pause` ? 'Pausing…' : 'Pause'}
                        </button>
                      )}
                      {o.status === 'PAUSED' && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => handleReactivate(o)}
                          className={`rounded-lg bg-[#087A38] px-3 py-1.5 text-[11px] font-bold text-white transition ${busyKey === `${o.id}:reactivate` ? 'opacity-60' : 'hover:bg-[#065e2c]'}`}
                        >
                          {busyKey === `${o.id}:reactivate` ? 'Reactivating…' : 'Reactivate'}
                        </button>
                      )}
                      {o.status !== 'DELISTED' && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => handleDelist(o)}
                          className={`rounded-lg border border-danger bg-white px-3 py-1.5 text-[11px] font-bold text-danger transition ${busyKey === `${o.id}:delist` ? 'opacity-60' : 'hover:bg-danger/5'}`}
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

function EditOfferModal({
  offer,
  onClose,
  onSaved,
}: {
  offer: MyOffer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productName, setProductName] = useState(offer.product_name);
  const [physicalRef, setPhysicalRef] = useState(offer.physical_ref);
  const [unit, setUnit] = useState(offer.unit ?? '');
  const [priceNaira, setPriceNaira] = useState((offer.price_cents ?? 0) / 100);
  const [availableQty, setAvailableQty] = useState(offer.available_qty);
  const [minOrderQty, setMinOrderQty] = useState(offer.min_order_qty);
  const [channel, setChannel] = useState<Channel>(offer.channel);
  const [perishability, setPerishability] = useState<Perishability>(offer.perishability);
  const [fulfilmentModes, setFulfilmentModes] = useState<FulfilmentMode[]>(offer.fulfilment_modes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-primary';

  const toggleFulfilment = (mode: FulfilmentMode) => {
    setFulfilmentModes((prev) => (prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!productName.trim()) return setError('Product name is required');
    const price = Math.round(Number(priceNaira) * 100);
    if (isNaN(price) || price <= 0) return setError('Price must be a positive number');
    const qty = parseInt(String(availableQty), 10);
    if (isNaN(qty) || qty < 0) return setError('Available quantity must be zero or more');
    const minQty = parseInt(String(minOrderQty), 10);
    if (isNaN(minQty) || minQty < 1) return setError('Min order quantity must be at least 1');
    if (fulfilmentModes.length === 0) return setError('Select at least one fulfilment mode');

    setSubmitting(true);
    try {
      await updateOffer(offer.id, {
        product_name: productName.trim(),
        physical_ref: physicalRef.trim() || undefined,
        unit: unit.trim() || undefined,
        available_qty: qty,
        min_order_qty: minQty,
        channel,
        perishability,
        fulfilment_modes: fulfilmentModes,
        price_cents: price,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-black text-text">Edit offer</h2>
          <button type="button" onClick={onClose} className="p-1 text-textSecondary transition hover:text-text">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary sm:col-span-2">
              Product name
              <input className={inputCls} value={productName} onChange={(e) => setProductName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
              Unit
              <input className={inputCls} placeholder="e.g. basket, crate" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
              Physical reference
              <input className={inputCls} value={physicalRef} onChange={(e) => setPhysicalRef(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
              Price (₦ per unit)
              <input type="number" min="1" step="0.01" className={inputCls} value={priceNaira} onChange={(e) => setPriceNaira(parseFloat(e.target.value))} />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                Available qty
                <input type="number" min="0" className={inputCls} value={availableQty} onChange={(e) => setAvailableQty(parseInt(e.target.value, 10))} />
              </label>
              <label className="flex flex-1 flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                Min order
                <input type="number" min="1" className={inputCls} value={minOrderQty} onChange={(e) => setMinOrderQty(parseInt(e.target.value, 10))} />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
              Channel
              <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[11px] font-bold uppercase tracking-wide text-textSecondary">
              Perishability
              <select className={inputCls} value={perishability} onChange={(e) => setPerishability(e.target.value as Perishability)}>
                {PERISHABILITY.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-textSecondary">Fulfilment modes</span>
            <div className="flex flex-wrap gap-2">
              {FULFILMENT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => toggleFulfilment(mode.value)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${fulfilmentModes.includes(mode.value) ? 'border-primary bg-primaryLight text-primary' : 'border-border text-textSecondary'}`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-[12px] font-bold text-textSecondary transition hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}