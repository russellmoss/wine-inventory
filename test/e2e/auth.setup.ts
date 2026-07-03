import { test as setup, expect } from "@playwright/test";

// Phase 15 QA — log in ONCE as the Demo Winery owner and persist the session. Defaults match
// `npm run seed:demo-tenant` (sandbox tenant; override via env). NEVER Bhutan Wine Co.
const authFile = "test/e2e/.auth/owner.json";
const EMAIL = process.env.E2E_OWNER_EMAIL || "owner@demowinery.test";
const PASSWORD = process.env.E2E_OWNER_PASSWORD || "DemoWinery!2026";

setup("authenticate as the Demo Winery owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Auth succeeded once we've left /login (Playwright's fill fires React's onChange correctly).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  await page.context().storageState({ path: authFile });
});
