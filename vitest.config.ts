import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Environment-dependent (real filesystem watchers; EMFILE on constrained
    // hosts). Run them explicitly with `npm run test:env`.
    exclude: ['**/node_modules/**', 'tests/integration/claw-watcher.test.ts'],
    testTimeout: 10000,
  },
});
