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
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("../src/app", import.meta.url));
const FIXTURE = fileURLToPath(new URL("./fixtures/routes.json", import.meta.url));

/** Every route the app serves, derived from the file system. */
export function currentRoutes(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "page.tsx") {
        const rel = p.slice(APP.length + 1).split(sep).join("/").replace(/\/page\.tsx$/, "");
        // Route groups like `(app)` are organisational and not part of the URL.
        const url = "/" + rel.replace(/\((?:[^)]+)\)\/?/g, "");
        out.push(url === "/" ? "/" : url.replace(/\/$/, ""));
      }
    }
  })(APP);
  return [...new Set(out)].sort();
}

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

  it("keeps the destinations the new nav model points at", () => {
    // doc 01 §2's 13 global destinations. `/ferment` is in this list because
    // Phase 3 CREATES it — the handoff listed it as an existing destination when
    // only /ferment/crush, /press and /process existed.
    const DESTINATIONS = [
      "/work-orders",
      "/bulk",
      "/vineyards/field-notes",
      "/vineyards/harvest",
      "/lots",
      "/ferment",
      "/blend",
      "/bottling",
      "/inventory",
      "/compliance",
      "/accounting",
      "/audit",
      "/settings",
    ];
    const missing = DESTINATIONS.filter((d) => !routes.includes(d));
    expect(missing, `nav destination(s) with no page: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps every contextual route doc 01 §4 says is still reachable", () => {
    const CONTEXTUAL = [
      "/work-orders/review",
      "/work-orders/templates",
      "/work-orders/task-types",
      "/work-orders/new",
      "/blend/trials",
      "/finished-goods",
      "/bottled",
      "/setup/equipment",
      "/vineyards/sprays/products",
      "/inbox",
      "/ferment/process",
      "/samples",
      "/winemaking-calculator",
      "/reports",
      "/help/feedback",
      "/assistant",
      "/vessels",
    ];
    const missing = CONTEXTUAL.filter((r) => !routes.includes(r));
    expect(
      missing,
      `doc 01 §4 promises these stay reachable, but they have no page: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
