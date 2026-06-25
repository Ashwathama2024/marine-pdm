import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
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
  server: { port: 5173, host: true },
});
