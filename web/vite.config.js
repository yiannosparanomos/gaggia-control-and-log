import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The ESP32 to talk to during development. Override with:  ESP=http://192.168.2.10 npm run dev
const ESP = process.env.ESP || 'http://192.168.2.6';

export default defineConfig({
  // Everything (JS, CSS, fonts) is inlined into one index.html, which tools/embed.mjs
  // gzips into firmware/src/web_assets.h
  plugins: [viteSingleFile()],
  build: { assetsInlineLimit: 100000000, cssCodeSplit: false },
  server: {
    // npm run dev            -> page at http://localhost:5173, /api/* forwarded to the real ESP32
    // http://localhost:5173/?sim -> same page with a simulated machine, no ESP32 needed
    proxy: { '/api': { target: ESP, changeOrigin: true } },
  },
});
