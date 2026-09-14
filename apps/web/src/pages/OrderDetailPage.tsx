import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  getOrder, getFulfilmentStatus, payOrder, confirmDelivery, decideOrder, cancelOrder, addReview,
  type OrderDetail, type FulfilmentStatus, type OrderDetailLine,
} from '../lib/api';
import { Icon } from '../components/icons';
import { pushNotification } from '../lib/notifications';
import { activeBuyerId } from '../lib/session';

const fmt = (kobo: number) => naira.format(kobo / 100);

const DELIVERY_LABELS: Record<string, string> = {
  INSTANT: 'Instant Delivery',
  SCHEDULED: 'Scheduled Delivery',
  MARKET_DAY: 'Market Day Pickup',
};

function statusBadge(s: string): { label: string; cls: string } {
  switch (s) {
    case 'PAID': return { label: 'Paid', cls: 'bg-primary-light text-primary' };
    case 'CHECKOUT':
    case 'PENDING_PAYMENT': return { label: 'Awaiting payment', cls: 'bg-[#FFF6DA] text-[#A36A00]' };
    case 'DELIVERED': return { label: 'Delivered', cls: 'bg-primary text-white' };
    case 'DISPATCHED':
    case 'PARTIALLY_DISPATCHED': return { label: 'In transit', cls: 'bg-blue-50 text-blue-700' };
    case 'CANCELLED': return { label: 'Cancelled', cls: 'bg-danger/10 text-danger' };
    case 'PARTIALLY_REFUNDED':
    case 'REFUNDED': return { label: 'Refunded', cls: 'bg-danger/10 text-danger' };
    default: return { label: s, cls: 'bg-surface text-textSecondary' };
  }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const NEEDS_PAYMENT = new Set(['CHECKOUT', 'PENDING_PAYMENT']);

function buildTimeline(o: OrderDetail): Array<{ label: string; done: boolean; time?: string }> {
  const placed = { label: 'Order placed', time: o.created_at, done: true };
  const paid = { label: 'Payment confirmed', time: o.status !== 'CHECKOUT' && o.status !== 'PENDING_PAYMENT' ? o.updated_at : undefined, done: !NEEDS_PAYMENT.has(o.status) };
  const delivered = { label: 'Delivered', time: o.status === 'DELIVERED' ? o.updated_at : undefined, done: o.status === 'DELIVERED' };

  if (['CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.status)) {
    return [placed, { ...paid, label: 'Payment', time: o.updated_at, done: true }, { label: 'Closed', time: o.updated_at, done: true }];
  }
  if (NEEDS_PAYMENT.has(o.status)) {
    return [placed, { label: 'Payment', done: false }, { label: 'Delivery', done: false }, delivered];
  }
  if (o.status === 'DELIVERED') return [placed, paid, delivered];
  return [placed, paid, delivered];
}

interface TimelineProps { o: OrderDetail }
function Timeline({ o }: TimelineProps) {
  const steps = buildTimeline(o);
  const futureIndex = steps.findIndex((s) => !s.done);
  return (
    <div className="grid items-start gap-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const current = i === futureIndex;
        return (
          <div key={i} className="relative flex min-w-0 flex-col items-center text-center">
            {i < steps.length - 1 && <span className={`absolute left-1/2 right-0 top-[10px] h-0.5 ${s.done ? 'bg-primary' : 'bg-border'}`} />}
            <span className={`relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded-full ${s.done ? 'bg-primary text-white' : current ? 'border-2 border-primary bg-white' : 'border border-border bg-white'}`}>
              {s.done && <Icon name="check" size={11} />}
            </span>
            <span className="mt-2 min-w-0">
              <span className={`block break-words text-[9px] font-bold leading-tight sm:text-[10px] ${s.done ? 'text-text' : current ? 'text-primary' : 'text-textSecondary'}`}>{s.label}</span>
              {s.time && <span className="mt-0.5 hidden text-[9px] text-textSecondary sm:block">{fmtDateTime(s.time)}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function lineStatusChip(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'bg-surface text-textSecondary',
    PAID: 'bg-primary-light text-primary',
    DISPATCHED: 'bg-blue-50 text-blue-700',
    DELIVERED: 'bg-primary text-white',
    REFUNDED: 'bg-danger/10 text-danger',
    CANCELLED: 'bg-surface text-textSecondary',
    REPLACED: 'bg-[#FFF6DA] text-[#A36A00]',
  };
  return map[status] ?? 'bg-surface text-textSecondary';
}

interface ReviewPromptProps {
  line: OrderDetailLine;
}
function ReviewPrompt({ line }: ReviewPromptProps) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (rating < 1 || status === 'submitting') return;
    setStatus('submitting');
    setErr(null);
    try {
      await addReview(line.offer_id, activeBuyerId(), rating, text.trim() || undefined);
      setStatus('done');
      pushNotification({ type: 'order', title: 'Review published', body: `Thanks for rating ${line.product_name}.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not publish your review.';
      if (/already reviewed/i.test(msg)) {
        setStatus('done');
      } else {
        setStatus('idle');
        setErr(msg);
      }
    }
  };

  if (status === 'done') {
    return (
      <div className="flex items-center gap-2 py-3 first:pt-0 last:pb-0">
        <Icon name="check" size={15} className="text-primary" />
        <p className="flex-1 text-xs font-semibold text-text">
          You rated this item{rating > 0 ? ` ${rating} / 5` : ''} — thanks for the feedback!
        </p>
      </div>
    );
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-text">{line.product_name}</p>
          <p className="text-[11px] text-textSecondary">{line.seller_name ?? `Seller ${line.seller_id.slice(0, 8)}`}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              disabled={status === 'submitting'}
              onClick={() => setRating(n)}
              className="p-0.5"
            >
              <Icon
                name="star"
                size={18}
                stroke="none"
                className={n <= rating ? 'fill-[#f5a623]' : 'fill-border'}
              />
            </button>
          ))}
        </div>
      </div>
      {rating > 0 && (
        <div className="mt-2 flex items-start gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={status === 'submitting'}
            maxLength={300}
            placeholder="Tell other buyers what the item was like…"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs text-text outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={submit}
            disabled={status === 'submitting'}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-white transition hover:bg-primary-dark disabled:opacity-50"
          >
            {status === 'submitting' ? 'Posting…' : 'Post'}
          </button>
        </div>
      )}
      {err && <p className="mt-1.5 text-[11px] font-semibold text-danger">{err}</p>}
    </div>
  );
}

export default function OrderDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [fulfilment, setFulfilment] = useState<FulfilmentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      const [o, f] = await Promise.all([getOrder(id), getFulfilmentStatus(id)]);
      setOrder(o);
      setFulfilment(f);
    } catch {
      /* keep last snapshot */
    }
  };

  useEffect(() => {
    void load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (!status) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('status');
    url.searchParams.delete('reference');
    window.history.replaceState({}, '', url.toString());
    if (status === 'success') {
      setNotice('Payment confirmed — hold on while we update your order.');
      void load();
    } else if (status === 'abandoned') {
      setError('Payment was not completed. You can try again below.');
    }
  }, [id]);

  const startPayment = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const callbackUrl = `${window.location.origin}/orders/${id}`;
      const pay = await payOrder(id, callbackUrl);
      window.location.assign(pay.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment.');
      setBusy(false);
    }
  };

  const markDelivered = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmDelivery(id);
      setNotice(`Delivery confirmed — escrow release scheduled for ${fmtDateTime(res.release_scheduled_at)}.`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm delivery.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!id || !order) return;
    const paid = ['PAID', 'PARTIALLY_DISPATCHED', 'DISPATCHED'].includes(order.status);
    const ok = window.confirm(
      paid
        ? 'Cancel this order and request a full refund? Your escrow balance will be released back to you.'
        : 'Cancel this order? This releases your reservation — nothing has been charged yet.',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await cancelOrder(id);
      setNotice(res.refunded_cents > 0
        ? 'Order cancelled — your refund has been released from escrow.'
        : 'Order cancelled — your reservation has been released.');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the order.');
    } finally {
      setBusy(false);
    }
  };

  const makeDecision = async (action: 'CONTINUE' | 'CANCEL') => {
    if (!id || !fulfilment) return;
    setBusy(true);
    setError(null);
    try {
      await decideOrder(id, action, fulfilment.pending_decisions);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process your decision.');
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <div className="flex h-full flex-col bg-white">
        <Header onBack={() => navigate(-1)} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs font-medium text-textSecondary">Loading order…</p>
        </div>
      </div>
    );
  }

  const badge = statusBadge(order.status);
  const pendingLines: OrderDetailLine[] = (order.lines ?? []).filter((l) => fulfilment?.pending_decisions?.includes(l.id));
  const hasDecision = order.status === 'PARTIALLY_DISPATCHED' && pendingLines.length > 0;

  return (
    <div className="flex h-full flex-col bg-surface/40">
      <Header onBack={() => navigate('/orders')} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl">
          {/* Status card */}
          <div className="bg-white px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-textSecondary">Order · {order.id.slice(0, 8)}</p>
                <p className="mt-0.5 text-sm font-black text-text">
                  {fmt(order.landed_total_cents)}
                  <span className="ml-1 text-xs font-medium text-textSecondary">· {order.lines.reduce((s, l) => s + l.qty, 0)} item{order.lines.length === 1 ? '' : 's'}</span>
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
            </div>

            {['PAID', 'DISPATCHED', 'PARTIALLY_DISPATCHED'].includes(order.status) && (
              <div className="mt-4 rounded-xl bg-gradient-to-r from-[#087a38] to-primary px-4 py-3 text-white">
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/75">Order tracking</p>
                <p className="mt-1 text-sm font-extrabold">{order.status === 'DISPATCHED' || order.status === 'PARTIALLY_DISPATCHED' ? 'Your order is on the way' : 'Your order is being prepared'}</p>
                {order.window_start && <p className="mt-0.5 text-[11px] text-white/80">Estimated delivery · {fmtDateTime(order.window_start)}</p>}
              </div>
            )}

            {notice && (
              <div className={`mt-4 rounded-xl px-3 py-2.5 text-xs font-semibold ${order.status === 'PAID' || order.status === 'DELIVERED' ? 'bg-primary-light text-primary' : 'bg-[#FFF6DA] text-[#A36A00]'}`}>
                {notice}
              </div>
            )}
            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger">
                <Icon name="shield" size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {NEEDS_PAYMENT.has(order.status) && (
              <button
                type="button"
                onClick={startPayment}
                disabled={busy}
                className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white transition hover:bg-primary-dark disabled:opacity-50"
              >
                {busy ? 'Starting payment…' : 'Complete payment'}
              </button>
            )}

            {order.status === 'PAID' && (
              <button
                type="button"
                onClick={markDelivered}
                disabled={busy}
                className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white transition hover:bg-primary-dark disabled:opacity-50"
              >
                {busy ? 'Updating…' : 'Confirm delivery'}
              </button>
            )}

            {(NEEDS_PAYMENT.has(order.status) || order.status === 'PAID') && (
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="mt-2 w-full rounded-xl border border-danger/30 bg-white py-2.5 text-sm font-bold text-danger transition hover:bg-danger/10 disabled:opacity-50"
              >
                {NEEDS_PAYMENT.has(order.status) ? 'Cancel order' : 'Cancel order & refund'}
              </button>
            )}
          </div>

          {/* Timeline */}
          <div className="mt-3 rounded-2xl bg-white px-5 py-5 shadow-[0_4px_16px_rgba(15,48,28,0.04)] sm:border sm:border-border">
            <h2 className="mb-4 text-[13px] font-bold text-text">Progress</h2>
            <Timeline o={order} />
          </div>

          {/* Decision panel */}
          {hasDecision && (
            <div className="mt-3 border border-[#FFE2A8] bg-[#FFF9EC] px-5 py-4">
              <div className="flex items-start gap-2">
                <Icon name="help" size={16} className="mt-0.5 shrink-0 text-[#A36A00]" />
                <div>
                  <p className="text-[13px] font-bold text-text">Some items couldn't be fulfilled</p>
                  <p className="mt-0.5 text-xs text-textSecondary">
                    {pendingLines.map((l) => l.product_name).join(', ')}{pendingLines.length > 1 ? ' couldn' : " couldn't"} be delivered.
                    Choose what happens next.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => makeDecision('CONTINUE')}
                      className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-white transition hover:bg-primary-dark disabled:opacity-50"
                    >
                      Refund item{`${pendingLines.length === 1 ? '' : 's'}`} & keep the rest
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => makeDecision('CANCEL')}
                      className="flex-1 rounded-xl border border-danger/40 bg-white py-2.5 text-xs font-bold text-danger transition hover:bg-danger/5 disabled:opacity-50"
                    >
                      Cancel my order
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="mt-3 rounded-2xl bg-white px-5 py-5 shadow-[0_4px_16px_rgba(15,48,28,0.04)] sm:border sm:border-border">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-bold text-text">Items</h2>
              {order.multi_seller && <span className="text-[10px] font-bold text-[#A36A00]">Multi-seller order</span>}
            </div>
            <div className="divide-y divide-border">
              {order.lines.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-text">
                      {l.product_name}
                      {l.unit ? ` · ${l.unit}` : ''}
                    </p>
                    <p className="text-[11px] text-textSecondary">
                      {l.seller_name ?? `Seller ${l.seller_id.slice(0, 8)}`} · {l.qty}× {fmt(l.unit_price_cents)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[12px] font-bold text-text">{fmt(l.unit_price_cents * l.qty)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${lineStatusChip(l.status)}`}>{l.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reviews */}
          {order.status === 'DELIVERED' && (
            <div className="mt-3 rounded-2xl bg-white px-5 py-5 shadow-[0_4px_16px_rgba(15,48,28,0.04)] sm:border sm:border-border">
              <h2 className="mb-1 text-[13px] font-bold text-text">Rate your purchase</h2>
              <p className="mb-3 text-[11px] text-textSecondary">Share your experience — it helps fellow buyers trust this seller.</p>
              <div className="divide-y divide-border">
                {order.lines.map((l) => <ReviewPrompt key={l.id} line={l} />)}
              </div>
            </div>
          )}

          {/* Delivery */}
          {(order.delivery_mode || order.window_start) && (
            <div className="mt-3 rounded-2xl bg-white px-5 py-5 shadow-[0_4px_16px_rgba(15,48,28,0.04)] sm:border sm:border-border">
              <h2 className="mb-3 text-[13px] font-bold text-text">Delivery</h2>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-textSecondary">Mode</span><span className="font-semibold text-text">{DELIVERY_LABELS[order.delivery_mode ?? ''] ?? order.delivery_mode ?? '—'}</span></div>
                {order.window_start && (
                  <div className="flex justify-between">
                    <span className="text-textSecondary">Window</span>
                    <span className="font-semibold text-text">{fmtDateTime(order.window_start)} – {fmtDateTime(order.window_end)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Totals + escrow */}
          <div className="mt-3 mb-4 rounded-2xl bg-white px-5 py-5 shadow-[0_4px_16px_rgba(15,48,28,0.04)] sm:border sm:border-border">
            <h2 className="mb-3 text-[13px] font-bold text-text">Payment</h2>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-textSecondary">Subtotal</span><span className="font-semibold text-text">{fmt(order.item_total_cents)}</span></div>
              <div className="flex justify-between">
                <span className="text-textSecondary">Delivery ({DELIVERY_LABELS[order.delivery_mode ?? ''] ?? order.delivery_mode ?? '—'})</span>
                <span className="font-semibold text-text">{fmt(order.delivery_fee_cents ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-text"><span>Total paid</span><span className="text-primary">{fmt(order.landed_total_cents)}</span></div>
            </div>

            {order.escrow && (
              <div className="mt-4 rounded-xl bg-surface px-3 py-3">
                <div className="flex items-center gap-2">
                  <Icon name="shield" size={15} className="text-primary" />
                  <p className="flex-1 text-[11px] font-bold text-text">
                    {order.escrow.status === 'HELD'
                      ? `Held in escrow: ${fmt(order.escrow.amount_held_cents)}`
                      : order.escrow.status === 'RELEASED'
                        ? `Released from escrow: ${fmt(order.escrow.amount_held_cents)}`
                        : `Escrow ${order.escrow.status}: ${fmt(order.escrow.amount_held_cents)}`}
                  </p>
                  <span className="text-[10px] font-bold text-primary">{order.escrow.status}</span>
                </div>
                {order.escrow.release_scheduled_at && (
                  <p className="mt-1.5 text-[10px] text-textSecondary">
                    Seller release scheduled for {fmtDateTime(order.escrow.release_scheduled_at)} (24h after delivery confirmation).
                  </p>
                )}
                {order.status === 'CANCELLED' && (
                  <p className="mt-1.5 text-[10px] text-textSecondary">
                    Your refund has been released from escrow.
                  </p>
                )}
                {order.status === 'PAID' && (
                  <p className="mt-1.5 text-[10px] text-textSecondary">
                    Your money is protected — confirm delivery so the seller gets paid.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-3">
      <button type="button" onClick={onBack} aria-label="Back" className="p-1">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 className="flex-1 text-lg font-semibold text-text">Order details</h1>
      <button type="button" onClick={() => navigate('/notifications')} className="p-1 text-textSecondary" aria-label="Notifications">
        <Icon name="bell" size={19} />
      </button>
    </header>
  );
}
