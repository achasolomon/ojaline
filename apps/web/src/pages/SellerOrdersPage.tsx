import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  listSellerOrders,
  acceptOrderLine,
  dispatchOrderLine,
  declineOrderLine,
  type SellerOrderItem,
} from '../lib/api';
import { getUserId, getUser } from '../lib/session';
import { toCSV, downloadCSV } from '../lib/csv';
import { Icon } from '../components/icons';

const fmt = (kobo: number) => naira.format(kobo / 100);

const EXPORT_COLS = [
  { key: 'order_id', header: 'Order ID' },
  { key: 'created_at', header: 'Date' },
  { key: 'order_status', header: 'Status' },
  { key: 'buyer_name', header: 'Buyer' },
  { key: 'product_name', header: 'Product' },
  { key: 'unit', header: 'Unit' },
  { key: 'qty', header: 'Qty' },
  { key: 'unit_price', header: 'Unit price' },
  { key: 'seller_payable', header: 'Seller payable' },
  { key: 'line_status', header: 'Line status' },
  { key: 'tracking_ref', header: 'Tracking ref' },
];

function flattenOrders(orders: SellerOrderItem[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const o of orders) {
    for (const l of o.lines) {
      rows.push({
        order_id: o.id,
        created_at: o.created_at,
        order_status: o.status,
        buyer_name: o.buyer_name,
        product_name: l.product_name,
        unit: l.unit ?? '',
        qty: l.qty,
        unit_price: fmt(l.unit_price_cents),
        seller_payable: fmt(l.seller_payable_cents),
        line_status: l.status,
        tracking_ref: l.tracking_ref ?? '',
      });
    }
  }
  return rows;
}

type LineFilter = 'ALL' | 'TO_ACCEPT' | 'IN_PROGRESS' | 'DELIVERED' | 'DECLINED';

const LINE_FILTERS: Array<{ id: LineFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'TO_ACCEPT', label: 'Needs action' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'DECLINED', label: 'Declined' },
];

