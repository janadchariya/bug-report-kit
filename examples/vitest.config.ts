// Copy this to the host root and merge with the host's test setup.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./", import.meta.url)),
  "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
};
export default defineConfig({
  test: {
    maxWorkers: 4,
    projects: [
      {
        plugins: [react()], resolve: { alias },
        test: {
          name: "unit", environment: "jsdom", globals: true, css: true,
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/lib/**/*.test.ts", "src/domain/**/*.test.ts", "src/components/**/*.test.{ts,tsx}", "app/**/*.test.tsx", "tests/src/components/**/*.test.tsx"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "server", environment: "node", globals: true,
          // The host must provision/migrate a disposable TEST_DATABASE_URL first.
          // Do not inherit the production DATABASE_URL.
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://kit_test@127.0.0.1:5434/kit_test",
            APP_ENVIRONMENT: "local",
            AUTH_SECRET: "synthetic-test-only-secret-32-characters",
            APP_URL: "https://crm.test",
          },
          include: ["src/server/**/*.test.ts", "app/**/*.test.ts", "tests/src/server/**/*.test.ts"],
          fileParallelism: false, hookTimeout: 30_000, testTimeout: 30_000,
        },
      },
    ],
  },
});
