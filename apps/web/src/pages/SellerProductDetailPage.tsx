import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  getMyOffers,
  getOfferAnalytics,
  getWantsForSeller,
  listSellerNegotiations,
  setOfferStatus,
  type CrowdWant,
  type MyOffer,
  type NegotiationThread,
  type OfferAnalytics,
  type OfferStatus,
} from '../lib/api';
import { getUserId, getUser } from '../lib/session';
import { mediaUrl } from '../lib/api';
import { Icon, type IconName } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';
import { EditOfferModal } from '../components/seller/EditOfferModal';

const fmt = (kobo: number | null) => (kobo == null ? '—' : naira.format(kobo / 100));

const STATUS_BADGE: Record<OfferStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-white/20 text-white' },
  PAUSED: { label: 'Paused', cls: 'bg-[#FFD166]/25 text-[#FFE3A3]' },
  DELISTED: { label: 'Delisted', cls: 'bg-white/10 text-white/70' },
};

const CHANNEL_LABEL: Record<string, string> = {
  RETAILER: 'Retail',
  WHOLESALE: 'Wholesale',
  DIRECT: 'Direct',
  OPEN: 'Open',
};

const PERISHABILITY_LABEL: Record<string, string> = {
  SHELF_GT_7D: 'Shelf 7+ days',
  SHELF_LT_7D: 'Perishable (< 7 days)',
};

const FULFILMENT_LABEL: Record<string, string> = {
  INSTANT: 'Instant (2-3h)',
  SCHEDULED: 'Scheduled',
  MARKET_DAY: 'Market Day',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'just now';
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatTile({ icon, label, value, tint }: { icon: IconName; label: string; value: string; tint: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl bg-white p-3.5">
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${tint}`}>
        <Icon name={icon} size={15} />
      </span>
      <p className="mt-2.5 truncate text-lg font-black tracking-tight text-gray-900">{value}</p>
      <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}

function SectionTitle({ icon, children, count }: { icon: IconName; children: string; count?: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-gray-900">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-light text-primary">
          <Icon name={icon} size={13} />
        </span>
        {children}
      </h2>
      {count != null && (
        <span className="shrink-0 rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-bold text-primary">{count}</span>
      )}
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function ViewsChart({ points }: { points: { date: string; views: number }[] }) {
  const max = Math.max(...points.map((p) => p.views), 0);
  const peak = points.reduce<{ date: string; views: number } | null>(
    (best, p) => (best == null || p.views > best.views ? p : best),
    null,
  );
  const step = Math.max(1, Math.ceil(points.length / 8));

  if (max === 0) {
    return (
      <div className="flex h-44 flex-col items-center justify-center rounded-xl bg-surface/60 px-6 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-light text-primary">
          <Icon name="eye" size={18} />
        </span>
        <p className="mt-2 text-[13px] font-bold text-gray-900">No page views yet</p>
        <p className="mt-0.5 text-xs text-gray-500">When buyers open this listing, the daily count shows up here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-500">
          <Icon name="chart" size={11} /> Peak day
        </span>
        <span className="text-[11px] font-black text-gray-900">
          {peak ? `${peak.views} views · ${shortDate(peak.date)}` : '—'}
        </span>
      </div>
      <div className="flex h-36 items-end gap-[3px] border-b border-border/60">
        {points.map((p) => {
          const v = p.views;
          const pct = v > 0 ? Math.max((v / max) * 100, 2) : 0;
          const isPeak = peak && v > 0 && v === peak.views;
          return (
            <div
              key={p.date}
              className="group relative flex h-full flex-1 flex-col justify-end"
              title={`${shortDate(p.date)} · ${v} view${v === 1 ? '' : 's'}`}
            >
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-semibold text-white shadow-md group-hover:block">
                {shortDate(p.date)} · {v === 0 ? 'no views' : `${v} view${v === 1 ? '' : 's'}`}
              </div>
              <div
                className={`w-full rounded-t-[3px] transition-colors ${
                  isPeak ? 'bg-secondary group-hover:bg-secondary/80' : 'bg-primary/75 group-hover:bg-primary'
                }`}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[9px] font-medium text-gray-400">
        {points.map((p, i) =>
          i % step === 0 || i === points.length - 1 ? <span key={p.date}>{shortDate(p.date)}</span> : <span key={p.date} />,
        )}
      </div>
    </div>
  );
}

function ThreadRow({ t, unit, onClick }: { t: NegotiationThread; unit: string | null; onClick: () => void }) {
  const lastSeller = [...t.messages].reverse().find((m) => m.side === 'SELLER' && m.per_unit_kobo != null);
  const closed = t.status === 'SETTLED' || t.status === 'REVOKED';
  const chip = t.status === 'OPEN'
    ? 'bg-[#FFF6DA] text-[#A36A00]'
    : t.status === 'SETTLED'
      ? 'bg-primary-light text-primary'
      : t.status === 'ENDED'
        ? 'bg-[#FFF6DA] text-[#A36A00]'
        : 'bg-[#FFF1F0] text-danger';
  const chipLabel = t.status === 'OPEN' ? 'Bargaining' : t.status === 'SETTLED' ? 'Settled' : t.status === 'ENDED' ? 'Frozen' : 'Revoked';
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-3 text-left">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
        <Icon name="user" size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-gray-900">{t.buyer_name}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-500">
          {t.qty} {unit ? `× ${unit}` : ''}
          {lastSeller ? ` · ${fmt(lastSeller.per_unit_kobo)} ${unit ?? ''}` : ` · wants ${fmt(t.basis.ask_per_unit_kobo)} ${unit ?? ''}`}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${chip}`}>{chipLabel}</span>
      {!closed && <Icon name="chevronRight" size={14} className="shrink-0 text-gray-400" />}
    </button>
  );
}

