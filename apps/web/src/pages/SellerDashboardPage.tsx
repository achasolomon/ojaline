import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import { Icon, type IconName } from '../components/icons';
import { getUserId, getUser } from '../lib/session';
import {
  listCrowdSales,
  getMyOffers,
  getWantsForSeller,
  getSellerStats,
  getSellerTrend,
  getPayoutBalance,
  type CrowdSale,
  type CrowdWant,
  type MyOffer,
  type SellerStats,
  type SellerTrend,
  type PayoutBalance,
} from '../lib/api';
import { mapWant, mapBidder, openSellerChat } from '../lib/crowd';
import { TrendChart, type TrendMetric } from '../components/seller/TrendChart';

const fmtKobo = (k: number) => naira.format(k / 100);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_LINKS: Array<{ to: string; icon: IconName; label: string; sub: string }> = [
  { to: '/seller/crowd', icon: 'user', label: 'Manage crowd sales', sub: 'Broadcasts & bids' },
  { to: '/seller/payouts', icon: 'card', label: 'View payouts', sub: 'Balance & withdrawals' },
  { to: '/seller/products', icon: 'basket', label: 'Manage products', sub: 'Offers & stock' },
  { to: '/seller/ads', icon: 'megaphone', label: 'Run an ad', sub: 'Reach more buyers' },
  { to: '/seller/storefront', icon: 'store', label: 'My storefront', sub: 'Buyer view' },
  { to: '/seller/help', icon: 'help', label: 'Help centre', sub: 'Support & guides' },
];

const TREND_METRICS: Array<{ key: TrendMetric; label: string }> = [
  { key: 'sales_cents', label: 'Sales' },
  { key: 'released_cents', label: 'Released' },
  { key: 'orders', label: 'Orders' },
];

