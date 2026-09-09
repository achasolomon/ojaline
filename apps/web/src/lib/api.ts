import { validateEnvelope } from '@ojaline/contracts';
import type { EventType, EventPayload, OutboxEnvelope } from '@ojaline/contracts';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * Resolve a backend storage key (e.g. "fruits.jpg") into a fetchable URL.
 * The API stores relative filenames and serves them from GET /media/:key.
 */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//i.test(key) || key.startsWith('/')) return key;
  return `${BASE_URL}/media/${key}`;
}

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
  unit?: string | null;
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
  menu_section?: string | null;
  children?: Category[];
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
  unit?: string;
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

async function patchJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
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

export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string;
  status: string;
  seller_type: string | null;
  roles: string[];
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export type OAuthProvider = 'google' | 'facebook';

/** Full URL to kick off a provider's authorization flow (web redirect). */
export function oauthAuthorizeUrl(provider: OAuthProvider): string {
  return `${BASE_URL}/auth/oauth/${provider}/authorize`;
}

export async function login(phoneOrEmail: string, password: string): Promise<AuthSession> {
  return postJson<AuthSession>('/auth/login', { phone_or_email: phoneOrEmail, password });
}

export async function register(input: { full_name: string; phone: string; email?: string; password: string }): Promise<AuthSession> {
  return postJson<AuthSession>('/auth/register', input);
}

export async function getMe(token: string): Promise<AuthUser> {
  return getJson<AuthUser>('/auth/me', { headers: { authorization: `Bearer ${token}` } });
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

const offerFetchCache = new Map<string, Promise<Offer>>();

async function fetchOffer(id: string): Promise<Offer> {
  const raw = await getJson<any>(`/catalog/offers/${id}`);
  return {
    ...raw,
    primary_image: Array.isArray(raw.images) && raw.images.length > 0
      ? raw.images.find((i: any) => i.is_primary) ?? raw.images[0]
      : null,
  };
}

export function prefetchOffer(id: string): void {
  if (offerFetchCache.has(id)) return;
  const promise = fetchOffer(id).catch((err) => {
    offerFetchCache.delete(id);
    throw err;
  });
  offerFetchCache.set(id, promise);
}

export async function getOfferById(id: string): Promise<Offer> {
  let promise = offerFetchCache.get(id);
  if (!promise) prefetchOffer(id);
  promise = offerFetchCache.get(id)!;
  return promise;
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

const RV_KEY = 'kika_recently_viewed';
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

/* ── Marketplace Advertising (ADR-009) ── */

export type AdFormat = 'TOAST' | 'BANNER';
export type AdTargetType = 'OFFER' | 'SELLER' | 'NONE';
export type AdStatus = 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REMOVED';

export interface Ad {
  id: string;
  seller_id: string;
  seller_name?: string;
  title: string;
  body: string | null;
  format: AdFormat;
  image_key: string | null;
  target_type: AdTargetType;
  target_id: string | null;
  category_id: string | null;
  cluster_id: string | null;
  channel: string | null;
  status?: AdStatus;
  starts_at: string;
  ends_at: string;
  max_impressions?: number | null;
  impressions_shown?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAdInput {
  title: string;
  body?: string;
  format: AdFormat;
  image_key?: string;
  target_type: AdTargetType;
  target_id?: string;
  category_id?: string;
  cluster_id?: string;
  channel?: string;
  max_impressions?: number;
}

export async function listAds(sellerId: string): Promise<Ad[]> {
  return getJson<Ad[]>(`/ads?seller_id=${encodeURIComponent(sellerId)}`);
}

export async function createAd(sellerId: string, input: CreateAdInput): Promise<Ad> {
  return postJson<Ad>(`/ads?seller_id=${encodeURIComponent(sellerId)}`, input);
}

export async function updateAd(sellerId: string, adId: string, patch: Partial<CreateAdInput> & { status?: AdStatus }): Promise<Ad> {
  return patchJson<Ad>(`/ads/${adId}?seller_id=${encodeURIComponent(sellerId)}`, patch);
}

export async function deleteAd(sellerId: string, adId: string): Promise<{ ok: boolean; removed: boolean }> {
  return deleteJson<{ ok: boolean; removed: boolean }>(`/ads/${adId}?seller_id=${encodeURIComponent(sellerId)}`);
}

export async function getActiveAds(params: { format?: AdFormat; cluster_id?: string; category_id?: string } = {}): Promise<Ad[]> {
  const qs = new URLSearchParams();
  if (params.format) qs.set('format', params.format);
  if (params.cluster_id) qs.set('cluster_id', params.cluster_id);
  if (params.category_id) qs.set('category_id', params.category_id);
  const query = qs.toString();
  return getJson<Ad[]>(`/ads/active${query ? `?${query}` : ''}`);
}

export async function reportAd(adId: string, userId: string | null, reason: string): Promise<{ ok: boolean; removed: boolean }> {
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
  return postJson<{ ok: boolean; removed: boolean }>(`/ads/${adId}/report${qs}`, { reason });
}

/**
 * Convert a picked File into the base64 + mime body the media endpoint expects.
 */
export async function fileToBase64(file: File): Promise<{ data: string; mime: string }> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return { data: btoa(binary), mime: file.type || 'image/jpeg' };
}

export async function uploadImage(data: string, mime: string): Promise<string> {
  const res = await postJson<{ storage_key: string }>('/media', { data, mime });
  return res.storage_key;
}
