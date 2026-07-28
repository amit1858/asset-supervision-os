import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws when imported outside an RSC bundle; stub it for tests.
      "server-only": path.resolve(__dirname, "./src/test/empty-module.ts"),
    },
  },
});
