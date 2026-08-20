import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    include: ["test/**/*.e2e.ts"],
    exclude: ["vitest.config.e2e.ts"],
    env: {
      NODE_ENV: "test"
    },
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 60000
  }
})
