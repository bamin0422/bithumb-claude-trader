import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      lib: { entry: "electron/main/index.ts" },
      rollupOptions: { external: ["better-sqlite3", "keytar"] }
    },
    resolve: { alias: { "@shared": resolve("shared"), "@main": resolve("electron") } }
  },
  preload: {
    build: { lib: { entry: "electron/preload/index.ts" } },
    resolve: { alias: { "@shared": resolve("shared") } }
  },
  renderer: {
    root: "renderer",
    build: { rollupOptions: { input: resolve("renderer/index.html") } },
    plugins: [react()],
    resolve: {
      alias: {
        "@shared": resolve("shared"),
        "@renderer": resolve("renderer/src")
      }
    }
  }
});
