/**
 * Route reachability — the deliverable of plan 104 (D3).
 *
 * `route-stability` asks "did a URL disappear?". Nothing asked "can anyone get
 * there?". That is how 39 of 56 routes ended up with no way in while every test
 * stayed green: two hard-coded lists both asserted a page EXISTED, which it did.
 *
 * This walks the real route tree and requires each static route to be accounted for
 * by exactly one of:
 *
 *   1. a `NAV_MODEL` global destination        (the sidebar)
 *   2. a `SECTIONS` item                       (a per-hub sub-nav + Ctrl-K)
 *   3. a `UTILITY_DESTINATIONS` entry          (Ctrl-K only, and short by contract)
 *   4. a `CONTEXTUAL_ENTRY_POINTS` entry       (a named control, checked in source)
 *   5. an `INTENTIONALLY_UNNAVIGABLE` entry    (auth / dev tool / redirect stub)
 *
 * A new page with nothing linking to it fails CI by name.
 *
 * **It reads the live file system, not `test/fixtures/routes.json`.** The fixture is
 * a baseline for the removal check and lags reality by design: additions only log,
 * so `/ferment` sat outside it from Phase 3 until this branch. Reading it here would mean a
 * brand-new orphan route stays invisible until somebody remembers to refresh the
 * fixture, which is the failure mode this test exists to end.
 */
import { describe, expect, it } from "vitest";
import { allDestinations } from "@/lib/nav/model";
import { SECTIONS, allSectionItems, sectionHubs, UTILITY_DESTINATIONS } from "@/lib/nav/sections";
import { CONTEXTUAL_ENTRY_POINTS, INTENTIONALLY_UNNAVIGABLE } from "@/lib/nav/unnavigable";
import { linksTo, pageSource, srcFile, staticRoutes } from "./helpers/routes";
import { code } from "./helpers/code";

type Source =
  | "sidebar"
  | "section"
  | "palette-only"
  | "contextual"
  | "exempt";

/** Which classification(s) claim this route. More than one is itself a failure. */
function claimsFor(route: string): Source[] {
  const out: Source[] = [];
  if (allDestinations().some((d) => d.href === route)) out.push("sidebar");
  if (allSectionItems().some((i) => i.href === route)) out.push("section");
  if (UTILITY_DESTINATIONS.some((u) => u.href === route)) out.push("palette-only");
  if (CONTEXTUAL_ENTRY_POINTS.some((c) => c.href === route)) out.push("contextual");
  if (INTENTIONALLY_UNNAVIGABLE.some((e) => e.href === route)) out.push("exempt");
  return out;
}

const ROUTES = staticRoutes();

describe("every route has a way in", () => {
  it("leaves no orphan", () => {
    const orphans = ROUTES.filter((r) => claimsFor(r).length === 0);
    expect(
      orphans,
      `${orphans.length} route(s) exist but NOTHING LINKS TO THEM — a user can only ` +
        `reach them by typing the URL:\n` +
        orphans.map((o) => `  ${o}`).join("\n") +
        `\n\nGive each one a home: a NAV_MODEL destination, a SECTIONS item in ` +
        `src/lib/nav/sections.ts, a contextual entry point, or — if it genuinely ` +
        `should have no way in — an INTENTIONALLY_UNNAVIGABLE entry WITH A REASON ` +
        `in src/lib/nav/unnavigable.ts.`,
    ).toEqual([]);
  });

  it("classifies each route exactly once", () => {
    // Two answers to "where does this live" is how the first-level and second-level
    // models drift apart.
    const doubled = ROUTES.map((r) => ({ r, claims: claimsFor(r) })).filter((x) => x.claims.length > 1);
    expect(
      doubled.map((d) => `${d.r} → ${d.claims.join(" + ")}`),
      "a route may be claimed by exactly one source",
    ).toEqual([]);
  });

  it("has no dead entry — every list names a route that still exists", () => {
    const known = new Set(ROUTES);
    const dead = [
      ...allSectionItems().map((i) => ({ href: i.href, list: "SECTIONS" })),
      ...sectionHubs().map((h) => ({ href: h, list: "SECTIONS (hub)" })),
      ...UTILITY_DESTINATIONS.map((u) => ({ href: u.href, list: "UTILITY_DESTINATIONS" })),
      ...CONTEXTUAL_ENTRY_POINTS.map((c) => ({ href: c.href, list: "CONTEXTUAL_ENTRY_POINTS" })),
      ...INTENTIONALLY_UNNAVIGABLE.map((e) => ({ href: e.href, list: "INTENTIONALLY_UNNAVIGABLE" })),
    ].filter((x) => !known.has(x.href));
    expect(
      dead.map((d) => `${d.href} (${d.list})`),
      "these point at a route that does not exist — a nav item on a 404",
    ).toEqual([]);
  });
});

