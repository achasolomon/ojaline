/**
 * Guest ("near me") location.
 *
 * Anonymous buyers can still get location-first suggestions. We never store a
 * guest's coordinates on the server: the browser geolocation consent (or a
 * manual State → LGA → Ward pick) is kept locally and only the resulting
 * lat/lon rides along with public catalog requests as query params.
 */

export type GuestLocationSource = 'gps' | 'manual';

export interface GuestLocation {
  lat: number;
  lon: number;
  label: string;
  source: GuestLocationSource;
  state?: string;
  lga?: string;
  ward_id?: string;
  saved_at: number;
}

const KEY = 'kika_guest_location';

export const LOCATION_EVENT = 'kika:location-change';

function dispatch(): void {
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function getGuestLocation(): GuestLocation | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestLocation;
    if (!finite(parsed?.lat) || !finite(parsed?.lon) || !parsed?.label) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setGuestLocation(loc: Omit<GuestLocation, 'saved_at'>): GuestLocation {
  const stored: GuestLocation = { ...loc, saved_at: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* storage unavailable — the in-memory subscriber still sees the change */
  }
  dispatch();
  return stored;
}

export function clearGuestLocation(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  dispatch();
}

export function subscribeGuestLocation(listener: (loc: GuestLocation | null) => void): () => void {
  const handler = () => listener(getGuestLocation());
  window.addEventListener(LOCATION_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(LOCATION_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function geolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Ask the browser for the visitor's exact position. Resolves with the raw
 * coordinates; rejection means the visitor denied or the lookup failed.
 */
export function requestBrowserLocation(timeoutMs = 10_000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) {
      reject(new Error('Location is not available on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Could not get your location')),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    );
  });
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres, used for local "x km away" labels. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