function WantRow({ w, onClick }: { w: CrowdWant; onClick: () => void }) {
  const chip = w.status === 'OPEN'
    ? 'bg-[#FFF6DA] text-[#A36A00]'
    : w.status === 'SETTLED'
      ? 'bg-primary-light text-primary'
      : 'bg-surface text-textSecondary';
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-3 text-left">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FFF6DA] text-[#A36A00]">
        <Icon name="megaphone" size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-gray-900">{w.buyer_name}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-gray-500">
          wants {w.qty} {w.unit ?? ''}
          {w.my_bid ? ` · your quote ${fmt(w.my_bid.quote_per_unit_kobo)}` : ''}
          {w.ceiling_kobo != null ? ` · ceiling ${fmt(w.ceiling_kobo)}` : ''}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${chip}`}>{w.status === 'OPEN' ? 'Open' : w.status === 'SETTLED' ? 'Settled' : w.status.toLowerCase()}</span>
      {w.status === 'OPEN' && <Icon name="chevronRight" size={14} className="shrink-0 text-gray-400" />}
    </button>
  );
}

export default function SellerProductDetailPage() {
  const navigate = useNavigate();
  const { offerId = '' } = useParams();
  const user = getUser();
  const sellerId = getUserId() ?? '';
  const isSeller = Boolean(user?.seller_type);

  const [offer, setOffer] = useState<MyOffer | null>(null);
  const [analytics, setAnalytics] = useState<OfferAnalytics | null>(null);
  const [threads, setThreads] = useState<NegotiationThread[]>([]);
  const [wants, setWants] = useState<CrowdWant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isSeller || !sellerId || !offerId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [list, a, wantList, threadList] = await Promise.all([
          getMyOffers(sellerId, { limit: 100 }),
          getOfferAnalytics(offerId),
          getWantsForSeller(sellerId),
          listSellerNegotiations(sellerId),
        ]);
        if (cancelled) return;
        const mine = list.offers.find((o) => o.id === offerId);
        if (!mine) {
          setError('This product is no longer in your inventory.');
          return;
        }
        setOffer(mine);
        setAnalytics(a);
        setThreads(threadList.filter((t) => t.basis.type === 'OFFER' && t.basis.offer?.id === offerId));
        setWants(wantList.filter((w) => w.my_bid?.offer_id === offerId));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this product');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isSeller, sellerId, offerId, reloadToken]);

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

  const act = async (action: 'pause' | 'reactivate' | 'delist') => {
    setBusyKey(action);
    try {
      await setOfferStatus(offerId, action);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Could not ${action} offer`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelist = () => {
    if (!offer) return;
    if (!window.confirm(`Delist "${offer.product_name}"? Buyers will no longer see this offer.`)) return;
    void act('delist');
  };

  if (error && !offer) {
    return (
      <div className="min-h-full bg-surface/60">
        <PageTopBar title="Product" />
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#FFF1F0] text-danger">
            <Icon name="tag" size={24} />
          </span>
          <p className="mt-3 text-sm font-bold text-text">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/seller/products')}
            className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
          >
            Back to products
          </button>
        </div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="min-h-full bg-surface/60">
        <PageTopBar title="Product" />
        <div className="flex flex-col items-center justify-center px-6 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-3 text-xs font-medium text-textSecondary">Loading product…</p>
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGE[offer.status];
  const a = analytics;
  const maxQty = offer.available_qty || 1;
  const utilPct = Math.min(100, Math.round(((offer.available_qty - offer.sellable_qty) / maxQty) * 100));
  const conversion = a?.conversion_rate_7d;
  const openThreads = threads.filter((t) => t.status === 'OPEN');
  const openWants = wants.filter((w) => w.status === 'OPEN');

  return (
    <div className="min-h-full bg-surface/60">
      <PageTopBar title={offer.product_name} />

      <div className="mx-auto w-full max-w-3xl md:p-0">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary to-[#0B6B30] p-5 text-white shadow-[0_14px_32px_rgba(15,48,28,0.18)] md:rounded-2xl">
          <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -right-2 bottom-2 h-24 w-24 rounded-full bg-white/[0.06]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {offer.primary_image ? (
                  <img
                    src={mediaUrl(offer.primary_image.storage_key) ?? undefined}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-2xl border border-white/20 object-cover bg-white/10"
                  />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-white">
                    <Icon name="tag" size={22} />
                  </span>
                )}
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-black leading-tight tracking-tight sm:text-xl">{offer.product_name}</h1>
                  <p className="mt-0.5 text-[11px] font-medium text-white/75">
                    {offer.physical_ref ? `Ref ${offer.physical_ref} · ` : ''}Listed {timeAgo(offer.created_at)}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
            </div>

            <div className="mt-4 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">Selling price</p>
                <p className="mt-1 truncate text-3xl font-black tracking-tight">{fmt(offer.price_cents)}</p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-white/75">
                  {offer.unit ? `per ${offer.unit}` : 'per unit'} · min order {offer.min_order_qty}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">
                {CHANNEL_LABEL[offer.channel] ?? offer.channel}
              </span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">
                {PERISHABILITY_LABEL[offer.perishability] ?? offer.perishability}
              </span>
              {offer.fulfilment_modes.map((m) => (
                <span key={m} className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white">
                  {FULFILMENT_LABEL[m] ?? m}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-primary shadow-sm transition active:scale-95 disabled:opacity-60"
              >
                <Icon name="settings" size={13} /> Edit
              </button>
              <button
                type="button"
                onClick={() => navigate(`/offers/${offer.id}`)}
                className="rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/20 active:scale-95"
              >
                View as buyer
              </button>
              {offer.status === 'ACTIVE' && (
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => act('pause')}
                  className="rounded-xl border border-[#FFD166]/60 bg-[#FFD166]/15 px-3.5 py-2 text-xs font-bold text-[#FFE3A3] transition active:scale-95 disabled:opacity-60"
                >
                  {busyKey === 'pause' ? 'Pausing…' : 'Pause'}
                </button>
              )}
              {offer.status === 'PAUSED' && (
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => act('reactivate')}
                  className="rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-primary shadow-sm transition active:scale-95 disabled:opacity-60"
                >
                  {busyKey === 'reactivate' ? 'Reactivating…' : 'Reactivate'}
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="space-y-4 px-4 pb-10 pt-4 sm:px-5 md:px-0 md:pb-0 md:pt-4">
          {/* Performance */}
          <section className="rounded-2xl bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle icon="chart">Performance</SectionTitle>
              {conversion != null && (
                <span className="shrink-0 rounded-full bg-[#E8EEFF] px-2 py-0.5 text-[10px] font-bold text-[#2A4BD7]">
                  {conversion}% conversion
                </span>
              )}
            </div>
            <div className="mt-3 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon="eye" label="Views" value={a ? String(a.total_views) : '—'} tint="bg-[#E8EEFF] text-[#2A4BD7]" />
              <StatTile icon="cart" label="Purchases" value={a ? String(a.sold_qty) : '—'} tint="bg-[#D6F5E7] text-[#087A38]" />
              <StatTile icon="truck" label="Delivered" value={a ? String(a.delivered_qty) : '—'} tint="bg-[#D6F5E7] text-[#087A38]" />
              <StatTile icon="bank" label="Revenue" value={a ? fmt(a.revenue_cents) : '—'} tint="bg-[#FFF6DA] text-[#A36A00]" />
            </div>

            {a && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Views — last 14 days</p>
                  <p className="text-[11px] font-semibold text-gray-500">
                    {a.views_7d} this week<span className="text-gray-300"> · </span>{a.views_14d} total
                  </p>
                </div>
                <ViewsChart points={a.views} />
              </div>
            )}
          </section>

          {/* Stock */}
          <section className="rounded-2xl bg-white p-4 sm:p-5">
            <SectionTitle icon="box">Stock & availability</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-surface/70 p-3">
                <p className="truncate text-lg font-black tracking-tight text-gray-900">{offer.sellable_qty}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Sellable</p>
              </div>
              <div className="rounded-xl bg-[#FFF6DA]/70 p-3">
                <p className="truncate text-lg font-black tracking-tight text-gray-900">{offer.reserved_qty}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Reserved</p>
              </div>
              <div className="rounded-xl bg-[#E8EEFF]/70 p-3">
                <p className="truncate text-lg font-black tracking-tight text-gray-900">{offer.soft_held_qty}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Soft-held</p>
              </div>
              <div className="rounded-xl bg-[#D6F5E7]/70 p-3">
                <p className="truncate text-lg font-black tracking-tight text-gray-900">{offer.available_qty}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Available</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-gray-500">
                <span>Committed stock</span>
                <span className="font-bold text-gray-900">{offer.available_qty - offer.sellable_qty} of {offer.available_qty} ({utilPct}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-primary" style={{ width: `${utilPct}%` }} />
              </div>
            </div>
          </section>

          {/* Listing details */}
          <section className="rounded-2xl bg-white p-4 sm:p-5">
            <SectionTitle icon="tag">Listing details</SectionTitle>
            <dl className="mt-2 divide-y divide-gray-100">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Price</dt>
                <dd className="truncate text-[13px] font-bold text-gray-900">{fmt(offer.price_cents)} {offer.unit ? `/ ${offer.unit}` : ''}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Channel</dt>
                <dd className="truncate text-[13px] font-bold text-gray-900">{CHANNEL_LABEL[offer.channel] ?? offer.channel}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Perishability</dt>
                <dd className="truncate text-[13px] font-bold text-gray-900">{PERISHABILITY_LABEL[offer.perishability] ?? offer.perishability}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Fulfilment</dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {offer.fulfilment_modes.map((m) => (
                    <span key={m} className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-gray-600">
                      {FULFILMENT_LABEL[m] ?? m}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Physical ref</dt>
                <dd className="truncate text-[13px] font-bold text-gray-900">{offer.physical_ref || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Description</dt>
                <dd className="text-right text-[12px] text-gray-700">{offer.description || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Listed</dt>
                <dd className="truncate text-[13px] font-bold text-gray-900">{new Date(offer.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              </div>
            </dl>
            {offer.status !== 'DELISTED' && (
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={handleDelist}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold text-danger transition hover:bg-danger/5 disabled:opacity-60"
              >
                <Icon name="trash" size={12} /> Delist this product
              </button>
            )}
          </section>

          {/* Bargain & bids */}
          <section className="rounded-2xl bg-white p-4 sm:p-5">
            <SectionTitle icon="handshake" count={openThreads.length + openWants.length}>
              Bargain & bids
            </SectionTitle>
            <p className="mt-1 text-[11px] text-gray-500">
              Direct haggles with buyers and buyer wants you've served with this product.
            </p>

            {threads.length === 0 && wants.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-2xl bg-surface/50 px-5 py-8 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-light text-primary">
                  <Icon name="handshake" size={22} />
                </span>
                <p className="mt-3 text-sm font-bold text-gray-900">Nobody is bargaining on this product yet</p>
                <p className="mt-1 max-w-xs text-xs text-gray-500">
                  Watch buyer wants and offer a quote to start a bargain.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/seller/crowd')}
                  className="mt-4 rounded-xl border border-primary bg-white px-4 py-2 text-[12px] font-bold text-primary transition hover:bg-primary-light"
                >
                  See buyer wants
                </button>
              </div>
            ) : (
              <div className="mt-2">
                {threads.length > 0 && (
                  <div>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">Haggles on this listing ({threads.length})</p>
                    <div className="divide-y divide-gray-100">
                      {threads.map((t) => (
                        <ThreadRow key={t.id} t={t} unit={offer.unit} onClick={() => navigate(`/seller/negotiations/${t.id}`)} />
                      ))}
                    </div>
                  </div>
                )}
                {wants.length > 0 && (
                  <div className={threads.length > 0 ? 'mt-1 border-t border-gray-100' : ''}>
                    <p className={`${threads.length > 0 ? 'mt-3' : 'mt-2'} text-[10px] font-bold uppercase tracking-wide text-gray-400`}>
                      Wants served with this product ({wants.length})
                    </p>
                    <div className="divide-y divide-gray-100">
                      {wants.map((w) => (
                        <WantRow key={w.id} w={w} onClick={() => navigate('/seller/crowd')} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {editing && offer && (
        <EditOfferModal
          offer={offer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </div>
  );
}