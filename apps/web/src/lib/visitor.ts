/**
 * Stable anonymous visitor id, used to dedupe product-view analytics for
 * guests. Survives refreshes in localStorage; falls back to an in-memory id
 * when storage is unavailable. Signed-in users are identified by their account
 * id server-side, so this only matters for logged-out traffic.
 */

const KEY = 'kika_visitor_id';

let cached: string | null = null;

function fresh(): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable — the in-memory id still dedupes this session */
  }
  return id;
}

export function getVisitorId(): string {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(KEY);
  } catch {
    cached = null;
  }
  cached = cached ?? fresh();
  return cached;
}