function lineStatusBadge(s: string) {
  if (s === 'PAID') return { label: 'Awaiting acceptance', cls: 'bg-[#FFF6DA] text-[#A36A00]' };
  if (s === 'ACCEPTED') return { label: 'Accepted', cls: 'bg-[#D6F5E7] text-[#087A38]' };
  if (s === 'DISPATCHED') return { label: 'Dispatched', cls: 'bg-primary-light text-primary' };
  if (s === 'DELIVERED') return { label: 'Delivered', cls: 'bg-[#D6F5E7] text-[#087A38]' };
  if (s === 'CANCELLED') return { label: 'Cancelled', cls: 'bg-danger/10 text-danger' };
  if (s === 'REFUNDED') return { label: 'Refunded', cls: 'bg-danger/10 text-danger' };
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

export default function SellerOrdersPage() {
  const navigate = useNavigate();
  const user = getUser();
  const sellerId = getUserId() ?? '';
  const isSeller = Boolean(user?.seller_type);

  const [orders, setOrders] = useState<SellerOrderItem[] | null>(null);
  const [filter, setFilter] = useState<LineFilter>('ALL');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isSeller || !sellerId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const lineStatusFilter =
          filter === 'TO_ACCEPT'
            ? 'PAID'
            : filter === 'IN_PROGRESS'
              ? 'DISPATCHED'
              : filter === 'DELIVERED'
                ? 'DELIVERED'
                : filter === 'DECLINED'
                  ? 'CANCELLED'
                  : undefined;
        const page = await listSellerOrders(sellerId, { lineStatus: lineStatusFilter, limit: 50 });
        if (!cancelled) setOrders(page.orders);
      } catch {
        /* offline — keep last snapshot */
      }
    };

    void load();
    const iv = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [isSeller, sellerId, filter, reloadToken]);

  if (!isSeller) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
          <Icon name="store" size={24} />
        </span>
        <p className="mt-3 text-sm font-bold text-text">You're not registered as a seller</p>
        <p className="mt-1 text-xs text-textSecondary">Register a seller profile to start receiving and managing orders.</p>
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

  const handleAccept = async (orderId: string, lineId: string) => {
    const key = `${orderId}:${lineId}:accept`;
    setBusyKey(key);
    try {
      await acceptOrderLine(orderId, lineId);
      setReloadToken((t) => t + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not accept line');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDispatch = async (orderId: string, lineId: string) => {
    const trackingRef = window.prompt('Tracking reference (optional — can leave empty)');
    if (trackingRef === null) return;
    const key = `${orderId}:${lineId}:dispatch`;
    setBusyKey(key);
    try {
      await dispatchOrderLine(orderId, lineId, trackingRef || undefined);
      setReloadToken((t) => t + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not dispatch line');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDecline = async (orderId: string, lineId: string) => {
    const reason = window.prompt('Why are you declining this order? (optional)');
    if (reason === null) return;
    if (reason !== '' && !window.confirm('Confirm you are declining this order? The buyer will be notified and can request a replacement or refund.')) {
      return;
    }
    const key = `${orderId}:${lineId}:decline`;
    setBusyKey(key);
    try {
      await declineOrderLine(orderId, lineId, reason || undefined);
      setReloadToken((t) => t + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not decline line');
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
        <h1 className="flex-1 text-[15px] font-extrabold text-text">Orders</h1>
        {orders && orders.length > 0 && (
          <button
            type="button"
            onClick={() => downloadCSV(`seller-orders-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(flattenOrders(orders), EXPORT_COLS))}
            className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[10px] font-bold text-textSecondary transition hover:border-primary/40 hover:text-primary"
          >
            Export CSV
          </button>
        )}
        <span className="flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-[10px] font-bold text-primary">
          <Icon name="orders" size={12} />
          {orders == null ? '…' : orders.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
        {orders == null ? (
          <div className="flex flex-col items-center justify-center px-6 py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-xs font-medium text-textSecondary">Loading your seller orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
              <Icon name="orders" size={24} />
            </span>
            <p className="mt-3 text-sm font-bold text-text">No seller orders yet</p>
            <p className="mt-1 text-xs text-textSecondary">
              When a buyer pays for your item, the order will show here.
            </p>
            <button
              type="button"
              onClick={() => navigate('/seller/products/new')}
              className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
            >
              Create an offer
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-none">
              {LINE_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-bold transition ${filter === item.id ? 'bg-primary text-white' : 'bg-white text-textSecondary hover:border-primary/40 border border-border'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {orders.length === 0 ? (
              <div className="rounded-2xl bg-white px-5 py-10 text-center">
                <p className="text-sm font-bold text-text">
                  No {LINE_FILTERS.find((item) => item.id === filter)?.label.toLowerCase()} orders
                </p>
                <p className="mt-1 text-xs text-textSecondary">Orders in this filter will show here.</p>
              </div>
            ) : (
              orders.map((o) => (
                <div
                  key={o.id}
                  className="mb-4 rounded-2xl bg-white px-4 py-3.5 transition hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-textSecondary">
                      Order · {o.id.slice(0, 8)}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-textSecondary">{timeAgo(o.created_at)}</span>
                      <span className="rounded-full bg-primary-light px-2 py-0.5 text-[9px] font-bold text-primary">{o.status}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[12px] font-semibold text-text">
                    Buyer: {o.buyer_name || 'Buyer'}
                  </p>

                  <div className="mt-3 space-y-3">
                    {o.lines.map((l) => {
                      const badge = lineStatusBadge(l.status);
                      const kAccept = `${o.id}:${l.id}:accept`;
                      const kDispatch = `${o.id}:${l.id}:dispatch`;
                      const kDecline = `${o.id}:${l.id}:decline`;
                      const anyBusy = busyKey !== null;
                      return (
                        <div
                          key={l.id}
                          className="rounded-xl bg-surface/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 text-[13px] font-semibold text-text">
                              {l.product_name}
                              {l.unit ? ` · ${l.unit}` : ''}
                              <span className="ml-1 text-textSecondary">× {l.qty}</span>
                            </p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[12px] font-medium text-textSecondary">
                            <span>Seller payable: <span className="text-text">{fmt(l.seller_payable_cents)}</span></span>
                            <span>Unit: {fmt(l.unit_price_cents)}</span>
                          </div>
                          {l.tracking_ref && (
                            <p className="mt-1 text-[11px] font-medium text-textSecondary">Tracking: {l.tracking_ref}</p>
                          )}
                          {l.decline_reason && (
                            <p className="mt-1 text-[11px] font-medium text-danger">Reason declined: {l.decline_reason}</p>
                          )}
{(l.status === 'PAID' || l.status === 'ACCEPTED') && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-border/60 pt-2.5">
                  {l.status === 'PAID' && (
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() => handleAccept(o.id, l.id)}
                      className={`rounded-lg bg-[#087A38] px-3 py-2 text-[11px] font-bold text-white transition ${anyBusy && busyKey === kAccept ? 'opacity-60' : 'hover:bg-[#065e2c]'}`}
                    >
                      {busyKey === kAccept ? 'Accepting…' : 'Accept'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => handleDispatch(o.id, l.id)}
                    className={`rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-white transition ${anyBusy && busyKey === kDispatch ? 'opacity-60' : 'hover:bg-primary-dark'}`}
                  >
                    {busyKey === kDispatch ? 'Dispatching…' : 'Dispatch'}
                  </button>
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => handleDecline(o.id, l.id)}
                    className={`rounded-lg border border-danger bg-white px-3 py-2 text-[11px] font-bold text-danger transition ${anyBusy && busyKey === kDecline ? 'opacity-60' : 'hover:bg-danger/5'}`}
                  >
                    {busyKey === kDecline ? 'Declining…' : 'Decline'}
                  </button>
                </div>
              )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2">
                    <p className="text-[10px] font-medium text-textSecondary">
                      {o.lines.length} item{o.lines.length === 1 ? '' : 's'}
                    </p>
                    <p className="text-[13px] font-black text-text">
                      Total <span className="text-primary">{fmt(o.landed_total_cents)}</span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}