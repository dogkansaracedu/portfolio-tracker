import path from "path"
import { defineConfig } from "vitest/config"

// Vitest config for the pure P&L engine tests. Mirrors the `@/` alias from
// vite.config.ts so engine modules import the same way they do in the app.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
