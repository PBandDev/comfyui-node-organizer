import { defineConfig, devices } from "@playwright/test";
import { e2eConfig } from "./e2e.config.ts";

export default defineConfig({
  testDir: "./tests/e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 8,
  reporter: [
    ["line"],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL: e2eConfig.comfyUrl,
    trace: "on-first-retry",
    viewport: { width: 1600, height: 1000 },
  },
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
