import type { Ad } from './api';

/**
 * Per-device ad grounds: an ad the user has already seen/dismissed is not
 * surfaced again (toast or banner) until it expires or changes.
 */
const SEEN_KEY = 'kika_ads_seen';

export function addSeenAd(adId: string): void {
  try {
    const seen = readSeen();
    if (seen.has(adId)) return;
    seen.add(adId);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // storage unavailable — best-effort only
  }
}

export function isAdSeen(adId: string): boolean {
  try {
    return readSeen().has(adId);
  } catch {
    return false;
  }
}

export function shownAdIds(): string[] {
  return [...readSeen()];
}

function readSeen(): Set<string> {
  const raw = localStorage.getItem(SEEN_KEY);
  if (!raw) return new Set();
  const parsed = JSON.parse(raw) as unknown;
  return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
}

/** Where an ad should take the user when tapped. */
export function adTargetUrl(ad: Pick<Ad, 'target_type' | 'target_id' | 'seller_id'>): string {
  if (ad.target_type === 'OFFER' && ad.target_id) return `/offers/${ad.target_id}`;
  if (ad.target_type === 'SELLER' && ad.target_id) return `/sellers/${ad.target_id}`;
  return `/sellers/${ad.seller_id}`;
}