import { validateEnvelope } from '@ojaline/contracts';
import type { EventType, EventPayload, OutboxEnvelope } from '@ojaline/contracts';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/* ── Offer types (Sprint 1 — derived from catalog.offers schema) ── */

export type Channel = 'RETAILER' | 'WHOLESALE' | 'DIRECT' | 'OPEN';
export type Perishability = 'SHELF_GT_7D' | 'SHELF_LT_7D';
export type FulfilmentMode = 'INSTANT' | 'SCHEDULED' | 'MARKET_DAY';
export type OfferStatus = 'ACTIVE' | 'PAUSED' | 'DELISTED';

export interface Offer {
  id: string;
  seller_id: string;
  channel: Channel;
  sellable_qty: number;
  min_order_qty: number;
  perishability: Perishability;
  fulfilment_modes: FulfilmentMode[];
  cluster_id: string;
  created_at: string;
  product_name: string;
  physical_ref: string;
  price_cents: number | null;
}

export interface DiscoverOffersParams {
  channel?: Channel;
  cluster_id?: string;
  perishability?: Perishability;
  limit?: number;
  offset?: number;
}

export interface DiscoverOffersResponse {
  offers: Offer[];
  total: number;
}

export interface CreateOfferRequest {
  seller_id: string;
  product_name: string;
  physical_ref: string;
  channel: Channel;
  available_qty: number;
  min_order_qty: number;
  perishability: Perishability;
  fulfilment_modes: FulfilmentMode[];
  cluster_id: string;
  price_cents: number;
}

export interface CreateOfferResponse {
  offer_id: string;
  lot_id: string;
}

/* ── HTTP helpers ── */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await safeText(res));
  return (await res.json()) as T;
}

export async function postJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...init?.headers },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status, await safeText(res));
  return (await res.json()) as T;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

/**
 * Fetches a raw outbox envelope (e.g. from a debug/replay endpoint) and
 * validates it against the shared contract, so the client never trusts
 * a malformed event (ADR-003/008).
 */
export async function getEnvelope<T extends EventType>(
  path: string,
  expectedType: T,
): Promise<OutboxEnvelope & { payload: EventPayload<T> }> {
  const raw = await getJson<unknown>(path);
  const result = validateEnvelope(raw);
  if (!result.ok) throw new ApiError(0, `invalid envelope: ${result.reason}`);
  if (result.envelope.event_type !== expectedType) {
    throw new ApiError(0, `expected ${expectedType}, got ${result.envelope.event_type}`);
  }
  return result.envelope as OutboxEnvelope & { payload: EventPayload<T> };
}

/** Placeholder auth surface. Sprint 1 replaces this with real OTP/phone flow. */
export async function login(phoneOrEmail: string, _password: string): Promise<{ user_id: string }> {
  return postJson('/auth/login', { phone_or_email: phoneOrEmail });
}

/* ── Catalog API (Sprint 1) ── */

export async function discoverOffers(params: DiscoverOffersParams = {}): Promise<DiscoverOffersResponse> {
  const qs = new URLSearchParams();
  if (params.channel) qs.set('channel', params.channel);
  if (params.cluster_id) qs.set('cluster_id', params.cluster_id);
  if (params.perishability) qs.set('perishability', params.perishability);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return getJson<DiscoverOffersResponse>(`/catalog/offers${query ? `?${query}` : ''}`);
}

export async function createOffer(body: CreateOfferRequest): Promise<CreateOfferResponse> {
  return postJson<CreateOfferResponse>('/catalog/offers', body);
}

export async function getOfferById(id: string): Promise<Offer> {
  return getJson<Offer>(`/catalog/offers/${id}`);
}
