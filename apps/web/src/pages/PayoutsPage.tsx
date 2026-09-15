import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  addBankAccount,
  deleteBankAccount,
  getBankAccounts,
  getPayoutBalance,
  getPayoutLedger,
  getPayoutRequests,
  getSellerStatus,
  requestPayout,
  setPrimaryBankAccount,
  type PayoutBalance,
  type PayoutLedgerEntry,
  type PayoutRequestRecord,
  type SellerBankAccount,
} from '../lib/api';
import { getUser } from '../lib/session';
import { Icon } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';

const fmt = (cents: number) => naira.format(cents / 100);

function statusBadge(s: string) {
  if (s === 'PENDING') return { label: 'Pending review', cls: 'bg-[#FFF6DA] text-[#A36A00]' };
  if (s === 'APPROVED') return { label: 'Approved', cls: 'bg-primary-light text-primary' };
  if (s === 'PROCESSING') return { label: 'Processing', cls: 'bg-[#E8EEFF] text-[#2A4BD7]' };
  if (s === 'SENT') return { label: 'Sent', cls: 'bg-[#D6F5E7] text-[#087A38]' };
  if (s === 'FAILED') return { label: 'Failed', cls: 'bg-danger/10 text-danger' };
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

export default function PayoutsPage() {
  const navigate = useNavigate();
  const user = getUser();
  const isSeller = Boolean(user?.seller_type);

  const [tier, setTier] = useState<string | null | undefined>(undefined);
  const [balance, setBalance] = useState<PayoutBalance | null>(null);
  const [ledger, setLedger] = useState<PayoutLedgerEntry[] | null>(null);
  const [requests, setRequests] = useState<PayoutRequestRecord[] | null>(null);
  const [bankAccounts, setBankAccounts] = useState<SellerBankAccount[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');

  const [showBankForm, setShowBankForm] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  const load = useCallback(async () => {
    const [tierRes, balRes, reqRes, ledgerRes, bankRes] = await Promise.allSettled([
      getSellerStatus(),
      getPayoutBalance(),
      getPayoutRequests({ limit: 20 }),
      getPayoutLedger({ limit: 20 }),
      getBankAccounts(),
    ]);
    if (tierRes.status === 'fulfilled') setTier(tierRes.value.kyc_tier);
    if (balRes.status === 'fulfilled') setBalance(balRes.value);
    if (reqRes.status === 'fulfilled') setRequests(reqRes.value.requests);
    if (ledgerRes.status === 'fulfilled') setLedger(ledgerRes.value.entries);
    if (bankRes.status === 'fulfilled') setBankAccounts(bankRes.value);
  }, []);

  useEffect(() => {
    if (!isSeller) return;
    void load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [isSeller, load]);

  if (!isSeller) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
          <Icon name="store" size={24} />
        </span>
        <p className="mt-3 text-sm font-bold text-text">You're not registered as a seller</p>
        <p className="mt-1 text-xs text-textSecondary">Register a seller profile to start earning and receiving payouts.</p>
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

  const notFullTier = tier !== 'FULL';

  const handleWithdraw = async () => {
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      alert('Enter a withdrawal amount');
      return;
    }
    if (!accountId) {
      alert('Choose a bank account to pay you in to');
      return;
    }
    setBusy(true);
    try {
      await requestPayout({ amount_cents: amountCents, bank_account_id: accountId });
      setShowWithdraw(false);
      setAmount('');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not request a withdrawal');
    } finally {
      setBusy(false);
    }
  };

  const handleAddBank = async () => {
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      alert('Fill in the bank name, account number and account name');
      return;
    }
    setBusy(true);
    try {
      const account = await addBankAccount({
        bank_code: bankCode.trim() || '000',
        bank_name: bankName.trim(),
        account_number: accountNumber.trim(),
        account_name: accountHolder.trim(),
      });
      setAccountId(account.id);
      setShowBankForm(false);
      setBankName('');
      setBankCode('');
      setAccountNumber('');
      setAccountHolder('');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the bank account');
    } finally {
      setBusy(false);
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      await setPrimaryBankAccount(id);
      await load();
    } catch {
      /* keep current selection */
    }
  };

  const handleDeleteBank = async (id: string) => {
    if (!window.confirm('Remove this bank account?')) return;
    try {
      await deleteBankAccount(id);
      if (accountId === id) setAccountId('');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not remove the bank account');
    }
  };

  const withdrawEnabled = !notFullTier && balance != null && balance.available_cents > 0 && bankAccounts != null && bankAccounts.length > 0;

  return (
    <div className="min-h-full bg-surface/70">
      <PageTopBar title="Payouts" />
      <div className="mx-auto max-w-[960px] px-4 py-5 sm:px-6 sm:py-8">
        {notFullTier && tier !== undefined && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#FFD9A8] bg-[#FFF6DA] p-3.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#FFE4B8] text-[#A36A00]"><Icon name="shield" size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-[#7A4E00]">Verify your identity to withdraw</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#8A5A00]">Add a government ID to unlock payouts. You can keep earning and building your store while your check is pending.</p>
              <button
                type="button"
                onClick={() => navigate('/offers/new')}
                className="mt-2 rounded-lg bg-[#A36A00] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#8A5A00]"
              >
                Complete verification
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#087a38] to-[#16a34a] p-5 text-white shadow-[0_12px_30px_rgba(8,122,56,0.2)] sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Available for payout</p>
              <p className="mt-1 text-3xl font-black tracking-tight">{balance ? fmt(balance.available_cents) : '—'}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] font-medium text-white/80">
                <span>On hold: <span className="font-bold text-white">{balance ? fmt(balance.on_hold_cents) : '—'}</span></span>
                <span>Pending review: <span className="font-bold text-white">{balance ? fmt(balance.pending_cents) : '—'}</span></span>
                <span>Withdrawn to date: <span className="font-bold text-white">{balance ? fmt(balance.withdrawn_cents) : '—'}</span></span>
              </div>
            </div>
            <button
              type="button"
              disabled={!withdrawEnabled || busy}
              onClick={() => setShowWithdraw((v) => !v)}
              className="shrink-0 rounded-xl bg-white/20 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-white/30 disabled:opacity-60"
            >
              {balance && balance.available_cents === 0 ? 'No balance yet' : 'Withdraw funds'}
            </button>
          </div>
          <p className="mt-4 max-w-md text-xs leading-relaxed text-white/80">Completed orders are released after delivery confirmation, minus the platform commission, and appear here once the 24-hour hold clears.</p>
        </div>

        {showWithdraw && (
          <div className="mt-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
            <h2 className="text-sm font-extrabold text-text">Request a withdrawal</h2>
            {bankAccounts != null && bankAccounts.length === 0 ? (
              <p className="mt-3 text-xs text-textSecondary">Add a bank account below so we know where to pay you.</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-bold text-textSecondary">
                  Amount (₦)
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 25000"
                    className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary"
                  />
                </label>
                <label className="block text-xs font-bold text-textSecondary">
                  Pay to
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary"
                  >
                    <option value="">Choose account</option>
                    {(bankAccounts ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_name} · {a.bank_name} · {a.account_number}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleWithdraw}
                    className="w-full rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition hover:bg-primary-dark disabled:opacity-60 sm:w-auto"
                  >
                    {busy ? 'Requesting…' : 'Request payout'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <section className="mt-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold text-text">Bank accounts</h2>
            <button
              type="button"
              onClick={() => setShowBankForm((v) => !v)}
              className="rounded-lg bg-primary-light px-3 py-1.5 text-[11px] font-bold text-primary transition hover:bg-primary/15"
            >
              {showBankForm ? 'Cancel' : '+ Add account'}
            </button>
          </div>

          {notFullTier ? (
            <p className="mt-3 text-xs text-textSecondary">Complete identity verification to save a payout account — your funds stay safe in escrow meanwhile.</p>
          ) : showBankForm ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-textSecondary">
                Bank name
                <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary" />
              </label>
              <label className="block text-xs font-bold text-textSecondary">
                Bank code (optional)
                <input type="text" value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="e.g. 058" className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary" />
              </label>
              <label className="block text-xs font-bold text-textSecondary">
                NUBAN account number
                <input type="text" inputMode="numeric" maxLength={10} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="10 digits" className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary" />
              </label>
              <label className="block text-xs font-bold text-textSecondary">
                Account name
                <input type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Name on the account" className="mt-1 w-full rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-sm font-semibold text-text outline-none transition focus:border-primary" />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleAddBank}
                  className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition hover:bg-primary-dark disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Save account'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {bankAccounts == null ? (
                <p className="mt-3 text-xs text-textSecondary">Loading your payout accounts…</p>
              ) : bankAccounts.length === 0 ? (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/60 p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-textSecondary"><Icon name="bank" size={17} /></span>
                  <p className="min-w-0 text-xs leading-relaxed text-textSecondary">No payout account yet — add one so your balance can be paid into it.</p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {bankAccounts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-surface/40 p-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-text">
                          {a.account_name}
                          {a.is_primary && <span className="rounded-full bg-primary-light px-2 py-0.5 text-[9px] font-bold text-primary">Primary</span>}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-textSecondary">{a.bank_name} · {a.account_number}</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {!a.is_primary && (
                          <button type="button" onClick={() => handleSetPrimary(a.id)} className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[10px] font-bold text-textSecondary transition hover:border-primary/40 hover:text-primary">
                            Make primary
                          </button>
                        )}
                        <button type="button" onClick={() => handleDeleteBank(a.id)} className="rounded-lg border border-danger/20 bg-white px-2.5 py-1.5 text-[10px] font-bold text-danger transition hover:bg-danger/5">
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
          <h2 className="text-sm font-extrabold text-text">Withdrawal requests</h2>
          {requests == null ? (
            <p className="mt-3 text-xs text-textSecondary">Loading your requests…</p>
          ) : requests.length === 0 ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/60 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-textSecondary"><Icon name="bank" size={17} /></span>
              <p className="min-w-0 text-xs leading-relaxed text-textSecondary">When you ask to withdraw, the request and its status will show here.</p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {requests.map((r) => {
                const badge = statusBadge(r.status);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-text">{fmt(r.amount_cents)}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-textSecondary">
                        {r.bank_account ? `${r.bank_account.bank_name} · ${r.bank_account.account_number}` : 'No account'}
                        <span className="ml-1.5">· {timeAgo(r.requested_at)}</span>
                      </p>
                      {r.review_note && <p className="mt-0.5 text-[11px] text-textSecondary">Note: {r.review_note}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
          <h2 className="text-sm font-extrabold text-text">Release history</h2>
          {ledger == null ? (
            <p className="mt-3 text-xs text-textSecondary">Loading your releases…</p>
          ) : ledger.length === 0 ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/60 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-textSecondary"><Icon name="store" size={17} /></span>
              <p className="min-w-0 text-xs leading-relaxed text-textSecondary">Money from completed orders appears here once escrow releases it to you.</p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {ledger.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-text">{fmt(e.amount_cents)}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-textSecondary">
                      Order · {e.order_id.slice(0, 8)}
                      <span className="ml-1.5">· {timeAgo(e.created_at)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#D6F5E7] px-2 py-1 text-[10px] font-bold text-[#087A38]">Released</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}