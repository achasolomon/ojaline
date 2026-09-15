import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Integration specs share one live Postgres, so files must not run in parallel
    // (global assertions like "all payout requests" or "all seller profiles"
    // would see rows written by concurrently running spec files).
    fileParallelism: false,
  },
});