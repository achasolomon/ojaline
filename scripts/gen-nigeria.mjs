// Regenerates apps/api/src/modules/addresses/areas.data.ts and
// apps/web/src/lib/addresses.data.ts from the repo's 3-level dataset in
// data/full.json (State → LGA → Ward, 774 LGAs + 8809 wards with coordinates).
// The server copy carries the wards (used for ward lookups + curated geo pins);
// the web mirror stays slim (states/capitals/lgas/areas only) so the bundle
// doesn't ship ~9k ward rows.
//
// Usage: node scripts/gen-nigeria.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const full = JSON.parse(readFileSync(new URL('../data/full.json', import.meta.url), 'utf8'));

const CAPITALS = {
  'Abia': 'Umuahia', 'Adamawa': 'Yola', 'Akwa Ibom': 'Uyo', 'Anambra': 'Awka',
  'Bauchi': 'Bauchi', 'Bayelsa': 'Yenagoa', 'Benue': 'Makurdi', 'Borno': 'Maiduguri',
  'Cross River': 'Calabar', 'Delta': 'Asaba', 'Ebonyi': 'Abakaliki', 'Edo': 'Benin City',
  'Ekiti': 'Ado Ekiti', 'Enugu': 'Enugu', 'Gombe': 'Gombe', 'Imo': 'Owerri',
  'Jigawa': 'Dutse', 'Kaduna': 'Kaduna', 'Kano': 'Kano', 'Katsina': 'Katsina',
  'Kebbi': 'Birnin Kebbi', 'Kogi': 'Lokoja', 'Kwara': 'Ilorin', 'Lagos': 'Ikeja',
  'Nasarawa': 'Lafia', 'Niger': 'Minna', 'Ogun': 'Abeokuta', 'Ondo': 'Akure',
  'Osun': 'Osogbo', 'Oyo': 'Ibadan', 'Plateau': 'Jos', 'Rivers': 'Port Harcourt',
  'Sokoto': 'Sokoto', 'Taraba': 'Jalingo', 'Yobe': 'Damaturu', 'Zamfara': 'Gusau',
  'FCT': 'Abuja',
};

const HUBS = {
  'Lagos': ['Ajah', 'Apapa', 'Bariga', 'Ebute Metta', 'Ejigbo', 'Festac Town', 'Gbagada', 'Ikeja', 'Ikorodu', 'Ilupeju', 'Ipaja', 'Isolo', 'Ketu', 'Lekki Phase 1', 'Marina', 'Maryland', 'Mowe', 'Oshodi', 'Surulere', 'Victoria Island', 'Yaba'],
  'FCT': ['Asokoro', 'Bwari', 'Dutse', 'Garki', 'Gwarinpa', 'Gwagwalada', 'Jabi', 'Katampe', 'Kubwa', 'Lokogoma', 'Lugbe', 'Maitama', 'Nyanya', 'Utako', 'Wuse', 'Wuye'],
  'Oyo': ['Agodi', 'Agbowo', 'Akobo', 'Apata', 'Bashorun', 'Bodija', 'Challenge', 'Dugbe', 'Iwo Road', 'Jericho', 'Mokola', 'Ojoo', 'Onireke', 'Orogun', 'Ring Road', 'Sango'],
  'Rivers': ['Abuloma', 'Agip', 'Borikiri', 'Choba', 'D-Line', 'Elekahia', 'GRA Phase 1', 'GRA Phase 2', 'Mgbuoba', 'Obiri-Ikwere', 'Ogbunabali', 'Rumuigbo', 'Rumuokoro', 'Trans Amadi', 'Woji'],
  'Kano': ['Bompai', 'Dala', 'Dorayi', 'Fagge', 'Gwale', 'Hotoro', 'Jamare', 'Kumbotso', 'Nasarawa', 'Nye', 'Sabon Gari', 'Tarauni', 'Wambai', 'Yankaba'],
};

