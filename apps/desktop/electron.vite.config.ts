import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf8"),
) as { version: string };

// @testcat/shared is a source-only TS workspace package, so it must be bundled
// into main/preload (not externalized) — otherwise the sandboxed preload would
// try to require a .ts file at runtime. electron-vite auto-externalizes deps;
// exclude shared so it gets bundled.
const externalizeDeps = { exclude: ["@testcat/shared"] };

export default defineConfig({
  main: {
    build: { externalizeDeps },
  },
  preload: {
    build: { externalizeDeps },
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    plugins: [react(), tailwindcss()],
  },
});
