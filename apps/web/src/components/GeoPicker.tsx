import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geoReverse, geoSearch, type GeoPlace } from '../lib/api';
import { Icon } from './icons';

export interface PickedLocation {
  lat: number | null;
  lon: number | null;
  street: string;
  area: string;
  city: string;
  state: string;
  covered: boolean;
  /** Human note shown to the user (e.g. "outside covered areas"). */
  note: string | null;
}

export const EMPTY_LOCATION: PickedLocation = {
  lat: null,
  lon: null,
  street: '',
  area: '',
  city: '',
  state: '',
  covered: true,
  note: null,
};

const DEFAULT_CENTER: [number, number] = [6.5244, 3.3792]; // Lagos
const DEFAULT_ZOOM = 11;

function placeToLocation(p: GeoPlace): PickedLocation {
  return {
    lat: p.lat,
    lon: p.lon,
    street: [p.house, p.road].filter(Boolean).join(' '),
    area: p.area ?? '',
    city: p.city ?? '',
    state: p.state ?? '',
    covered: p.covered,
    note: p.covered ? null : 'outside',
  };
}

const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:grid;place-items:center;width:30px;height:30px;background:#fff;border:2.5px solid #EF2B2D;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.35)"><span style="width:9px;height:9px;background:#EF2B2D;border-radius:50%"></span></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

export function GeoPicker({
  value,
  onChange,
}: {
  value: PickedLocation;
  onChange: (v: PickedLocation) => void;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Debounce + stale-guard so keystrokes don't hammer the geocoder.
  const searchSeq = useRef(0);
  const searchTimer = useRef<number | null>(null);
  useEffect(() => () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); }, []);

  const setPin = (lat: number, lon: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lon], { icon: pinIcon }).addTo(map);
    } else {
      markerRef.current.setLatLng([lat, lon]);
    }
  };

  const applyGeo = async (lat: number, lon: number) => {
    setPin(lat, lon);
    setErr(null);
    try {
      const place = await geoReverse(lat, lon);
      if (!place.covered) setErr('That point looks outside Nigeria — we deliver nationwide. Tap a Nigerian location or pick a state below.');
      onChangeRef.current(placeToLocation(place));
    } catch {
      setErr('We no fit read that point — choose city/area below and we go use it.');
      onChangeRef.current({ ...EMPTY_LOCATION, lat, lon, city: valueRef.current.city, state: valueRef.current.state });
    }
  };

  // Map lifecycle (handles React double-mount via cleanup).
  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    const map = L.map(el, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    map.on('click', (e: L.LeafletMouseEvent) => void applyGeo(e.latlng.lat, e.latlng.lng));

    const v = valueRef.current;
    if (v.lat != null && v.lon != null) {
      markerRef.current = L.marker([v.lat, v.lon], { icon: pinIcon }).addTo(map);
      map.setView([v.lat, v.lon], Math.max(map.getZoom(), 14));
    }
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external pin changes (ward pick, city/area clears) on the map.
  useEffect(() => {
    const map = mapRef.current;
    const { lat, lon } = value;
    if (lat == null || lon == null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    if (map && markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    } else if (map) {
      markerRef.current = L.marker([lat, lon], { icon: pinIcon }).addTo(map);
      map.setView([lat, lon], Math.max(map.getZoom(), 14));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.lat, value.lon]);

  const runSearch = async (t: string, seq: number) => {
    setSearching(true);
    setErr(null);
    try {
      const found = await geoSearch(t);
      if (seq !== searchSeq.current) return;
      setResults(found);
    } catch {
      if (seq !== searchSeq.current) return;
      setResults(null);
      setErr('Search no reachable right now — use the map or the lists below.');
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  };

  const onSearchInput = (raw: string) => {
    const t = raw.trim();
    setQ(raw);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (t.length < 3) {
      searchSeq.current += 1;
      setResults(null);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    searchTimer.current = window.setTimeout(() => void runSearch(t, seq), 400);
  };

  const pickResult = (p: GeoPlace) => {
    setResults(null);
    setQ('');
    // Ward hits carry authoritative coordinates → pin the map.
    if (p.lat != null && p.lon != null) {
      void applyGeo(p.lat, p.lon);
      return;
    }
    // Curated state / LGA / area hits have no pin — fill the form's selects.
    onChangeRef.current({
      ...EMPTY_LOCATION,
      city: p.city ?? '',
      state: p.state ?? '',
      area: p.area ?? '',
      covered: p.covered,
      note: p.covered ? null : 'outside',
    });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setErr('Your browser no support location — use the map or the lists below.');
      return;
    }
    setLocating(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => void applyGeo(pos.coords.latitude, pos.coords.longitude),
      () => {
        setErr('We no fit reach your location — use the map or pick from the lists below.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const latching = searching || locating;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={q}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder="Search your street or area (e.g. 15 Murtala Muhammed Way, Yaba)"
            className="h-10 w-full rounded-lg border border-border bg-white px-3 pr-8 text-sm text-text outline-none focus:border-primary"
          />
          {latching && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-surface px-3 text-[12px] font-bold text-primary cursor-pointer border-none transition hover:bg-primary-light disabled:opacity-50"
        >
          <Icon name="pin" size={14} /> {locating ? 'Locating...' : 'Use my location'}
        </button>
      </div>

      {results && results.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-lg border border-border bg-white shadow-md">
          {results.slice(0, 5).map((p, i) => (
            <button
              key={`${p.label}-${i}`}
              type="button"
              onClick={() => pickResult(p)}
              className="block w-full border-b border-border/60 px-3 py-2 text-left text-[12px] text-text last:border-none cursor-pointer bg-transparent hover:bg-surface transition"
            >
              {p.label}
              {!p.covered && <span className="ml-1 text-[10px] font-bold text-danger">(outside coverage)</span>}
            </button>
          ))}
        </div>
      )}
      {results && results.length === 0 && !searching && (
        <p className="mt-1 rounded-lg bg-surface px-3 py-2 text-[11px] font-medium text-textSecondary">
          No street match — use the map or pick a covered area below.
        </p>
      )}

      <div ref={mapEl} className="mt-2 h-[200px] w-full overflow-hidden rounded-lg border border-border bg-surface" />

      <p className="mt-1 text-[10px] text-textSecondary">
        Tap the map or search to pin your delivery point. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-primary">© OpenStreetMap</a>
      </p>

      {err && (
        <p className="mt-2 rounded-lg bg-[#FFF0EC] px-3 py-2 text-[11px] font-semibold text-[#8F3A2B]">{err}</p>
      )}

      {(value.lat != null || value.street !== '') && (
        <button
          type="button"
          onClick={() => onChangeRef.current({ ...EMPTY_LOCATION, city: value.city, state: value.state })}
          className="mt-2 text-[11px] font-semibold text-textSecondary cursor-pointer border-none bg-transparent underline"
        >
          Clear map point
        </button>
      )}
    </div>
  );
}