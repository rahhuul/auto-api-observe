import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    include:     ['tests/**/*.test.ts'],
    // Native addons (better-sqlite3) can segfault when loaded across
    // Vitest's default worker_threads pool — their N-API bindings aren't
    // designed to survive being torn down inside a worker thread. Running
    // each test file in its own child process avoids the shared-memory
    // teardown issue that causes this. Confirmed in CI: "Segmentation
    // fault (core dumped)", exit code 139, right after the DB integration
    // tests ran under the default 'threads' pool.
    pool: 'forks',
    // See tests/setup/node18-crypto.ts for why this is needed on Node 18.x.
    setupFiles: ['./tests/setup/node18-crypto.ts'],
  },
});
