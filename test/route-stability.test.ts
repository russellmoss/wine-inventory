/**
 * Route stability — the merge gate for the Phase 3 IA rewrite.
 *
 * The handoff repeats "URLs do not change" three times. This makes that
 * mechanical instead of aspirational: the full route list is committed as a
 * fixture, and any route that disappears or changes shape fails CI by name.
 *
 * It lands BEFORE the nav rewrite deliberately. A guard written after the change
 * it guards only records whatever the change did.
 *
 * Adding a route is fine and expected — the fixture is updated. REMOVING or
 * RENAMING one is what this catches, because that is what breaks a bookmark, a
 * QR code on a barrel, or a link in someone's email.
 *
 * **It answers "does this page still exist", and nothing more.** That is not the
 * same question as "can anyone get there", which is `test/route-reachability.test.ts`
 * (plan 104 D3). Both of this file's route lists used to be hand-typed and had
 * already drifted — `CONTEXTUAL` held 17 entries against the model's 22, included
 * `/work-orders/new` which the model did not, and omitted six the model did, with
 * nothing reconciling them. They are DERIVED now, so that drift cannot recur.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { allDestinations } from "@/lib/nav/model";
import { allSectionItems, UTILITY_DESTINATIONS } from "@/lib/nav/sections";
import { CONTEXTUAL_ENTRY_POINTS } from "@/lib/nav/unnavigable";
import { currentRoutes } from "./helpers/routes";

const FIXTURE = fileURLToPath(new URL("./fixtures/routes.json", import.meta.url));

const routes = currentRoutes();

// Self-seeding: the first run records the baseline instead of failing on it.
if (!existsSync(FIXTURE)) {
  writeFileSync(FIXTURE, JSON.stringify(routes, null, 2) + "\n", "utf8");
}
const baseline: string[] = JSON.parse(readFileSync(FIXTURE, "utf8"));

describe("every URL that existed still exists", () => {
  it("has not removed or renamed any route", () => {
    const missing = baseline.filter((r) => !routes.includes(r));
    expect(
      missing,
      `${missing.length} route(s) disappeared. Each one is a dead bookmark, a dead QR ` +
        `code on a barrel, and a dead link in someone's email:\n` +
        missing.map((m) => `  ${m}`).join("\n") +
        `\n\nIf a removal is genuinely intended, update test/fixtures/routes.json ` +
        `in the SAME commit so the decision is visible in review.`,
    ).toEqual([]);
  });

  it("reports newly added routes without failing on them", () => {
    const added = routes.filter((r) => !baseline.includes(r));
    if (added.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`route-stability: ${added.length} new route(s): ${added.join(", ")}`);
    }
    expect(Array.isArray(added)).toBe(true);
  });

  it("keeps the destinations the nav model points at", () => {
    // Derived from model.ts, not re-typed. A destination whose page does not exist
    // is a top-level nav item on a 404 — which is exactly what /ferment would have
    // been if Phase 3 had shipped the handoff verbatim.
    const missing = allDestinations()
      .map((d) => d.href)
      .filter((d) => !routes.includes(d));
    expect(missing, `nav destination(s) with no page: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps every second-level route the IA promises stays reachable", () => {
    // Derived from sections.ts + unnavigable.ts, the two lists that actually drive
    // the sub-navs, the palette and the reachability guard.
    const contextual = [
      ...allSectionItems().map((i) => i.href),
      ...UTILITY_DESTINATIONS.map((u) => u.href),
      ...CONTEXTUAL_ENTRY_POINTS.map((c) => c.href),
    ];
    const missing = [...new Set(contextual)].filter((r) => !routes.includes(r));
    expect(
      missing,
      `the IA promises these stay reachable, but they have no page: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