export default function SellerDashboardPage() {
  const nav = useNavigate();
  const sellerId = getUserId();

  const [sales, setSales] = useState<CrowdSale[]>([]);
  const [offers, setOffers] = useState<MyOffer[]>([]);
  const [servables, setServables] = useState<CrowdWant[]>([]);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [trendDays, setTrendDays] = useState(14);
  const [trend, setTrend] = useState<SellerTrend | null>(null);
  const [payout, setPayout] = useState<PayoutBalance | null>(null);
  const [metric, setMetric] = useState<TrendMetric>('sales_cents');
  const [error, setError] = useState<string | null>(null);
  const [showAmounts, setShowAmounts] = useState(true);

  const load = useCallback(() => {
    if (!sellerId) {
      nav('/', { replace: true });
      return;
    }
    void Promise.all([
      listCrowdSales({ seller_id: sellerId }),
      getMyOffers(sellerId, { status: 'ACTIVE' }),
      getWantsForSeller(sellerId),
      getSellerStats(),
      getSellerTrend(trendDays),
      getPayoutBalance(),
    ])
      .then(([crowd, mine, serve, s, t, p]) => {
        setSales(crowd);
        setOffers(mine.offers);
        setServables(serve);
        setStats(s);
        setTrend(t);
        setPayout(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load your dashboard.'));
  }, [sellerId, nav, trendDays]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const openCount = useMemo(() => sales.filter((s) => s.status === 'OPEN').length, [sales]);
  const serveCount = servables.length;

  const lowStock = useMemo(
    () => offers.filter((o) => o.sellable_qty <= Math.max(o.min_order_qty, 5)).length,
    [offers],
  );
  const bestSeller = stats?.top_products[0] ?? null;
  const topMax = stats?.top_products.reduce((m, p) => Math.max(m, p.revenue_cents), 0) ?? 0;
  const bestDay = trend?.best_day ?? null;

  const insights: Array<{ icon: IconName; text: string; to?: string }> = [];
  if (bestSeller) {
    insights.push({
      icon: 'star',
      text: `${bestSeller.product_name} is your best seller this month — ₦${(bestSeller.revenue_cents / 100).toLocaleString()} earned.`,
      to: '/seller/products',
    });
  }
  if (lowStock > 0) {
    insights.push({
      icon: 'box',
      text: `${lowStock} active offer${lowStock === 1 ? '' : 's'} almost out of stock — top up before you lose sales.`,
      to: '/seller/products',
    });
  }
  if (serveCount > 0) {
    insights.push({
      icon: 'handshake',
      text: `${serveCount} buyer want${serveCount === 1 ? '' : 's'} match your offers right now.`,
      to: '/seller/crowd',
    });
  }
  if (openCount > 0) {
    insights.push({
      icon: 'megaphone',
      text: `${openCount} open crowd sale${openCount === 1 ? '' : 's'} — respond to bids to close them.`,
      to: '/seller/crowd',
    });
  }
  if (stats) {
    insights.push({
      icon: 'clock',
      text: `On-time delivery sits at ${pct(stats.on_time_rate)} — keep it above 95% to stay trusted.`,
    });
    if (stats.dispute_rate_30d > 0.03) {
      insights.push({
        icon: 'help',
        text: `Dispute rate is ${pct(stats.dispute_rate_30d)} in the last 30 days — address returns quickly.`,
        to: '/seller/returns',
      });
    }
  }
  if (trend && bestDay) {
    insights.push({
      icon: 'bolt',
      text: `${new Date(bestDay.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} was your strongest day (${fmtKobo(bestDay.sales_cents)} sold).`,
    });
  }
  if (insights.length === 0) {
    insights.push({
      icon: 'store',
      text: 'Once you start selling, insights about your products and orders will appear here.',
    });
  }

  const serveRow = (w: CrowdWant) => {
    const mine = w.bidders.find((b) => b.seller_id === sellerId);
    if (!mine) return null;
    return (
      <li key={w.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{w.product_name}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {w.buyer_name} · {w.qty}{w.unit ? ` ${w.unit}` : ''}{w.ceiling_kobo ? ` · ≤ ${fmtKobo(w.ceiling_kobo)}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void openSellerChat(mapWant(w), mapBidder(mine), w.buyer_name)
              .then((t) => nav(`/seller/negotiations/${t.id}`, { replace: true }))
              .catch((e) => setError(e instanceof Error ? e.message : 'Could not open the bargain.'));
          }}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Open bargain
        </button>
      </li>
    );
  };

  const user = getUser();
  const todos: Array<{ to: string; icon: IconName; label: string }> = [];
  if (serveCount > 0) {
    todos.push({ to: '/seller/crowd', icon: 'handshake', label: `${serveCount} want request${serveCount === 1 ? '' : 's'}` });
  }
  if (openCount > 0) {
    todos.push({ to: '/seller/crowd', icon: 'megaphone', label: `${openCount} open crowd sale${openCount === 1 ? '' : 's'}` });
  }
  if (lowStock > 0) {
    todos.push({ to: '/seller/products', icon: 'box', label: `${lowStock} low-stock offer${lowStock === 1 ? '' : 's'}` });
  }

  return (
    <div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-[#0B6B30] p-5 text-white shadow-[0_14px_32px_rgba(15,48,28,0.18)] md:rounded-2xl">
        <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -right-2 bottom-2 h-24 w-24 rounded-full bg-white/[0.06]" />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
                {user?.full_name?.split(' ')[0] ?? 'Seller'}'s shop
              </p>
              <h1 className="mt-1.5 text-xl font-black tracking-tight text-white">
                {greeting()}
                {sales.length + (bestSeller ? 1 : 0) > 0 ? ' 👋' : ''}
              </h1>
              <p className="mt-0.5 text-xs text-white/80">Here's how your store is performing today.</p>
            </div>
            <button
              type="button"
              onClick={() => nav('/seller/products')}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-primary shadow-sm transition active:scale-95"
            >
              <Icon name="plus" size={14} />
              Add product
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">Available payout</p>
                <button
                  type="button"
                  onClick={() => setShowAmounts((v) => !v)}
                  aria-label={showAmounts ? 'Hide amounts' : 'Show amounts'}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-90"
                >
                  <Icon name={showAmounts ? 'eye' : 'eyeOff'} size={13} />
                </button>
              </div>
              <p className="mt-1 truncate text-3xl font-black tracking-tight">
                {showAmounts ? (payout ? fmtKobo(payout.available_cents) : '—') : '₦ ••••'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => nav('/seller/payouts')}
              className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-bold text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
            >
              Withdraw
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-white/15 rounded-xl bg-white/[0.07] py-2.5 text-center">
            <div className="min-w-0 px-1">
              <p className="truncate text-[9px] font-bold uppercase tracking-wide text-white/60">Revenue</p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-white">
                {showAmounts ? (stats ? fmtKobo(stats.revenue_cents) : '—') : '₦ ••••'}
              </p>
            </div>
            <div className="min-w-0 px-1">
              <p className="truncate text-[9px] font-bold uppercase tracking-wide text-white/60">Rating</p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-white">
                {showAmounts ? (stats?.avg_rating != null ? stats.avg_rating.toFixed(1) : '—') : '••'}
              </p>
            </div>
            <div className="min-w-0 px-1">
              <p className="truncate text-[9px] font-bold uppercase tracking-wide text-white/60">Orders</p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-white">
                {showAmounts ? (stats ? `${stats.orders_completed}/${stats.orders_total}` : '—') : '••'}
              </p>
            </div>
          </div>

          {todos.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {todos.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => nav(t.to)}
                  className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur transition active:bg-white/25"
                >
                  <Icon name={t.icon} size={13} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="space-y-4 px-4 pt-4 sm:space-y-6 sm:px-5 md:px-0 md:pt-5">
      {/* Quick links */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {QUICK_LINKS.map((l) => (
          <button
            key={l.to}
            type="button"
            onClick={() => nav(l.to)}
            className="group rounded-2xl bg-white p-3.5 text-left transition hover:bg-primary-light/40"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-light text-primary transition group-hover:scale-105">
              <Icon name={l.icon} size={17} />
            </span>
            <p className="mt-2.5 text-xs font-bold text-gray-900">{l.label}</p>
            <p className="mt-0.5 text-[10px] text-gray-400">{l.sub}</p>
          </button>
        ))}
      </section>

      {/* Sales trend */}
      <section className="rounded-2xl bg-white p-4 sm:p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-gray-900">Sales trend</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Daily {metric === 'sales_cents' ? 'sales' : metric === 'released_cents' ? 'escrow releases' : 'orders'} over the last {trendDays} days.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {TREND_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetric(m.key)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    metric === m.key ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {[14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTrendDays(d)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    trendDays === d ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="min-w-0 rounded-xl bg-surface px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Sales</p>
            <p className="mt-0.5 truncate text-sm font-black text-gray-900">{trend ? fmtKobo(trend.total_sales_cents) : '—'}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-surface px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Released</p>
            <p className="mt-0.5 truncate text-sm font-black text-gray-900">{trend ? fmtKobo(trend.total_released_cents) : '—'}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-surface px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Orders</p>
            <p className="mt-0.5 truncate text-sm font-black text-gray-900">{trend ? String(trend.total_orders) : '—'}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-surface px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Best day</p>
            <p className="mt-0.5 truncate text-sm font-black text-gray-900">
              {bestDay
                ? `${new Date(bestDay.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} · ${fmtKobo(bestDay.sales_cents)}`
                : '—'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {trend ? (
            <TrendChart points={trend.trend} metric={metric} />
          ) : (
            <div className="grid h-44 place-items-center animate-pulse rounded-xl bg-gray-100" />
          )}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-gray-400">
          Sales are orders placed on your store. Released is money escrow paid out to you. Figures update automatically.
        </p>
      </section>

      {/* Best sellers + insights */}
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl bg-white p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-gray-900">Best-selling products</h2>
            <button
              type="button"
              onClick={() => nav('/seller/analytics')}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary-light/50"
            >
              Full analytics <Icon name="arrowRight" size={12} />
            </button>
          </div>

          {!stats || stats.top_products.length === 0 ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface/60 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-gray-400">
                <Icon name="tag" size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-800">No sales ranked yet</p>
                <p className="text-[11px] leading-relaxed text-gray-500">
                  Delivered orders will rank your products here by revenue.
                </p>
              </div>
            </div>
          ) : (
            <ul className="mt-4">
              {stats.top_products.map((p, i) => (
                <li key={p.offer_id} className="flex items-center gap-3 py-2.5">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black ${i === 0 ? 'bg-[#FFF6DA] text-[#A36A00]' : 'bg-gray-100 text-gray-500'}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[13px] font-bold text-gray-900">{p.product_name}</p>
                      <span className="shrink-0 text-[13px] font-black text-gray-900">{fmtKobo(p.revenue_cents)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: topMax > 0 ? `${(p.revenue_cents / topMax) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] font-medium text-gray-400">{p.sold_qty} sold</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-extrabold text-gray-900">Insights</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {insights.map((ins, i) => {
              const inner = (
                <>
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
                    <Icon name={ins.icon} size={13} />
                  </span>
                  <p className="min-w-0 text-[12px] leading-relaxed text-gray-600">{ins.text}</p>
                </>
              );
              return (
                <li key={i}>
                  {ins.to ? (
                    <button
                      type="button"
                      onClick={() => nav(ins.to!)}
                      className="flex w-full items-start gap-2.5 py-3 text-left transition hover:bg-primary-light/40"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex items-start gap-2.5 py-3">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Serve a want */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Icon name="handshake" size={16} className="text-primary" />
          Serve a want ({serveCount})
        </h2>
        {serveCount === 0 ? (
          <p className="text-xs text-gray-400">No buyer wants match your active offers yet.</p>
        ) : (
          <ul className="space-y-2">{servables.map(serveRow)}</ul>
        )}
      </section>
      </div>
    </div>
  );
}