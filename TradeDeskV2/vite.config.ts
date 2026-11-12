import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: https://apatel85.github.io/Dashboards/TradeDeskV2/
// Data is NOT copied into this app — it is read from the original TradeDesk
// (see src/lib/dataBase.ts). publicDir points at it for local dev only.
export default defineConfig({
  base: '/Dashboards/TradeDeskV2/dist/',
  plugins: [react()],
  publicDir: '../TradeDesk/public',
  build: {
    outDir: 'dist',
    sourcemap: false,
    copyPublicDir: false,
  },
});
