import { useEffect, useState } from 'react';
import { createAddress, getWards, type SavedAddress, type Ward } from '../lib/api';
import {
  getStates,
  subscribeStates,
  areasOf,
  capitalOf,
  stateCovered,
  type NigerianState,
} from '../lib/addresses';
import { getUser, getUserId } from '../lib/session';
import { GeoPicker, type PickedLocation, EMPTY_LOCATION } from './GeoPicker';
import { Icon } from './icons';

const inputCls =
  'h-10 w-full px-3 border border-border rounded-lg text-sm outline-none focus:border-primary bg-white';

export function AddressForm({
  makeDefault,
  onSaved,
  onCancel,
}: {
  /** Make this the default address (true for the first one). */
  makeDefault: boolean;
  onSaved: (a: SavedAddress) => void;
  onCancel?: () => void;
}) {
  const user = getUser();
  const userId = getUserId();
  const [states, setStates] = useState<NigerianState[]>(() => getStates());
  const [label, setLabel] = useState('');
  const [recipient, setRecipient] = useState(() => user?.full_name?.split(' ')[0] ?? '');
  const [phone, setPhone] = useState(() => user?.phone ?? '');
  const [state, setState] = useState('Lagos');
  const [area, setArea] = useState(() => areasOf('Lagos')[0] ?? '');
  const [wards, setWards] = useState<Ward[]>([]);
  const [ward, setWard] = useState('');
  const [street, setStreet] = useState('');
  const [apt, setApt] = useState('');
  const [landmark, setLandmark] = useState('');
  const [instructions, setInstructions] = useState('');
  const [geo, setGeo] = useState<PickedLocation>(EMPTY_LOCATION);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const off = subscribeStates((list) => {
      setStates(list);
      setState((prev) => list.find((s) => s.state === prev)?.state ?? 'Lagos');
      setArea((prev) => {
        const ok =
          list
            .find((s) => s.state === state)
            ?.areas.some((a) => a.toLowerCase() === prev.trim().toLowerCase()) ?? false;
        return ok ? prev : areasOf(state)[0] ?? '';
      });
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Ward list for the chosen state + local government (hubs' curated areas
  // that aren't LGAs simply return no wards → the select hides).
  useEffect(() => {
    setWard('');
    setWards([]);
    let alive = true;
    if (state && area.trim()) {
      getWards(state, area.trim())
        .then((list) => {
          if (alive) setWards(list);
        })
        .catch(() => {
          if (alive) setWards([]);
        });
    }
    return () => {
      alive = false;
    };
  }, [state, area]);

  const mapSet = geo.lat != null;
  const coveredOk = mapSet ? geo.covered : stateCovered(state);
  const canSave = street.trim().length > 0 && recipient.trim().length > 0 && coveredOk;

  const changeState = (s: string) => {
    setState(s);
    const as = areasOf(s);
    if (as.length > 0) setArea(as[0]);
  };

  const pickWard = (name: string) => {
    setWard(name);
    const w = wards.find((x) => x.name === name);
    if (w) {
      setGeo({
        ...EMPTY_LOCATION,
        lat: w.latitude,
        lon: w.longitude,
        street: '',
        area,
        city: capitalOf(state),
        state,
        covered: true,
        note: null,
      });
    }
  };

  const onGeo = (g: PickedLocation) => {
    setGeo(g);
    const st = (g.state ?? '').trim().toLowerCase();
    if (st) {
      const hit = states.find(
        (s) =>
          s.state.toLowerCase() === st ||
          (st === 'fct' && s.state === 'FCT') ||
          (st === 'federal capital territory' && s.state === 'FCT') ||
          (st === 'abuja' && s.state === 'FCT'),
      );
      if (hit) setState(hit.state);
    }
    if (g.area) {
      const matching = states.find((s) => s.state === state)?.areas.some((a) => a.toLowerCase() === g.area!.toLowerCase());
      if (matching) setArea(g.area!);
    }
  };

  const submit = async () => {
    if (!userId || !canSave) return;
    setSaving(true);
    setErr(null);
    try {
      const saved = await createAddress(userId, {
        label: label.trim() || 'Home',
        recipient_name: recipient.trim(),
        address_line1: street.trim() + (apt.trim() ? `, ${apt.trim()}` : ''),
        address_line2: apt.trim() || undefined,
        city: capitalOf(state) || undefined,
        state: state.trim(),
        area: area.trim() || undefined,
        ward: ward.trim() || undefined,
        landmark: landmark.trim() || undefined,
        instructions: instructions.trim() || undefined,
        latitude: geo.lat,
        longitude: geo.lon,
        phone_number: phone.trim() || '08000000000',
        is_default: makeDefault,
      });
      onSaved(saved);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We no fit save this address.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl bg-surface p-4">
      {coveredOk === false && (
        <p className="mb-3 rounded-lg bg-[#FFF0EC] px-3 py-2 text-[11px] font-semibold text-[#8F3A2B]">
          That location dey outside Nigeria — we deliver nationwide, so pick a state from the list or tap the map.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="Label (Home / Office)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className={inputCls} placeholder="Who dey receive (recipient)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <input className={inputCls} placeholder="Phone number (for delivery call)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />

        <div className="sm:col-span-2">
          <GeoPicker value={geo} onChange={onGeo} />
        </div>

        <input
          className={inputCls}
          placeholder="House number + street (required)"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
        />
        <input className={inputCls} placeholder="Apartment / floor (optional)" value={apt} onChange={(e) => setApt(e.target.value)} />

        <select className={inputCls} value={state} onChange={(e) => changeState(e.target.value)}>
          {states.map((s) => (
            <option key={s.state} value={s.state}>{s.state}</option>
          ))}
        </select>
        <select className={inputCls} value={area} onChange={(e) => setArea(e.target.value)}>
          {areasOf(state).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {wards.length > 0 && (
          <select className={`${inputCls} sm:col-span-2`} value={ward} onChange={(e) => pickWard(e.target.value)}>
            <option value="">Ward (optional — pins the map for delivery)</option>
            {wards.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
        )}

        <input className={inputCls} placeholder="Landmark / nearest junction (very useful)" value={landmark} onChange={(e) => setLandmark(e.target.value)} />
        <input className={inputCls} placeholder="Delivery instructions (optional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </div>

      {err && (
        <p className="mt-3 rounded-lg bg-[#FFF0EC] px-3 py-2 text-[11px] font-semibold text-[#8F3A2B]">{err}</p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !canSave}
          className="flex-1 bg-primary text-white text-sm font-semibold rounded-lg py-2.5 border-none cursor-pointer hover:bg-primary-dark transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save address'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-textSecondary cursor-pointer border-none transition hover:bg-surface"
          >
            Cancel
          </button>
        )}
      </div>
      {!stateCovered(state) && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-textSecondary">
          <Icon name="pin" size={10} /> Pick a Nigerian state — we deliver in all 36 states and the FCT.
        </p>
      )}
    </div>
  );
}