import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { coveredRegionFor, NIGERIA } from '../addresses/areas.data.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'ojaline/0.1 (local-market prototype; contact: dev@ojaline.local)';
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 500;
// Nomitatim policy is ≤1 req/sec; we self-throttle to stay a good citizen.
const MIN_REQUEST_INTERVAL_MS = 1100;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let lastRequestAt = 0;
let requestChain: Promise<void> = Promise.resolve();

function waitForSlot(): Promise<void> {
  const slot = requestChain.then(async () => {
    const since = Date.now() - lastRequestAt;
    if (since < MIN_REQUEST_INTERVAL_MS) await sleep(MIN_REQUEST_INTERVAL_MS - since);
    lastRequestAt = Date.now();
  });
  requestChain = slot;
  return slot;
}

// Precomputed ward index (8809 entries) so ward-name searches resolve to a
// precise point without ever hitting Nominatim.
const WARD_INDEX: GeoPlace[] = [];
for (const st of NIGERIA) {
  for (const [lgaName, wards] of Object.entries(st.wardsByLga)) {
    for (const w of wards) {
      WARD_INDEX.push({
        label: `${w.name}, ${lgaName}, ${st.state}`,
        house: null,
        road: null,
        area: lgaName,
        city: st.capital,
        state: st.state,
        lga: lgaName,
        lat: w.latitude,
        lon: w.longitude,
        covered: true,
        is_area: true,
      });
    }
  }
}

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
  /** True for curated city/neighbourhood hits (no pin — pick from the lists). */
  is_area?: boolean;
}

const cache = new Map<string, { at: number; data: GeoPlace[] }>();
// Transient downtime guard — a query that failed stays "down" for 5 minutes so
// we don't re-hammer a limited provider on every keystroke.
const DOWN_TTL_MS = 5 * 60 * 1000;
const downCache = new Map<string, number>();

function cacheGet(key: string): GeoPlace[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key: string, data: GeoPlace[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), data });
}

function pickAddress(addr: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = addr[k];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function mapPlace(raw: { lat?: string; lon?: string; display_name?: string; address?: Record<string, string> }): GeoPlace | null {
  const lat = parseFloat(raw.lat ?? '');
  const lon = parseFloat(raw.lon ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const addr = raw.address ?? {};
  const state = pickAddress(addr, ['state']);
  const city = pickAddress(addr, ['city', 'town', 'municipality', 'city_district']);
  return {
    label: raw.display_name ?? '',
    house: pickAddress(addr, ['house_number']),
    road: pickAddress(addr, ['road', 'pedestrian', 'footway']),
    area: pickAddress(addr, ['neighbourhood', 'suburb', 'borough']),
    city,
    state,
    lga: pickAddress(addr, ['county', 'municipality', 'local_government_area']),
    lat,
    lon,
    covered: coveredRegionFor(state, city) !== null,
  };
}

/**
 * Curated hits for any Nigerian state / capital / LGA / neighbourhood name.
 * These never touch Nominatim, so typing "Abuja", "Gar…" or "Ikeja" can't trip
 * the rate limit — the client fills state/area selects instead of pinning a point.
 */
function matchCurated(q: string): GeoPlace[] {
  const needle = q.toLowerCase().trim();
  if (!needle) return [];
  const out: GeoPlace[] = [];
  const seen = new Set<string>();
  const push = (p: GeoPlace) => {
    if (out.length >= 6) return;
    const k = `${p.state}|${p.area ?? ''}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };
  for (const st of NIGERIA) {
    const stateL = st.state.toLowerCase();
    const capL = st.capital.toLowerCase();
    if (stateL.startsWith(needle) || capL.startsWith(needle) || needle.startsWith(stateL)) {
      push({
        label: `${st.state} (capital: ${st.capital}) — pick your local government below`,
        house: null, road: null, area: null,
        city: st.capital, state: st.state,
        lga: null, lat: null, lon: null,
        covered: true, is_area: true,
      });
    }
    for (const area of st.areas) {
      if (area.toLowerCase().startsWith(needle)) {
        push({
          label: `${area}, ${st.state}`,
          house: null, road: null, area,
          city: st.capital, state: st.state,
          lga: null, lat: null, lon: null,
          covered: true, is_area: true,
        });
      }
    }
  }
  // Ward names carry authoritative coordinates — perfect pins, no geo call.
  if (out.length < 6) {
    for (const w of WARD_INDEX) {
      if (w.label.toLowerCase().startsWith(needle)) {
        push(w);
        if (out.length >= 6) break;
      }
    }
  }
  return out;
}

@Injectable()
export class GeoService {
  async search(q: string): Promise<GeoPlace[]> {
    const query = (q ?? '').trim();
    if (!query) throw new BadRequestException('q is required');
    const cacheKey = `s:${query.toLowerCase()}`;
    const hit = cacheGet(cacheKey);
    if (hit) return hit;

    // Covered city/neighbourhood names are answered locally — no external call.
    const local = matchCurated(query);
    if (local.length > 0) {
      cacheSet(cacheKey, local);
      return local;
    }

    // While Nominatim is down/rate-limiting us, answer locally instead of 503s.
    const downUntil = downCache.get(cacheKey);
    if (downUntil && Date.now() < downUntil) return [];

    // Structured search: "15 Murtala Muhammed Way" → housenumber + street.
    // Free-text q searches street-level poorly in Nigeria, this matches far better.
    const m = query.match(/^(\d+)\s+(.+)$/);
    let url: string;
    if (m) {
      url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ng&housenumber=${encodeURIComponent(m[1])}&street=${encodeURIComponent(m[2])}`;
    } else {
      url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ng&q=${encodeURIComponent(query)}`;
    }
    let rows: Array<Record<string, unknown>>;
    try {
      rows = await this.nominatim<Array<Record<string, unknown>>>(url);
    } catch {
      downCache.set(cacheKey, Date.now() + DOWN_TTL_MS);
      return [];
    }
    const places = rows.map((r) => mapPlace(r as never)).filter((p): p is GeoPlace => p !== null);
    if (places.length > 0) cacheSet(cacheKey, places);
    return places;
  }

  async reverse(lat: number, lon: number): Promise<GeoPlace> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new BadRequestException('lat and lon are required');
    const cacheKey = `r:${lat.toFixed(6)},${lon.toFixed(6)}`;
    const hit = cacheGet(cacheKey);
    if (hit) return hit[0];

    const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lon}`;
    const raw = await this.nominatim<Record<string, unknown>>(url);
    const place = mapPlace(raw as never);
    if (!place) throw new ServiceUnavailableException('No address found for that point');
    cacheSet(cacheKey, [place]);
    return place;
  }

  private async nominatim<T>(url: string): Promise<T> {
    // Rate-limit per OSM policy; retry once on 429 after a cool-off.
    for (let attempt = 0; attempt < 2; attempt++) {
      await waitForSlot();
      let res: Response;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        throw new ServiceUnavailableException(`Map service unreachable: ${(err as Error).message}`);
      }
      if (res.status === 429 && attempt === 0) {
        await sleep(2500);
        continue;
      }
      if (!res.ok) throw new ServiceUnavailableException(`Map service responded ${res.status}`);
      return (await res.json()) as T;
    }
    throw new ServiceUnavailableException('Map service is rate-limiting us; try again soon');
  }
}