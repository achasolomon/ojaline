import { useEffect, useRef, useState } from 'react';
import { naira } from '@ojaline/design';
import {
  buyerBid,
  buyerAccept,
  endBargain,
  payFrozen,
  continueBargain,
  sellerCounter,
  sellerAcceptPrice,
  sellerSellFrozen,
  sellerEndBargain,
  sellerContinueBargain,
  askPerUnitKobo,
  floorPerUnitKobo,
  negotiationRole,
  buyerMoves,
  sellerMoves,
  lastPriceFromSide,
  turnDeadlineAt,
  MAX_ROUNDS,
  REOPEN_LIMIT,
  type Negotiation,
  type NegotiationMessage,
} from '../lib/negotiation';
import { useCountdownUntil, formatCountdown } from '../lib/countdown';
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
  const [unitText, setUnitText] = useState('');
  const [msg, setMsg] = useState('');
  const [endConfirm, setEndConfirm] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const role = negotiationRole(negotiation);
  const isSeller = role === 'SELLER';
  const opponent = isSeller ? negotiation.buyer_name.split(' ')[0] || 'buyer' : negotiation.seller.name.split(' ')[0] || 'seller';

  const unit = (q: number = qty): string => {
    const raw =
      negotiation.basis.type === 'OFFER' ? negotiation.basis.offer.unit : negotiation.basis.offer_ref.unit;
    return pluralUnit(raw, q);
  };

  useEffect(() => {
    setQty(negotiation.qty);
    setContinuing(false);
  }, [negotiation.id, negotiation.status]);

  useEffect(() => {
    const ask = askPerUnitKobo(negotiation, qty) ?? 0;
    setTotalText((prev) => (prev && Number(prev.replace(/[^0-9]/g, '')) > 0 ? prev : String(Math.round((ask * qty) / 100))));
  }, [negotiation.id, qty]);

  useEffect(() => {
    const bid = lastPriceFromSide(negotiation, isSeller ? 'BUYER' : 'SELLER');
    setUnitText((prev) => (prev && Number(prev.replace(/[^0-9]/g, '')) > 0 ? prev : String(Math.round((bid?.per_unit_kobo ?? askPerUnitKobo(negotiation, qty) ?? 0) / 100))));
  }, [negotiation.id, qty, negotiation.messages.length, isSeller]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [negotiation.messages.length, negotiation.status]);

  const parseTotal = (): number | null => {
    const n = Number(totalText.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return roundTo50(Math.round(n * 100));
  };

  const parseUnit = (): number | null => {
    const n = Number(unitText.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return roundTo50(n * 100);
  };

  const sendBid = () => {
    const total = parseTotal();
    if (total == null) return;
    const perUnit = Math.round(total / qty);
    const sentence = msg.trim() || `I go pay ${fmt(total)} for ${qty} ${unit()}`;
    if (negotiation.status === 'ENDED') continueBargain(negotiation.id, perUnit, qty, sentence);
    else buyerBid(negotiation.id, qty, total, sentence);
    setMsg('');
    setContinuing(false);
    setEndConfirm(false);
  };

  const sendCounter = () => {
    const perUnit = parseUnit();
    if (perUnit == null) return;
    const sentence = msg.trim() || `Make we settle — I fit do ${fmt(perUnit * qty)} for ${qty} ${unit()}.`;
    if (negotiation.status === 'ENDED') sellerContinueBargain(negotiation.id, perUnit, qty, sentence);
    else sellerCounter(negotiation.id, perUnit, qty, sentence);
    setMsg('');
    setUnitText('');
    setContinuing(false);
    setEndConfirm(false);
  };

  const settle = (perUnit: number) => {
    buyerAccept(negotiation.id, perUnit);
    onSettle?.(dealQty, perUnit);
  };

  const sellerSettle = (perUnit: number) => {
    sellerAcceptPrice(negotiation.id, perUnit);
  };

  const payThis = () => {
    const price = frozenSeller;
    if (price == null) return;
    payFrozen(negotiation.id);
    onSettle?.(negotiation.qty, price);
  };

  const sellFrozen = () => {
    sellerSellFrozen(negotiation.id);
  };

  const endNow = () => {
    if (!endConfirm) {
      setEndConfirm(true);
      return;
    }
    if (isSeller) sellerEndBargain(negotiation.id);
    else endBargain(negotiation.id);
    setEndConfirm(false);
  };

  const lastSellerMsg = [...negotiation.messages].reverse().find(
    (m) => m.side === 'SELLER' && m.per_unit_kobo != null,
  );
  const lastMessage = negotiation.messages[negotiation.messages.length - 1];
  const dealPrice = lastSellerMsg?.per_unit_kobo ?? null;
  const dealQty = lastSellerMsg && lastSellerMsg.qty > 0 ? lastSellerMsg.qty : negotiation.qty;
  const buyerStanding = lastPriceFromSide(negotiation, 'BUYER');
  const open = negotiation.status === 'OPEN';
  const ended = negotiation.status === 'ENDED';
  const settled = negotiation.status === 'SETTLED';
  const revoked = negotiation.status === 'REVOKED';

  const frozenSeller = negotiation.frozen_seller_per_unit_kobo;
  const frozenBuyer = negotiation.frozen_buyer_per_unit_kobo;
  const freezeExpired =
    ended && negotiation.freeze_expires_at != null && negotiation.freeze_expires_at <= Date.now();
  const oppGrab = isSeller ? frozenSeller : frozenBuyer;
  const myGrab = isSeller ? frozenBuyer : frozenSeller;

  const myMoves = isSeller ? sellerMoves(negotiation) : buyerMoves(negotiation);
  const oppMoves = isSeller ? buyerMoves(negotiation) : sellerMoves(negotiation);
  const myCapUsed = myMoves >= MAX_ROUNDS;
  const canReopen = ended && (negotiation.reopen_count ?? 0) < REOPEN_LIMIT && !freezeExpired;
  const reopenNote = ended && (negotiation.reopen_count ?? 0) >= REOPEN_LIMIT;

  const turnLeft = useCountdownUntil(open ? turnDeadlineAt(negotiation) : null);
  const freezeLeft = useCountdownUntil(ended && negotiation.freeze_expires_at != null ? negotiation.freeze_expires_at : null);

  const lastSide = lastMessage?.side ?? null;
  const myTurn = open && (isSeller ? lastSide === 'BUYER' : lastSide === 'SELLER');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Thread */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[9px] font-bold text-textSecondary">
            <Icon name="handshake" size={10} />
            You: {Math.min(myMoves, MAX_ROUNDS)}/{MAX_ROUNDS} · {opponent}: {Math.min(oppMoves, MAX_ROUNDS)}/{MAX_ROUNDS}
          </span>
          {open && turnLeft != null && turnLeft > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[#FFF6DA] px-2 py-0.5 text-[9px] font-bold text-[#A36A00]">
              <Icon name="clock" size={10} />
              {turnLeft <= 36_000_000 ? `Reply window: ${formatCountdown(turnLeft)} left` : 'Reply window open'}
            </span>
          )}
          {ended && freezeLeft != null && freezeLeft > 0 && !freezeExpired && (
            <span className="flex items-center gap-1 rounded-full bg-[#FFF6DA] px-2 py-0.5 text-[9px] font-bold text-[#8A5F00]">
              <Icon name="pause" size={10} />
              Frozen price: {formatCountdown(freezeLeft)} left
            </span>
          )}
        </div>

        {negotiation.messages.length === 0 ? (
          <div className="rounded-xl bg-surface px-4 py-3 text-[12px] leading-relaxed text-text">
            {isSeller ? (
              <>{opponent} wan buy this one — talk your own price, make we reach agreement.</>
            ) : (
              <>
                {opponent}:{' '}
                <span className="italic">
                  "Oya, {negotiation.qty > 1 ? `${negotiation.qty} ${unit()}` : `1 ${unit()}`} wey you want — talk your own
                  price, make we reach agreement."
                </span>
              </>
            )}
          </div>
        ) : (
          negotiation.messages.map((m) => <Bubble key={m.id} m={m} unitWord={unit(m.qty || negotiation.qty)} />)
        )}

        {open && !myTurn && lastMessage != null && (
          <div className="rounded-xl bg-surface px-4 py-2.5">
            <p className="text-[11px] font-bold text-text">{opponent} dey think am…</p>
            <p className="mt-0.5 text-[10px] font-medium text-textSecondary">
              You fit leave am go shop — we go notify you when e reply.
            </p>
          </div>
        )}

        {open && myTurn && (
          <div className="rounded-xl bg-secondary/15 px-4 py-2.5">
            <p className="text-[11px] font-bold text-primary-dark">Na your turn o</p>
            {!myCapUsed && (
              <p className="mt-0.5 text-[10px] font-medium text-textSecondary">
                Reply before the window closes, else your price go stand frozen.
              </p>
            )}
          </div>
        )}

        {ended && (
          <div className="rounded-xl bg-[#FFF6DA] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#A36A00]">
              <Icon name="pause" size={15} /> Price don stand frozen
            </p>
            <p className="mt-1 text-[12px] text-[#6B4A00]">
              {negotiation.ended_by == null
                ? 'Nobody reply for 24 hours, so the price don stand frozen. '
                : negotiation.ended_by === role
                  ? 'You don end the bargain. '
                  : `${opponent} don end the bargain. `}
              Any of una fit grab the frozen price — or run am again. {freezeExpired ? 'The window don close — this one finish.' : 'The price expire after 24h.'}
            </p>
            {!freezeExpired && (
              <div className="mt-2 space-y-1 text-[11px] font-semibold">
                <p className="text-[#8A5F00]">
                  {opponent} fit {isSeller ? 'pay' : 'sell for'}:{' '}
                  {oppGrab != null ? fmt(oppGrab) : `${opponent} no drop any price yet`}
                </p>
                <p className="text-[#6B4A00]">
                  You fit {isSeller ? 'sell for' : 'pay'}: {myGrab != null ? fmt(myGrab) : 'no frozen price yet'}
                </p>
              </div>
            )}
          </div>
        )}

        {settled && (
          <div className="rounded-xl bg-primary-light px-4 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-primary">
              <Icon name="check" size={15} /> Deal done!
            </p>
            <p className="mt-1 text-[12px] text-text">
              {isSeller
                ? `You settle with ${opponent} — e go take am from the buyer cart.`
                : `You settle with ${opponent} — it's heading to your cart.`}
            </p>
          </div>
        )}

        {revoked && (
          <div className="rounded-xl bg-surface px-4 py-3">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-text">
              <Icon name="trash" size={15} /> Deal revoked
            </p>
            <p className="mt-1 text-[12px] text-textSecondary">
              {isSeller
                ? `${opponent} commot am from their cart. You fit message am—or open a fresh bargain.`
                : `You commot am from your cart — ${opponent} don know. E fit reach out to ask why.`}
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
        ) : ended ? (
          <EndedComposer
            isSeller={isSeller}
            frozenSeller={frozenSeller}
            frozenBuyer={frozenBuyer}
            freezeExpired={freezeExpired}
            qty={qty}
            canReopen={canReopen}
            reopenNote={reopenNote}
            continuing={continuing}
            setContinuing={setContinuing}
            unitText={unitText}
            setUnitText={setUnitText}
            totalText={totalText}
            setTotalText={setTotalText}
            msg={msg}
            setMsg={setMsg}
            parseUnit={parseUnit}
            parseTotal={parseTotal}
            sendCounter={sendCounter}
            sendBid={sendBid}
            payThis={payThis}
            sellFrozen={sellFrozen}
          />
        ) : open ? (
          isSeller ? (
            <SellerComposer
              qty={qty}
              setQty={setQty}
              unitText={unitText}
              setUnitText={setUnitText}
              msg={msg}
              setMsg={setMsg}
              parseUnit={parseUnit}
              sendCounter={sendCounter}
              endNow={endNow}
              endConfirm={endConfirm}
              myCapUsed={myCapUsed}
              buyerStanding={buyerStanding}
              sellerSettle={sellerSettle}
              negotiation={negotiation}
              unit={unit}
            />
          ) : (
            <BuyerComposer
              qty={qty}
              setQty={setQty}
              totalText={totalText}
              setTotalText={setTotalText}
              msg={msg}
              setMsg={setMsg}
              parseTotal={parseTotal}
              sendBid={sendBid}
              endNow={endNow}
              endConfirm={endConfirm}
              myCapUsed={myCapUsed}
              negotiateDealPrice={dealPrice}
              negotiateDealQty={dealQty}
              unit={unit}
              settle={settle}
              negotiation={negotiation}
            />
          )
        ) : null}
      </div>
    </div>
  );
}

