import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const UI_ROOT = resolve(__dirname, 'packages/ui');

export default defineConfig({
  root: UI_ROOT,
  plugins: [react()],
  resolve: {
    alias: {
      '@marine-pdm/shared':     resolve(__dirname, 'shared/src/index.ts'),
      '@marine-pdm/simulator':  resolve(__dirname, 'packages/simulator/src/index.ts'),
      '@marine-pdm/knowledge':  resolve(__dirname, 'packages/knowledge/src/index.ts'),
      '@marine-pdm/features':   resolve(__dirname, 'packages/features/src/index.ts'),
      '@marine-pdm/decision':   resolve(__dirname, 'packages/decision/src/index.ts'),
      '@marine-pdm/ingestion':  resolve(__dirname, 'packages/ingestion/src/index.ts'),
    },
  },
  server: { port: 5173, host: true },
});
