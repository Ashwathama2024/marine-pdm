import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const MARINE_PDM = resolve(__dirname, 'marine-pdm');
const UI_ROOT    = resolve(MARINE_PDM, 'packages/ui');

export default defineConfig({
  root: UI_ROOT,
  plugins: [react()],
  resolve: {
    alias: {
      '@marine-pdm/shared':    resolve(MARINE_PDM, 'shared/src/index.ts'),
      '@marine-pdm/simulator': resolve(MARINE_PDM, 'packages/simulator/src/index.ts'),
      '@marine-pdm/knowledge': resolve(MARINE_PDM, 'packages/knowledge/src/index.ts'),
      '@marine-pdm/features':  resolve(MARINE_PDM, 'packages/features/src/index.ts'),
      '@marine-pdm/decision':  resolve(MARINE_PDM, 'packages/decision/src/index.ts'),
      '@marine-pdm/ingestion': resolve(MARINE_PDM, 'packages/ingestion/src/index.ts'),
    },
  },
  server: { port: 5173, host: true },
});