function BuyerComposer({
  qty,
  setQty,
  totalText,
  setTotalText,
  msg,
  setMsg,
  parseTotal,
  sendBid,
  endNow,
  endConfirm,
  myCapUsed,
  negotiateDealPrice,
  negotiateDealQty,
  unit,
  settle,
  negotiation,
}: {
  qty: number;
  setQty: (v: number) => void;
  totalText: string;
  setTotalText: (v: string) => void;
  msg: string;
  setMsg: (v: string) => void;
  parseTotal: () => number | null;
  sendBid: () => void;
  endNow: () => void;
  endConfirm: boolean;
  myCapUsed: boolean;
  negotiateDealPrice: number | null;
  negotiateDealQty: number;
  unit: (q?: number) => string;
  settle: (perUnit: number) => void;
  negotiation: Negotiation;
}) {
  const fmtLocal = (kobo: number) => fmt(kobo);
  return (
    <>
      {negotiateDealPrice != null && (
        <button
          type="button"
          onClick={() => settle(negotiateDealPrice)}
          className="mb-2 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-dark active:scale-[0.98]"
        >
          Deal! Add {negotiateDealQty} {unit(negotiateDealQty)} · {fmtLocal(negotiateDealPrice * negotiateDealQty)}
        </button>
      )}

      {myCapUsed ? (
        <div className="mb-2 rounded-xl bg-[#FFF6DA] px-3 py-2.5">
          <p className="text-[12px] font-bold text-[#8A5F00]">
            You don use your {MAX_ROUNDS} rounds — accept the seller price or end the bargain.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-text">How many you wan buy</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                disabled={qty <= 1}
                aria-label="Less"
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-primary transition disabled:opacity-30"
              >
                <Icon name="minus" size={13} />
              </button>
              <span className="min-w-[34px] text-center text-base font-black text-text">{qty}</span>
              <button
                type="button"
                onClick={() => setQty(qty + 1)}
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
              = {fmtLocal(parseTotal() ?? 0)}
            </span>
          </div>

          <input
            type="text"
            placeholder={`e.g. Oga, make I give you ${fmtLocal((askPerUnitKobo(negotiation, qty) ?? 0) * qty)} for ${qty} ${unit()}…`}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendBid()}
            className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface/50 px-3 text-[13px] font-medium text-text outline-none transition focus:border-primary"
          />
        </>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={sendBid}
          disabled={myCapUsed || parseTotal() == null}
          className="h-10 flex-1 rounded-xl bg-secondary text-[13px] font-bold text-primary-dark transition hover:bg-[#F0BE1F] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send new price
        </button>
        <button
          type="button"
          onClick={endNow}
          className={`h-10 shrink-0 rounded-xl px-3 text-[12px] font-semibold transition ${
            endConfirm ? 'bg-red-50 text-red-600' : 'border border-border text-textSecondary hover:text-text'
          }`}
        >
          {endConfirm ? 'Comot from market?' : 'End bargain'}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] font-medium text-textSecondary">
        Settle area: around {fmtLocal(floorPerUnitKobo(negotiation, qty) ?? 0)} each at this qty · {MAX_ROUNDS} rounds per
        side · End freezes the price for 24h
      </p>
    </>
  );
}

