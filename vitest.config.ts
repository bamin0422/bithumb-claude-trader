import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "shared"),
      "@main": resolve(__dirname, "electron"),
      "@renderer": resolve(__dirname, "renderer/src")
    }
  },
  test: {
    environment: "node"
  }
});
