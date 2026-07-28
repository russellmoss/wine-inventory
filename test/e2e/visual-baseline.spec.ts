import { expect, test } from "@playwright/test";
import { AUDITED_ROUTES, VIEWPORTS } from "./routes";

/**
 * Full-page visual baseline for every audited route, at 390px and 1440px.
 *
 * This repo had no visual-regression baseline at all before Phase 1 (the only e2e spec
 * was accounting.spec.ts, screenshots on failure only). So the FIRST run of this spec
 * writes the baseline; it does not diff against anything.
 *
 * Consequence worth being blunt about: this cannot produce the "before" half of a
 * before/after diff for the PR that introduced it, because the code already changed.
 * To capture a true "before", check out the merge-base, run this spec to write the
 * baseline, then check the branch back out and run it again — the second run is the
 * diff. From Phase 2 onward that problem disappears: the committed baseline is the
 * previous phase's rendering, which is exactly what the layout-risk gate needs.
 *
 * Run:  npx playwright test visual-baseline
 * Update after an intentional visual change:  npx playwright test visual-baseline --update-snapshots
 */

test.describe.configure({ mode: "serial" });

for (const vp of VIEWPORTS) {
  for (const route of AUDITED_ROUTES) {
    test(`${route} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.locator("#main").waitFor({ state: "attached", timeout: 20_000 });

      // Kill the two sources of false diffs: motion mid-capture, and the clock.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addStyleTag({
        content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`,
      });

      const name = `${route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-")}-${vp.name}.png`;
      await expect(page).toHaveScreenshot(name, {
        fullPage: true,
        // Relative-time strings ("pulled 3d ago") and live counts move on their own.
        maxDiffPixelRatio: 0.01,
        animations: "disabled",
      });
    });
  }
}
