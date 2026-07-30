import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// UI unit tests run in a plain Node environment — the current suites (regression math, analytic RUL,
// CSV escaping) are framework-free pure functions, so no jsdom / React setup is needed. Add jsdom here
// later if a component test is introduced.
//
// The workspace aliases must mirror vite.config.ts: services under test (rul.ts, forecast.ts) import
// the real simulator constants and physics rather than fixtures, so the tests fail if the matrix
// weights or the coded alarm bands drift.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@marine-pdm/shared': resolve(__dirname, '../../shared/src/index.ts'),
      '@marine-pdm/simulator': resolve(__dirname, '../simulator/src/index.ts'),
      '@marine-pdm/knowledge': resolve(__dirname, '../knowledge/src/index.ts'),
      '@marine-pdm/features': resolve(__dirname, '../features/src/index.ts'),
      '@marine-pdm/decision': resolve(__dirname, '../decision/src/index.ts'),
      '@marine-pdm/ingestion': resolve(__dirname, '../ingestion/src/index.ts'),
    },
  },
});
