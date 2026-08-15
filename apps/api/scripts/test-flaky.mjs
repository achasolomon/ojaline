import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bin = require.resolve('vitest/vitest.mjs');
const child = spawnSync(process.execPath, [bin, 'run'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_FLAKY: '1' },
});
process.exit(child.status ?? 1);
