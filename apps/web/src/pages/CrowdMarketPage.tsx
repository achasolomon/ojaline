import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { naira } from '@ojaline/design';
import {
  getRequests,
  makeCrowdRequest,
  openSellerChat,
  sellerLabel,
  subscribeRequests,
  type CrowdBidder,
  type CrowdRequest,
} from '../lib/crowd';
import {
  subscribeNegotiations,
  findRequestNegotiation,
  type Negotiation,
} from '../lib/negotiation';
import { getOfferById } from '../lib/api';
import { addToCart } from '../lib/cart';
import { pluralUnit } from '../lib/bargain';
import { NegotiationChat } from '../components/NegotiationChat';
import { Icon } from '../components/icons';

const fmt = (kobo: number) => naira.format(kobo / 100);

const UNIT_OPTIONS = ['basket', 'crate', 'bag', 'bunch', 'measure', 'bottle', 'kg'];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function statusOf(negotiation?: Negotiation): { label: string; cls: string } | null {
  if (negotiation?.status === 'ENDED') return { label: 'Price frozen', cls: 'bg-[#FFF6DA] text-[#8A5F00]' };
  if (negotiation?.status === 'SETTLED') return { label: 'You settle with this seller', cls: 'bg-primary-light text-primary' };
  if (negotiation?.status === 'REVOKED') return { label: 'Deal removed', cls: 'bg-[#FFF0EC] text-[#8F3A2B]' };
  return null;
}

