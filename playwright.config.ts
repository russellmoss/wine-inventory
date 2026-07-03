import { defineConfig, devices } from "@playwright/test";

// Phase 15 QA harness — reliable AUTHED UI/UX QA. The `setup` project logs in ONCE and saves a
// storageState; every spec reuses it (no per-test re-login, the thing that made ad-hoc CDP QA flaky).
// Reuses an already-running dev server, or starts one. Screenshots land in test-results/.
const authFile = "test/e2e/.auth/owner.json";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: authFile },
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
