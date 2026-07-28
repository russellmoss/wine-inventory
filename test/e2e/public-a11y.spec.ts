import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { VIEWPORTS } from "./routes";

/**
 * Axe on the routes that need no session.
 *
 * The authed sweep (phase1-a11y.spec.ts) needs a Demo Winery login. This one does
 * not, so it runs anywhere — CI, a fresh clone, a machine with no seeded tenant —
 * and it covers the one route EVERY user reaches, including the ones who never
 * get past it.
 */
const PUBLIC_ROUTES = ["/login"];

test.describe.configure({ mode: "serial" });

for (const vp of VIEWPORTS) {
  for (const route of PUBLIC_ROUTES) {
    test(`axe: ${route} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route, { waitUntil: "domcontentloaded" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const detail = results.violations
        .map(
          (v) =>
            `${v.id} (${v.impact}) x${v.nodes.length}: ${v.help}\n      ${v.nodes[0]?.target.join(" ")}`,
        )
        .join("\n    ");

      expect(results.violations, `axe violations on ${route} @ ${vp.name}:\n    ${detail}`).toEqual([]);
    });
  }
}

test("the login form's controls are properly named and described", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Regression guard for a real defect: the required marker used to add an
  // sr-only "(required)" INSIDE the label, so the accessible name came out as
  // "Email (required)" and a screen reader said "required" twice — once from the
  // name, once from the attribute. Caught in a Playwright a11y snapshot.
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  await expect(email).toBeVisible();
  await expect(email).toHaveAttribute("required", "");

  const password = page.getByRole("textbox", { name: "Password", exact: true });
  await expect(password).toBeVisible();
});
