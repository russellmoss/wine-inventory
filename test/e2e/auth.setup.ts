import { test as setup, expect } from "@playwright/test";

// Phase 15 QA — log in ONCE as the Demo Winery owner and persist the session. Defaults match
// `npm run seed:demo-tenant` (sandbox tenant; override via env). NEVER Bhutan Wine Co.
const authFile = "test/e2e/.auth/owner.json";
const EMAIL = process.env.E2E_OWNER_EMAIL || "owner@demowinery.test";
const PASSWORD = process.env.E2E_OWNER_PASSWORD || "DemoWinery!2026";
/**
 * Sign-in has to round-trip remote Neon and then compile the post-login route. Measured on this
 * box against a warm, otherwise-idle Turbopack dev server: 19.7s. The old hardcoded 20s left
 * 300ms of headroom, so the first run under any load failed — and it fails looking exactly like
 * a rejected password (the button just sits on "Signing in…"), which is a genuinely misleading
 * signal. CI keeps the strict default; a local run can buy room with E2E_LOGIN_TIMEOUT_MS.
 */
const LOGIN_TIMEOUT_MS = Number(process.env.E2E_LOGIN_TIMEOUT_MS || 20_000);

setup("authenticate as the Demo Winery owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Auth succeeded once we've left /login (Playwright's fill fires React's onChange correctly).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: LOGIN_TIMEOUT_MS });
  await page.context().storageState({ path: authFile });
});
