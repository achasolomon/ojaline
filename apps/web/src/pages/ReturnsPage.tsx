import { useCallback, useEffect, useState } from 'react';
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
import { Icon } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';

const fmt = (cents: number) => naira.format(cents / 100);

function statusBadge(s: string) {
  if (s === 'AWAITING_SELLER') return { label: 'Awaiting seller', cls: 'bg-[#E8EEFF] text-[#2A4BD7]' };
  if (s === 'REJECTED') return { label: 'Rejected → you can escalate', cls: 'bg-[#FFF1F0] text-danger' };
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

export default function ReturnsPage() {
  const user = getUser();
  const isSelling = Boolean(user?.seller_type);
  const isOps = Boolean(user?.roles?.some((r) => r === 'OPS' || r === 'AGENT'));
  const userId = user?.id ?? '';

  const [returns, setReturns] = useState<ReturnRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
    const note = decision === 'REFUND' ? '' : '';
    setBusy(ret.id);
    try {
      await mediateReturn(ret.id, decision, note);
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
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            disabled={busy === ret.id}
            onClick={() => handleMediate(ret, 'REFUND')}
            className="rounded-lg bg-[#087A38] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#066B30] disabled:opacity-60"
          >
            {busy === ret.id ? '…' : 'Refund buyer'}
          </button>
          <button
            type="button"
            disabled={busy === ret.id}
            onClick={() => handleMediate(ret, 'DISMISS')}
            className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[10px] font-bold text-textSecondary transition hover:border-danger/40 hover:text-danger disabled:opacity-60"
          >
            Dismiss
          </button>
        </div>
      );
    }
    if (isSelling && ret.seller_id === userId && ret.status === 'AWAITING_SELLER') {
      return (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            disabled={busy === ret.id}
            onClick={() => handleRespond(ret, 'ACCEPT')}
            className="rounded-lg bg-[#087A38] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#066B30] disabled:opacity-60"
          >
            {busy === ret.id ? '…' : 'Accept & refund'}
          </button>
          <button
            type="button"
            disabled={busy === ret.id}
            onClick={() => handleRespond(ret, 'REJECT')}
            className="rounded-lg border border-danger/20 bg-white px-2.5 py-1.5 text-[10px] font-bold text-danger transition hover:bg-danger/5 disabled:opacity-60"
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
          className="shrink-0 rounded-lg bg-[#A36A00] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#8A5A00] disabled:opacity-60"
        >
          {busy === ret.id ? '…' : 'Escalate to OPS'}
        </button>
      );
    }
    return null;
  };

  return (
    <div className="min-h-full bg-surface/70">
      <PageTopBar title="Returns & disputes" />
      <div className="mx-auto max-w-[960px] px-4 py-5 sm:px-6 sm:py-8">
        {!isSelling && !isOps && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-white p-3.5">
            <p className="text-xs text-textSecondary">Something wrong with a delivered order? Raise a return for a refund or a replacement.</p>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-primary-dark"
            >
              {showCreate ? 'Cancel' : '+ Raise a return'}
            </button>
          </div>
        )}

        {showCreate && (
          <div className="mb-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
            <h2 className="text-sm font-extrabold text-text">Raise a return</h2>
            <p className="mt-1 text-[11px] text-textSecondary">You can only return lines that were delivered. Find the details on your order page.</p>
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
              <div className="sm:col-span-2">
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
        )}

        <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
          <h2 className="text-sm font-extrabold text-text">Returns & disputes</h2>
          {returns == null ? (
            <p className="mt-3 text-xs text-textSecondary">Loading your returns…</p>
          ) : returns.length === 0 ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/60 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-textSecondary"><Icon name="box" size={17} /></span>
              <p className="min-w-0 text-xs leading-relaxed text-textSecondary">
                {isSelling
                  ? 'When a buyer raises a return against one of your orders, you can accept it for a refund or reject it and let OPS mediate.'
                  : 'Returns you raise against delivered orders will appear here.'}
              </p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {returns.map((ret) => {
                const badge = statusBadge(ret.status);
                return (
                  <li key={ret.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-text">
                        {ret.product_name}
                        <span className="text-[11px] font-medium text-textSecondary">× {ret.qty}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-textSecondary">
                        {fmt(ret.unit_price_cents * ret.qty)} · {ret.reason.replace('_', ' ')}{' '}
                        <span className="ml-1">· {timeAgo(ret.created_at)}</span>
                      </p>
                      {ret.reason_note && <p className="mt-0.5 text-[11px] text-textSecondary">“{ret.reason_note}”</p>}
                      {ret.decision_note && <p className="mt-0.5 text-[11px] text-textSecondary">Seller note: {ret.decision_note}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
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
    </div>
  );
}