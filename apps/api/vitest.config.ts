import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The environment defaults must be in place before any module is imported.
    setupFiles: ['tests/setup.ts'],
    // The development machine is memory constrained: run the suites sequentially in a single
    // forked process instead of spawning a worker pool.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