function SellerComposer({
  qty,
  setQty,
  unitText,
  setUnitText,
  msg,
  setMsg,
  parseUnit,
  sendCounter,
  endNow,
  endConfirm,
  myCapUsed,
  buyerStanding,
  sellerSettle,
  negotiation,
  unit,
}: {
  qty: number;
  setQty: (v: number) => void;
  unitText: string;
  setUnitText: (v: string) => void;
  msg: string;
  setMsg: (v: string) => void;
  parseUnit: () => number | null;
  sendCounter: () => void;
  endNow: () => void;
  endConfirm: boolean;
  myCapUsed: boolean;
  buyerStanding: { qty: number; per_unit_kobo: number } | null;
  sellerSettle: (perUnit: number) => void;
  negotiation: Negotiation;
  unit: (q?: number) => string;
}) {
  return (
    <>
      {buyerStanding != null && (
        <button
          type="button"
          onClick={() => sellerSettle(buyerStanding.per_unit_kobo)}
          className="mb-2 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-dark active:scale-[0.98]"
        >
          Accept buyer price · {fmt(buyerStanding.per_unit_kobo * buyerStanding.qty)} ({fmt(buyerStanding.per_unit_kobo)} ea)
        </button>
      )}

      {myCapUsed ? (
        <div className="mb-2 rounded-xl bg-[#FFF6DA] px-3 py-2.5">
          <p className="text-[12px] font-bold text-[#8A5F00]">
            Na your final word — you don drop {MAX_ROUNDS} counters. Accept the buyer price or end the bargain.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-text">How many you go sell</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                disabled={qty <= 1}
                aria-label="Less"
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-primary transition disabled:opacity-30"
              >
                <Icon name="minus" size={13} />
              </button>
              <span className="min-w-[34px] text-center text-base font-black text-text">{qty}</span>
              <button
                type="button"
                onClick={() => setQty(qty + 1)}
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
              placeholder={`price per ${unit(1).replace(/^1 /, '')}`}
              value={unitText}
              onChange={(e) => setUnitText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendCounter()}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-bold text-text outline-none"
            />
            <span className="whitespace-nowrap text-[10px] font-semibold text-textSecondary">
              = {fmt((parseUnit() ?? 0) * qty)} total
            </span>
          </div>

          <input
            type="text"
            placeholder={`e.g. E no reach — make we meet for ${fmt(Math.max(5000, askPerUnitKobo(negotiation, qty) ?? 0))} each…`}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCounter()}
            className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface/50 px-3 text-[13px] font-medium text-text outline-none transition focus:border-primary"
          />
        </>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={sendCounter}
          disabled={myCapUsed || parseUnit() == null}
          className="h-10 flex-1 rounded-xl bg-secondary text-[13px] font-bold text-primary-dark transition hover:bg-[#F0BE1F] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send counter price
        </button>
        <button
          type="button"
          onClick={endNow}
          className={`h-10 shrink-0 rounded-xl px-3 text-[12px] font-semibold transition ${
            endConfirm ? 'bg-red-50 text-red-600' : 'border border-border text-textSecondary hover:text-text'
          }`}
        >
          {endConfirm ? 'Comot from market?' : 'End bargain'}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] font-medium text-textSecondary">
        Anchor: around {fmt(floorPerUnitKobo(negotiation, qty) ?? 0)}–{fmt(askPerUnitKobo(negotiation, qty) ?? 0)} each
        · {MAX_ROUNDS} counters max
      </p>
    </>
  );
}

