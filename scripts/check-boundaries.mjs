import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const modulesRoot = join(repoRoot, 'apps', 'api', 'src', 'modules');

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);
const SPEC_EXT = '.spec.ts';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (TS_EXT.has(extname(full)) && !full.endsWith(SPEC_EXT)) out.push(full);
  }
  return out;
}

const importRe = /(?:^|\n)\s*import\s[^'"]*?['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
const exportRe = /export\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g;

function extractImports(source) {
  const out = [];
  let m;
  importRe.lastIndex = 0;
  while ((m = importRe.exec(source)) !== null) out.push(m[1] ?? m[2]);
  exportRe.lastIndex = 0;
  while ((m = exportRe.exec(source)) !== null) out.push(m[1]);
  return out;
}

let failures = 0;

for (const file of walk(modulesRoot)) {
  const rel = relative(repoRoot, file);
  const moduleDir = dirname(file);
  const source = readFileSync(file, 'utf8');

  for (const specifier of extractImports(source)) {
    if (!specifier.startsWith('.')) continue;
    const resolved = normalize(join(moduleDir, specifier));
    const relativeToModule = relative(moduleDir, resolved);
    if (relativeToModule.startsWith('..')) {
      console.error(`boundary violation: ${rel} imports outside its module: ${specifier}`);
      failures += 1;
    }
  }
}

if (failures > 0) {
  console.error(`${failures} module-boundary violation(s) — a module may only import from its own directory (own schema); app root + workspace packages are injected via app.module.ts`);
  process.exit(1);
}
console.log('module boundaries: OK — no cross-module imports');
