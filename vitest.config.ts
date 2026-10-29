import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Never pick up the copies of test files emitted into the standalone
    // build output — they are stale and shadow the source-tree tests.
    exclude: ["**/node_modules/**", "**/.next/**"],
    // next-auth imports `next/server` without an extension, which Node's ESM
    // resolver refuses; Vite's resolver handles it. Needed only by tests that
    // load the real auth module (lib/auth/shared/journeys.test.ts). AccountKit is
    // inlined so that test's `next/headers` mock reaches the runtime's reads.
    server: { deps: { inline: ["next-auth", "@bitbaum/accountkit"] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