function EndedComposer({
  isSeller,
  frozenSeller,
  frozenBuyer,
  freezeExpired,
  qty,
  canReopen,
  reopenNote,
  continuing,
  setContinuing,
  unitText,
  setUnitText,
  totalText,
  setTotalText,
  msg,
  setMsg,
  parseUnit,
  parseTotal,
  sendCounter,
  sendBid,
  payThis,
  sellFrozen,
}: {
  isSeller: boolean;
  frozenSeller: number | null;
  frozenBuyer: number | null;
  freezeExpired: boolean;
  qty: number;
  canReopen: boolean;
  reopenNote: boolean;
  continuing: boolean;
  setContinuing: (v: boolean) => void;
  unitText: string;
  setUnitText: (v: string) => void;
  totalText: string;
  setTotalText: (v: string) => void;
  msg: string;
  setMsg: (v: string) => void;
  parseUnit: () => number | null;
  parseTotal: () => number | null;
  sendCounter: () => void;
  sendBid: () => void;
  payThis: () => void;
  sellFrozen: () => void;
}) {
  const grabPrice = isSeller ? frozenBuyer : frozenSeller;
  const ContinueBtn = canReopen && !continuing ? (
    <button
      type="button"
      onClick={() => setContinuing(true)}
      className="h-10 w-full rounded-xl bg-secondary text-[13px] font-bold text-primary-dark transition hover:bg-[#F0BE1F] active:scale-[0.98]"
    >
      Continue bargain
    </button>
  ) : null;

  if (!continuing) {
    return (
      <>
        {grabPrice != null && (
          <button
            type="button"
            onClick={isSeller ? sellFrozen : payThis}
            disabled={freezeExpired}
            className="mb-2 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-white transition hover:bg-primary-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {freezeExpired
              ? 'Price don expire'
              : isSeller
                ? `Sell for this · ${fmt(grabPrice * qty)} (${fmt(grabPrice)} ea)`
                : `Pay this · ${fmt(grabPrice * qty)} (${fmt(grabPrice)} ea)`}
          </button>
        )}
        {ContinueBtn}
        {reopenNote && (
          <p className="mt-1.5 text-center text-[10px] font-medium text-textSecondary">
            You don already reopen this one — na this be the final freeze.
          </p>
        )}
        {!canReopen && !reopenNote && freezeExpired && (
          <p className="mt-1.5 text-center text-[10px] font-medium text-textSecondary">
            The frozen price don expire — this bargain don finish.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mb-2 mt-2 flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-text">{isSeller ? 'Your new price per unit' : 'How many you wan buy'}</p>
      </div>

      {isSeller ? (
        <div className="flex items-center gap-1 rounded-xl border border-border bg-white px-3 transition focus-within:border-primary">
          <span className="text-sm font-bold text-textSecondary">₦</span>
          <input
            type="number"
            min="1"
            inputMode="numeric"
            placeholder="price per unit"
            value={unitText}
            onChange={(e) => setUnitText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCounter()}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm font-bold text-text outline-none"
          />
          <span className="whitespace-nowrap text-[10px] font-semibold text-textSecondary">
            = {fmt((parseUnit() ?? 0) * qty)}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-xl border border-border bg-white px-3 transition focus-within:border-primary">
          <span className="text-sm font-bold text-textSecondary">₦</span>
          <input
            type="number"
            min="1"
            inputMode="numeric"
            placeholder="your new total price"
            value={totalText}
            onChange={(e) => setTotalText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendBid()}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm font-bold text-text outline-none"
          />
          <span className="whitespace-nowrap text-[10px] font-semibold text-textSecondary">
            = {fmt(parseTotal() ?? 0)}
          </span>
        </div>
      )}

      <input
        type="text"
        placeholder={isSeller ? 'talk your new price…' : 'talk your new price…'}
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (isSeller ? sendCounter() : sendBid())}
        className="mt-1.5 h-10 w-full rounded-xl border border-border bg-surface/50 px-3 text-[13px] font-medium text-text outline-none transition focus:border-primary"
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={isSeller ? sendCounter : sendBid}
          disabled={isSeller ? parseUnit() == null : parseTotal() == null}
          className="h-10 flex-1 rounded-xl bg-secondary text-[13px] font-bold text-primary-dark transition hover:bg-[#F0BE1F] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reopen with new price
        </button>
        <button
          type="button"
          onClick={() => setContinuing(false)}
          className="h-10 shrink-0 rounded-xl border border-border px-3 text-[12px] font-semibold text-textSecondary transition hover:text-text"
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function Bubble({ m, unitWord }: { m: NegotiationMessage; unitWord: string }) {
  if (m.kind === 'WALK' || m.kind === 'NOTE' || m.kind === 'REVOKE' || m.kind === 'END') {
    const revoke = m.kind === 'REVOKE';
    const ended = m.kind === 'END';
    const sys = m.side === 'SYSTEM';
    return (
      <div
        className={`mx-auto w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-center text-[11px] font-medium italic ${
          revoke
            ? 'bg-[#FFF0EC] text-[#8F3A2B]'
            : ended
              ? 'bg-[#FFF6DA] text-[#8A5F00]'
              : sys
                ? 'bg-[#F3F0E9] text-[#6B4A00]'
                : 'bg-surface text-textSecondary'
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