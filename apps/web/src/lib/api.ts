import { validateEnvelope } from '@ojaline/contracts';
import type { EventType, EventPayload, OutboxEnvelope } from '@ojaline/contracts';
import { getToken, handleUnauthorized } from './session';

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
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: mergedHeaders(init) });
  if (!res.ok) return reject(res, path);
  return (await res.json()) as T;
}

export async function postJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    method: 'POST',
    headers: mergedHeaders(init, { 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) return reject(res, path);
  return (await res.json()) as T;
}

async function deleteJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { ...init, method: 'DELETE', headers: mergedHeaders(init) });
  if (!res.ok) return reject(res, path);
  return (await res.json()) as T;
}

async function patchJson<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    method: 'PATCH',
    headers: mergedHeaders(init, { 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) return reject(res, path);
  return (await res.json()) as T;
}

/** When a session is active, every request is automatically authenticated
 *  (authority: JwtAuthGuard + assertOwnedOrAnon on the server). */
function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Merge request headers so the Authorization header is emitted exactly once.
 * HTTP header names are case-insensitive, but plain-object spreads keep
 * `Authorization` and `authorization` as two keys, which produces
 * `Bearer <token>, Bearer <token>` on the wire and breaks the JWT guard.
 * An explicit `authorization`/`Authorization` in `init.headers` overrides
 * the session auto-header.
 */
function mergedHeaders(init?: RequestInit, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (key.toLowerCase() !== 'authorization') headers[key] = value;
    }
  }
  let authOverride: string | undefined;
  if (init?.headers) {
    for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
      if (!value) continue;
      if (key.toLowerCase() === 'authorization') authOverride = String(value);
      else headers[key] = value;
    }
  }
  const auth = authOverride ?? authHeaders().Authorization;
  if (auth) headers.Authorization = auth;
  return headers;
}

/**
 * A 401 from a protected endpoint while a session is active means the stored
 * token is no longer accepted (expired or revoked). Restore the app to a
 * logged-out state and send the user to login. A 401 from the login endpoint
 * is excluded — that one belongs to the credentials form.
 */
function handleRejectedAuth(path: string): void {
  if (path === '/auth/login') return;
  if (!getToken()) return;
  handleUnauthorized();
}

