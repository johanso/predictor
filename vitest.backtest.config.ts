import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate config for scripts/backtest.test.ts (a manual tool, not part of the
// automated suite — excluded from vitest.config.ts). Run with:
//   npx vitest run --config vitest.backtest.config.ts
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/**/*.test.ts"],
  },
});
