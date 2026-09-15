import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import { getSellerStats, type SellerStats } from '../lib/api';
import { getUser } from '../lib/session';
import { toCSV, downloadCSV } from '../lib/csv';
import { Icon } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';
import { NotificationBell } from '../components/NotificationBell';

const fmt = (cents: number) => naira.format(cents / 100);
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const TOP_PRODUCTS_COLS = [
  { key: 'product_name', header: 'Product' },
  { key: 'sold_qty', header: 'Units sold' },
  { key: 'revenue', header: 'Revenue' },
];

function exportTopProducts(stats: SellerStats) {
  const rows = stats.top_products.map((p) => ({
    product_name: p.product_name,
    sold_qty: p.sold_qty,
    revenue: fmt(p.revenue_cents),
  }));
  downloadCSV(`seller-top-products-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, TOP_PRODUCTS_COLS));
}

export default function SellerAnalyticsPage() {
  const navigate = useNavigate();
  const user = getUser();
  const isSeller = Boolean(user?.seller_type);

  const [stats, setStats] = useState<SellerStats | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getSellerStats();
      setStats(s);
    } catch {
      /* keep last state */
    }
  }, []);

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
          onClick={() => navigate('/offers/new')}
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
        { label: 'Reviews', value: String(stats.review_count), icon: 'message' as const, tint: 'bg-surface text-textSecondary' },
      ]
    : [];

  return (
    <div className="min-h-full bg-surface/70">
      <PageTopBar title="Seller analytics" action={<NotificationBell />} />
      <div className="mx-auto max-w-[960px] px-4 py-5 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#087a38] to-[#16a34a] p-5 text-white shadow-[0_12px_30px_rgba(8,122,56,0.2)] sm:p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Store health</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{user?.full_name}</h1>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-white/80">How your orders, refunds and ratings have been shaping up. Figures update automatically while you trade.</p>
        </div>

        {stats == null ? (
          <p className="mt-4 text-xs text-textSecondary">Loading your analytics…</p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {cards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-border bg-white p-3.5">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${card.tint}`}>
                    <Icon name={card.icon} size={15} />
                  </span>
                  <p className="mt-2 text-lg font-black text-text">{card.value}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-textSecondary">{card.label}</p>
                </div>
              ))}
            </div>

            <section className="mt-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-extrabold text-text">Top products</h2>
                {stats.top_products.length > 0 && (
                  <button
                    type="button"
                    onClick={() => exportTopProducts(stats)}
                    className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[10px] font-bold text-textSecondary transition hover:border-primary/40 hover:text-primary"
                  >
                    Export CSV
                  </button>
                )}
              </div>
              {stats.top_products.length === 0 ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/60 p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-textSecondary"><Icon name="tag" size={17} /></span>
                  <p className="min-w-0 text-xs leading-relaxed text-textSecondary">Delivered sales will rank your products here.</p>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-border/60">
                  {stats.top_products.map((p) => (
                    <li key={p.offer_id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-text">{p.product_name}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-textSecondary">{p.sold_qty} sold</p>
                      </div>
                      <span className="shrink-0 text-[13px] font-black text-text">{fmt(p.revenue_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="mt-3 text-[11px] leading-relaxed text-textSecondary">
              Revenue is the money escrow has released to you after platform commission. Dispute rate counts returns raised on your orders in the last 30 days. Refunds issued after release are booked back as clawbacks, so your available payout balance already reflects them.
            </p>
          </>
        )}
      </div>
    </div>
  );
}