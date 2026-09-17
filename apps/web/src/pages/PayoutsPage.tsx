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
import { Icon, type IconName } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';
import { cn } from '../lib/cn';

const fmt = (cents: number) => naira.format(cents / 100);

function statusBadge(s: string) {
  if (s === 'PENDING') return { label: 'Pending review', cls: 'bg-[#FFF6DA] text-[#A36A00]' };
  if (s === 'APPROVED') return { label: 'Approved', cls: 'bg-primary-light text-primary' };
  if (s === 'PROCESSING') return { label: 'Processing', cls: 'bg-[#E8EEFF] text-[#2A4BD7]' };
  if (s === 'SENT') return { label: 'Sent', cls: 'bg-[#D6F5E7] text-[#087A38]' };
  if (s === 'FAILED') return { label: 'Failed', cls: 'bg-danger/10 text-danger' };
  return { label: s, cls: 'bg-gray-100 text-gray-600' };
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

function SectionHeader({
  icon,
  title,
  count,
  action,
}: {
  icon: IconName;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-gray-900">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-light text-primary">
          <Icon name={icon} size={13} />
        </span>
        {title}
        {count != null && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-5 py-8 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gray-100 text-gray-400">
        <Icon name={icon} size={20} />
      </span>
      <p className="mt-3 text-[13px] font-bold text-gray-800">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

const inputCls =
  'mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/10';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-gray-500';

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
          onClick={() => navigate('/seller/products/new')}
          className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
        >
          Set up seller profile
        </button>
      </div>
    );
  }

  const notFullTier = tier !== 'FULL';
  const maxNaira = Math.floor((balance?.available_cents ?? 0) / 100);
  const amountNum = Math.round(Number(amount) * 100);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= (balance?.available_cents ?? 0);
  const canWithdraw = !notFullTier && balance != null && balance.available_cents > 0 && bankAccounts != null && bankAccounts.length > 0;

  const handleWithdraw = async () => {
    if (!amountValid) {
      alert('Enter a withdrawal amount up to your available balance');
      return;
    }
    if (!accountId) {
      alert('Choose a bank account to pay you in to');
      return;
    }
    setBusy(true);
    try {
      await requestPayout({ amount_cents: amountNum, bank_account_id: accountId });
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

  const heroAction = notFullTier
    ? { label: 'Verify to withdraw', onClick: () => navigate('/seller/products/new') }
    : balance && balance.available_cents === 0
      ? { label: 'No balance yet', onClick: undefined as undefined }
      : { label: 'Withdraw funds', onClick: () => setShowWithdraw((v) => !v) };

  return (
    <div className="min-h-full bg-surface/60">
      <PageTopBar title="Payouts" />
      <div className="mx-auto w-full max-w-3xl md:p-0">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#087a38] to-[#16a34a] p-5 text-white shadow-[0_12px_30px_rgba(8,122,56,0.18)] md:rounded-2xl sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -right-2 bottom-0 h-20 w-20 rounded-full bg-white/[0.06]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Available for payout</p>
              <p className="mt-1 truncate text-3xl font-black tracking-tight">
                {balance ? fmt(balance.available_cents) : '—'}
              </p>
              <div className="mt-3 grid grid-cols-3 divide-x divide-white/15 overflow-hidden rounded-xl bg-white/[0.07] py-2.5 text-center">
                <div className="min-w-0 px-1">
                  <p className="truncate text-[9px] font-bold uppercase tracking-wide text-white/60">On hold</p>
                  <p className="mt-0.5 truncate text-[11px] font-bold text-white">{balance ? fmt(balance.on_hold_cents) : '—'}</p>
                </div>
                <div className="min-w-0 px-1">
                  <p className="truncate text-[9px] font-bold uppercase tracking-wide text-white/60">Review</p>
                  <p className="mt-0.5 truncate text-[11px] font-bold text-white">{balance ? fmt(balance.pending_cents) : '—'}</p>
                </div>
                <div className="min-w-0 px-1">
                  <p className="truncate text-[9px] font-bold uppercase tracking-wide text-white/60">Withdrawn</p>
                  <p className="mt-0.5 truncate text-[11px] font-bold text-white">{balance ? fmt(balance.withdrawn_cents) : '—'}</p>
                </div>
              </div>
            </div>
            {heroAction.onClick ? (
              <button
                type="button"
                onClick={heroAction.onClick}
                disabled={busy}
                className={cn(
                  'w-full shrink-0 rounded-xl bg-white px-5 py-3 text-xs font-bold text-primary shadow-sm transition hover:bg-white/90 active:scale-[0.99] sm:w-auto sm:self-end',
                )}
              >
                {heroAction.label}
              </button>
            ) : (
              <span className="w-full shrink-0 rounded-xl bg-white/20 px-5 py-3 text-center text-xs font-bold text-white/70 sm:w-auto sm:self-end">
                {heroAction.label}
              </span>
            )}
          </div>
        </section>

        <div className="space-y-4 px-4 pb-10 pt-4 sm:px-5 md:px-0 md:pb-0 md:pt-4">
          {notFullTier && tier !== undefined && (
            <div className="flex items-start gap-3 rounded-2xl border border-[#FFD9A8] bg-[#FFF6DA] p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#FFE4B8] text-[#A36A00]">
                <Icon name="shield" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold text-[#7A4E00]">Verify your identity to withdraw</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#8A5A00]">
                  Add a government ID to unlock payouts. You can keep earning while your check is pending.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/seller/products/new')}
                  className="mt-2 rounded-lg bg-[#A36A00] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#8A5A00]"
                >
                  Complete verification
                </button>
              </div>
            </div>
          )}

          {showWithdraw && canWithdraw && (
          <section className="rounded-2xl bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-gray-900">Request a withdrawal</h2>
                <p className="mt-0.5 text-[11px] text-gray-500">Money lands in your bank after a short review.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWithdraw(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
                aria-label="Close withdraw"
              >
                <Icon name="close" size={15} />
              </button>
            </div>

            {bankAccounts != null && bankAccounts.length === 0 ? (
              <p className="mt-3 rounded-xl bg-surface/70 px-3 py-3 text-xs text-gray-500">
                Add a bank account below so we know where to pay you.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Amount (₦)
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">₦</span>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className={cn(inputCls, 'pl-8 text-lg font-black tracking-tight')}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[0.25, 0.5, 0.75, 1].map((f) => {
                      const v = Math.max(1, Math.floor(maxNaira * f));
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setAmount(String(v))}
                          className={cn(
                            'rounded-full px-2.5 py-1 text-[10px] font-bold transition',
                            amountNum === v * 100 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                          )}
                        >
                          {f === 1 ? 'Max' : `${Math.round(f * 100)}%`}
                        </button>
                      );
                    })}
                    <span className="ml-auto self-center text-[10px] font-medium text-gray-400">Available {fmt(balance?.available_cents ?? 0)}</span>
                  </div>
                </label>
                <label className={labelCls}>
                  Pay to
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Choose account</option>
                    {(bankAccounts ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_name} · {a.bank_name} · {a.account_number}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end sm:col-span-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleWithdraw}
                    className="w-full rounded-xl bg-primary px-4 py-3 text-[12px] font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? 'Requesting…' : 'Request payout'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <section className="rounded-2xl bg-white p-4 sm:p-5">
          <SectionHeader
            icon="bank"
            title="Bank accounts"
            count={bankAccounts?.length}
            action={
              !notFullTier && (
                <button
                  type="button"
                  onClick={() => setShowBankForm((v) => !v)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-[11px] font-bold transition',
                    showBankForm
                      ? 'border border-gray-200 text-gray-500 hover:bg-gray-50'
                      : 'bg-primary text-white hover:bg-primary/90',
                  )}
                >
                  {showBankForm ? 'Cancel' : '+ Add account'}
                </button>
              )
            }
          />

          {notFullTier ? (
            <p className="mt-3 rounded-xl bg-surface/70 px-3 py-3 text-xs leading-relaxed text-gray-500">
              Complete identity verification to save a payout account — your funds stay safe in escrow meanwhile.
            </p>
          ) : showBankForm ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>
                Bank name
                <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" className={inputCls} />
              </label>
              <label className={labelCls}>
                Bank code (optional)
                <input type="text" value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="e.g. 058" className={inputCls} />
              </label>
              <label className={labelCls}>
                NUBAN account number
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="10 digits"
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Account name
                <input type="text" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Name on the account" className={inputCls} />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={handleAddBank}
                className="rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary/90 disabled:opacity-60 sm:col-span-2 sm:w-fit"
              >
                {busy ? 'Saving…' : 'Save account'}
              </button>
            </div>
          ) : bankAccounts == null ? (
            <EmptyState icon="bank" title="Loading payout accounts…" sub="Pulling in your saved accounts." />
          ) : bankAccounts.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon="bank"
                title="No payout account yet"
                sub="Add one so your balance can be paid into it."
              />
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {bankAccounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3 first:pt-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E8EEFF] text-[#2A4BD7]">
                      <Icon name="bank" size={17} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-gray-900">
                        <span className="truncate">{a.account_name}</span>
                        {a.is_primary && (
                          <span className="rounded-full bg-primary-light px-2 py-0.5 text-[9px] font-bold text-primary">Primary</span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-gray-500">
                        {a.bank_name} · {a.account_number}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {!a.is_primary && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(a.id)}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-gray-500 transition hover:border-primary/40 hover:text-primary"
                      >
                        Make primary
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteBank(a.id)}
                      className="rounded-lg border border-danger/20 bg-white px-2.5 py-1.5 text-[10px] font-bold text-danger transition hover:bg-danger/5"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 sm:p-5">
          <SectionHeader icon="card" title="Withdrawal requests" count={requests?.length} />
          {requests == null ? (
            <div className="mt-3">
              <EmptyState icon="clock" title="Loading requests…" sub="Pulling in your recent withdrawal requests." />
            </div>
          ) : requests.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon="card"
                title="No withdrawal requests"
                sub="When you ask to withdraw, the request and its status will show here."
              />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {requests.map((r) => {
                const badge = statusBadge(r.status);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-black text-gray-900">{fmt(r.amount_cents)}</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-gray-500">
                        {r.bank_account ? `${r.bank_account.bank_name} · ${r.bank_account.account_number}` : 'No account'}
                        <span className="ml-1.5">· {timeAgo(r.requested_at)}</span>
                      </p>
                      {r.review_note && <p className="mt-0.5 text-[11px] text-gray-500">Note: {r.review_note}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 sm:p-5">
          <SectionHeader icon="check" title="Release history" count={ledger?.length} />
          {ledger == null ? (
            <div className="mt-3">
              <EmptyState icon="clock" title="Loading releases…" sub="Pulling in your recent releases." />
            </div>
          ) : ledger.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon="store"
                title="No releases yet"
                sub="Money from completed orders appears here once escrow releases it to you."
              />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {ledger.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-black text-[#087A38]">+{fmt(e.amount_cents)}</p>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-gray-500">
                      Order · {e.order_id.slice(0, 8)}
                      <span className="ml-1.5">· {timeAgo(e.created_at)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#D6F5E7] px-2.5 py-1 text-[10px] font-bold text-[#087A38]">Released</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}