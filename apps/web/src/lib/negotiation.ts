import { useEffect, useState } from 'react';
import type { Offer } from './api';
import {
  acceptNegotiation,
  listNegotiations,
  markNegotiationSeen,
  openNegotiation,
  revokeNegotiation,
  submitNegotiationBid,
  walkAwayNegotiation,
  type NegotiationThread,
} from './api';
import { hashCode, volumeFloorKobo, volumePerUnitKobo } from './bargain';
import { connectMarketFeed, disconnectMarketFeed, type MarketEnvelope } from './realtime';
import { activeBuyerId } from './session';

/**
 * Multi-round negotiation threads, now backed by the API (market.negotiations
 * + market.negotiation_messages in postgres). Buyer bids, seller counters,
 * walk-aways and the "seller called you back" callback all run server-side:
 * the store here mirrors the server, refreshes on a light poll and instantly
 * on SSE events, and every buyer action fires an optimistic update followed
 * by the server's authoritative thread.
 */

export type NegotiationSide = 'BUYER' | 'SELLER';
export type NegotiationStatus = 'OPEN' | 'SETTLED' | 'WALKED' | 'REVOKED';
export type NegotiationKind =
  | 'BUYER_BID'
  | 'SELLER_OFFER'
  | 'SELLER_ACCEPT'
  | 'BUYER_ACCEPT'
  | 'WALK'
  | 'CALLBACK'
  | 'NOTE'
  | 'REVOKE';

export interface NegotiationMessage {
  id: string;
  kind: NegotiationKind;
  side: NegotiationSide;
  qty: number;
  per_unit_kobo: number | null;
  message: string;
  at: string;
}

export interface NegotiationSeller {
  id: string;
  name: string;
  channel: Offer['channel'];
  market_name?: string | null;
  stall_number?: string | null;
  rating?: number | null;
  review_count?: number;
}

export type NegotiationBasis =
  | { type: 'OFFER'; offer: Offer; ask_per_unit_kobo: number; floor_per_unit_kobo: number }
  | {
      type: 'REQUEST';
      request_id: string;
      offer_ref: { offer_id: string; product_name: string; unit: string | null; price_cents: number | null };
      ask_per_unit_kobo: number;
      floor_per_unit_kobo: number;
    };

export interface Negotiation {
  id: string;
  draft?: boolean;
  basis: NegotiationBasis;
  seller: NegotiationSeller;
  buyer_name: string;
  qty: number;
  status: NegotiationStatus;
  messages: NegotiationMessage[];
  demeanor: 'easy' | 'fair' | 'tough';
  dropped_at: number | null;
  callback: { at: number; sent: boolean } | null;
  unseen_callbacks: number;
  created_at: string;
  updated_at: string;
}

type NegotiationListener = (items: Negotiation[]) => void;

const POLL_MS = 4000;

const listeners = new Set<NegotiationListener>();

let items: Negotiation[] = [];
let loaded = false;
let inFlight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let feedConnected = false;

/**
 * `draft` negotiations are local-only: created when you open a haggle but
 * promoted to a real server thread on the first bid. Do nothing and they
 * never touch the API, so tapping "Haggle" and walking away records nothing.
 */
interface DraftSeed {
  basis_type: 'OFFER' | 'REQUEST';
  offer_id?: string;
  want_id?: string;
  bid_id?: string;
  qty?: number;
}
const draftSeeds = new Map<string, DraftSeed>();

function nowIso(): string {
  return new Date().toISOString();
}

export function isDraftNegotiation(n: Negotiation): boolean {
  return Boolean(n.draft);
}

/* --------------------------------- mapper ---------------------------------- */

/** Thin Offer shaped purely from the server thread payload. */
function offerFromThread(o: { id: string; product_name: string; unit: string | null | undefined }): Offer {
  return {
    id: o.id,
    seller_id: '',
    seller_name: '',
    channel: 'OPEN',
    sellable_qty: 1,
    min_order_qty: 1,
    perishability: 'SHELF_GT_7D',
    fulfilment_modes: ['INSTANT'],
    cluster_id: '',
    created_at: '',
    product_name: o.product_name,
    physical_ref: '',
    price_cents: null,
    category_id: null,
    primary_image: null,
    unit: o.unit ?? null,
  };
}

