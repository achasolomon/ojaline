import { useCallback, useEffect, useState } from 'react';
import { naira } from '@ojaline/design';
import {
  decideKyc,
  getPlatformStats,
  listDisputes,
  listKycQueue,
  listSellerRisk,
  mediateReturn,
  recomputeRiskTiers,
  setSellerRisk,
  type DisputeRow,
  type KycQueueRow,
  type PlatformStats,
  type SellerRiskRow,
} from '../lib/api';
import { Icon } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';

const fmt = (cents: number) => naira.format(cents / 100);
const pct = (n: number | null | undefined) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);

function tierBadge(tier: string) {
  if (tier === 'VERIFIED_LOW') return { label: 'Verified low', cls: 'bg-[#D6F5E7] text-[#087A38]' };
  if (tier === 'ELEVATED') return { label: 'Elevated', cls: 'bg-[#FFF1F0] text-danger' };
  return { label: 'New', cls: 'bg-[#E8EEFF] text-[#2A4BD7]' };
}

type Tab = 'overview' | 'kyc' | 'disputes' | 'risk';

export default function OpsConsolePage() {
  const [tab, setTab] = useState<Tab>('overview');

  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [kyc, setKyc] = useState<KycQueueRow[] | null>(null);
  const [disputes, setDisputes] = useState<DisputeRow[] | null>(null);
  const [risk, setRisk] = useState<SellerRiskRow[] | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [tierInput, setTierInput] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [statsRes, kycRes, dispRes, riskRes] = await Promise.allSettled([
      getPlatformStats(),
      listKycQueue({ status: 'PENDING', limit: 50 }),
      listDisputes({ status: 'OPEN', limit: 50 }),
      listSellerRisk({ limit: 50 }),
    ]);
    if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    if (kycRes.status === 'fulfilled') setKyc(kycRes.value.kyc);
    if (dispRes.status === 'fulfilled') setDisputes(dispRes.value.disputes);
    if (riskRes.status === 'fulfilled') setRisk(riskRes.value.sellers);
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [load]);

  const refresh = async () => {
    await load();
  };

  const handleKyc = async (userId: string, action: 'APPROVED' | 'REJECTED') => {
    const note = action === 'REJECTED' ? window.prompt('Reason for rejection (required):') : undefined;
    if (action === 'REJECTED' && !note?.trim()) {
      alert('Rejection requires a note');
      return;
    }
    setBusy(userId);
    try {
      await decideKyc(userId, action, note ?? undefined);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update the KYC submission');
    } finally {
      setBusy(null);
    }
  };

  const handleMediate = async (dispute: DisputeRow, decision: 'REFUND' | 'DISMISS') => {
    if (!dispute.return_request_id) {
      alert('This dispute is not linked to a return request');
      return;
    }
    setBusy(dispute.id);
    try {
      await mediateReturn(dispute.return_request_id, decision);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not mediate the dispute');
    } finally {
      setBusy(null);
    }
  };

  const handleSetTier = async (sellerId: string) => {
    const tier = (tierInput[sellerId] ?? '').toUpperCase();
    if (!tier) {
      alert('Choose a tier first');
      return;
    }
    setBusy(sellerId);
    try {
      await setSellerRisk({ seller_id: sellerId, tier, ops_override: true });
      setTierInput((prev) => ({ ...prev, [sellerId]: '' }));
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not set the risk tier');
    } finally {
      setBusy(null);
    }
  };

  const handleRecompute = async () => {
    setBusy('recompute');
    try {
      const res = await recomputeRiskTiers();
      alert(`Recomputed risk tiers for ${res.updated} sellers`);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not recompute risk tiers');
    } finally {
      setBusy(null);
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'kyc', label: 'KYC queue', count: kyc?.length },
    { id: 'disputes', label: 'Open disputes', count: disputes?.length },
    { id: 'risk', label: 'Seller risk' },
  ];

  return (
    <div className="min-h-full bg-surface/70">
      <PageTopBar title="OPS Console" />
      <div className="mx-auto max-w-[960px] px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-4 flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-white p-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${tab === t.id ? 'bg-primary text-white' : 'text-textSecondary hover:bg-surface'}`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === t.id ? 'bg-white/20' : 'bg-danger/10 text-danger'}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <h2 className="text-sm font-extrabold text-text">Platform health</h2>
            {stats == null ? (
              <p className="mt-3 text-xs text-textSecondary">Loading platform stats…</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Sellers', value: String(stats.sellers_total), icon: 'store' as const },
                  { label: 'Orders', value: String(stats.orders_total), icon: 'box' as const },
                  { label: 'GMV', value: fmt(stats.gmv_cents), icon: 'bank' as const },
                  { label: 'Pending KYC', value: String(stats.pending_kyc), icon: 'shield' as const },
                  { label: 'Open disputes', value: String(stats.open_disputes), icon: 'help' as const },
                  { label: 'Pending payouts', value: String(stats.pending_payouts), icon: 'clock' as const },
                  { label: 'Returns (30d)', value: String(stats.returns_30d), icon: 'refresh' as const },
                ].map((card) => (
                  <div key={card.label} className="rounded-2xl border border-border/60 bg-surface/40 p-3.5">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-light text-primary">
                      <Icon name={card.icon} size={15} />
                    </span>
                    <p className="mt-2 text-lg font-black text-text">{card.value}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-textSecondary">{card.label}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'kyc' && (
          <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <h2 className="text-sm font-extrabold text-text">KYC queue — pending submissions</h2>
            {kyc == null ? (
              <p className="mt-3 text-xs text-textSecondary">Loading the queue…</p>
            ) : kyc.length === 0 ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/60 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D6F5E7] text-[#087A38]"><Icon name="check" size={17} /></span>
                <p className="min-w-0 text-xs leading-relaxed text-textSecondary">No sellers waiting for KYC review. Nice work.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {kyc.map((row) => (
                  <li key={row.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-text">{row.full_name}</p>
                      <p className="mt-0.5 text-[11px] text-textSecondary">
                        {row.id_type} · {row.phone ?? 'no phone'} · submitted {new Date(row.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        disabled={busy === row.user_id}
                        onClick={() => handleKyc(row.user_id, 'APPROVED')}
                        className="rounded-lg bg-[#087A38] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#066B30] disabled:opacity-60"
                      >
                        {busy === row.user_id ? '…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={busy === row.user_id}
                        onClick={() => handleKyc(row.user_id, 'REJECTED')}
                        className="rounded-lg border border-danger/20 bg-white px-2.5 py-1.5 text-[10px] font-bold text-danger transition hover:bg-danger/5 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'disputes' && (
          <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <h2 className="text-sm font-extrabold text-text">Open disputes</h2>
            {disputes == null ? (
              <p className="mt-3 text-xs text-textSecondary">Loading disputes…</p>
            ) : disputes.length === 0 ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/60 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#D6F5E7] text-[#087A38]"><Icon name="check" size={17} /></span>
                <p className="min-w-0 text-xs leading-relaxed text-textSecondary">No open disputes right now.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {disputes.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-text">{d.type} dispute</p>
                      <p className="mt-0.5 text-[11px] text-textSecondary">
                        Order {d.order_id.slice(0, 8)} · by {d.opened_by} · {d.reason}
                        {d.return_request_id ? ' · linked to a return' : ''}
                      </p>
                    </div>
                    {d.return_request_id ? (
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={busy === d.id}
                          onClick={() => handleMediate(d, 'REFUND')}
                          className="rounded-lg bg-[#087A38] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#066B30] disabled:opacity-60"
                        >
                          {busy === d.id ? '…' : 'Refund buyer'}
                        </button>
                        <button
                          type="button"
                          disabled={busy === d.id}
                          onClick={() => handleMediate(d, 'DISMISS')}
                          className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[10px] font-bold text-textSecondary transition hover:border-danger/40 hover:text-danger disabled:opacity-60"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-bold text-textSecondary">Not linked</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'risk' && (
          <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-text">Seller risk tiers</h2>
              <button
                type="button"
                disabled={busy === 'recompute'}
                onClick={handleRecompute}
                className="rounded-lg bg-primary-light px-3 py-1.5 text-[11px] font-bold text-primary transition hover:bg-primary/15 disabled:opacity-60"
              >
                {busy === 'recompute' ? 'Recomputing…' : 'Recompute tiers'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-textSecondary">Override a tier to pin it regardless of automated scoring (recommended for powersellers and repeat offenders).</p>
            {risk == null ? (
              <p className="mt-3 text-xs text-textSecondary">Loading risk tiers…</p>
            ) : risk.length === 0 ? (
              <p className="mt-3 text-xs text-textSecondary">No sellers scored yet — hit “Recompute tiers” to build the first risk table.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border/60">
                {risk.map((s) => {
                  const badge = tierBadge(s.tier);
                  return (
                    <li key={s.user_id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-text">
                            {s.full_name}
                            {s.ops_override && <span className="rounded-full bg-[#E8EEFF] px-2 py-0.5 text-[9px] font-bold text-[#2A4BD7]">Override</span>}
                          </p>
                          <p className="mt-0.5 text-[11px] text-textSecondary">
                            On-time {pct(s.on_time_rate_30d)} · disputes {pct(s.dispute_rate_30d)} · QA {pct(s.qa_rate)}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <select
                          value={tierInput[s.user_id] ?? ''}
                          onChange={(e) => setTierInput((prev) => ({ ...prev, [s.user_id]: e.target.value }))}
                          className="rounded-lg border border-border bg-surface/50 px-2.5 py-1.5 text-[11px] font-semibold text-text outline-none focus:border-primary"
                        >
                          <option value="">Override to…</option>
                          <option value="NEW">New</option>
                          <option value="ELEVATED">Elevated</option>
                          <option value="VERIFIED_LOW">Verified low</option>
                        </select>
                        <button
                          type="button"
                          disabled={busy === s.user_id}
                          onClick={() => handleSetTier(s.user_id)}
                          className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-primary-dark disabled:opacity-60"
                        >
                          {busy === s.user_id ? '…' : 'Apply override'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}