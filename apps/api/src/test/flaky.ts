import { describe, it } from 'vitest';

/**
 * QA-3 flaky-test quarantine.
 *
 * Environment-sensitive or timing-dependent tests are quarantined instead of
 * deleted: they register with `flakyDescribe`/`flakyIt` and are skipped by
 * default so a flaky failure can never block CI. Run them deliberately with
 * `pnpm --filter @ojaline/api run test:flaky` (sets RUN_FLAKY=1).
 */
const FLAKY_GATE = process.env.RUN_FLAKY === '1';

export function flakyDescribe(name: string, fn: () => void) {
  return FLAKY_GATE ? describe(name, fn) : describe.skip(name, fn);
}

export function flakyIt(name: string, fn: () => void) {
  return FLAKY_GATE ? it(name, fn) : it.skip(name, fn);
}