function baseFromThread(t: NegotiationThread): Negotiation {
  const common = {
    id: t.id,
    seller: { id: t.seller.id, name: t.seller.name, channel: t.seller.channel },
    buyer_name: t.buyer_name,
    qty: t.qty,
    status: t.status,
    messages: t.messages as NegotiationMessage[],
    demeanor: t.demeanor,
    dropped_at: t.dropped_at ? new Date(String(t.dropped_at)).getTime() : null,
    callback: t.callback.at ? { at: Number(t.callback.at), sent: t.callback.sent } : null,
    unseen_callbacks: t.unseen_callbacks,
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
  if (t.basis.type === 'OFFER' && t.basis.offer) {
    return {
      ...common,
      basis: {
        type: 'OFFER',
        offer: offerFromThread(t.basis.offer),
        ask_per_unit_kobo: t.basis.ask_per_unit_kobo,
        floor_per_unit_kobo: t.basis.floor_per_unit_kobo,
      },
    } as Negotiation;
  }
  return {
    ...common,
    basis: {
      type: 'REQUEST',
      request_id: t.basis.request_id ?? '',
      offer_ref: { offer_id: '', product_name: '', unit: null, price_cents: null },
      ask_per_unit_kobo: t.basis.ask_per_unit_kobo,
      floor_per_unit_kobo: t.basis.floor_per_unit_kobo,
    },
  } as Negotiation;
}

/** Copy the volatile (server-changing) fields onto a locally-richer thread. */
function applyVolatile(existing: Negotiation, fresh: Negotiation): Negotiation {
  return {
    ...existing,
    buyer_name: fresh.buyer_name,
    qty: fresh.qty,
    status: fresh.status,
    messages: fresh.messages,
    demeanor: fresh.demeanor,
    dropped_at: fresh.dropped_at,
    callback: fresh.callback,
    unseen_callbacks: fresh.unseen_callbacks,
    updated_at: fresh.updated_at,
  };
}

function upsert(n: Negotiation): void {
  items = items.filter((x) => x.id !== n.id);
  items.unshift(n);
  emit();
}

/** Replace a known thread with the server's fresh copy, keeping rich basis. */
function applyThread(t: NegotiationThread): void {
  const fresh = baseFromThread(t);
  const existing = items.find((x) => x.id === t.id);
  if (existing) upsert(applyVolatile(existing, fresh));
  else upsert(fresh);
}

/* ------------------------------ store plumbing ------------------------------ */

function emit(): void {
  listeners.forEach((l) => l(items));
}

async function refresh(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const threads = await listNegotiations(activeBuyerId());
      const byId = new Map(threads.map((t) => [t.id, t]));
      const next = items.map((n) => {
        const t = byId.get(n.id);
        return t ? applyVolatile(n, baseFromThread(t)) : n;
      });
      const localIds = new Set(next.map((n) => n.id));
      for (const t of threads) {
        if (!localIds.has(t.id)) next.push(baseFromThread(t));
      }
      items = next;
    } catch {
      /* offline — keep the last known store */
    } finally {
      loaded = true;
      inFlight = null;
      emit();
    }
  })();
  return inFlight;
}

/** Refetch thread state immediately (used on subscribe and by callers). */
export function ensureLoaded(): Promise<void> {
  return refresh();
}

function startPoll(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => void refresh(), POLL_MS);
}