describe("the exemptions are checked, not trusted", () => {
  it("proves every contextual claim by reading the file that makes it", () => {
    const broken = CONTEXTUAL_ENTRY_POINTS.map((c) => {
      const src = srcFile(c.from);
      if (src === null) return `${c.href}: ${c.from} does not exist`;
      if (!linksTo(src, c.href)) return `${c.href}: ${c.from} no longer links to it (was ${c.via})`;
      return null;
    }).filter(Boolean);
    expect(
      broken,
      "a contextual entry point whose link is gone is an orphan wearing a label:\n" + broken.join("\n"),
    ).toEqual([]);
  });

  it("proves every redirect stub really redirects", () => {
    // Otherwise a real page can be waved through as "just a stub".
    const notStubs = INTENTIONALLY_UNNAVIGABLE.filter((e) => e.kind === "redirect")
      .filter((e) => !/\b(?:permanentRedirect|redirect)\s*\(/.test(pageSource(e.href)))
      .map((e) => e.href);
    expect(notStubs, "exempted as a redirect stub but the page does not redirect").toEqual([]);
  });

  it("makes every exemption state a reason", () => {
    for (const e of INTENTIONALLY_UNNAVIGABLE) {
      expect(e.reason.length, `${e.href} is exempt with no stated reason`).toBeGreaterThan(20);
    }
  });

  it("keeps the exemption list from quietly becoming the answer", () => {
    // An ABSOLUTE cap, not `ROUTES.length / 3`. A ceiling that scales with the route
    // count means adding three orphan pages and exempting all three stays green — the
    // escape hatch widening itself every time it is used.
    expect(INTENTIONALLY_UNNAVIGABLE.length).toBeLessThanOrEqual(15);
  });
});

describe("a section is only reachable if its hub RENDERS the sub-nav", () => {
  // Without this the guard grades its own homework: `SECTIONS` could list every
  // orphan in the app and the orphan check above would go green while nothing on
  // screen changed. `SectionNav` shipped in Phase 2 with zero consumers for exactly
  // this reason — it was in the barrel, in the docs, and in no page.
  const HUBS = sectionHubs();

  it("wires every tab-strip hub to its own HubSectionNav", () => {
    // The hub string is part of the assertion: a page rendering some OTHER hub's
    // sections would be a copy-paste bug that a bare "does it import SectionNav"
    // check would wave straight through.
    const missing = HUBS.filter((hub) => hub !== "/setup").filter(
      (hub) => !pageSource(hub).includes(`<HubSectionNav hub="${hub}"`),
    );
    expect(
      missing,
      `these hubs have sub-navigation in the model and render none of it:\n` +
        missing.map((m) => `  ${m} (src/app/(app)${m}/page.tsx)`).join("\n"),
    ).toEqual([]);
  });

  it("renders the strip on every SECTION page too, not just the hub", () => {
    // A strip that only exists on the hub is a one-way door: you click "Samples",
    // the strip you just used disappears, and the way back is browser-back. Each
    // section page passes its OWN href as `current`, so the strip highlights where
    // you actually are instead of the hub you came from.
    const missing = allSectionItems()
      // The card hub is an index page, not a strip; its children are reached from it.
      .filter((i) => SECTIONS[i.hub].render !== "cards")
      .filter((i) => !pageSource(i.href).includes(`<HubSectionNav hub="${i.hub}" current="${i.href}"`))
      .map((i) => `${i.href} (section of ${i.hub})`);
    expect(
      missing,
      `these section pages drop the strip that led to them:\n` + missing.map((m) => `  ${m}`).join("\n"),
    ).toEqual([]);
  });

  it("renders the strip from the model, never from a hand-written item list", () => {
    const nav = srcFile("src/components/nav/HubSectionNav.tsx") ?? "";
    expect(nav).toContain("sectionsFor(hub,");
    expect(nav).toContain("SECTIONS[hub]");
  });

  it("renders the card hub from the same module", () => {
    const src = pageSource("/setup");
    expect(src).toContain('SECTIONS["/setup"]');
    expect(src).toContain("isSectionVisible");
  });

  it("keeps the sub-nav off the [id] capture screens (D1)", () => {
    // A layout.tsx would wrap every nested route, putting section tabs on
    // /work-orders/[id]/execute — a wet-hands capture surface with a sticky action
    // bar and single-column fields (doc 04 §130).
    // `code()` per test/helpers/code.ts: this repo's static guards keep failing on
    // their own documentation, and a comment saying "deliberately no SectionNav
    // here" would trip a raw not.toContain.
    for (const child of [
      "src/app/(app)/work-orders/[id]/execute/page.tsx",
      "src/app/(app)/work-orders/[id]/print/page.tsx",
      "src/app/(app)/work-orders/[id]/page.tsx",
      "src/app/(app)/lots/[id]/page.tsx",
      "src/app/(app)/vineyards/sprays/[id]/page.tsx",
    ]) {
      const src = srcFile(child);
      if (src === null) continue;
      expect(code(src), `${child} grew a section strip — it is a detail/capture screen`).not.toContain("SectionNav");
    }
    for (const hub of HUBS) {
      const seg = hub.split("/").filter(Boolean);
      expect(
        srcFile(`src/app/(app)/${seg.join("/")}/layout.tsx`),
        `${hub} grew a layout.tsx — D1 says sub-navs render per page, not per layout`,
      ).toBeNull();
    }
  });
});

describe("the guard is not vacuous", () => {
  it("reports a route that no list mentions", () => {
    expect(claimsFor("/a-page-nobody-linked")).toEqual([]);
  });

  it("recognises each of the five sources", () => {
    expect(claimsFor("/work-orders")).toEqual(["sidebar"]);
    expect(claimsFor("/samples")).toEqual(["section"]);
    expect(claimsFor("/assistant")).toEqual(["palette-only"]);
    expect(claimsFor("/ferment/process")).toEqual(["contextual"]);
    expect(claimsFor("/login")).toEqual(["exempt"]);
  });

  it("does not count an object-literal nav entry as a link", () => {
    // AppShell keeps the LEGACY 31-entry sidebar in the flag's else arm as
    // `{ href: "/x", label: "…" }`. Counting that would let a route look reachable
    // under NAV_V2 when the only thing naming it is the nav the flag turns off.
    expect(linksTo('const MAIN = [{ href: "/reports", label: "Reports" }];', "/reports")).toBe(false);
    expect(linksTo('<Link href="/reports">Reports</Link>', "/reports")).toBe(true);
  });

  it("does not count a revalidatePath as a link", () => {
    expect(linksTo('revalidatePath("/vessels");', "/vessels")).toBe(false);
  });
});
