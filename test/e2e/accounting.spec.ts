import { test, expect, type Page } from "@playwright/test";

// Phase 15 QA — authed UI/UX of the QuickBooks integration. Asserts the pages render with the right
// domain-language copy + captures full-page screenshots. Console errors are collected and asserted
// (filtering known pre-existing noise: the manifest syntax quirk + favicon/resource 404s).

const BENIGN = /manifest\.webmanifest|favicon|Failed to load resource.*40\d|the server responded with a status of 40\d/i;

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !BENIGN.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("Phase 15 — accounting UI", () => {
  test("/accounting dashboard renders (not connected, empty queue)", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/accounting");

    await expect(page.getByRole("heading", { name: "Accounting", exact: true })).toBeVisible();
    await expect(page.getByText("Not connected")).toBeVisible();
    await expect(page.getByText(/Nothing to sync yet/i)).toBeVisible();
    // domain language — never leak internals
    await expect(page.getByText(/JournalEntry|realmId|debitAccount/)).toHaveCount(0);

    await page.screenshot({ path: "test-results/phase15-accounting-dashboard.png", fullPage: true });
    expect(errors, `console errors: ${errors.join(" ; ")}`).toEqual([]);
  });

  test("/settings shows the QuickBooks connect + account-mapping cards", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "QuickBooks", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect QuickBooks/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Account mapping", exact: true })).toBeVisible();
    await expect(page.getByText(/Connect QuickBooks first/i)).toBeVisible();

    // scroll the mapping card into frame for the screenshot
    await page.getByRole("heading", { name: "Account mapping", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/phase15-settings-quickbooks.png", fullPage: true });
    expect(errors, `console errors: ${errors.join(" ; ")}`).toEqual([]);
  });

  test("Accounting appears in the left nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Accounting", exact: true })).toBeVisible();
  });
});
