import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The default export of server-only throws outside React Server Components.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "*.test.ts", "infra/**/*.test.mjs"],
    env: {
      A10_SUPABASE_URL: "http://127.0.0.1:54321",
      A10_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
  },
});