const alpha = (a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en');

// Collapse stray whitespace/newlines in source names.
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

// Single-quoted TS string literal (safe quotes + backslashes).
const lit = (s) => `'${clean(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const STATE_NAME_ALIASES = { 'federal capital territory': 'FCT', nassarawa: 'Nasarawa' };
const stateNameOf = (raw) => STATE_NAME_ALIASES[String(raw).toLowerCase()] ?? raw;

const states = full.map((s) => {
  const stateName = stateNameOf(s.state);
  const capital = CAPITALS[stateName];
  if (!capital) { console.error('missing capital:', stateName); process.exit(1); }
  const lgas = s.lgas.map((l) => clean(l.name)).sort(alpha);
  const wardsByLga = Object.fromEntries(
    s.lgas.map((l) => [
      clean(l.name),
      l.wards
        .map((w) => ({ name: clean(w.name), latitude: w.latitude, longitude: w.longitude }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'en')),
    ]),
  );
  return {
    state: stateName,
    capital,
    lgas,
    wardsByLga,
    areas: HUBS[stateName]
      ? [...new Set([...HUBS[stateName], ...lgas])].sort(alpha)
      : lgas,
  };
}).sort((a, b) => a.state.localeCompare(b.state, 'en'));

function tsArray(arr) { return arr.map(lit).join(', '); }

const rows = states.map(
  (s) => `  {
    state: ${lit(s.state)},
    capital: ${lit(s.capital)},
    lgas: [${tsArray(s.lgas)}],
    areas: [${tsArray(s.areas)}],
  },`,
).join('\n');

const wardRows = states.map((s) => {
  const entries = Object.entries(s.wardsByLga)
    .map(([lga, wards]) => {
      const list = wards
        .map(
          (w) =>
            `      { name: ${lit(w.name)}, latitude: ${w.latitude}, longitude: ${w.longitude} },`,
        )
        .join('\n');
      return `    ${lit(lga)}: [\n${list}\n    ],`;
    })
    .join('\n');
  return `  {
    state: ${lit(s.state)},
    capital: ${lit(s.capital)},
    lgas: [${tsArray(s.lgas)}],
    areas: [${tsArray(s.areas)}],
    wardsByLga: {
${entries}
    },
  },`;
}).join('\n');

const server = `/**
 * Nationwide delivery dataset (generated — run \`node scripts/gen-nigeria.mjs\`):
 * all 36 states + FCT with capitals, all 774 LGAs, curated neighbourhood lists
 * for the hub cities, and full ward data per LGA (8809 wards with coordinates).
 * Source: data/full.json in this repo (State → LGA → Ward). This file is the
 * authoritative copy; apps/web/src/lib/addresses.data.ts is the generated slim
 * mirror (states/capitals/lgas/areas only).
 */
export interface Ward {
  name: string;
  latitude: number;
  longitude: number;
}

export interface NigerianState {
  state: string;
  capital: string;
  lgas: string[];
  /** Selectable areas: curated neighbourhoods for hubs, otherwise the state's LGAs. */
  areas: string[];
  /** Wards grouped by LGA (used for ward lookups + curated map pins). */
  wardsByLga: Record<string, Ward[]>;
}

export const NIGERIA: NigerianState[] = [
${wardRows}
];

const STATE_ALIASES: Record<string, string> = {
  fct: 'FCT',
  'federal capital territory': 'FCT',
  'federal capital': 'FCT',
  abuja: 'FCT',
};

/** Canonical state name (e.g. "Federal Capital Territory" → "FCT"), or null. */
export function normalizeState(state: string | null | undefined): string | null {
  const s = (state ?? '').trim().toLowerCase();
  if (!s) return null;
  const alias = STATE_ALIASES[s];
  if (alias) return alias;
  return NIGERIA.find((n) => n.state.toLowerCase() === s)?.state ?? null;
}

/** Nationwide: any real Nigerian state is served. Returns the state or null. */
export function coveredRegionFor(state: string | null | undefined, _city?: string | null): NigerianState | null {
  const st = normalizeState(state);
  if (!st) return null;
  return NIGERIA.find((n) => n.state === st) ?? null;
}

/** True when the name matches a known LGA or curated neighbourhood of that state. */
export function isValidArea(stateName: string, area: string | null | undefined): boolean {
  const st = normalizeState(stateName);
  if (!st || !area?.trim()) return true; // blank is acceptable; we don't hard-block area
  const n = NIGERIA.find((x) => x.state === st);
  if (!n) return false;
  const a = area.trim().toLowerCase();
  return n.areas.some((x) => x.toLowerCase() === a);
}

/** Wards for a known LGA, or [] when the LGA isn't in the dataset. */
export function wardsFor(stateName: string, lga: string): Ward[] {
  const st = normalizeState(stateName);
  if (!st) return [];
  const n = NIGERIA.find((x) => x.state === st);
  if (!n) return [];
  return n.wardsByLga[lga] ?? [];
}
`;

const mirror = `/** Generated slim mirror of apps/api/src/modules/addresses/areas.data.ts — do not edit by hand. */
export const NIGERIA_FALLBACK: Array<{
  state: string;
  capital: string;
  lgas: string[];
  areas: string[];
}> = [
${rows}
];
`;

writeFileSync(new URL('../apps/api/src/modules/addresses/areas.data.ts', import.meta.url), server);
writeFileSync(new URL('../apps/web/src/lib/addresses.data.ts', import.meta.url), mirror);
console.log('states:', states.length, '| LGAs:', states.reduce((n, s) => n + s.lgas.length, 0), '| wards:', states.reduce((n, s) => n + Object.values(s.wardsByLga).reduce((a, w) => a + w.length, 0), 0));