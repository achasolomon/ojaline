// ============================================================================
// seed-geo.mjs — regenerate the national geo migrations from data/*.json
//
//   node scripts/seed-geo.mjs            # default: 2 markets per state
//   GEO_MARKETS_PER_STATE=3 node scripts/seed-geo.mjs
//
// Reads data/states.json (names), data/lgas.json (state -> lga[]) and
// data/wards.json (flat INEC ward list with coordinates) and writes two
// flyway migrations:
//   packages/db/migrations/V43__geo_divisions.sql     — states, lgas, wards
//   packages/db/migrations/V44__seed_market_areas.sql — a few deterministic,
//     ward-based market clusters per state (all states except Lagos, which is
//     already covered by scripts/seed.sql), so every state has at least one
//     selectable market area.
//
// Output is deterministic: rerunning with unchanged data produces identical
// files (flyway checksum-safe). Editing the JSON and rerunning intentionally
// changes V43/V44, which flyway rejects after apply — ship a new migration
// instead so DB state can never silently diverge from source.
// ============================================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA = join(ROOT, 'data');
const MIGRATIONS = join(ROOT, 'packages', 'db', 'migrations');

const PER_STATE = Math.max(0, Number(process.env.GEO_MARKETS_PER_STATE ?? 2));

const states = JSON.parse(readFileSync(join(DATA, 'states.json'), 'utf8'));
const lgas = JSON.parse(readFileSync(join(DATA, 'lgas.json'), 'utf8'));
const wards = JSON.parse(readFileSync(join(DATA, 'wards.json'), 'utf8'));

// Normalise an lga/hierarchy name for join purposes (real-world data files
// disagree: "Urue Offong|Oruko" vs "Urue Offong/Oruko"). Slash is the anchor.
const norm = (s) => String(s).trim().replace(/[|\\]/g, '/').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
const esc = (s) => String(s).replace(/'/g, "''");
const hex = (n, w = 12) => BigInt(n).toString(16).padStart(w, '0');
const round = (n) => Math.round(n * 1e6) / 1e6;
const PAD = (p) => `${p}000000-0000-4000-8000-`;

const stateId = new Map(); // name -> id
const lgaId = new Map();   // `${state}\u0000${lga}` -> id

states.forEach((name, i) => stateId.set(name, `${PAD('a9')}${hex(i + 1)}`));

const lgaRows = [];
let lgaIdx = 0;
for (const state of states) {
  for (const name of lgas[state] ?? []) {
    lgaIdx += 1;
    const sid = `${PAD('b9')}${hex(lgaIdx)}`;
    lgaId.set(`${state}\u0000${norm(name)}`, sid);
    lgaRows.push({ state, name, id: sid });
  }
}

const wByLga = new Map(); // `${state}\u0000${norm(lga)}` -> ward[]
const wardRows = [];
let wardIdx = 0;
for (const w of wards) {
  const key = `${w.State}\u0000${norm(w.LGA)}`;
  if (!lgaId.has(key)) {
    console.error(`SKIP ward "${w.Ward}" — unknown lga "${w.LGA}" in "${w.State}"`);
    continue;
  }
  wardIdx += 1;
  wardRows.push({
    id: `${PAD('c9')}${hex(wardIdx)}`,
    lga_key: key,
    name: w.Ward,
    latitude: round(Number(w.Latitude)),
    longitude: round(Number(w.Longitude)),
  });
  if (!wByLga.has(key)) wByLga.set(key, []);
  wByLga.get(key).push(w.Ward);
}

if (wardIdx !== wards.length) {
  throw new Error(`Expected ${wards.length} wards, matched ${wardIdx} — fix the data before generating.`);
}

const dayOfWk = (seed) => ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][
  parseInt(createHash('md5').update(seed).digest('hex').slice(0, 8), 16) % 6
];

