import { defineConfig } from 'vitest/config';

// UI unit tests run in a plain Node environment — the current suites (regression math) are
// framework-free pure functions, so no jsdom / React setup is needed. Add jsdom here later if a
// component test is introduced.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
