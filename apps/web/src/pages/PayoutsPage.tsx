import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import { PageTopBar } from '../components/PageTopBar';

/**
 * Payout records are not exposed by the API yet. This is deliberately a
 * transparent seller zero-state rather than inventing an account balance.
 */
export default function PayoutsPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-full bg-surface/70">
      <PageTopBar title="Payouts" />
      <div className="mx-auto max-w-[960px] px-4 py-5 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#087a38] to-[#16a34a] p-5 text-white shadow-[0_12px_30px_rgba(8,122,56,0.2)] sm:p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/75">Available for payout</p>
          <p className="mt-1 text-3xl font-black tracking-tight">₦0.00</p>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-white/80">Completed orders are released after delivery confirmation and appear here when payout records are available.</p>
          <button type="button" disabled className="mt-5 rounded-xl bg-white/20 px-4 py-2.5 text-xs font-bold text-white opacity-70">Withdraw funds</button>
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-light text-primary"><Icon name="shield" size={19} /></span>
            <div><h2 className="text-sm font-extrabold text-text">Your payouts are protected</h2><p className="mt-0.5 text-xs text-textSecondary">Funds are released from escrow after delivery is confirmed.</p></div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-border bg-white p-5 text-center sm:p-8">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface text-textSecondary"><Icon name="bank" size={22} /></span>
          <h2 className="mt-3 text-sm font-extrabold text-text">No payouts yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-textSecondary">When an eligible sale is released, its amount and destination account will be shown here.</p>
          <button type="button" onClick={() => navigate('/offers/new')} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition hover:bg-primary-dark">Create an offer</button>
        </section>
      </div>
    </div>
  );
}
