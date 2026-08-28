import { validateEnvelope } from '@ojaline/contracts';
import type { EventType, EventPayload, OutboxEnvelope } from '@ojaline/contracts';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/* ── Offer types ── */

export type Channel = 'RETAILER' | 'WHOLESALE' | 'DIRECT' | 'OPEN';
export type Perishability = 'SHELF_GT_7D' | 'SHELF_LT_7D';
export type FulfilmentMode = 'INSTANT' | 'SCHEDULED' | 'MARKET_DAY';
export type OfferStatus = 'ACTIVE' | 'PAUSED' | 'DELISTED';

export interface OfferImage {
  id: string;
  storage_key: string;
  kind?: 'REFERENCE_PHOTO' | 'GALLERY';
  is_primary?: boolean;
}

export interface Offer {
  id: string;
  seller_id: string;
  seller_name: string;
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
  category_id: string | null;
  primary_image: OfferImage | null;
  images?: OfferImage[];
  negotiable?: boolean;
  stall_number?: string;
  market_name?: string;
  member_since?: string;
  profile_photo_url?: string;
  years_in_market?: number;
  seller_stats?: { avg_rating: number | null; review_count: number };
}

export interface Category {
  id: string;
  name: string;
  perishability_default: Perishability;
  offer_count: number;
  image_url: string | null;
}

