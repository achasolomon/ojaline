import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ensureLoaded,
  findNegotiationById,
  subscribeNegotiations,
  negotiationDeepLink,
  type Negotiation,
} from '../lib/negotiation';
import { NegotiationDetail } from '../components/NegotiationDetail';
import { Icon } from '../components/icons';

export default function NegotiationPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [neg, setNeg] = useState<Negotiation | undefined>(() => (id ? findNegotiationById(id) : undefined));
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    ensureLoaded()
      .then(() => {
        if (cancelled) return;
        const n = findNegotiationById(id);
        if (!n) setNotFound(true);
        else setNeg(n);
      })
      .catch(() => {});
    const off = subscribeNegotiations((items) => {
      const n = items.find((x) => x.id === id);
      if (n) setNeg(n);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [id]);

  const title = neg ? (neg.basis.type === 'OFFER' ? neg.basis.offer.product_name : neg.basis.offer_ref.product_name) : null;

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="p-1">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-text">{title ?? 'Haggling'}</h1>
          {neg && (
            <p className="truncate text-[11px] font-medium text-textSecondary">
              {neg.seller.name}
              {neg.seller.market_name ? ` · ${neg.seller.market_name}` : ''}
            </p>
          )}
        </div>
        {neg && neg.status === 'SETTLED' && (
          <Link
            to="/cart"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-bold text-primary-dark"
          >
            <Icon name="cart" size={13} /> View cart
          </Link>
        )}
      </header>

      {notFound ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface text-textSecondary">
            <Icon name="box" size={22} />
          </span>
          <p className="mt-3 text-sm font-bold text-text">This bargain no dey again</p>
          <p className="mt-1 text-xs text-textSecondary">
            E fit don finish or the item don sell. Go check the market for fresh ones.
          </p>
          <Link
            to="/offers"
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-[12px] font-bold text-white transition hover:bg-primary-dark"
          >
            Bounce to offers
          </Link>
        </div>
      ) : neg ? (
        <NegotiationDetail negotiation={neg} onRestarted={(fresh) => navigate(negotiationDeepLink(fresh), { replace: true })} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs font-medium text-textSecondary">Stand gbadun dey load…</p>
        </div>
      )}
    </div>
  );
}