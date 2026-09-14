import type { WishlistEntry } from './api';

type Listener = (entries: WishlistEntry[]) => void;

const listeners = new Set<Listener>();

function keyOf(userId: string): string {
  return `kika_wishlist:${userId}`;
}

function read(userId: string): Record<string, WishlistEntry> {
  try {
    const raw = localStorage.getItem(keyOf(userId));
    return raw ? (JSON.parse(raw) as Record<string, WishlistEntry>) : {};
  } catch {
    return {};
  }
}

function emit(userId: string) {
  const entries = Object.values(read(userId)).sort((a, b) => (a.wished_at < b.wished_at ? 1 : -1));
  listeners.forEach((l) => l(entries));
}

function write(userId: string, map: Record<string, WishlistEntry>) {
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(map));
  } catch { /* ignore quota errors */ }
  emit(userId);
}

export function getWishlist(userId: string): WishlistEntry[] {
  return Object.values(read(userId)).sort((a, b) => (a.wished_at < b.wished_at ? 1 : -1));
}

export function isWished(userId: string, offerId: string): boolean {
  return offerId in read(userId);
}

export function upsertWishlist(userId: string, entry: WishlistEntry) {
  const map = read(userId);
  map[entry.offer_id] = entry;
  write(userId, map);
}

export function dropWishlist(userId: string, offerId: string) {
  const map = read(userId);
  if (!(offerId in map)) return;
  delete map[offerId];
  write(userId, map);
}

export function replaceWishlist(userId: string, entries: WishlistEntry[]) {
  const map: Record<string, WishlistEntry> = {};
  for (const entry of entries) map[entry.offer_id] = entry;
  write(userId, map);
}

export function subscribeWishlist(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}