export interface DiscoverOffersParams {
  channel?: Channel;
  cluster_id?: string;
  perishability?: Perishability;
  category_id?: string;
  q?: string;
  price_min?: number;
  price_max?: number;
  sort?: 'newest' | 'popular' | 'cheapest';
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
  category_id?: string;
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

async function deleteJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { accept: 'application/json', ...init?.headers },
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
 * Fetches a raw outbox envelope and validates it against the shared contract.
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

export async function login(phoneOrEmail: string, _password: string): Promise<{ user_id: string }> {
  return postJson('/auth/login', { phone_or_email: phoneOrEmail });
}

/* ── Catalog API ── */

export async function discoverOffers(params: DiscoverOffersParams = {}): Promise<DiscoverOffersResponse> {
  const qs = new URLSearchParams();
  if (params.channel) qs.set('channel', params.channel);
  if (params.cluster_id) qs.set('cluster_id', params.cluster_id);
  if (params.perishability) qs.set('perishability', params.perishability);
  if (params.category_id) qs.set('category_id', params.category_id);
  if (params.q) qs.set('q', params.q);
  if (params.price_min != null) qs.set('price_min', String(params.price_min));
  if (params.price_max != null) qs.set('price_max', String(params.price_max));
  if (params.sort) qs.set('sort', params.sort);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return getJson<DiscoverOffersResponse>(`/catalog/offers${query ? `?${query}` : ''}`);
}

export async function getCategories(): Promise<Category[]> {
  return getJson<Category[]>('/catalog/categories');
}

export type SellerType = 'FARMER' | 'MARKET_WOMAN' | 'STORE' | 'PROCESSOR';

export interface Cluster {
  id: string;
  name: string;
  lga: string;
  state: string;
}

export interface Market {
  id: string;
  name: string;
  cluster_id: string;
  cluster_name: string;
  lga: string;
  state?: string;
  operating_days: string[];
  next_date: string | null;
  is_open_today: boolean;
  is_open_on_date?: boolean;
  sellers: Array<{ id: string; full_name: string; seller_type?: SellerType }>;
  product_count: number;
}

export interface MarketDetail extends Market {
  order_cutoff: string;
  seller_groups: Record<string, Array<{ id: string; full_name: string; seller_type?: SellerType }>>;
}

export interface Seller {
  id: string;
  full_name: string;
  seller_type: SellerType | null;
  profile_type: SellerType | null;
  bio: string | null;
  stall_number?: string;
  market_name?: string;
  member_since?: string;
  profile_photo_url?: string;
  years_in_market?: number;
  avg_rating?: number;
  review_count?: number;
  completed_orders?: number;
  total_orders?: number;
  completion_rate?: number;
  markets: Array<{ id: string; name: string; cluster_name: string; lga: string }>;
  products: Offer[];
}

export interface StateLocation {
  state: string;
  cluster_count: number;
}

export interface LgaLocation {
  lga: string;
  cluster_count: number;
}

export async function getClusters(state?: string, lga?: string): Promise<Cluster[]> {
  const qs = new URLSearchParams();
  if (state) qs.set('state', state);
  if (lga) qs.set('lga', lga);
  const query = qs.toString();
  return getJson<Cluster[]>(`/catalog/clusters${query ? `?${query}` : ''}`);
}

export async function getStates(): Promise<StateLocation[]> {
  return getJson<StateLocation[]>('/catalog/locations/states');
}

export async function getLgas(state: string): Promise<LgaLocation[]> {
  return getJson<LgaLocation[]>(`/catalog/locations/lgas?state=${encodeURIComponent(state)}`);
}

export async function getMarkets(clusterId?: string, date?: string): Promise<Market[]> {
  const qs = new URLSearchParams();
  if (clusterId) qs.set('cluster_id', clusterId);
  if (date) qs.set('date', date);
  const query = qs.toString();
  return getJson<Market[]>(`/catalog/markets${query ? `?${query}` : ''}`);
}

export async function getMarketById(id: string): Promise<MarketDetail> {
  return getJson<MarketDetail>(`/catalog/markets/${id}`);
}

export async function getMarketSellers(marketId: string, sellerType?: string): Promise<Array<{ id: string; full_name: string; seller_type: SellerType; product_count: number }>> {
  const qs = sellerType ? `?seller_type=${sellerType}` : '';
  return getJson(`/catalog/markets/${marketId}/sellers${qs}`);
}

export async function getSellerById(id: string): Promise<Seller> {
  return getJson<Seller>(`/catalog/sellers/${id}`);
}

export async function getSimilarOffers(offerId: string, limit = 8): Promise<Offer[]> {
  return getJson<Offer[]>(`/catalog/offers/${offerId}/similar?limit=${limit}`);
}

export async function createOffer(body: CreateOfferRequest): Promise<CreateOfferResponse> {
  return postJson<CreateOfferResponse>('/catalog/offers', body);
}

export async function getOfferById(id: string): Promise<Offer> {
  const raw = await getJson<any>(`/catalog/offers/${id}`);
  return {
    ...raw,
    primary_image: Array.isArray(raw.images) && raw.images.length > 0
      ? raw.images.find((i: any) => i.is_primary) ?? raw.images[0]
      : null,
  };
}

/* ── Top Sellers ── */

export interface TopSeller {
  id: string;
  name: string;
  seller_type: SellerType;
  avg_rating: number;
  review_count: number;
  bio: string | null;
  market_count: number;
  stall_number?: string;
  market_name?: string;
  member_since?: string;
  years_in_market?: number;
  completed_orders?: number;
  total_orders?: number;
  completion_rate?: number;
}

export async function getTopSellers(limit = 5): Promise<TopSeller[]> {
  return getJson<TopSeller[]>(`/catalog/sellers/top?limit=${limit}`);
}

/* ── Batch fetch (for recently viewed) ── */

export async function getBatchOffers(ids: string[]): Promise<Offer[]> {
  if (ids.length === 0) return [];
  return getJson<Offer[]>(`/catalog/offers/batch?ids=${ids.join(',')}`);
}

/* ── Recently Viewed (localStorage) ── */

const RV_KEY = 'ojaline_recently_viewed';
const RV_MAX = 10;

export function trackView(offerId: string): void {
  try {
    const raw = localStorage.getItem(RV_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const filtered = ids.filter((id) => id !== offerId);
    filtered.unshift(offerId);
    localStorage.setItem(RV_KEY, JSON.stringify(filtered.slice(0, RV_MAX)));
  } catch { /* ignore */ }
}

export function getRecentlyViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(RV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/* ── Reviews ── */

export interface Review {
  id: string;
  rating: number;
  review_text: string | null;
  reviewer_photo_url: string | null;
  created_at: string;
  reviewer_name: string;
}

export async function getReviews(offerId: string): Promise<Review[]> {
  return getJson<Review[]>(`/catalog/offers/${offerId}/reviews`);
}

export async function addReview(offerId: string, reviewerId: string, rating: number, reviewText?: string): Promise<unknown> {
  return postJson(`/catalog/offers/${offerId}/reviews`, { reviewer_id: reviewerId, rating, review_text: reviewText });
}

/* ── Chat ── */

export interface Conversation {
  id: string;
  buyer_id: string;
  seller_id: string;
  offer_id: string | null;
  order_id: string | null;
  status: string;
  last_message: string | null;
  last_message_at: string | null;
  other_party_name: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'image' | 'system';
  flagged: boolean;
  created_at: string;
  sender_name?: string;
}

export async function createConversation(buyerId: string, sellerId: string, offerId?: string): Promise<Conversation> {
  return postJson<Conversation>('/chat/conversations', { buyer_id: buyerId, seller_id: sellerId, offer_id: offerId });
}

export async function sendChatMessage(conversationId: string, senderId: string, content: string): Promise<{ message: ChatMessage; warnings: string[]; blocked: boolean }> {
  return postJson(`/chat/conversations/${conversationId}/messages`, { sender_id: senderId, content });
}

export async function getChatMessages(conversationId: string, userId: string, limit = 50, offset = 0): Promise<ChatMessage[]> {
  return getJson<ChatMessage[]>(`/chat/conversations/${conversationId}/messages?user_id=${userId}&limit=${limit}&offset=${offset}`);
}

export async function getUserConversations(userId: string): Promise<Conversation[]> {
  return getJson<Conversation[]>(`/chat/conversations?user_id=${userId}`);
}

/* ── Active Cities ── */

export const ACTIVE_CITIES = [
  { name: 'Lagos', state: 'Lagos' },
  { name: 'Abuja', state: 'FCT' },
  { name: 'Ibadan', state: 'Oyo' },
  { name: 'Port Harcourt', state: 'Rivers' },
  { name: 'Kano', state: 'Kano' },
] as const;

/* ── Saved Addresses ── */

export interface SavedAddress {
  id: string;
  label: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  lga?: string | null;
  landmark?: string | null;
  is_default: boolean;
  created_at: string;
}

export async function getAddresses(userId: string): Promise<SavedAddress[]> {
  return getJson<SavedAddress[]>(`/addresses?user_id=${userId}`);
}

export async function createAddress(userId: string, input: {
  label?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  lga?: string;
  landmark?: string;
  phone_number: string;
  is_default?: boolean;
}): Promise<SavedAddress> {
  return postJson<SavedAddress>('/addresses?user_id=' + userId, input);
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<{ ok: boolean }> {
  return postJson(`/addresses/${addressId}/default?user_id=${userId}`, {});
}

export async function deleteAddress(userId: string, addressId: string): Promise<{ ok: boolean }> {
  return deleteJson(`/addresses/${addressId}?user_id=${userId}`);
}

/* ── Push Notifications ── */

export async function subscribeToPush(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<{ ok: boolean; id: string }> {
  return postJson('/push/subscribe?user_id=' + userId, { ...sub });
}

/* ── ToS Enforcement ── */

export interface SellerToSStatus {
  warning_count: number;
  visibility_penalty: boolean;
  latest_action: string | null;
}

export async function getToSStatus(userId: string): Promise<SellerToSStatus> {
  return getJson<SellerToSStatus>(`/tos/status?user_id=${userId}`);
}
