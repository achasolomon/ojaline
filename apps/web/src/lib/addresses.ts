import { getAddresses, getAreas, setDefaultAddress, type NigerianState, type SavedAddress } from './api';
import { activeBuyerId, AUTH_EVENT } from './session';
import { NIGERIA_FALLBACK } from './addresses.data';

export type { NigerianState, SavedAddress } from './api';

/* ----------------------- nationwide states dataset ----------------------- */
/* Mirror of the API's authoritative list (apps/api/.../areas.data.ts); the  */
/* API list wins when reachable, this bundle is the offline fallback.        */

type StatesListener = (list: NigerianState[]) => void;

const statesListeners = new Set<StatesListener>();
let states: NigerianState[] = NIGERIA_FALLBACK as NigerianState[];
let statesLoaded = false;

function emitStates(): void {
  statesListeners.forEach((l) => l(states));
}

export async function loadStates(): Promise<void> {
  try {
    const remote = await getAreas();
    if (remote.length > 0) states = remote;
  } catch {
    /* offline — keep the bundled fallback */
  } finally {
    statesLoaded = true;
    emitStates();
  }
}

export function getStates(): NigerianState[] {
  if (!statesLoaded) void loadStates();
  return states;
}

export function subscribeStates(listener: StatesListener): () => void {
  statesListeners.add(listener);
  if (!statesLoaded) void loadStates();
  return () => {
    statesListeners.delete(listener);
  };
}

const stateKey = (raw: string): string => {
  const s = raw.trim().toLowerCase();
  if (s === 'fct' || s === 'federal capital territory' || s === 'abuja') return 'fct';
  return s;
};

export function stateOf(raw: string): NigerianState | undefined {
  return states.find((x) => x.state.toLowerCase() === stateKey(raw));
}

export function capitalOf(state: string): string {
  return stateOf(state)?.capital ?? '';
}

export function lgasOf(state: string): string[] {
  return stateOf(state)?.lgas ?? [];
}

/** Selectable areas/local governments for a state (hubs get curated ones). */
export function areasOf(stateValue: string): string[] {
  return stateOf(stateValue)?.areas ?? [];
}

/** True when the state is one we deliver to — any real Nigerian state. */
export function stateCovered(state: string): boolean {
  return stateOf(state) != null;
}

/* ----------------------- saved-address store ----------------------- */

type Listener = (items: SavedAddress[]) => void;

const listeners = new Set<Listener>();

let items: SavedAddress[] = [];
let loaded = false;
let inFlight: Promise<void> | null = null;
let lastUserId = '';

function emit(): void {
  listeners.forEach((l) => l(items));
}

export async function loadAddresses(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      items = await getAddresses(activeBuyerId());
    } catch {
      /* offline — keep the last known list */
    } finally {
      loaded = true;
      inFlight = null;
      emit();
    }
  })();
  return inFlight;
}

export function subscribeAddresses(listener: Listener): () => void {
  listeners.add(listener);
  void loadAddresses();
  return () => {
    listeners.delete(listener);
  };
}

export function getSavedAddresses(): SavedAddress[] {
  if (!loaded) void loadAddresses();
  return items;
}

export function activeAddress(): SavedAddress | undefined {
  return items.find((a) => a.is_default) ?? items[0];
}

/** Short label for the header: label ("Home") or the city. */
export function addressShortLabel(a: SavedAddress): string {
  return a.label && a.label !== 'Home' ? a.label : a.city || a.state;
}

/** One-line summary used in the switcher/checkout, street → area → city → state. */
export function addressSummary(a: SavedAddress): string {
  const parts = [
    a.address_line1,
    a.address_line2,
    a.ward || a.area || a.lga || null,
    a.city,
    a.state,
  ].filter((p): p is string => Boolean(p));
  return parts.join(', ');
}

export async function setActiveAddress(addressId: string): Promise<void> {
  await setDefaultAddress(activeBuyerId(), addressId);
  await loadAddresses();
}

// Keep the cache for the right identity when the user logs in/out.
window.addEventListener(AUTH_EVENT, () => {
  const uid = activeBuyerId();
  if (uid !== lastUserId) {
    lastUserId = uid;
    items = [];
    loaded = false;
  }
  void loadAddresses();
});