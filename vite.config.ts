import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import preact from "@preact/preset-vite";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [preact(), crx({ manifest })],
  // CRXJS needs a stable dev server port for the extension's HMR websocket.
  server: {
    port: 5173,
    strictPort: true,
  },
});
