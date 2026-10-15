import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project-site hosting: https://apatel85.github.io/Dashboards/TradeDesk/
export default defineConfig({
  base: '/Dashboards/TradeDesk/dist/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
