import { defineConfig, devices } from "@playwright/test";

// Runs against the Docker app (scripts/start.sh); set PLAYWRIGHT_BASE_URL to target another server.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8000";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
