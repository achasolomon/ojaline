import { useCallback, useEffect, useMemo, useState } from 'react';
import { naira } from '@ojaline/design';
import {
  escalateReturn,
  listReturns,
  mediateReturn,
  respondToReturn,
  createReturn,
  type ReturnRequest,
} from '../lib/api';
import { getUser } from '../lib/session';
import { Icon, type IconName } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';
import { cn } from '../lib/cn';

const fmt = (cents: number) => naira.format(cents / 100);

const REASON_LABELS: Record<string, string> = {
  WRONG_ITEM: 'Wrong item',
  QUALITY: 'Quality issue',
  MISSING: 'Missing item',
  DAMAGED: 'Arrived damaged',
  OTHER: 'Something else',
};

const REASON_ICONS: Record<string, IconName> = {
  WRONG_ITEM: 'box',
  QUALITY: 'leaf',
  MISSING: 'cart',
  DAMAGED: 'trash',
  OTHER: 'help',
};

function statusBadge(s: string) {
  if (s === 'AWAITING_SELLER') return { label: 'Awaiting seller', cls: 'bg-[#E8EEFF] text-[#2A4BD7]' };
  if (s === 'REJECTED') return { label: 'Rejected — you can escalate', cls: 'bg-[#FFF1F0] text-danger' };
  if (s === 'ESCALATED') return { label: 'With OPS mediation', cls: 'bg-[#FFF6DA] text-[#A36A00]' };
  if (s === 'RESOLVED_REFUND') return { label: 'Refunded', cls: 'bg-[#D6F5E7] text-[#087A38]' };
  if (s === 'DISMISSED') return { label: 'Dismissed', cls: 'bg-surface text-textSecondary' };
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

const allFilters = ['ALL', 'AWAITING_SELLER', 'REJECTED', 'ESCALATED', 'RESOLVED_REFUND', 'DISMISSED'];

export default function ReturnsPage() {
  const user = getUser();
  const isSelling = Boolean(user?.seller_type);
  const isOps = Boolean(user?.roles?.some((r) => r === 'OPS' || r === 'AGENT'));
  const userId = user?.id ?? '';

  const [returns, setReturns] = useState<ReturnRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');

  const [showCreate, setShowCreate] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [lineId, setLineId] = useState('');
  const [reason, setReason] = useState('QUALITY');
  const [reasonNote, setReasonNote] = useState('');
  const [qty, setQty] = useState('1');

  const load = useCallback(async () => {
    const res = await listReturns({ limit: 50 });
    setReturns(res.returns);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    await load();
  };

  const handleRespond = async (ret: ReturnRequest, action: 'ACCEPT' | 'REJECT') => {
    setBusy(ret.id);
    try {
      await respondToReturn(ret.id, action);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Could not ${action.toLowerCase()} the return`);
    } finally {
      setBusy(null);
    }
  };

  const handleEscalate = async (id: string) => {
    setBusy(id);
    try {
      await escalateReturn(id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not escalate the return');
    } finally {
      setBusy(null);
    }
  };

  const handleMediate = async (ret: ReturnRequest, decision: 'REFUND' | 'DISMISS') => {
    setBusy(ret.id);
    try {
      await mediateReturn(ret.id, decision, '');
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not mediate the return');
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async () => {
    if (!orderId.trim() || !lineId.trim()) {
      alert('Enter the order id and line id of the item you received');
      return;
    }
    setBusy('new');
    try {
      await createReturn({
        order_id: orderId.trim(),
        order_line_id: lineId.trim(),
        reason,
        reason_note: reasonNote.trim() || undefined,
        qty: Number(qty) || 1,
      });
      setShowCreate(false);
      setOrderId('');
      setLineId('');
      setReason('QUALITY');
      setReasonNote('');
      setQty('1');
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not raise the return');
    } finally {
      setBusy(null);
    }
  };

  const actionsFor = (ret: ReturnRequest) => {
    if (isOps && (ret.status === 'ESCALATED' || ret.status === 'REJECTED')) {
      return (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy === ret.id}
            onClick={() => handleMediate(ret, 'REFUND')}
            className="rounded-lg bg-[#087A38] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#066B30] disabled:opacity-60"
          >
            {busy === ret.id ? '…' : 'Refund buyer'}
          </button>
          <button
            type="button"
            disabled={busy === ret.id}
            onClick={() => handleMediate(ret, 'DISMISS')}
            className="rounded-lg border border-border bg-white px-3 py-2 text-[11px] font-bold text-textSecondary transition hover:border-danger/40 hover:text-danger disabled:opacity-60"
          >
            Dismiss
          </button>
        </div>
      );
    }
    if (isSelling && ret.seller_id === userId && ret.status === 'AWAITING_SELLER') {
      return (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy === ret.id}
            onClick={() => handleRespond(ret, 'ACCEPT')}
            className="rounded-lg bg-[#087A38] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#066B30] disabled:opacity-60"
          >
            {busy === ret.id ? '…' : 'Accept & refund'}
          </button>
          <button
            type="button"
            disabled={busy === ret.id}
            onClick={() => handleRespond(ret, 'REJECT')}
            className="rounded-lg border border-danger/20 bg-white px-3 py-2 text-[11px] font-bold text-danger transition hover:bg-danger/5 disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      );
    }
    if (ret.buyer_id === userId && ret.status === 'REJECTED') {
      return (
        <button
          type="button"
          disabled={busy === ret.id}
          onClick={() => handleEscalate(ret.id)}
          className="shrink-0 rounded-lg bg-[#A36A00] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#8A5A00] disabled:opacity-60"
        >
          {busy === ret.id ? '…' : 'Escalate to OPS'}
        </button>
      );
    }
    return null;
  };

  const filtered = useMemo(() => {
    if (!returns) return returns;
    if (filter === 'ALL') return returns;
    return returns.filter((r) => r.status === filter);
  }, [returns, filter]);

  const countFor = (s: string) => (returns ? (s === 'ALL' ? returns.length : returns.filter((r) => r.status === s).length) : 0);

  return (
    <div className="min-h-full bg-surface/70">
      <PageTopBar title="Returns & disputes" />
      <div className="mx-auto max-w-[960px] px-4 py-5 sm:px-6 sm:py-8">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#087a38] to-[#16a34a] p-5 text-white shadow-[0_12px_30px_rgba(8,122,56,0.18)] sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -right-2 bottom-0 h-20 w-20 rounded-full bg-white/[0.06]" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-white">
                  <Icon name="shield" size={22} />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Buyer protection</p>
                  <h1 className="mt-0.5 text-xl font-black tracking-tight sm:text-2xl">
                    {returns == null ? 'Returns' : `${returns.length} return${returns.length === 1 ? '' : 's'}`}
                  </h1>
                </div>
              </div>
              {!isSelling && !isOps && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-[12px] font-bold text-[#087A38] shadow-sm transition hover:bg-white/90"
                >
                  <Icon name="plus" size={14} />
                  Raise a return
                </button>
              )}
            </div>
            <p className="mt-3 max-w-lg text-[12px] leading-relaxed text-white/80">
              {isSelling
                ? 'When a buyer raises a return against one of your orders, accept it for a refund or reject it and let OPS mediate.'
                : isOps
                  ? 'Mediate escalated returns — refund the buyer or dismiss the claim.'
                  : 'Something wrong with a delivered order? Raise a return for a refund or replacement.'}
            </p>
          </div>
        </section>

        <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1">
          {allFilters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold transition',
                filter === f ? 'bg-primary text-white shadow-sm' : 'bg-white text-gray-500 hover:text-gray-700',
              )}
            >
              {f === 'ALL' ? 'All' : statusBadge(f).label.split(' — ')[0]}
              <span className={cn('rounded-full px-1.5 text-[10px] font-black', filter === f ? 'bg-white/20' : 'bg-gray-100 text-gray-400')}>
                {countFor(f)}
              </span>
            </button>
          ))}
        </div>

        <section className="mt-3 rounded-2xl border border-border bg-white p-4 sm:p-5">
          {filtered == null ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl bg-surface/60 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-textSecondary">
                <Icon name="shield" size={18} />
              </span>
              <p className="min-w-0 text-xs leading-relaxed text-textSecondary">
                No {filter === 'ALL' ? '' : statusBadge(filter).label + ' '}returns here yet.
                {!isSelling && !isOps && ' If a delivered order went wrong, raise a return and it will show up here.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((ret) => {
                const badge = statusBadge(ret.status);
                const reasonLabel = REASON_LABELS[ret.reason] ?? ret.reason.replace(/_/g, ' ');
                const amount = fmt((ret.unit_price_cents ?? 0) * ret.qty);
                return (
                  <li key={ret.id} className="rounded-2xl border border-border bg-surface/30 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm">
                          <Icon name={REASON_ICONS[ret.reason] ?? 'help'} size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-black text-gray-900">
                            {ret.product_name}
                            <span className="text-[11px] font-semibold text-gray-400">× {ret.qty}</span>
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-gray-500">
                            <span>{amount}</span>
                            <span className="text-gray-200">•</span>
                            <span>{reasonLabel}</span>
                            <span className="text-gray-200">•</span>
                            <span>{timeAgo(ret.created_at)}</span>
                          </p>
                        </div>
                      </div>
                      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold', badge.cls)}>{badge.label}</span>
                    </div>

                    {ret.refund_cents != null && ret.status === 'RESOLVED_REFUND' && (
                      <p className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-[#087A38]">
                        <Icon name="check" size={13} />
                        Refund issued · {fmt(ret.refund_cents)}
                      </p>
                    )}
                    {ret.reason_note && (
                      <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[12px] leading-relaxed text-gray-600">“{ret.reason_note}”</p>
                    )}
                    {ret.decision_note && (
                      <p className="mt-2 text-[11px] text-gray-500">Seller note: {ret.decision_note}</p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
                      <span className="mr-auto text-[10px] font-semibold text-gray-400">#{ret.id.slice(0, 8)}</span>
                      <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold', badge.cls)}>{badge.label}</span>
                      {actionsFor(ret)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {isOps && (
            <p className="mt-4 rounded-xl bg-[#F6F8FF] px-3 py-2 text-[11px] leading-relaxed text-textSecondary">
              You are reviewing these as an OPS agent. You can refund the buyer or dismiss the claim on escalated returns.
            </p>
          )}
        </section>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close create return"
            onClick={() => setShowCreate(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-gray-900">Raise a return</h2>
                <p className="mt-0.5 text-[11px] text-gray-500">You can only return lines that were delivered — find the details on your order page.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
                aria-label="Close create return"
              >
                <Icon name="close" size={15} />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-textSecondary">
                Order id
                <input
                  type="text"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="e.g. 3f2a…"
                  className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary"
                />
              </label>
              <label className="block text-xs font-bold text-textSecondary">
                Order line id
                <input
                  type="text"
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  placeholder="e.g. 8c1e…"
                  className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary"
                />
              </label>
              <label className="block text-xs font-bold text-textSecondary">
                Reason
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary"
                >
                  <option value="WRONG_ITEM">Wrong item</option>
                  <option value="QUALITY">Quality issue</option>
                  <option value="MISSING">Missing part of the order</option>
                  <option value="DAMAGED">Arrived damaged</option>
                  <option value="OTHER">Something else</option>
                </select>
              </label>
              <label className="block text-xs font-bold text-textSecondary">
                Quantity to return
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary"
                />
              </label>
              <label className="block text-xs font-bold text-textSecondary sm:col-span-2">
                Notes (optional)
                <textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  rows={2}
                  placeholder="Tell the seller what went wrong"
                  className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary"
                />
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl border border-border bg-white px-4 py-2.5 text-xs font-bold text-textSecondary transition hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy === 'new'}
                  onClick={handleCreate}
                  className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition hover:bg-primary-dark disabled:opacity-60"
                >
                  {busy === 'new' ? 'Submitting…' : 'Submit return request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}