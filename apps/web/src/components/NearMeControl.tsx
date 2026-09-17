import { useCallback, useEffect, useState } from 'react';
import {
  getStates,
  getLgas,
  getCatalogWards,
  type StateLocation,
  type LgaLocation,
  type CatalogWard,
} from '../lib/api';
import {
  getGuestLocation,
  setGuestLocation,
  clearGuestLocation,
  subscribeGuestLocation,
  requestBrowserLocation,
  geolocationSupported,
  type GuestLocation,
} from '../lib/guestLocation';
import { Icon } from './icons';

export interface NearMeSelection {
  lat: number;
  lon: number;
  label: string;
}

interface NearMeControlProps {
  onChange: (loc: NearMeSelection | null) => void;
}

const selectCls =
  'w-full h-9 px-3 border border-border rounded-lg bg-white text-xs text-text outline-none focus:border-primary transition cursor-pointer disabled:opacity-40';

/**
 * Guest-first "Near me" switch. Signed-in and anonymous buyers alike can order
 * the catalog by how close an offer is. The coordinate is either the browser's
 * own fix (consent) or a manual State → LGA → Ward pick, kept locally only.
 */
export function NearMeControl({ onChange }: NearMeControlProps) {
  const [loc, setLoc] = useState<GuestLocation | null>(() => getGuestLocation());
  const [enabled, setEnabled] = useState(() => getGuestLocation() !== null);
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [states, setStates] = useState<StateLocation[]>([]);
  const [stateName, setStateName] = useState('');
  const [lgas, setLgas] = useState<LgaLocation[]>([]);
  const [lga, setLga] = useState('');
  const [wards, setWards] = useState<CatalogWard[]>([]);

  useEffect(() => subscribeGuestLocation(setLoc), []);

  useEffect(() => {
    if (enabled && loc) onChange({ lat: loc.lat, lon: loc.lon, label: loc.label });
    else onChange(null);
  }, [enabled, loc, onChange]);

  useEffect(() => {
    if (!panelOpen || states.length > 0) return;
    void getStates().then(setStates, () => {});
  }, [panelOpen, states.length]);

  useEffect(() => {
    if (!stateName) {
      setLgas([]);
      return;
    }
    void getLgas(stateName).then(setLgas, () => setLgas([]));
  }, [stateName]);

  useEffect(() => {
    if (!lga) {
      setWards([]);
      return;
    }
    void getCatalogWards(stateName, lga).then(setWards, () => setWards([]));
  }, [stateName, lga]);

  const useGps = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { lat, lon } = await requestBrowserLocation();
      setGuestLocation({ lat, lon, label: 'Current location', source: 'gps' });
      setEnabled(true);
      setPanelOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get your location');
      setPanelOpen(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const chooseWard = (wardId: string) => {
    const ward = wards.find((w) => w.id === wardId);
    if (!ward || ward.latitude == null || ward.longitude == null) return;
    setGuestLocation({
      lat: ward.latitude,
      lon: ward.longitude,
      label: [ward.name, lga].filter(Boolean).join(', '),
      source: 'manual',
      state: stateName,
      lga,
      ward_id: ward.id,
    });
    setEnabled(true);
    setPanelOpen(false);
    setError(null);
  };

  const toggle = () => {
    if (enabled) {
      setEnabled(false);
      return;
    }
    if (loc) {
      setEnabled(true);
      return;
    }
    void useGps();
  };

  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={toggle} className="flex items-center gap-2 text-xs font-bold text-text">
          <Icon name="pin" size={14} className={enabled && loc ? 'text-primary' : 'text-textSecondary'} />
          Near me
        </button>
        <div className="flex items-center gap-2">
          {loc && (
            <span className="max-w-[10rem] truncate text-[11px] font-semibold text-textSecondary" title={loc.label}>
              {loc.label}
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Sort offers near me"
            onClick={toggle}
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${enabled ? 'bg-primary' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {enabled && loc && (
        <div className="mt-2 flex items-center gap-3 text-[11px] font-semibold">
          {geolocationSupported() && (
            <button type="button" onClick={() => void useGps()} disabled={busy} className="text-primary hover:underline disabled:opacity-50">
              {busy ? 'Locating…' : 'Use GPS'}
            </button>
          )}
          <button type="button" onClick={() => setPanelOpen((v) => !v)} className="text-primary hover:underline">
            Change
          </button>
          <button
            type="button"
            onClick={() => {
              clearGuestLocation();
              setEnabled(false);
              setPanelOpen(false);
            }}
            className="text-textSecondary hover:text-danger"
          >
            Clear
          </button>
        </div>
      )}

      {enabled && !loc && (
        <div className="mt-2 text-[11px] font-semibold text-textSecondary">
          {busy ? 'Locating…' : 'Pick where you are to see nearby offers.'}
        </div>
      )}

      {enabled && !loc && !panelOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-semibold">
          {geolocationSupported() && (
            <button type="button" onClick={() => void useGps()} disabled={busy} className="text-primary hover:underline disabled:opacity-50">
              Use GPS
            </button>
          )}
          <button type="button" onClick={() => setPanelOpen(true)} className="text-primary hover:underline">
            Enter a location
          </button>
        </div>
      )}

      {panelOpen && (
        <div className="mt-2.5 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              className={selectCls}
              value={stateName}
              onChange={(e) => {
                setStateName(e.target.value);
                setLga('');
              }}
            >
              <option value="">State…</option>
              {states.map((s) => (
                <option key={s.state} value={s.state}>{s.state}</option>
              ))}
            </select>
            <select
              className={selectCls}
              value={lga}
              onChange={(e) => setLga(e.target.value)}
              disabled={!stateName}
            >
              <option value="">Local government…</option>
              {lgas.map((l) => (
                <option key={l.lga} value={l.lga}>{l.lga}</option>
              ))}
            </select>
            <select
              className={selectCls}
              value=""
              onChange={(e) => chooseWard(e.target.value)}
              disabled={!lga}
            >
              <option value="">Ward…</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id} disabled={w.latitude == null || w.longitude == null}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {geolocationSupported() && (
            <button type="button" onClick={() => void useGps()} disabled={busy} className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50">
              {busy ? 'Locating…' : 'Or use my current location'}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11px] font-semibold text-danger">{error}</p>}
    </div>
  );
}
