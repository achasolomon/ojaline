import {
  createWant,
  getWants,
  type Channel,
  type CrowdBidder as ApiBidder,
  type CrowdWant as ApiWant,
} from './api';
import { firstName, sellerHonorific } from './bargain';
import { createRequestNegotiation, findRequestNegotiation, type Negotiation } from './negotiation';
import { connectMarketFeed, disconnectMarketFeed, type MarketEnvelope } from './realtime';
import { activeBuyerId } from './session';

/**
 * A "crowd market" want: the buyer posts a request ("7 baskets of Jaji yam")
 * and the market answers — sellers who stock that produce come bargaining for
 * the sale, with location and ratings visible. The buyer can bargain with
 * several of them at once and settle with the best, like a real market.
 *
 * Everything now lives server-side (market.wants + market.bids): creating a
 * want runs the bid-discovery engine on the API, and live updates arrive
 * over the SSE feed.
 */

export interface CrowdBidder {
  id: string;
  seller_id: string;
  seller_name: string;
  channel: Channel;
  offer_id: string;
  product_name: string;
  unit: string | null;
  market_name: string | null;
  stall_number: string | null;
  rating: number | null;
  review_count: number;
  quote_per_unit_kobo: number;
  quote_total_kobo: number;
  pitch: string;
  chosen: boolean;
  created_at: string;
}

export interface CrowdRequest {
  id: string;
  buyer_id: string;
  buyer_name: string;
  product_name: string;
  qty: number;
  unit: string | null;
  ceiling_kobo: number | null;
  note: string;
  status: 'OPEN' | 'SETTLED' | 'CLOSED' | 'EXPIRED';
  chosen_bid_id: string | null;
  settled_with: CrowdBidder | null;
  closed_at: string | null;
  created_at: string;
  bid_count: number;
  bidders: CrowdBidder[];
}

export interface CreateCrowdRequestInput {
  product_name: string;
  qty: number;
  unit: string | null;
  ceiling_kobo: number | null;
  note?: string;
}

export function sellerLabel(channel: Channel, name: string): string {
  return `${sellerHonorific(channel)} ${firstName(name)}`;
}

export function searchableTerms(productName: string): string[] {
  const cleaned = productName.trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];
  const words = cleaned.split(' ');
  const last = words[words.length - 1];
  const terms = [cleaned];
  if (last.length >= 3 && last.toLowerCase() !== cleaned.toLowerCase()) terms.push(last);
  return terms;
}

/* ---------------------------------- store ---------------------------------- */

type StoreListener = (items: CrowdRequest[]) => void;

const listeners = new Set<StoreListener>();

let items: CrowdRequest[] = [];
let loaded = false;
let inFlight: Promise<void> | null = null;
let feedConnected = false;

function emit(): void {
  listeners.forEach((l) => l(items));
}

async function refresh(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const wants = await getWants(activeBuyerId());
      items = wants.map(mapWant);
    } catch {
      /* offline — keep the last known list */
    } finally {
      loaded = true;
      inFlight = null;
      emit();
    }
  })();
  return inFlight;
}

function mapWant(w: ApiWant): CrowdRequest {
  return {
    id: w.id,
    buyer_id: w.buyer_id,
    buyer_name: w.buyer_name,
    product_name: w.product_name,
    qty: w.qty,
    unit: w.unit,
    ceiling_kobo: w.ceiling_kobo,
    note: w.note,
    status: w.status,
    chosen_bid_id: w.chosen_bid_id,
    settled_with: w.settled_with ? mapBidder(w.settled_with) : null,
    closed_at: w.closed_at,
    created_at: w.created_at,
    bid_count: w.bid_count,
    bidders: w.bidders.map(mapBidder),
  };
}

function mapBidder(b: ApiBidder): CrowdBidder {
  return { ...b, channel: 'OPEN' };
}

function handleEnvelope(env: MarketEnvelope): void {
  if (env.event_type === 'market.want_created') {
    const buyerId = (env.payload as { buyer_id?: string }).buyer_id;
    if (buyerId && buyerId === activeBuyerId()) void refresh();
  }
}

function startFeed(): void {
  if (feedConnected) return;
  feedConnected = true;
  connectMarketFeed(handleEnvelope);
}

function stopFeed(): void {
  if (!feedConnected) return;
  feedConnected = false;
  disconnectMarketFeed(handleEnvelope);
}

export function subscribeRequests(listener: StoreListener): () => void {
  listeners.add(listener);
  if (!loaded) void refresh();
  startFeed();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopFeed();
  };
}

export function getRequests(): CrowdRequest[] {
  if (!loaded) void refresh();
  return items;
}

export function getRequest(id: string): CrowdRequest | undefined {
  if (!loaded) void refresh();
  return items.find((r) => r.id === id);
}

export async function makeCrowdRequest(input: CreateCrowdRequestInput): Promise<CrowdRequest> {
  await createWant(activeBuyerId(), {
    product_name: input.product_name,
    qty: input.qty,
    unit: input.unit,
    ceiling_kobo: input.ceiling_kobo,
    note: input.note,
  });
  await refresh();
  const created = items[0];
  if (!created) throw new Error('Want creation failed');
  return created;
}

export async function bidderChatsOpen(requestId: string, sellerId: string): Promise<Negotiation | undefined> {
  return findRequestNegotiation(requestId, sellerId);
}

export async function openSellerChat(
  request: CrowdRequest,
  bidder: CrowdBidder,
  buyerName: string,
): Promise<Negotiation> {
  const existing = findRequestNegotiation(request.id, bidder.seller_id);
  if (existing) return existing;
  return createRequestNegotiation({
    requestId: request.id,
    bidId: bidder.id,
    seller: {
      id: bidder.seller_id,
      name: bidder.seller_name,
      channel: bidder.channel,
      market_name: bidder.market_name,
      stall_number: bidder.stall_number,
      rating: bidder.rating,
      review_count: bidder.review_count,
    },
    offerRef: {
      offer_id: bidder.offer_id,
      product_name: bidder.product_name,
      unit: bidder.unit,
      price_cents: null,
    },
    askPerUnitKobo: bidder.quote_per_unit_kobo,
    qty: request.qty,
    buyerName,
  });
}