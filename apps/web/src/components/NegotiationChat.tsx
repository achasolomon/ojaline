import { useEffect, useRef, useState } from 'react';
import { naira } from '@ojaline/design';
import {
  buyerBid,
  buyerAccept,
  walkAway,
  markThreadSeen,
  askPerUnitKobo,
  floorPerUnitKobo,
  isTerminalWalk,
  type Negotiation,
  type NegotiationMessage,
} from '../lib/negotiation';
import { pluralUnit } from '../lib/bargain';
import { Icon } from './icons';

const fmt = (kobo: number) => naira.format(kobo / 100);
const roundTo50 = (kobo: number) => Math.max(50, Math.round(kobo / 50) * 50);

export function NegotiationChat({
  negotiation,
  onSettle,
}: {
  negotiation: Negotiation;
  onSettle?: (qty: number, perUnitKobo: number) => void;
}) {
  const [qty, setQty] = useState(negotiation.qty);
  const [totalText, setTotalText] = useState('');
  const [msg, setMsg] = useState('');
  const [walkConfirm, setWalkConfirm] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const unit = (q: number = qty): string => {
    const raw =
      negotiation.basis.type === 'OFFER' ? negotiation.basis.offer.unit : negotiation.basis.offer_ref.unit;
    return pluralUnit(raw, q);
  };

  useEffect(() => {
    markThreadSeen(negotiation.id);
  }, [negotiation.id]);

  useEffect(() => {
    const ask = askPerUnitKobo(negotiation, qty) ?? 0;
    setTotalText((prev) => (prev && Number(prev.replace(/[^0-9]/g, '')) > 0 ? prev : String(Math.round((ask * qty) / 100))));
  }, [negotiation.id, qty]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [negotiation.messages.length, negotiation.status]);

  const parseTotal = (): number | null => {
    const n = Number(totalText.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return roundTo50(Math.round(n * 100));
  };

  const sendBid = () => {
    const total = parseTotal();
    if (total == null) return;
    const sentence = msg.trim() || `I go pay ${fmt(total)} for ${qty} ${unit()}`;
    buyerBid(negotiation.id, qty, total, sentence);
    setMsg('');
    setWalkConfirm(false);
  };

  const settle = (perUnit: number) => {
    buyerAccept(negotiation.id, perUnit);
    onSettle?.(dealQty, perUnit);
  };

  const walk = () => {
    if (!walkConfirm) {
      setWalkConfirm(true);
      return;
    }
    walkAway(negotiation.id);
    setWalkConfirm(false);
  };

  const lastSellerMsg = [...negotiation.messages].reverse().find(
    (m) => m.side === 'SELLER' && m.per_unit_kobo != null,
  );
  const lastMessage = negotiation.messages[negotiation.messages.length - 1];
  const dealPrice = lastSellerMsg?.per_unit_kobo ?? null;
  const dealQty = lastSellerMsg && lastSellerMsg.qty > 0 ? lastSellerMsg.qty : negotiation.qty;
  const sellerName = negotiation.seller.name.split(' ')[0] || 'seller';
  const open = negotiation.status === 'OPEN';
  const settled = negotiation.status === 'SETTLED';
  const revoked = negotiation.status === 'REVOKED';
  const walked = negotiation.status === 'WALKED';
  const walkEnded = walked && isTerminalWalk(negotiation);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Thread */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
        {negotiation.messages.length === 0 ? (
          <div className="rounded-xl bg-surface px-4 py-3 text-[12px] leading-relaxed text-text">
            {sellerName}:{' '}
            <span className="italic">
              "Oya, {negotiation.qty > 1 ? `${negotiation.qty} ${unit()}` : `1 ${unit()}`} wey you want — talk your own
              price, make we reach agreement."
            </span>
          </div>
        ) : (
          negotiation.messages.map((m) => <Bubble key={m.id} m={m} unitWord={unit(m.qty || negotiation.qty)} />)
        )}

        {negotiation.status === 'WALKED' && (
          <div className="mx-auto w-fit max-w-[85%] rounded-full bg-surface px-3.5 py-1.5 text-center text-[11px] font-semibold text-textSecondary">
            {walkEnded
              ? 'You walked away — this one don close, both sides don move on'
              : 'You walked away — if the seller wan sell, e go call you back'}
          </div>
        )}

        {open && lastMessage?.side === 'BUYER' && (
          <div className="rounded-xl bg-surface px-4 py-2.5">
            <p className="text-[11px] font-bold text-text">{sellerName} dey think am…</p>
            <p className="mt-0.5 text-[10px] font-medium text-textSecondary">
              You fit leave am go shop — we go notify you when e reply.
            </p>
          </div>
        )}

        {settled && (
          <div className="rounded-xl bg-primary-light px-4 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-primary">
              <Icon name="check" size={15} /> Deal done!
            </p>
            <p className="mt-1 text-[12px] text-text">
              You settle with <span className="font-bold">{sellerName}</span> — it's heading to your cart.
            </p>
          </div>
        )}

        {revoked && (
          <div className="rounded-xl bg-surface px-4 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-text">
              <Icon name="trash" size={15} /> Deal revoked
            </p>
            <p className="mt-1 text-[12px] text-textSecondary">
              You commot am from your cart — {sellerName} don know. E fit reach out to ask why.
            </p>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Composer / actions */}
      <div className="border-t border-border px-4 py-3">
        {settled ? (
          <p className="text-center text-[11px] font-semibold text-textSecondary">
            This one don settle — thank you for doing business.
          </p>
        ) : revoked ? (
          <p className="text-center text-[11px] font-semibold text-textSecondary">
            This deal don close — if the seller reach out, e go lan for your messages.
          </p>
        ) : negotiation.status === 'WALKED' ? (
          <p className="text-center text-[11px] font-semibold text-textSecondary">
            {walkEnded
              ? 'This haggle don end — seller no come back. If e wan sell again, e go start fresh.'
              : 'If this seller call you back, the new price go drop here.'}
          </p>
        ) : open ? (
          <>
            {dealPrice != null && (
              <button
                type="button"
                onClick={() => settle(dealPrice)}
                className="mb-2 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-dark active:scale-[0.98]"
              >
                Deal! Add {dealQty} {unit(dealQty)} · {fmt(dealPrice * dealQty)}
              </button>
            )}

            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-text">How many you wan buy</p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Less"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border text-primary transition disabled:opacity-30"
                >
                  <Icon name="minus" size={13} />
                </button>
                <span className="min-w-[34px] text-center text-base font-black text-text">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => q + 1)}
                  aria-label="More"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border text-primary transition"
                >
                  <Icon name="plus" size={13} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-border bg-white px-3 transition focus-within:border-primary">
              <span className="text-sm font-bold text-textSecondary">₦</span>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                placeholder="your total price"
                value={totalText}
                onChange={(e) => setTotalText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendBid()}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm font-bold text-text outline-none"
              />
              <span className="whitespace-nowrap text-[10px] font-semibold text-textSecondary">
                = {fmt(parseTotal() ?? 0)}
              </span>
            </div>

            <input
              type="text"
              placeholder={`e.g. Oga, make I give you ${fmt((askPerUnitKobo(negotiation, qty) ?? 0) * qty)} for ${qty} ${unit()}…`}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendBid()}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface/50 px-3 text-[13px] font-medium text-text outline-none transition focus:border-primary"
            />

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={sendBid}
                disabled={parseTotal() == null}
                className="h-10 flex-1 rounded-xl bg-secondary text-[13px] font-bold text-primary-dark transition hover:bg-[#F0BE1F] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send new price
              </button>
              <button
                type="button"
                onClick={walk}
                className={`h-10 shrink-0 rounded-xl px-3 text-[12px] font-semibold transition ${
                  walkConfirm ? 'bg-red-50 text-red-600' : 'border border-border text-textSecondary hover:text-text'
                }`}
              >
                {walkConfirm ? 'Abeg comot?' : 'Walk away'}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] font-medium text-textSecondary">
              Settle area: around {fmt(floorPerUnitKobo(negotiation, qty) ?? 0)} each at this qty
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Bubble({ m, unitWord }: { m: NegotiationMessage; unitWord: string }) {
  if (m.kind === 'WALK' || m.kind === 'NOTE' || m.kind === 'REVOKE') {
    const revoke = m.kind === 'REVOKE';
    return (
      <div
        className={`mx-auto w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-center text-[11px] font-medium italic ${
          revoke ? 'bg-[#FFF0EC] text-[#8F3A2B]' : 'bg-surface text-textSecondary'
        }`}
      >
        {m.message}
      </div>
    );
  }

  const isBuyer = m.side === 'BUYER';
  const callBack = m.kind === 'CALLBACK';
  const accepted = m.kind === 'SELLER_ACCEPT';
  const qty = m.qty || 1;

  return (
    <div className={`flex ${isBuyer ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[12px] font-medium leading-relaxed ${
          isBuyer
            ? 'rounded-tr-sm bg-secondary/25 text-text'
            : callBack
              ? 'rounded-tl-sm border border-[#E3B21F] bg-[#FFF6DA] text-text'
              : accepted
                ? 'rounded-tl-sm bg-[#E7F6EC] text-text'
                : 'rounded-tl-sm bg-primary-light text-text'
        }`}
      >
        {!isBuyer && (
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-textSecondary">
            {callBack ? (
              <>
                <Icon name="bell" size={11} /> Seller called you back
              </>
            ) : accepted ? (
              <>
                <Icon name="check" size={11} /> Agreed
              </>
            ) : (
              'Counter'
            )}
          </p>
        )}
        <p>{m.message}</p>
        {m.per_unit_kobo != null && (
          <p className="mt-1 text-[11px] font-semibold text-textSecondary">
            = {fmt(m.per_unit_kobo * qty)} total for {qty} {unitWord}
          </p>
        )}
      </div>
    </div>
  );
}