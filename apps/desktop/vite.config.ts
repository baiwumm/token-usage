import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed dev port: it must match `build.devUrl` in
// src-tauri/tauri.conf.json, so strictPort keeps a stray server from
// silently moving the webview to a dead URL.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // WebView2 (Evergreen) understands modern ES; chrome105 is the
    // conservative baseline Tauri's template uses for Windows.
    target: "chrome105",
  },
});
