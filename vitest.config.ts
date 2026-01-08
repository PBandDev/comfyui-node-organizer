import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts", // Extension entry point not testable without ComfyUI
        "src/layout/reroute-collapse.ts", // No fixtures with reroute nodes yet
      ],
      thresholds: {
        lines: 70,
      },
    },
  },
});
