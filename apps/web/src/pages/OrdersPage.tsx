import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import { listOrders, type OrderSummary } from '../lib/api';
import { activeBuyerId } from '../lib/session';
import { Icon } from '../components/icons';

const fmt = (kobo: number) => naira.format(kobo / 100);

function statusBadge(s: string): { label: string; cls: string } {
  if (s === 'PAID') return { label: 'Paid', cls: 'bg-primary-light text-primary' };
  if (s === 'CHECKOUT') return { label: 'Awaiting payment', cls: 'bg-[#FFF6DA] text-[#A36A00]' };
  return { label: s, cls: 'bg-surface text-textSecondary' };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await listOrders(activeBuyerId());
        if (!cancelled) setOrders(list);
      } catch {
        /* offline — keep last snapshot */
      }
    };
    void load();
    const iv = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-lg font-semibold text-text">Orders</h1>
        <span className="flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-[10px] font-bold text-primary">
          <Icon name="orders" size={12} />
          {orders == null ? '…' : orders.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {orders == null ? (
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-xs font-medium text-textSecondary">Loading your orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
              <Icon name="orders" size={24} />
            </span>
            <p className="mt-3 text-sm font-bold text-text">You no get orders yet</p>
            <p className="mt-1 text-xs text-textSecondary">
              When you checkout from your cart, your orders go dey show here.
            </p>
            <button
              type="button"
              onClick={() => navigate('/offers')}
              className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
            >
              Go dey shop
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            {orders.map((o) => {
              const badge = statusBadge(o.status);
              return (
                <div key={o.id} className="border-b border-border bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                      Order · {o.id.slice(0, 8)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-textSecondary">{timeAgo(o.created_at)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${badge.cls}`}>{badge.label}</span>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {o.lines.map((l) => (
                      <div key={l.offer_id} className="flex items-center justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">
                          {l.product_name}
                          {l.unit ? ` · ${l.unit}` : ''}
                          <span className="ml-1 text-textSecondary">× {l.qty}</span>
                        </p>
                        <p className="shrink-0 text-[12px] font-bold text-text">{fmt(l.unit_price_cents * l.qty)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2">
                    <p className="text-[10px] font-medium text-textSecondary">
                      {o.lines.length} item{o.lines.length === 1 ? '' : 's'}
                      {o.multi_seller ? ' · multi-seller' : ''}
                    </p>
                    <p className="text-[13px] font-black text-text">
                      Total <span className="text-primary">{fmt(o.landed_total_cents)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}