async function reject(res: Response, path: string): Promise<never> {
  if (res.status === 401) handleRejectedAuth(path);
  throw new ApiError(res.status, await safeText(res));
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
  channel: Channel;
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

/* ── Sellers / KYC ── */

export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SellerKyc {
  id_type: string;
  status: KycStatus;
  review_note: string | null;
  submitted_at: string;
}

export interface SellerStatus {
  seller_type: SellerType | null;
  kyc_tier: 'BASIC' | 'FULL' | null;
  kyc: SellerKyc | null;
}

export interface SellerKycInput {
  id_type: string;
  id_number: string;
  date_of_birth: string;
  address_line1: string;
  city: string;
  state: string;
}

export interface SellerRegistrationInput {
  seller_type: SellerType;
  business_name?: string;
  market_name?: string;
  city: string;
  state: string;
  lga?: string;
  bio?: string;
}

export async function getSellerStatus(token?: string): Promise<SellerStatus> {
  return getJson<SellerStatus>('/sellers/me', { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

export async function registerSeller(token: string, input: SellerRegistrationInput): Promise<SellerStatus> {
  return postJson<SellerStatus>('/sellers/register', input, {
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function submitSellerKyc(token: string, input: SellerKycInput): Promise<SellerStatus> {
  return postJson<SellerStatus>('/sellers/kyc', input, {
    headers: { authorization: `Bearer ${token}` },
  });
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

export interface SearchSuggestion {
  kind: 'OFFER' | 'CATEGORY' | 'SELLER';
  id: string;
  label: string;
  sub?: string | null;
  href: string;
  imageUrl?: string | null;
}

/** Fast cross-entity lookup for the header's live search dropdown. */
export async function searchSuggestions(q: string, limit = 5): Promise<SearchSuggestion[]> {
  const query = q.trim();
  if (!query) return [];
  const lowered = query.toLowerCase();
  const [offersRes, cats] = await Promise.all([
    discoverOffers({ q: query, limit: Math.max(limit, 5) }),
    getCategories(),
  ]);
  const out: SearchSuggestion[] = [];
  const seenSellers = new Set<string>();
  for (const o of offersRes.offers.slice(0, limit)) {
    out.push({
      kind: 'OFFER',
      id: o.id,
      label: o.product_name,
      sub: [o.seller_name, o.unit ? `per ${o.unit}` : null].filter(Boolean).join(' · ') || null,
      href: `/offers/${o.id}`,
      imageUrl: o.primary_image?.storage_key ? `${BASE_URL}/media/${o.primary_image.storage_key}` : null,
    });
    if (o.seller_name && !seenSellers.has(o.seller_id)) {
      seenSellers.add(o.seller_id);
      out.push({
        kind: 'SELLER',
        id: o.seller_id,
        label: o.seller_name,
        sub: o.market_name ?? null,
        href: `/sellers/${o.seller_id}`,
      });
    }
  }
  for (const c of cats) {
    if (String(c.name).toLowerCase().includes(lowered)) {
      out.push({
        kind: 'CATEGORY',
        id: c.id,
        label: c.name,
        sub: `${c.offer_count} items`,
        href: `/offers?category_id=${c.id}`,
        imageUrl: c.image_url ? mediaUrl(c.image_url) : null,
      });
    }
  }
  return out.slice(0, limit * 3);
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
  verified?: boolean;
  business_name?: string | null;
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

export async function getStorefront(id: string): Promise<Seller> {
  return getJson<Seller>(`/catalog/sellers/${id}/storefront`);
}

/* ── Seller catalogue management (Phase 2) ── */

export interface MyOffer {
  id: string;
  status: OfferStatus;
  channel: Channel;
  available_qty: number;
  reserved_qty: number;
  soft_held_qty: number;
  sellable_qty: number;
  min_order_qty: number;
  perishability: Perishability;
  fulfilment_modes: FulfilmentMode[];
  cluster_id: string;
  unit: string | null;
  created_at: string;
  product_name: string;
  physical_ref: string;
  category_id: string | null;
  price_cents: number | null;
  primary_image: OfferImage | null;
  sold_qty: number;
  delivered_qty: number;
}

export interface MyOffersPage {
  offers: MyOffer[];
  total: number;
}

export interface UpdateOfferInput {
  product_name?: string;
  physical_ref?: string;
  unit?: string;
  available_qty?: number;
  min_order_qty?: number;
  channel?: Channel;
  perishability?: Perishability;
  fulfilment_modes?: FulfilmentMode[];
  cluster_id?: string;
  price_cents?: number;
}

export async function getMyOffers(
  sellerId: string,
  params?: { status?: OfferStatus; q?: string; limit?: number; offset?: number },
): Promise<MyOffersPage> {
  const qs = new URLSearchParams({ seller_id: sellerId });
  if (params?.status) qs.set('status', params.status);
  if (params?.q) qs.set('q', params.q);
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.offset != null) qs.set('offset', String(params.offset));
  return getJson<MyOffersPage>(`/catalog/offers/mine?${qs.toString()}`);
}

export async function updateOffer(offerId: string, input: UpdateOfferInput): Promise<{ offer_id: string; updated: string[] }> {
  return patchJson<{ offer_id: string; updated: string[] }>(`/catalog/offers/${offerId}`, input);
}

export async function setOfferStatus(
  offerId: string,
  action: 'pause' | 'reactivate' | 'delist',
): Promise<{ offer_id: string; status: OfferStatus }> {
  return postJson<{ offer_id: string; status: OfferStatus }>(`/catalog/offers/${offerId}/${action}`, {});
}

export async function addOfferMedia(
  offerId: string,
  storageKey: string,
  isPrimary?: boolean,
): Promise<{ id: string; storage_key: string; is_primary: boolean }> {
  return postJson(`/catalog/offers/${offerId}/media`, { storage_key: storageKey, is_primary: isPrimary });
}

export async function removeOfferMedia(offerId: string, mediaId: string): Promise<{ removed: boolean }> {
  return deleteJson(`/catalog/offers/${offerId}/media/${mediaId}`);
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

export async function addReview(offerId: string, reviewerId: string, rating: number, reviewText?: string): Promise<Review> {
  return postJson<Review>(`/catalog/offers/${offerId}/reviews`, { reviewer_id: reviewerId, rating, review_text: reviewText });
}

/* ── Wishlist ── */

export interface WishlistEntry {
  offer_id: string;
  wished_at: string;
  offer: Offer;
}

export async function getWishlist(userId: string): Promise<WishlistEntry[]> {
  return getJson<WishlistEntry[]>(`/catalog/wishlist?user_id=${encodeURIComponent(userId)}`);
}

export async function addToWishlist(userId: string, offerId: string): Promise<{ added: boolean }> {
  return postJson<{ added: boolean }>('/catalog/wishlist', { user_id: userId, offer_id: offerId });
}

export async function removeFromWishlist(userId: string, offerId: string): Promise<{ removed: boolean }> {
  return deleteJson<{ removed: boolean }>(
    `/catalog/wishlist?user_id=${encodeURIComponent(userId)}&offer_id=${encodeURIComponent(offerId)}`,
  );
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

/* ── Delivery States (nationwide) ── */

export interface NigerianState {
  state: string;
  capital: string;
  lgas: string[];
  /** Selectable areas: curated neighbourhoods for hubs, otherwise LGAs. */
  areas: string[];
}

export interface Ward {
  name: string;
  latitude: number;
  longitude: number;
}

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
  recipient_name?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  area?: string | null;
  lga?: string | null;
  ward?: string | null;
  landmark?: string | null;
  instructions?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone_number?: string;
  is_default: boolean;
  created_at: string;
}

export interface CreateAddressInput {
  label?: string;
  recipient_name?: string;
  address_line1: string;
  address_line2?: string;
  city?: string;
  state: string;
  area?: string;
  lga?: string;
  ward?: string;
  landmark?: string;
  instructions?: string;
  latitude?: number | null;
  longitude?: number | null;
  phone_number: string;
  is_default?: boolean;
}

export async function getAreas(): Promise<NigerianState[]> {
  return getJson<NigerianState[]>('/addresses/areas');
}

export async function getWards(state: string, lga: string): Promise<Ward[]> {
  return getJson<Ward[]>(`/addresses/wards?state=${encodeURIComponent(state)}&lga=${encodeURIComponent(lga)}`);
}

export async function getAddresses(userId: string): Promise<SavedAddress[]> {
  return getJson<SavedAddress[]>(`/addresses?user_id=${userId}`);
}

export async function createAddress(userId: string, input: CreateAddressInput): Promise<SavedAddress> {
  return postJson<SavedAddress>('/addresses?user_id=' + userId, input);
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<{ ok: boolean }> {
  return postJson(`/addresses/${addressId}/default?user_id=${userId}`, {});
}

export async function deleteAddress(userId: string, addressId: string): Promise<{ ok: boolean }> {
  return deleteJson(`/addresses/${addressId}?user_id=${userId}`);
}

/* ── Geocoding (OSM via the API proxy) ── */

export interface GeoPlace {
  label: string;
  house?: string | null;
  road?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  lga?: string | null;
  lat: number | null;
  lon: number | null;
  covered: boolean;
  /** Curated city/neighbourhood hit (no pin — pick from the lists). */
  is_area?: boolean;
}

export async function geoSearch(q: string): Promise<GeoPlace[]> {
  return getJson<GeoPlace[]>(`/geo/search?q=${encodeURIComponent(q)}`);
}

export async function geoReverse(lat: number, lon: number): Promise<GeoPlace> {
  return getJson<GeoPlace>(`/geo/reverse?lat=${lat}&lon=${lon}`);
}

/* ── Push Notifications ── */

export async function subscribeToPush(userId: string, sub: { endpoint: string; p256dh: string; auth: string }): Promise<{ ok: boolean; id: string }> {
  return postJson('/push/subscribe?user_id=' + userId, { ...sub });
}

export async function unsubscribeFromPush(userId: string, endpoint: string): Promise<{ ok: boolean }> {
  return deleteJson<{ ok: boolean }>(`/push/unsubscribe?user_id=${encodeURIComponent(userId)}`, {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

export async function getPushSubscriptions(userId: string): Promise<Array<{ id: string; endpoint: string; device_type: string; created_at: string }>> {
  return getJson(`/push/subscriptions?user_id=${encodeURIComponent(userId)}`);
}

export async function getVapidPublicKey(): Promise<{ public_key: string; enabled: boolean }> {
  return getJson('/push/vapid-public-key');
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

/* ── Content (banners / market-day) ── */

export interface Banner {
  id: string;
  slot: 'HERO' | 'MARKET_DAY';
  title: string;
  subtitle: string;
  cta_label: string;
  cta_href: string;
  image_key: string | null;
  gradient: string | null;
  fallback_icon: string;
  sort_order: number;
  starts_at: string;
  ends_at: string;
}

export interface MarketDayInfo {
  next_date: string | null;
  market_count: number;
  product_count: number;
  banner: Omit<Banner, 'slot' | 'sort_order' | 'starts_at' | 'ends_at'> | null;
}

export async function getBanners(): Promise<Banner[]> {
  return getJson<Banner[]>('/content/banners');
}

export async function getMarketDay(): Promise<MarketDayInfo> {
  return getJson<MarketDayInfo>('/content/market-day');
}

/* ── Crowd market / wants ── */

export interface CrowdBidder {
  id: string;
  seller_id: string;
  seller_name: string;
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

export interface CrowdWant {
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

export async function createWant(buyerId: string, input: {
  product_name: string;
  qty: number;
  unit?: string | null;
  ceiling_kobo?: number | null;
  note?: string;
}): Promise<CrowdWant> {
  return postJson<CrowdWant>(`/wants?buyer_id=${encodeURIComponent(buyerId)}`, input);
}

export async function getWants(buyerId: string): Promise<CrowdWant[]> {
  return getJson<CrowdWant[]>(`/wants?buyer_id=${encodeURIComponent(buyerId)}`);
}

export async function getWant(wantId: string): Promise<CrowdWant> {
  return getJson<CrowdWant>(`/wants/${wantId}`);
}

/* ── Orders ── */

export interface OrderLine {
  offer_id: string;
  product_name: string;
  unit: string | null;
  qty: number;
  unit_price_cents: number;
  status: string;
}

export interface OrderSummary {
  id: string;
  channel: string;
  status: string;
  multi_seller: boolean;
  item_total_cents: number;
  delivery_fee_cents: number;
  landed_total_cents: number;
  currency: string;
  delivery_mode?: FulfilmentMode;
  created_at: string;
  updated_at: string;
  lines: OrderLine[];
}

export async function listOrders(buyerId: string): Promise<OrderSummary[]> {
  return getJson<OrderSummary[]>(`/orders?buyer_id=${encodeURIComponent(buyerId)}`);
}

export interface CheckoutItem {
  offer_id: string;
  qty: number;
  unit_price_cents: number;
}

export interface CreateCheckoutResponse {
  order_id: string;
  checkout_session_id: string;
  channel: string;
  delivery_mode?: FulfilmentMode;
  item_total_cents: number;
  delivery_fee_cents: number;
  landed_total_cents: number;
  currency: string;
  soft_hold_expires_at: string | null;
  items: CheckoutItem[];
}

export interface PayOrderResponse {
  authorization_url: string;
  reference: string;
}

export async function createCheckout(params: {
  buyerId: string;
  items: CheckoutItem[];
  windowStart: string;
  windowEnd: string;
  deliveryMode?: FulfilmentMode;
}): Promise<CreateCheckoutResponse> {
  return postJson<CreateCheckoutResponse>('/orders/checkout', {
    buyer_id: params.buyerId,
    items: params.items,
    soft_hold_ids: [],
    window_start: params.windowStart,
    window_end: params.windowEnd,
    delivery_mode: params.deliveryMode,
  });
}

export async function payOrder(orderId: string, callbackUrl?: string): Promise<PayOrderResponse> {
  return postJson<PayOrderResponse>(`/orders/${orderId}/pay`, { callback_url: callbackUrl });
}

export interface OrderDetailLine extends OrderLine {
  id: string;
  order_id: string;
  seller_id: string;
  seller_name?: string;
  stock_hold_id?: string | null;
}

export interface EscrowSummary {
  id: string;
  status: string;
  amount_held_cents: number;
  release_scheduled_at?: string | null;
}

export interface OrderDetail extends OrderSummary {
  buyer_id: string;
  checkout_session_id?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  decision_deadline_at?: string | null;
  escrow?: EscrowSummary | null;
  lines: OrderDetailLine[];
}

export interface FulfilmentLineStatus {
  line_id: string;
  offer_id: string;
  seller_id: string;
  qty: number;
  status: string;
}

export interface FulfilmentStatus {
  order_id: string;
  order_status: string;
  lines: FulfilmentLineStatus[];
  pending_decisions: string[];
}

export interface BuyerDecisionResult {
  order_id: string;
  order_status: string;
  affected_lines: string[];
  action: 'CONTINUE' | 'CANCEL' | 'REPLACE_SELLER';
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  return getJson<OrderDetail>(`/orders/${orderId}`);
}

export async function getFulfilmentStatus(orderId: string): Promise<FulfilmentStatus> {
  return getJson<FulfilmentStatus>(`/orders/${orderId}/fulfilment`);
}

export async function confirmDelivery(orderId: string): Promise<{ order_id: string; escrow_status: string; release_scheduled_at: string }> {
  return postJson<{ order_id: string; escrow_status: string; release_scheduled_at: string }>(`/orders/${orderId}/deliver`, {});
}

export async function cancelOrder(orderId: string): Promise<{ order_id: string; order_status: string; refunded_cents: number }> {
  return postJson<{ order_id: string; order_status: string; refunded_cents: number }>(`/orders/${orderId}/cancel`, {});
}

/* ── Seller fulfilment ── */

export interface SellerOrderLine {
  id: string;
  offer_id: string;
  product_name: string;
  unit: string | null;
  qty: number;
  unit_price_cents: number;
  commission_cents: number;
  seller_payable_cents: number;
  status: string;
  tracking_ref: string | null;
  accepted_at: string | null;
  dispatched_at: string | null;
  decline_reason: string | null;
}

export interface SellerOrderItem extends OrderSummary {
  buyer_id: string;
  buyer_name: string;
  lines: SellerOrderLine[];
}

export interface SellerOrdersPage {
  orders: SellerOrderItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function listSellerOrders(
  sellerId: string,
  opts: { status?: string; lineStatus?: string; limit?: number; offset?: number } = {},
): Promise<SellerOrdersPage> {
  const qs = new URLSearchParams({ seller_id: sellerId });
  if (opts.status) qs.set('status', opts.status);
  if (opts.lineStatus) qs.set('line_status', opts.lineStatus);
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  return getJson<SellerOrdersPage>(`/orders?${qs.toString()}`);
}

export async function acceptOrderLine(orderId: string, lineId: string) {
  return postJson<{ order_id: string; line_id: string; status: string }>(
    `/orders/${orderId}/lines/${lineId}/accept`,
    {},
  );
}

export async function dispatchOrderLine(orderId: string, lineId: string, trackingRef?: string) {
  return postJson<{ order_id: string; line_id: string; status: string; order_status: string; tracking_ref: string | null }>(
    `/orders/${orderId}/lines/${lineId}/dispatch`,
    { tracking_ref: trackingRef },
  );
}

export async function declineOrderLine(orderId: string, lineId: string, reason?: string) {
  return postJson<{ order_id: string; line_id: string; status: string; order_status: string; decision_deadline_at: string | null }>(
    `/orders/${orderId}/lines/${lineId}/decline`,
    { reason },
  );
}

export async function decideOrder(
  orderId: string,
  action: BuyerDecisionResult['action'],
  lineIds: string[],
): Promise<BuyerDecisionResult> {
  return postJson<BuyerDecisionResult>(`/orders/${orderId}/decide`, {
    order_id: orderId,
    action,
    line_ids: lineIds,
  });
}

/* ── Seller payouts (Phase 3) ── */

export type PayoutRequestStatus = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'SENT' | 'FAILED';

export interface SellerBankAccount {
  id: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary: boolean;
}

export interface PayoutBalance {
  available_cents: number;
  on_hold_cents: number;
  pending_cents: number;
  withdrawn_cents: number;
  released_total_cents: number;
}

export interface PayoutLedgerEntry {
  id: string;
  entry_type: string;
  amount_cents: number;
  order_id: string;
  reference: string | null;
  created_at: string;
}

export interface PayoutLedgerPage {
  entries: PayoutLedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface PayoutRequestRecord {
  id: string;
  amount_cents: number;
  status: PayoutRequestStatus;
  bank_account: SellerBankAccount | null;
  transfer_reference: string | null;
  review_note: string | null;
  requested_at: string;
  processed_at: string | null;
}

export interface PayoutRequestsPage {
  requests: PayoutRequestRecord[];
  total: number;
  limit: number;
  offset: number;
}

export async function getPayoutBalance(): Promise<PayoutBalance> {
  return getJson<PayoutBalance>('/sellers/payouts/balance');
}

export async function getPayoutLedger(opts: { limit?: number; offset?: number } = {}): Promise<PayoutLedgerPage> {
  return getJson<PayoutLedgerPage>(`/sellers/payouts/ledger?limit=${opts.limit ?? 20}&offset=${opts.offset ?? 0}`);
}

export async function getPayoutRequests(opts: { status?: string; limit?: number; offset?: number } = {}): Promise<PayoutRequestsPage> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  qs.set('limit', String(opts.limit ?? 20));
  qs.set('offset', String(opts.offset ?? 0));
  return getJson<PayoutRequestsPage>(`/sellers/payouts/requests?${qs.toString()}`);
}

export async function requestPayout(input: { amount_cents: number; bank_account_id: string }): Promise<PayoutRequestRecord> {
  return postJson<PayoutRequestRecord>('/sellers/payouts/request', input);
}

export async function getBankAccounts(): Promise<SellerBankAccount[]> {
  return getJson<SellerBankAccount[]>('/sellers/payouts/bank-accounts');
}

export async function addBankAccount(input: {
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary?: boolean;
}): Promise<SellerBankAccount> {
  return postJson<SellerBankAccount>('/sellers/payouts/bank-accounts', input);
}

export async function setPrimaryBankAccount(accountId: string): Promise<{ ok: true }> {
  return patchJson(`/sellers/payouts/bank-accounts/${accountId}/primary`, {});
}

export async function deleteBankAccount(accountId: string): Promise<{ ok: boolean; removed: boolean }> {
  return deleteJson(`/sellers/payouts/bank-accounts/${accountId}`);
}

/* ── Negotiations ── */

export type NegotiationStatus = 'OPEN' | 'ENDED' | 'SETTLED' | 'REVOKED';
export type NegotiationMessageKind =
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
  kind: NegotiationMessageKind;
  side: 'BUYER' | 'SELLER';
  qty: number;
  per_unit_kobo: number | null;
  message: string;
  at: string;
}

export interface NegotiationThread {
  id: string;
  basis: {
    type: 'OFFER' | 'REQUEST';
    offer?: { id: string; product_name: string; unit: string | null } | undefined;
    request_id?: string | undefined;
    ask_per_unit_kobo: number;
    floor_per_unit_kobo: number;
  };
  seller: { id: string; name: string; channel: Channel };
  buyer_name: string;
  qty: number;
  status: NegotiationStatus;
  messages: NegotiationMessage[];
  demeanor: 'easy' | 'fair' | 'tough';
  ended_at: string | null;
  ended_by: 'BUYER' | 'SELLER' | null;
  frozen_seller_per_unit_kobo: number | null;
  frozen_buyer_per_unit_kobo: number | null;
  freeze_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function openNegotiation(buyerId: string, input: {
  basis_type: 'OFFER' | 'REQUEST';
  offer_id?: string;
  want_id?: string;
  bid_id?: string;
  qty?: number;
}): Promise<NegotiationThread> {
  return postJson<NegotiationThread>(`/negotiations?buyer_id=${encodeURIComponent(buyerId)}`, input);
}

export async function listNegotiations(buyerId: string): Promise<NegotiationThread[]> {
  return getJson<NegotiationThread[]>(`/negotiations?buyer_id=${encodeURIComponent(buyerId)}`);
}

export async function submitNegotiationBid(negotiationId: string, buyerId: string, input: {
  qty: number;
  total_kobo: number;
  message?: string;
}): Promise<NegotiationThread> {
  return postJson<NegotiationThread>(
    `/negotiations/${negotiationId}/bid?buyer_id=${encodeURIComponent(buyerId)}`,
    input,
  );
}

export async function acceptNegotiation(negotiationId: string, buyerId: string, per_unit_kobo: number): Promise<NegotiationThread> {
  return postJson<NegotiationThread>(
    `/negotiations/${negotiationId}/accept?buyer_id=${encodeURIComponent(buyerId)}`,
    { per_unit_kobo },
  );
}

export async function revokeNegotiation(negotiationId: string, buyerId: string): Promise<NegotiationThread> {
  return postJson<NegotiationThread>(
    `/negotiations/${negotiationId}/revoke?buyer_id=${encodeURIComponent(buyerId)}`,
    {},
  );
}

/** Either party can end a bargain; the last prices are frozen for 24h. */
export async function endNegotiation(
  negotiationId: string,
  buyerId: string,
  message?: string,
): Promise<NegotiationThread> {
  return postJson<NegotiationThread>(
    `/negotiations/${negotiationId}/end?buyer_id=${encodeURIComponent(buyerId)}`,
    message ? { message } : {},
  );
}

/** Buyer "Pays this" — accepts the seller's frozen price. */
export async function payFrozenNegotiation(negotiationId: string, buyerId: string): Promise<NegotiationThread> {
  return postJson<NegotiationThread>(
    `/negotiations/${negotiationId}/accept-frozen?buyer_id=${encodeURIComponent(buyerId)}`,
    {},
  );
}

/** Buyer reopens an ended bargain with a fresh price. */
export async function continueNegotiation(
  negotiationId: string,
  buyerId: string,
  input: { per_unit_kobo: number; qty?: number; message?: string },
): Promise<NegotiationThread> {
  return postJson<NegotiationThread>(
    `/negotiations/${negotiationId}/continue?buyer_id=${encodeURIComponent(buyerId)}`,
    input,
  );
}

/* ── Notifications feed ── */

export type NotificationType = 'order' | 'chat' | 'market' | 'deal' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  deep_link: string | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(userId: string, limit = 50): Promise<AppNotification[]> {
  return getJson<AppNotification[]>(`/notifications?user_id=${encodeURIComponent(userId)}&limit=${limit}`);
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const res = await getJson<{ count: number }>(`/notifications/unread?user_id=${encodeURIComponent(userId)}`);
  return res.count;
}

export async function markNotificationsRead(userId: string, ids?: string[]): Promise<{ ok: boolean; updated: number }> {
  return postJson<{ ok: boolean; updated: number }>('/notifications/read', { user_id: userId, ids });
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

/* ── Phase 4: Returns & disputes ── */

export interface ReturnRequest {
  id: string;
  order_id: string;
  order_line_id: string;
  buyer_id: string;
  seller_id: string;
  product_name: string;
  qty: number;
  unit_price_cents: number;
  refund_cents: number;
  reason: string;
  reason_note: string | null;
  status: string;
  decision_note: string | null;
  dispute_id: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ReturnPage {
  returns: ReturnRequest[];
  total: number;
  limit: number;
  offset: number;
}

export interface DisputeRow {
  id: string;
  order_id: string;
  return_request_id: string | null;
  opened_by: string;
  type: string;
  reason: string;
  status: string;
  decision_notes: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface DisputePage {
  disputes: DisputeRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface KycQueueRow {
  user_id: string;
  phone: string | null;
  full_name: string;
  id_type: string;
  status: string;
  submitted_at: string;
}

export interface KycPage {
  kyc: KycQueueRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface SellerRiskRow {
  user_id: string;
  full_name: string;
  tier: string;
  on_time_rate_30d: number | null;
  dispute_rate_30d: number | null;
  qa_rate: number | null;
  ops_override: boolean;
  updated_at: string;
}

export interface SellerRiskPage {
  sellers: SellerRiskRow[];
  total: number;
}

export interface SellerStats {
  seller_id: string;
  revenue_cents: number;
  orders_total: number;
  orders_completed: number;
  orders_cancelled: number;
  on_time_rate: number;
  dispute_rate_30d: number;
  avg_rating: number | null;
  review_count: number;
  top_products: Array<{ offer_id: string; product_name: string; sold_qty: number; revenue_cents: number }>;
}

export interface PlatformStats {
  sellers_total: number;
  orders_total: number;
  gmv_cents: number;
  pending_kyc: number;
  open_disputes: number;
  pending_payouts: number;
  returns_30d: number;
}

export async function createReturn(input: { order_id: string; order_line_id: string; reason: string; reason_note?: string; qty: number }): Promise<ReturnRequest> {
  return postJson<ReturnRequest>('/disputes/returns', input);
}

export async function listReturns(opts: { all?: boolean; status?: string; limit?: number; offset?: number } = {}): Promise<ReturnPage> {
  const qs = new URLSearchParams();
  if (opts.all) qs.set('all', 'true');
  if (opts.status) qs.set('status', opts.status);
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  return getJson<ReturnPage>(`/disputes/returns${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export async function getReturn(returnId: string): Promise<ReturnRequest> {
  return getJson<ReturnRequest>(`/disputes/returns/${returnId}`);
}

export async function respondToReturn(returnId: string, action: 'ACCEPT' | 'REJECT', note?: string): Promise<{ status: string; refund_cents?: number }> {
  return postJson<{ status: string; refund_cents?: number }>(`/disputes/returns/${returnId}/${action.toLowerCase()}`, note ? { note } : {});
}

export async function escalateReturn(returnId: string): Promise<{ status: string; dispute_id: string }> {
  return postJson<{ status: string; dispute_id: string }>(`/disputes/returns/${returnId}/escalate`, {});
}

export async function mediateReturn(returnId: string, decision: 'REFUND' | 'DISMISS', note?: string): Promise<{ status: string; refund_cents?: number }> {
  return postJson<{ status: string; refund_cents?: number }>(`/disputes/returns/${returnId}/mediate`, { decision, note });
}

export async function listDisputes(opts: { status?: string; limit?: number; offset?: number } = {}): Promise<DisputePage> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  return getJson<DisputePage>(`/disputes${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export async function listKycQueue(opts: { status?: string; limit?: number; offset?: number } = {}): Promise<KycPage> {
  const qs = new URLSearchParams();
  if (opts.status) qs.set('status', opts.status);
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  return getJson<KycPage>(`/disputes/ops/kyc${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export async function decideKyc(userId: string, action: 'APPROVED' | 'REJECTED', note?: string): Promise<{ user_id: string; status: string }> {
  return postJson<{ user_id: string; status: string }>(`/disputes/ops/kyc/${userId}/${action.toLowerCase()}`, note ? { note } : {});
}

export async function listSellerRisk(opts: { limit?: number; offset?: number } = {}): Promise<SellerRiskPage> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  return getJson<SellerRiskPage>(`/disputes/ops/risk${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export async function setSellerRisk(input: { seller_id: string; tier?: string; ops_override?: boolean }): Promise<SellerRiskRow> {
  return postJson<SellerRiskRow>('/disputes/ops/risk', input);
}

export async function recomputeRiskTiers(): Promise<{ updated: number }> {
  return postJson<{ updated: number }>('/disputes/ops/risk/recompute', {});
}

export async function getSellerStats(): Promise<SellerStats> {
  return getJson<SellerStats>('/disputes/analytics/seller');
}

export async function getPlatformStats(): Promise<PlatformStats> {
  return getJson<PlatformStats>('/disputes/analytics/platform');
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
