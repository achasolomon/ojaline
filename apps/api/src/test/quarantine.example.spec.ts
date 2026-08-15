import { expect } from 'vitest';
import { flakyDescribe, flakyIt } from './flaky';

// Demo of the QA-3 quarantine mechanism. Real flaky tests (timing,
// external-service dependent) move into a flakyDescribe block.
flakyDescribe('quarantine example', () => {
  flakyIt('is skipped by default and runs with RUN_FLAKY=1', () => {
    expect(true).toBe(true);
  });
});
