import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
  esbuild: {
    // Source components rely on the automatic JSX runtime (Next.js default);
    // mirror it here so tests can render components with react-dom/server.
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` throws when imported outside an RSC bundle; stub it for tests.
      "server-only": path.resolve(__dirname, "./src/test/empty-module.ts"),
    },
  },
});
