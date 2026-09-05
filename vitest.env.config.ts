import { defineConfig } from 'vitest/config';

/**
 * Environment-dependent tests (real filesystem watchers, etc.) — kept out
 * of the deterministic default run. `npm run test:env`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/claw-watcher.test.ts'],
    testTimeout: 20000,
    fileParallelism: false,
  },
});