function BiddingCard({
  request,
  bidder,
  index,
  negotiation,
  expanded,
  onToggle,
  onSelect,
  desktop,
}: {
  request: CrowdRequest;
  bidder: CrowdBidder;
  index: number;
  negotiation?: Negotiation;
  expanded: boolean;
  onToggle: () => void;
  onSelect?: (bidder: CrowdBidder) => void;
  desktop?: boolean;
}) {
  const settled = negotiation?.status === 'SETTLED';
  const fitsBudget = request.ceiling_kobo != null && bidder.quote_total_kobo <= request.ceiling_kobo;
  const statusBadge = statusOf(negotiation);
  const faded = !settled && request.bidders.length > 1 && requestHasSettled(request);

  return (
    <div
      className={`animate-fade-in overflow-hidden rounded-2xl border bg-white transition ${
        settled ? 'border-primary' : faded ? 'border-border opacity-55' : 'border-border'
      }`}
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-black text-white">
          {initials(bidder.seller_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-bold text-text">{sellerLabel(bidder.channel, bidder.seller_name)}</p>
            {statusBadge && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
            )}
          </div>
          <p className="truncate text-[10px] font-medium text-textSecondary">
            <Icon name="map" size={10} className="mr-0.5 inline" />
            {bidder.market_name ?? 'Oja'} · Stall {bidder.stall_number ?? '—'}
            {bidder.rating != null && (
              <span className="ml-1.5 text-[#B8860B]">
                ★ {Number(bidder.rating).toFixed(1)} ({bidder.review_count})
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-[16px] font-black leading-none ${fitsBudget && !settled ? 'text-primary' : 'text-text'}`}>
            {fmt(bidder.quote_total_kobo)}
          </p>
          <p className="text-[10px] font-medium text-textSecondary">{fmt(bidder.quote_per_unit_kobo)}/each</p>
        </div>
      </div>

      <div className="border-t border-border/60 bg-surface/30 px-4 py-2">
        <p className="text-[11px] italic leading-snug text-textSecondary">"{bidder.pitch}"</p>
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5">
        {fitsBudget && !settled && (
          <span className="rounded-full bg-primary-light px-2 py-0.5 text-[9px] font-bold text-primary">Fits your budget</span>
        )}
        <span className="flex-1" />
        {desktop ? (
          <button
            type="button"
            onClick={() => onSelect?.(bidder)}
            className={`flex h-9 items-center gap-1 rounded-lg px-3 text-[12px] font-bold transition ${
              desktop ? 'bg-secondary text-primary-dark' : 'bg-primary text-white hover:bg-primary-dark'
            }`}
          >
            {desktop ? 'Chatting' : 'View bid'} <Icon name="chevronRight" size={13} />
          </button>
        ) : (
          !settled && (
            <button
              type="button"
              onClick={onToggle}
              className={`relative flex h-9 items-center gap-1 rounded-lg px-3 text-[12px] font-bold transition ${
                expanded ? 'bg-secondary text-primary-dark' : 'bg-primary text-white hover:bg-primary-dark'
              }`}
            >
              <Icon name="message" size={13} /> {expanded ? 'Close' : 'Bargain'}
            </button>
          )
        )}
      </div>

      {!desktop && expanded && negotiation && (
        <div className="h-[320px] border-t border-border">
          <NegotiationChat
            negotiation={negotiation}
            onSettle={(q, perUnit) => openSettleFromCard(request, negotiation, q, perUnit)}
          />
        </div>
      )}
    </div>
  );
}

function requestHasSettled(request: CrowdRequest): boolean {
  return request.bidders.some((b) => findRequestNegotiation(request.id, b.seller_id)?.status === 'SETTLED');
}

function openSettleFromCard(
  request: CrowdRequest,
  negotiation: Negotiation,
  q: number,
  perUnit: number,
): void {
  const bidder = request.bidders.find((b) => b.seller_id === negotiation.seller.id);
  if (bidder) void addSettledToCart(bidder, negotiation, q, perUnit);
}

async function addSettledToCart(
  bidder: CrowdBidder,
  negotiation: Negotiation,
  q: number,
  perUnit: number,
): Promise<void> {
  try {
    const offer = await getOfferById(bidder.offer_id);
    addToCart(offer, q, perUnit, undefined, negotiation.draft ? null : negotiation.id);
  } catch {
    /* cart add is best-effort */
  }
}

export function CrowdMarketPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<CrowdRequest[]>(() => getRequests());
  const [, setNegoVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ requestId: string; sellerId: string } | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState(3);
  const [unit, setUnit] = useState('basket');
  const [unitCustom, setUnitCustom] = useState('');
  const [budget, setBudget] = useState('');
  const [note, setNote] = useState('');

  // New-bid arrive toast (mobile): only fires after the initial snapshot.
  const seenBids = useRef<Record<string, string[]>>({});
  const primedBids = useRef(false);
  const [bidToast, setBidToast] = useState<{ key: string; text: string } | null>(null);
  const bidToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const offR = subscribeRequests((items) => {
      setRequests(items);
      if (!primedBids.current) {
        for (const r of items) seenBids.current[r.id] = r.bidders.map((b) => b.id);
        primedBids.current = true;
        return;
      }
      for (const r of items) {
        const prev = seenBids.current[r.id] ?? [];
        const now = r.bidders.map((b) => b.id);
        const fresh = now.filter((id) => !prev.includes(id));
        if (fresh.length > 0) {
          seenBids.current[r.id] = now;
          const b = r.bidders.find((x) => x.id === fresh[0]);
          const who = b ? sellerLabel(b.channel, b.seller_name) : 'A seller';
          setBidToast({
            key: `${r.id}:${fresh.join(',')}:${Date.now()}`,
            text: `${who} don bring price for "${r.product_name}" · ${r.bidders.length} sellers dey come`,
          });
          if (bidToastTimer.current) clearTimeout(bidToastTimer.current);
          bidToastTimer.current = setTimeout(() => setBidToast(null), 6000);
        }
      }
    });
    const offN = subscribeNegotiations(() => setNegoVersion((v) => v + 1));
    return () => {
      offR();
      offN();
      if (bidToastTimer.current) clearTimeout(bidToastTimer.current);
    };
  }, []);

  const activeRequest = dismissedId && requests[0]?.id === dismissedId ? undefined : requests[0];

  const settledSellerName = (() => {
    if (!activeRequest) return null;
    for (const b of activeRequest.bidders) {
      const n = findRequestNegotiation(activeRequest.id, b.seller_id);
      if (n?.status === 'SETTLED') return sellerLabel(b.channel, b.seller_name);
    }
    return null;
  })();

  const selectedNeg = selected ? findRequestNegotiation(selected.requestId, selected.sellerId) : undefined;
  const selectedBidder = selected
    ? requests
        .find((r) => r.id === selected.requestId)
        ?.bidders.find((b) => b.seller_id === selected.sellerId)
    : undefined;

  const finalUnit = unit === 'custom' ? unitCustom.trim() : unit;

  const submit = async () => {
    const name = productName.trim();
    if (!name || qty < 1) return;
    setLoading(true);
    try {
      await makeCrowdRequest({
        product_name: name,
        qty,
        unit: finalUnit || null,
        ceiling_kobo: budget.trim() ? Math.round(Number(budget.replace(/[^0-9]/g, '')) * 100) : null,
        note,
      });
      setProductName('');
      setNote('');
      setBudget('');
      setExpanded({});
      setSelected(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleChat = (req: CrowdRequest, bidder: CrowdBidder) => {
    setExpanded((prev) => {
      const key = `${req.id}:${bidder.seller_id}`;
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      openSellerChat(req, bidder, 'customer').catch(() => {});
      return { ...prev, [key]: true };
    });
  };

  const selectBidder = (req: CrowdRequest, bidder: CrowdBidder) => {
    setSelected({ requestId: req.id, sellerId: bidder.seller_id });
    if (!findRequestNegotiation(req.id, bidder.seller_id)) {
      openSellerChat(req, bidder, 'customer').catch(() => {});
    }
  };

  const settleWith = async (bidder: CrowdBidder, q: number, perUnit: number) => {
    try {
      const offer = await getOfferById(bidder.offer_id);
      const thread = requests
        .map((r) => findRequestNegotiation(r.id, bidder.seller_id))
        .find((n): n is Negotiation => Boolean(n));
      addToCart(offer, q, perUnit, undefined, thread && !thread.draft ? thread.id : null);
    } catch {
      /* cart add is best-effort */
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6 lg:py-8">
      {/* Crowd Market banner */}
      <section className="relative mb-6 overflow-hidden rounded-[14px] bg-gradient-to-br from-[#056e31] via-[#07883f] to-[#79aa76] text-white">
        <img
          src="/api/media/banner-market-day.jpeg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#056e31] via-[#07883f]/75 to-transparent" />
        <button
          type="button"
          onClick={() => document.getElementById('crowd-body')?.scrollIntoView({ behavior: 'smooth' })}
          className="relative z-[2] flex w-full items-center gap-3 px-5 py-4 text-left cursor-pointer lg:hidden"
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
            <Icon name="megaphone" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-extrabold uppercase tracking-[1px] text-white/80">Crowd market</span>
            <span className="mt-0.5 block text-[13px] font-bold leading-snug text-white">
              Nothing no fit you? Post am — make sellers fight for your order.
            </span>
          </span>
          <Icon name="chevronRight" size={18} className="shrink-0 text-white/80" />
        </button>

        <div className="relative z-[2] hidden px-10 py-10 lg:block">
          <span className="inline-block rounded-[5px] bg-white/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[1px]">
            Post a want
          </span>
          <h1 className="mt-3 max-w-[460px] text-[26px] font-extrabold leading-[1.12] tracking-tight sm:text-[32px]">
            Nothing no fit you? Make market sellers fight for your money
          </h1>
          <p className="mt-2.5 max-w-[430px] text-[13px] leading-relaxed text-[#e9f7ed]">
            Shout wetin you need — sellers wey get am go pitch with price. Check their location, ratings and price,
            fit bargain, walk away — and dem fit call you back with better price.
          </p>
        </div>
      </section>

      {loading && (
        <div className="mx-auto mb-6 max-w-[560px] rounded-2xl border border-border bg-white px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:140ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:280ms]" />
          </div>
          <p className="mt-3 text-[13px] font-bold text-text">Sellers dey rush for your money o…</p>
          <p className="text-[11px] text-textSecondary">Market dey gather the best prices for you.</p>
        </div>
      )}

      <div id="crowd-body" className="scroll-mt-4">
      {!loading && !activeRequest && (
        <form
          className="mx-auto max-w-[560px] rounded-2xl border border-border bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold text-text">What you wan buy</span>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. 7 baskets of Jaji yam"
              className="h-11 w-full rounded-xl border border-border px-3 text-sm font-medium text-text outline-none transition focus:border-primary"
            />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-text">How many</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Less"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-border text-primary transition disabled:opacity-30"
                >
                  <Icon name="minus" size={14} />
                </button>
                <span className="min-w-[40px] text-center text-lg font-black text-text">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => q + 1)}
                  aria-label="More"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-border text-primary transition"
                >
                  <Icon name="plus" size={14} />
                </button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-text">Unit</span>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-2 text-sm font-medium text-text outline-none transition focus:border-primary"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
                <option value="custom">Other…</option>
              </select>
            </label>
          </div>

          {unit === 'custom' && (
            <input
              value={unitCustom}
              onChange={(e) => setUnitCustom(e.target.value)}
              placeholder="e.g. trailer, measure, cup"
              className="mt-3 h-11 w-full rounded-xl border border-border px-3 text-sm font-medium text-text outline-none transition focus:border-primary"
            />
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-text">Your total budget (₦, optional)</span>
              <input
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 150,000"
                className="h-11 w-full rounded-xl border border-border px-3 text-sm font-medium text-text outline-none transition focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-text">Note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. fresh one, comot oja"
                className="h-11 w-full rounded-xl border border-border px-3 text-sm font-medium text-text outline-none transition focus:border-primary"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={!productName.trim() || qty < 1 || (unit === 'custom' && !unitCustom.trim())}
            className="mt-5 h-12 w-full rounded-xl bg-green-700 text-sm font-bold text-white transition hover:bg-green-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Make I « request » · {qty} {pluralUnit(finalUnit || 'unit', qty)}
          </button>
        </form>
      )}

      {activeRequest && !loading && (
        <div className="lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-5">
          {/* Left pane: request details + bidding sellers */}
          <div className="mx-auto max-w-[720px] lg:max-w-none">
            {/* Request summary */}
            <div className="mb-4 rounded-2xl bg-gradient-to-r from-primary to-primary-dark px-4 py-4 text-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Your want</p>
                  <p className="text-[17px] font-black">
                    {activeRequest.qty} {pluralUnit(activeRequest.unit ?? 'unit', activeRequest.qty)} of{' '}
                    {activeRequest.product_name}
                  </p>
                  {activeRequest.ceiling_kobo != null && (
                    <p className="text-[11px] font-medium text-white/80">
                      budget {fmt(activeRequest.ceiling_kobo)} {activeRequest.note && `· ${activeRequest.note}`}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white">
                  {activeRequest.bidders.length} seller{activeRequest.bidders.length === 1 ? '' : 's'} dey come
                </span>
              </div>
            </div>

            {settledSellerName && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-primary bg-primary-light px-4 py-3">
                <p className="text-[12px] font-bold text-primary">
                  <Icon name="check" size={14} className="mr-1 inline" />
                  You settle with {settledSellerName} — market done!
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/cart')}
                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white hover:bg-primary-dark"
                >
                  View cart
                </button>
              </div>
            )}

            {/* Bidders */}
            <div id="bids-list" className="space-y-3">
              {activeRequest.bidders.map((b, i) => {
                const neg = findRequestNegotiation(activeRequest.id, b.seller_id);
                const key = `${activeRequest.id}:${b.seller_id}`;
                return (
                  <BiddingCard
                    key={key}
                    request={activeRequest}
                    bidder={b}
                    index={i}
                    negotiation={neg}
                    expanded={!!expanded[key]}
                    onToggle={() => toggleChat(activeRequest, b)}
                    onSelect={() => selectBidder(activeRequest, b)}
                    desktop={selected?.requestId === activeRequest.id && selected.sellerId === b.seller_id}
                  />
                );
              })}
            </div>

            {activeRequest.bidders.length === 0 && (
              <div className="rounded-2xl border border-border bg-white p-8 text-center">
                <Icon name="basket" size={28} className="mx-auto mb-3 text-textSecondary" />
                <p className="text-[13px] font-bold text-text">No seller wey fit this one today</p>
                <p className="mt-1 text-[11px] text-textSecondary">Try different produce name or check again later.</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (activeRequest) setDismissedId(activeRequest.id);
                setExpanded({});
                setSelected(null);
              }}
              className="mt-5 w-full rounded-xl border border-border bg-white py-3 text-[12px] font-bold text-textSecondary transition hover:border-primary hover:text-primary"
            >
              Start another want
            </button>
          </div>

          {/* Right pane (desktop): view bid + negotiation */}
          <div className="hidden lg:sticky lg:top-6 lg:block">
            {selectedBidder ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-white">
                <div className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-secondary to-[#F5A623] px-4 py-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[13px] font-black text-[#6B4A00]">
                    {initials(selectedBidder.seller_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-[#5B4300]">
                      {sellerLabel(selectedBidder.channel, selectedBidder.seller_name)}
                    </p>
                    <p className="truncate text-[11px] font-medium text-[#8A5F00]">
                      {selectedBidder.market_name ?? 'Oja'} · Stall {selectedBidder.stall_number ?? '—'}{' '}
                      {selectedBidder.rating != null && `· ★ ${Number(selectedBidder.rating).toFixed(1)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[16px] font-black leading-none text-[#5B4300]">
                      {fmt(selectedBidder.quote_total_kobo)}
                    </p>
                    <p className="text-[10px] font-medium text-[#8A5F00]">{fmt(selectedBidder.quote_per_unit_kobo)}/each</p>
                  </div>
                </div>

                <div className="border-b border-border bg-surface/30 px-4 py-2">
                  <p className="text-[12px] italic leading-snug text-textSecondary">"{selectedBidder.pitch}"</p>
                </div>

                <div className="h-[560px]">
                  {selectedNeg ? (
                    <NegotiationChat
                      negotiation={selectedNeg}
                      onSettle={(q, perUnit) => settleWith(selectedBidder, q, perUnit)}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-light text-primary">
                        <Icon name="handshake" size={22} />
                      </span>
                      <p className="mt-3 text-sm font-bold text-text">Starting bargain…</p>
                      <p className="mt-1 text-xs text-textSecondary">
                        Tell am your own price make we get agreement. First bid dey open the thread.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border px-8 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-surface text-textSecondary">
                  <Icon name="megaphone" size={24} />
                </span>
                <p className="mt-3 text-sm font-bold text-text">Select one seller</p>
                <p className="mt-1 text-[11px] text-textSecondary">
                  Tap any bid for the full quote here — check price, bargain and settle, all for one pane.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Mobile new-bid toast */}
      {bidToast && (
        <div
          key={bidToast.key}
          className="animate-sheet-up fixed inset-x-4 bottom-20 z-[90] flex items-center gap-3 rounded-2xl border border-primary/20 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.25)] lg:hidden"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
            <Icon name="megaphone" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-text">New bid don land</p>
            <p className="truncate text-[11px] font-medium text-textSecondary">{bidToast.text}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setBidToast(null);
              document.getElementById('bids-list')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-primary-dark"
          >
            Check
          </button>
        </div>
      )}
    </div>
  );
}