function buildV43() {
  const L = [];
  L.push(`-- ============================================================================
-- V43 — National geo divisions: states, LGAs, wards
--   Seeded from data/{states,lgas,wards}.json. Regenerate with:
--     node scripts/seed-geo.mjs
--   Staff adjust these rows directly in the DB; catalog + addresses APIs serve
--   straight from these tables, so admin edits show up immediately.
-- ============================================================================

CREATE TABLE catalog.states (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE catalog.lgas (
  id         UUID PRIMARY KEY,
  state_id   UUID NOT NULL REFERENCES catalog.states(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (state_id, name)
);
CREATE INDEX idx_lgas_state ON catalog.lgas(state_id);

CREATE TABLE catalog.wards (
  id         UUID PRIMARY KEY,
  lga_id     UUID NOT NULL REFERENCES catalog.lgas(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  latitude   DOUBLE PRECISION,
  longitude  DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- INEC ward lists legitimately repeat names within an LGA (e.g. "Central V"), so
-- no UNIQUE on (lga_id, name) — indices only; the PK stays the identity.
CREATE INDEX idx_wards_lga ON catalog.wards(lga_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.states, catalog.lgas, catalog.wards TO ojaline_app;

INSERT INTO catalog.states (id, name) VALUES`);
  L.push(states.map((s, i) => `  ('${stateId.get(s)}', '${esc(s)}')`).join(',\n') + ';');

  L.push(`
INSERT INTO catalog.lgas (id, state_id, name) VALUES`);
  L.push(
    lgaRows
      .map((r) => `  ('${r.id}', '${stateId.get(r.state)}', '${esc(r.name)}')`)
      .join(',\n') + ';',
  );

  L.push(`
INSERT INTO catalog.wards (id, lga_id, name, latitude, longitude) VALUES`);
  L.push(
    wardRows
      .map(
        (r) =>
          `  ('${r.id}', '${lgaId.get(r.lga_key)}', '${esc(r.name)}', ${r.latitude}, ${r.longitude})`,
      )
      .join(',\n') + ';',
  );

  return L.join('\n') + '\n';
}

function buildV44() {
  const markets = []; // { cluster, market, calendar, centroid, lga, state }
  let idx = 0;

  for (const state of states) {
    if (state === 'Lagos') continue; // already seeded in scripts/seed.sql
    const lgaNameToWards = new Map();
    for (const key of wByLga.keys()) {
      const [st, lg] = key.split('\u0000');
      if (st !== state) continue;
      lgaNameToWards.set(lg, wByLga.get(key));
    }
    // Most-urban local governments first (ward count), then name, capped.
    const chosen = [...lgaNameToWards.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .slice(0, PER_STATE);
    for (const [lgaNorm, wardNames] of chosen) {
      // Deterministic "core" ward: the first listed in the source file.
      const ward = wardNames[0];
      const base = ward.replace(/\s+Market$/i, '');
      const marketName = /Market$/i.test(ward) ? ward : `${ward} Market`;
      const wardRow = wardRows.find(
        (r) => r.lga_key === `${state}\u0000${lgaNorm}` && r.name === ward,
      );
      if (!wardRow) throw new Error(`Ward ${ward} not resolved`);
      idx += 1;
      const clusterId = `${PAD('d9')}${hex(idx)}`;
      const marketId = `${PAD('e9')}${hex(idx)}`;
      markets.push({
        clusterId,
        marketId,
        clusterName: base,
        marketName,
        lga: lgaNorm,
        state,
        lon: wardRow.longitude,
        lat: wardRow.latitude,
        day: dayOfWk(`${state}::${lgaNorm}::${ward}`),
      });
    }
  }

  const L = [];
  L.push(`-- ============================================================================
-- V44 — Seed a few market areas nationwide, sourced from real INEC wards
--   One cluster + market per chosen LGA (largest-by-wards per state, capped
--   at GEO_MARKETS_PER_STATE when regenerated). Each market is anchored to an
--   actual ward's coordinates. Lagos is excluded (scripts/seed.sql already
--   seeds Yaba/Surulere/Ikeja). Regenerate with:
--     node scripts/seed-geo.mjs
--   The market registry will later be admin-managed (create/update directly
--   on catalog.clusters + catalog.markets); these rows are just the starting
--   registry so ordering works in every state today.
-- ============================================================================

INSERT INTO catalog.clusters (id, name, lga, state, centroid) VALUES`);
  L.push(
    markets
      .map(
        (m) =>
          `  ('${m.clusterId}', '${esc(m.clusterName)}', '${esc(m.lga)}', '${esc(m.state)}', ST_SetSRID(ST_MakePoint(${m.lon}, ${m.lat}), 4326)::geography)`,
      )
      .join(',\n') + ';',
  );
  L.push(`
INSERT INTO catalog.markets (id, cluster_id, name, calendar, order_cutoff, weather_gate_enabled) VALUES`);
  L.push(
    markets
      .map(
        (m) =>
          `  ('${m.marketId}', '${m.clusterId}', '${esc(m.marketName)}', '{"days":["${m.day}"]}', '18:00', TRUE)`,
      )
      .join(',\n') + ';',
  );
  return L.join('\n') + '\n';
}

console.log(
  `States: ${states.length} | LGAs: ${lgaRows.length} | Wards: ${wardRows.length} | markets/state: ${PER_STATE}`,
);
writeFileSync(join(MIGRATIONS, 'V43__geo_divisions.sql'), buildV43());
writeFileSync(join(MIGRATIONS, 'V44__seed_market_areas.sql'), buildV44());
console.log('Wrote V43__geo_divisions.sql and V44__seed_market_areas.sql');