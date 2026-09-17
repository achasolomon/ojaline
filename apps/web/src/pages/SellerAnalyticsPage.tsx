import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import { getSellerStats, getSellerTrend, type SellerStats, type SellerTrend } from '../lib/api';
import { getUser } from '../lib/session';
import { toCSV, downloadCSV } from '../lib/csv';
import { Icon, type IconName } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';
import { TrendChart, type TrendMetric } from '../components/seller/TrendChart';
import { cn } from '../lib/cn';

const fmt = (cents: number) => naira.format(cents / 100);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const TOP_PRODUCTS_COLS = [
  { key: 'product_name', header: 'Product' },
  { key: 'sold_qty', header: 'Units sold' },
  { key: 'revenue', header: 'Revenue' },
];

const TREND_METRICS: Array<{ key: TrendMetric; label: string }> = [
  { key: 'sales_cents', label: 'Sales' },
  { key: 'released_cents', label: 'Released' },
  { key: 'orders', label: 'Orders' },
];

function exportTopProducts(stats: SellerStats) {
  const rows = stats.top_products.map((p) => ({
    product_name: p.product_name,
    sold_qty: p.sold_qty,
    revenue: fmt(p.revenue_cents),
  }));
  downloadCSV(`seller-top-products-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, TOP_PRODUCTS_COLS));
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

function SectionTitle({ icon, children, action }: { icon: IconName; children: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-gray-900">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-light text-primary">
          <Icon name={icon} size={13} />
        </span>
        {children}
      </h2>
      {action}
    </div>
  );
}

export default function SellerAnalyticsPage() {
  const navigate = useNavigate();
  const user = getUser();
  const isSeller = Boolean(user?.seller_type);

  const [stats, setStats] = useState<SellerStats | null>(null);
  const [trend, setTrend] = useState<SellerTrend | null>(null);
  const [days, setDays] = useState(14);
  const [metric, setMetric] = useState<TrendMetric>('sales_cents');

  const load = useCallback(async () => {
    try {
      const s = await getSellerStats();
      setStats(s);
    } catch {
      /* keep last state */
    }
    try {
      const t = await getSellerTrend(days);
      setTrend(t);
    } catch {
      /* keep last state */
    }
  }, [days]);

  useEffect(() => {
    if (!isSeller) return;
    void load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [isSeller, load]);

  if (!isSeller) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
          <Icon name="store" size={24} />
        </span>
        <p className="mt-3 text-sm font-bold text-text">You're not registered as a seller</p>
        <p className="mt-1 text-xs text-textSecondary">Analytics appear once you have a seller profile and some sales.</p>
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

  const cards = stats
    ? [
        { label: 'Revenue (released)', value: fmt(stats.revenue_cents), icon: 'bank' as const, tint: 'bg-[#D6F5E7] text-[#087A38]' },
        { label: 'Orders total', value: String(stats.orders_total), icon: 'box' as const, tint: 'bg-[#E8EEFF] text-[#2A4BD7]' },
        { label: 'Completed', value: String(stats.orders_completed), icon: 'check' as const, tint: 'bg-[#D6F5E7] text-[#087A38]' },
        { label: 'Cancelled', value: String(stats.orders_cancelled), icon: 'close' as const, tint: 'bg-[#FFF1F0] text-danger' },
        { label: 'On-time rate', value: pct(stats.on_time_rate), icon: 'clock' as const, tint: 'bg-[#E8EEFF] text-[#2A4BD7]' },
        { label: 'Disputes (30d)', value: pct(stats.dispute_rate_30d), icon: 'help' as const, tint: 'bg-[#FFF6DA] text-[#A36A00]' },
        { label: 'Avg rating', value: stats.avg_rating != null ? stats.avg_rating.toFixed(1) : '—', icon: 'star' as const, tint: 'bg-[#FFF6DA] text-[#A36A00]' },
        { label: 'Reviews', value: String(stats.review_count), icon: 'message' as const, tint: 'bg-[#E8EEFF] text-[#2A4BD7]' },
      ]
    : [];

  const bestDay = trend?.best_day ?? null;

  return (
    <div className="min-h-full bg-surface/60">
      <PageTopBar title="Seller analytics" />
      <div className="mx-auto w-full max-w-3xl md:p-0">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#087a38] to-[#16a34a] p-5 text-white shadow-[0_12px_30px_rgba(8,122,56,0.18)] md:rounded-2xl sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -right-2 bottom-0 h-20 w-20 rounded-full bg-white/[0.06]" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Store health</p>
            <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{user?.full_name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-white/80">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 font-bold text-white">
                <Icon name="star" size={11} />
                {stats?.avg_rating != null ? stats.avg_rating.toFixed(1) : '—'}
                <span className="font-medium text-white/70">/ 5</span>
              </span>
              <span>
                <span className="font-bold text-white">{stats ? `${stats.orders_completed} completed` : '—'}</span>
              </span>
              <span>
                <span className="font-bold text-white">{stats ? `${pct(stats.on_time_rate)} on-time` : '—'}</span>
              </span>
            </div>
          </div>
        </section>

        <div className="px-4 pb-10 pt-4 sm:px-5 md:px-0 md:pb-0 md:pt-4">
        {stats == null ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[118px] animate-pulse rounded-2xl bg-gray-200" />
              ))}
            </div>
            <div className="mt-4 h-64 animate-pulse rounded-2xl bg-gray-200" />
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
              {cards.map((card) => (
                <StatTile key={card.label} icon={card.icon} label={card.label} value={card.value} tint={card.tint} />
              ))}
            </div>

            <section className="rounded-2xl bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <SectionTitle icon="chart" action={undefined}>Sales trend</SectionTitle>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Daily {metric === 'sales_cents' ? 'sales' : metric === 'released_cents' ? 'escrow releases' : 'orders'} over the last {days} days.
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2">
                  <div className="flex rounded-xl bg-gray-100 p-0.5">
                    {TREND_METRICS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setMetric(m.key)}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition',
                          metric === m.key ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex rounded-xl bg-gray-100 p-0.5">
                    {[14, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition',
                          days === d ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
                        )}
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
                  <p className="mt-0.5 truncate text-sm font-black text-gray-900">{trend ? fmt(trend.total_sales_cents) : '…'}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-surface px-3.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Released</p>
                  <p className="mt-0.5 truncate text-sm font-black text-gray-900">{trend ? fmt(trend.total_released_cents) : '…'}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-surface px-3.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Orders</p>
                  <p className="mt-0.5 truncate text-sm font-black text-gray-900">{trend ? String(trend.total_orders) : '…'}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-surface px-3.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Best day</p>
                  <p className="mt-0.5 truncate text-sm font-black text-gray-900">
                    {bestDay
                      ? `${new Date(bestDay.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} · ${fmt(bestDay.sales_cents)}`
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                {trend ? (
                  <TrendChart points={trend.trend} metric={metric} />
                ) : (
                  <div className="grid h-44 place-items-center animate-pulse rounded-xl bg-gray-100">Loading trend…</div>
                )}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 sm:p-5">
              <SectionTitle
                icon="tag"
                action={
                  stats.top_products.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => exportTopProducts(stats)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-gray-500 transition hover:border-primary/40 hover:text-primary"
                    >
                      Export CSV
                    </button>
                  ) : undefined
                }
              >
                Top products
              </SectionTitle>

              {stats.top_products.length === 0 ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/60 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-gray-400">
                    <Icon name="tag" size={18} />
                  </span>
                  <p className="min-w-0 text-xs leading-relaxed text-gray-500">
                    Delivered sales will rank your products here by revenue.
                  </p>
                </div>
              ) : (
                <ul className="mt-3">
                  {stats.top_products.map((p, i) => {
                    const topMax = Math.max(...stats.top_products.map((x) => x.revenue_cents), 1);
                    return (
                      <li key={p.offer_id} className="flex items-center gap-3 py-2.5">
                        <span
                          className={cn(
                            'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black',
                            i === 0 ? 'bg-[#FFF6DA] text-[#A36A00]' : 'bg-gray-100 text-gray-500',
                          )}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[13px] font-bold text-gray-900">{p.product_name}</p>
                            <span className="shrink-0 text-[13px] font-black text-gray-900">{fmt(p.revenue_cents)}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${(p.revenue_cents / topMax) * 100}%` }}
                              />
                            </div>
                            <span className="shrink-0 text-[10px] font-medium text-gray-400">{p.sold_qty} sold</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
              Revenue is the money escrow has released to you after platform commission. Dispute rate counts returns raised on
              your orders in the last 30 days. Refunds issued after release are booked back as clawbacks, so your available
              payout balance already reflects them.
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}