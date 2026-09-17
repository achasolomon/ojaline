import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  getNegotiations,
  subscribeNegotiations,
  type Negotiation,
} from '../lib/negotiation';
import { useMediaQuery, DESKTOP_BREAKPOINT } from '../lib/useMediaQuery';
import { NegotiationDetail } from '../components/NegotiationDetail';
import { Icon } from '../components/icons';

const fmt = (kobo: number) => naira.format(kobo / 100);

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const STATUS_PRIORITY: Record<Negotiation['status'], number> = { OPEN: 0, ENDED: 1, REVOKED: 2, SETTLED: 3 };

function productName(n: Negotiation): string {
  return n.basis.type === 'OFFER' ? n.basis.offer.product_name : n.basis.offer_ref.product_name;
}

function lastSellerPrice(n: Negotiation): number | null {
  const m = [...n.messages].reverse().find((x) => x.side === 'SELLER');
  return m?.per_unit_kobo ?? null;
}

function StatusChip({ n }: { n: Negotiation }) {
  if (n.status === 'SETTLED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-bold text-primary">
        <Icon name="check" size={10} /> Settled
      </span>
    );
  }
  if (n.status === 'REVOKED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0EC] px-2 py-0.5 text-[10px] font-bold text-[#8F3A2B]">
        <Icon name="trash" size={10} /> Revoked
      </span>
    );
  }
  if (n.status === 'ENDED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF6DA] px-2 py-0.5 text-[10px] font-bold text-[#8A5F00]">
        Price frozen
      </span>
    );
  }
  const last = n.messages[n.messages.length - 1];
  const waiting = last?.side === 'BUYER';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        waiting ? 'bg-[#FFF6DA] text-[#A36A00]' : 'bg-secondary/25 text-primary-dark'
      }`}
    >
      <Icon name={waiting ? 'clock' : 'handshake'} size={10} />
      {waiting ? 'Waiting reply' : 'Bargaining'}
    </span>
  );
}

export default function NegotiationsPage({ base = '/negotiations' }: { base?: string }) {
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const [items, setItems] = useState<Negotiation[]>(() => getNegotiations());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const off = subscribeNegotiations(setItems);
    return off;
  }, []);

  const sorted = [...items]
    .filter((n) => !n.draft)
    .sort((a, b) => {
      const p = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (p !== 0) return p;
      return b.updated_at.localeCompare(a.updated_at);
    });

  const activeCount = items.filter((n) => !n.draft && n.status === 'OPEN').length;
  const selected = sorted.find((n) => n.id === selectedId) ?? sorted[0] ?? null;

  const openThread = (n: Negotiation) => {
    if (isDesktop) setSelectedId(n.id);
    else navigate(`${base}/${n.id}`);
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary-light text-primary">
        <Icon name="handshake" size={26} />
      </div>
      <p className="text-sm font-bold text-text">You no dey bargain anyone now</p>
      <p className="mt-1 text-xs text-textSecondary">
        Open any offer, bod da price button and start bargaining with the seller.
      </p>
      <Link
        to="/offers"
        className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-primary-dark"
      >
        Find something to bargain
      </Link>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-white lg:mx-auto lg:w-full lg:max-w-[1200px] lg:px-6 lg:py-6">
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-stretch lg:gap-5">
        {/* Left pane: negotiations list */}
        <div className="flex min-h-0 flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-white">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
            <button type="button" onClick={() => navigate(-1)} className="p-1 lg:hidden">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="flex-1 text-lg font-semibold text-text">Bargaining</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-[10px] font-bold text-primary">
              <Icon name="handshake" size={12} />
              {activeCount} active
            </span>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {sorted.length === 0 ? (
              emptyState
            ) : (
              <div className="mx-auto max-w-2xl lg:max-w-none">
                {sorted.map((n) => {
                  const waiting = n.status === 'OPEN' && n.messages[n.messages.length - 1]?.side === 'BUYER';
                  const lastMsg = n.messages[n.messages.length - 1];
                  const price = lastSellerPrice(n);
                  const isActive = isDesktop && selected?.id === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openThread(n)}
                      className={`flex w-full items-center gap-3 border-b border-border bg-white px-4 py-3 text-left transition ${
                        isActive ? 'bg-primary-light/30' : 'hover:bg-surface'
                      }`}
                    >
                      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
                        <Icon name="handshake" size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-text">{productName(n)}</span>
                          <span className="shrink-0 text-[11px] text-textSecondary">{timeAgo(n.updated_at)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-textSecondary">
                            {waiting
                              ? `Waiting for ${n.seller.name.split(' ')[0]} to reply…`
                              : lastMsg?.message ?? `Chatting with ${n.seller.name}`}
                          </span>
                          <StatusChip n={n} />
                        </span>
                        {price != null && (
                          <span className="mt-1 block text-[11px] font-bold text-primary">
                            Last offer: {fmt(price)} each
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right pane (desktop): detail view */}
        <div className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white lg:flex">
          {selected ? (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-text">{productName(selected)}</h2>
                  <p className="truncate text-[11px] font-medium text-textSecondary">
                    {selected.seller.name}
                    {selected.seller.market_name ? ` · ${selected.seller.market_name}` : ''}
                  </p>
                </div>
                <StatusChip n={selected} />
                {selected.status === 'SETTLED' && (
                  <Link
                    to="/cart"
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-bold text-primary-dark"
                  >
                    <Icon name="cart" size={13} /> View cart
                  </Link>
                )}
              </header>
              <NegotiationDetail negotiation={selected} onRestarted={(fresh) => setSelectedId(fresh.id)} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
                <Icon name="handshake" size={24} />
              </span>
              <p className="mt-3 text-sm font-bold text-text">No bargain wey dey</p>
              <p className="mt-1 text-[11px] text-textSecondary">
                Open any offer, bod da price button and start bargaining with the seller.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}