function stopPollIfIdle(): void {
  if (listeners.size === 0 && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function onEnvelope(env: MarketEnvelope): void {
  if (env.event_type !== 'market.negotiation_message' && env.event_type !== 'market.callback') return;
  const buyerId = (env.payload as { buyer_id?: string }).buyer_id;
  if (buyerId && buyerId === activeBuyerId()) void refresh();
}

function startFeed(): void {
  if (feedConnected) return;
  feedConnected = true;
  connectMarketFeed(onEnvelope);
}

function stopFeedIfIdle(): void {
  if (listeners.size === 0 && feedConnected) {
    feedConnected = false;
    disconnectMarketFeed(onEnvelope);
  }
}

export function subscribeNegotiations(listener: NegotiationListener): () => void {
  listeners.add(listener);
  void ensureLoaded();
  startPoll();
  startFeed();
  return () => {
    listeners.delete(listener);
    stopPollIfIdle();
    stopFeedIfIdle();
  };
}

export function getNegotiations(): Negotiation[] {
  if (!loaded) void ensureLoaded();
  return items;
}

export function findOfferNegotiation(offerId: string, statuses?: NegotiationStatus[]): Negotiation | undefined {
  return items
    .filter((n) => n.basis.type === 'OFFER' && (n.basis.offer as { id: string }).id === offerId)
    .filter((n) => !statuses || statuses.includes(n.status))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}

export function findRequestNegotiation(requestId: string, sellerId: string): Negotiation | undefined {
  return items
    .filter((n) => n.basis.type === 'REQUEST' && n.basis.request_id === requestId && n.seller.id === sellerId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}

export function isRequestNegotiation(n: Negotiation): boolean {
  return n.basis.type === 'REQUEST';
}

export function findNegotiationById(id: string): Negotiation | undefined {
  return items.find((n) => n.id === id);
}

export function negotiationDeepLink(n: Pick<Negotiation, 'id'>): string {
  return `/negotiations/${n.id}`;
}

/** Active negotiations count for header badges. */
export function useNegotiationCount(): number {
  const [count, setCount] = useState(() => activeNegotiationCount());
  useEffect(() => {
    const off = subscribeNegotiations(() => setCount(activeNegotiationCount()));
    return off;
  }, []);
  return count;
}

export function activeNegotiationCount(): number {
  return items.filter((n) => !n.draft && n.status === 'OPEN').length;
}

/**
 * A walked-away haggle is over unless the seller calls back. Pending = the
 * call-back window is still open (`callback.at` in the future). Terminal =
 * no call-back was ever scheduled, or the window passed without the seller
 * coming back — closed for both sides.
 */
export function isTerminalWalk(n: Negotiation): boolean {
  if (n.status !== 'WALKED') return false;
  if (!n.callback || !n.callback.at) return true;
  return n.callback.at <= Date.now();
}

/* -------------------------------- creation --------------------------------- */

export async function createOfferNegotiation(_offer: Offer, _buyerName: string, seedQty?: number): Promise<Negotiation> {
  const offer = _offer;
  await ensureLoaded();
  const existing = findOfferNegotiation(offer.id, ['OPEN', 'WALKED']);
  if (existing) return existing;

  const base = Math.min(Math.max(offer.min_order_qty, 1), offer.sellable_qty);
  const qty = seedQty != null ? Math.min(Math.max(seedQty, 1), offer.sellable_qty) : base;
  const draftAsk = volumePerUnitKobo(offer, qty) ?? offer.price_cents ?? 0;
  const draftFloor = volumeFloorKobo(offer, qty) ?? draftAsk;
  const draftId = `draft:offer:${offer.id}`;
  const existingDraft = items.find((n) => n.id === draftId);
  if (existingDraft) return existingDraft;

  const draft: Negotiation = {
    id: draftId,
    draft: true,
    basis: {
      type: 'OFFER',
      offer,
      ask_per_unit_kobo: draftAsk,
      floor_per_unit_kobo: draftFloor,
    },
    seller: { id: offer.seller_id, name: offer.seller_name, channel: offer.channel },
    buyer_name: _buyerName,
    qty,
    status: 'OPEN',
    messages: [],
    demeanor: 'fair',
    dropped_at: null,
    callback: null,
    unseen_callbacks: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  draftSeeds.set(draft.id, { basis_type: 'OFFER', offer_id: offer.id, qty });
  upsert(draft);
  return draft;
}

export async function createRequestNegotiation(input: {
  requestId: string;
  bidId: string;
  seller: NegotiationSeller;
  offerRef: { offer_id: string; product_name: string; unit: string | null; price_cents: number | null };
  askPerUnitKobo: number;
  qty: number;
  buyerName: string;
}): Promise<Negotiation> {
  await ensureLoaded();
  const existing = findRequestNegotiation(input.requestId, input.seller.id);
  if (existing) return existing;

  const draftId = `draft:request:${input.bidId}`;
  const existingDraft = items.find((n) => n.id === draftId);
  if (existingDraft) return existingDraft;

  const draft: Negotiation = {
    id: draftId,
    draft: true,
    basis: {
      type: 'REQUEST',
      request_id: input.requestId,
      offer_ref: input.offerRef,
      ask_per_unit_kobo: input.askPerUnitKobo,
      floor_per_unit_kobo: Math.max(5000, Math.round((input.askPerUnitKobo * 0.9) / 5000) * 5000),
    },
    seller: input.seller,
    buyer_name: input.buyerName,
    qty: input.qty,
    status: 'OPEN',
    messages: [],
    demeanor: 'fair',
    dropped_at: null,
    callback: null,
    unseen_callbacks: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  draftSeeds.set(draft.id, { basis_type: 'REQUEST', want_id: input.requestId, bid_id: input.bidId, qty: input.qty });
  upsert(draft);
  return draft;
}

/* ------------------------------- pricing basis ------------------------------ */

export function askPerUnitKobo(n: Negotiation, qty: number): number | null {
  if (n.basis.ask_per_unit_kobo > 0) return n.basis.ask_per_unit_kobo;
  if (n.basis.type === 'OFFER') return volumePerUnitKobo(n.basis.offer, qty);
  return null;
}

export function floorPerUnitKobo(n: Negotiation, qty: number): number | null {
  if (n.basis.floor_per_unit_kobo > 0) return n.basis.floor_per_unit_kobo;
  if (n.basis.type === 'OFFER') return volumeFloorKobo(n.basis.offer, qty);
  const ask = n.basis.ask_per_unit_kobo;
  return Math.max(5000, Math.round((ask * 0.9) / 5000) * 5000);
}

/* --------------------------------- actions --------------------------------- */

const roundGrid = (kobo: number, grid = 5000) => Math.max(50, Math.round(kobo / grid) * grid);

const NG0 = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const label = (kobo: number) => NG0.format(kobo / 100);

export function buyerBid(negotiationId: string, qty: number, totalKobo: number, message: string): void {
  const n = items.find((x) => x.id === negotiationId);
  if (!n || n.status !== 'OPEN') return;
  const perUnit = roundGrid(totalKobo / qty);
  const sentence = message.trim() || `I go pay ${label(perUnit)} each for ${qty}`;
  const optimistic: NegotiationMessage = {
    id: `pending-${Date.now()}`,
    kind: 'BUYER_BID',
    side: 'BUYER',
    qty,
    per_unit_kobo: perUnit,
    message: sentence,
    at: nowIso(),
  };

  if (n.draft) {
    // Draft threads only exist client-side: the first bid both creates the
    // server thread and lands this message. If it fails, the draft is dropped
    // and nothing was ever recorded — the haggle "didn't happen".
    upsert({ ...n, qty, messages: [...n.messages, optimistic] });
    void (async () => {
      const seed = draftSeeds.get(negotiationId);
      if (!seed) {
        items = items.filter((x) => x.id !== negotiationId);
        draftSeeds.delete(negotiationId);
        emit();
        return;
      }
      try {
        const thread = await openNegotiation(activeBuyerId(), seed);
        const real = baseFromThread(thread);
        real.basis = n.basis;
        const pending =
          items.find((x) => x.id === negotiationId)?.messages.filter((m) => m.id.startsWith('pending-')) ?? [];
        upsert({ ...real, messages: [...real.messages, ...pending] });
        items = items.filter((x) => x.id !== negotiationId);
        emit();
        draftSeeds.delete(negotiationId);
        const fresh = await submitNegotiationBid(real.id, activeBuyerId(), {
          qty,
          total_kobo: totalKobo,
          message: sentence,
        });
        applyThread(fresh);
      } catch {
        items = items.filter((x) => x.id !== negotiationId);
        draftSeeds.delete(negotiationId);
        emit();
      }
    })();
    return;
  }

  upsert({ ...n, qty, messages: [...n.messages, optimistic] });
  void submitNegotiationBid(negotiationId, activeBuyerId(), {
    qty,
    total_kobo: totalKobo,
    message: sentence,
  })
    .then(applyThread)
    .catch(() => void refresh());
}

/** Buyer accepts a seller counter (or any held price) and settles. */
export function buyerAccept(negotiationId: string, perUnitKobo: number): void {
  const n = items.find((x) => x.id === negotiationId);
  if (!n || n.status === 'SETTLED' || n.draft) return;

  upsert({
    ...n,
    status: 'SETTLED',
    messages: [
      ...n.messages,
      {
        id: `pending-${Date.now()}`,
        kind: 'BUYER_ACCEPT',
        side: 'BUYER',
        qty: n.qty,
        per_unit_kobo: perUnitKobo,
        message: `Oya na so! ${label(perUnitKobo)} each. Make you pack am.`,
        at: new Date().toISOString(),
      },
    ],
  });

  void acceptNegotiation(negotiationId, activeBuyerId(), perUnitKobo)
    .then(applyThread)
    .catch(() => void refresh());
}

/**
 * Buyer walks away. First walk: the seller may (sometimes) call back and
 * reopen the thread. If they already called back once, this walk is final —
 * the haggle closes for both sides and no second callback is scheduled.
 */
export function walkAway(negotiationId: string, message?: string): void {
  const n = items.find((x) => x.id === negotiationId);
  if (!n || n.status === 'SETTLED') return;
  if (n.draft) {
    // Drafts were never persisted — walking away just forgets the haggle.
    items = items.filter((x) => x.id !== negotiationId);
    draftSeeds.delete(negotiationId);
    emit();
    return;
  }
  const sent = message?.trim() || 'I go check other stalls, thank you.';

  // The seller only calls back once. If a CALLBACK already happened, this
  // walk is closed for both sides (server leaves callback_at empty); else
  // mirror the pending call-back window so the UI shows "may call you back".
  const sellerCalledBack = n.messages.some((m) => m.kind === 'CALLBACK');

  upsert({
    ...n,
    status: 'WALKED',
    dropped_at: Date.now(),
    callback: sellerCalledBack ? null : { at: Date.now() + 20000, sent: false },
    messages: [
      ...n.messages,
      {
        id: `pending-${Date.now()}`,
        kind: 'WALK',
        side: 'BUYER',
        qty: n.qty,
        per_unit_kobo: null,
        message: sent,
        at: new Date().toISOString(),
      },
    ],
  });

  void walkAwayNegotiation(negotiationId, activeBuyerId(), sent)
    .then(applyThread)
    .catch(() => void refresh());
}

/** Buyer removes a settled deal from the cart; the seller gets notified. */
export function revokeDeal(negotiationId: string): void {
  const n = items.find((x) => x.id === negotiationId);
  if (!n || n.status !== 'SETTLED') return;

  upsert({
    ...n,
    status: 'REVOKED',
    messages: [
      ...n.messages,
      {
        id: `pending-${Date.now()}`,
        kind: 'REVOKE',
        side: 'BUYER',
        qty: n.qty,
        per_unit_kobo: null,
        message: 'Massa, I don commot this one from my cart for now — no vex. If I change my mind, go come settle.',
        at: new Date().toISOString(),
      },
    ],
  });

  void revokeNegotiation(negotiationId, activeBuyerId())
    .then(applyThread)
    .catch(() => void refresh());
}

/** Zero the callback badge locally and tell the server the thread was seen. */
export function markThreadSeen(negotiationId: string): void {
  const n = items.find((x) => x.id === negotiationId);
  if (!n) return;
  if (n.unseen_callbacks > 0) upsert({ ...n, unseen_callbacks: 0 });
  void markNegotiationSeen(negotiationId, activeBuyerId()).catch(() => {});
}

export function hasUnseenCallback(negotiationId: string): boolean {
  const n = items.find((x) => x.id === negotiationId);
  return n != null && n.unseen_callbacks > 0;
}

/** Sweep-and-refresh: the API resolves due callbacks; we just re-sync. */
export function resumeCallbacks(): void {
  void refresh();
}

/** @deprecated server-owned — kept for API compatibility. */
export function sendCallbackIfDue(_negotiationId: string): void {
  void refresh();
}

export function forTesting(clear = false): void {
  if (clear) {
    items = [];
    loaded = false;
  }
}

export { hashCode };