/**
 * Does each section's role flag agree with the guard on the page it points at?
 *
 * This is the one claim in the plan-104 IA that was taken on trust. `SectionItem.admin`
 * says it is "at least as strict as the page, never looser", and nothing read a single
 * `page.tsx` to check — which is out of character for a phase whose other two guards
 * deliberately open the source file rather than believe a list.
 *
 * **Only the "never looser" direction is a bug, so only that direction fails here.**
 *   - looser than the page  → a link that turns the user away, and a route whose
 *     existence leaked to someone who cannot open it. That is a defect.
 *   - stricter than the page → a discoverability cost, taken deliberately in three
 *     places (see STRICTER_ON_PURPOSE). Recorded with a reason so it stays a decision
 *     rather than becoming an accident.
 */
import { describe, expect, it } from "vitest";
import { allSectionItems, UTILITY_DESTINATIONS } from "@/lib/nav/sections";
import { pageSource } from "./helpers/routes";
import { code } from "./helpers/code";

/** Markers that mean "this page turns a non-admin away", not "this page knows who you are". */
const ADMIN_GUARDS = [
  /\brequireAdmin\s*\(/,
  // `if (!isTenantAdminLike(user)) notFound()` and friends — the guard, not the prop.
  /!\s*isTenantAdminLike\([^)]*\)\s*\)?\s*(?:\{[^}]*)?(?:notFound|redirect|forbidden)/,
  // /work-orders/review refuses in prose instead of throwing: `if (… ||
  // !isTenantAdminLike(user)) { return <div>Only an admin can review …` — still a
  // refusal, and the flag that matches it is correct rather than over-strict.
  /!isTenantAdminLike\([^)]*\)\)\s*\{[\s\S]{0,200}?Only an admin/,
];

/** A capability gate is not a role gate — `requires` mirrors these, not ADMIN_GUARDS. */
const CAPABILITY_GUARDS: Record<string, RegExp> = {
  sparkling: /\bisSparklingEnabled\s*\(/,
  customCrush: /\bisCustomCrushEnabled\s*\(/,
};

/**
 * Flagged stricter than the page enforces, on purpose. Each needs a reason a
 * reviewer would accept, because each costs someone a way in.
 */
const STRICTER_ON_PURPOSE: Record<string, string> = {
  "/settings": "exposes QuickBooks/Commerce7 connection config and COA mappings; the page's lack of a guard is a separate pre-existing gap, not licence to advertise it",
  "/work-orders/task-types": "an authoring surface — the page renders read-only for non-admins, so linking them there is a dead end with extra steps",
  "/vineyards/harvest/weigh-tags": "matches the legacy sidebar's own customCrush gate (AppShell SETUP/VINEYARDS arrays)",
  "/setup/clients": "custom-crush programme surface; the page itself redirects when the programme is off",
};

describe("a section flag is never LOOSER than the page it points at", () => {
  it("flags every section whose page turns a non-admin away", () => {
    const offenders = allSectionItems()
      .filter((i) => !i.admin)
      .filter((i) => {
        const src = code(pageSource(i.href));
        return ADMIN_GUARDS.some((re) => re.test(src));
      })
      .map((i) => i.href);
    expect(
      offenders,
      `these pages refuse non-admins but their nav item is unflagged — a link that ` +
        `bounces the user, and a route whose existence just leaked to them:\n` +
        offenders.map((o) => `  ${o}`).join("\n"),
    ).toEqual([]);
  });

  it("applies the same rule to the palette-only destinations", () => {
    const offenders = UTILITY_DESTINATIONS.filter((u) => !u.admin)
      .filter((u) => ADMIN_GUARDS.some((re) => re.test(code(pageSource(u.href)))))
      .map((u) => u.href);
    expect(offenders).toEqual([]);
  });
});

describe("every over-restriction is a recorded decision, not an accident", () => {
  it("has a stated reason for each item flagged stricter than its page", () => {
    const undocumented = allSectionItems()
      .filter((i) => i.admin || i.vineyard || i.requires)
      .filter((i) => {
        const src = code(pageSource(i.href));
        // Mirrored if the page enforces the SAME kind of thing the flag claims.
        if (i.requires && CAPABILITY_GUARDS[i.requires].test(src)) return false;
        return !ADMIN_GUARDS.some((re) => re.test(src));
      })
      .filter((i) => !STRICTER_ON_PURPOSE[i.href])
      .map((i) => i.href);
    expect(
      undocumented,
      `flagged stricter than the page enforces, with no reason given. Either drop the ` +
        `flag or add an entry to STRICTER_ON_PURPOSE saying what it buys:\n` +
        undocumented.map((u) => `  ${u}`).join("\n"),
    ).toEqual([]);
  });

  it("keeps the exemption list from rotting — every entry is still a real section", () => {
    const live = new Set([...allSectionItems().map((i) => i.href), ...UTILITY_DESTINATIONS.map((u) => u.href)]);
    const stale = Object.keys(STRICTER_ON_PURPOSE).filter((h) => !live.has(h));
    expect(stale, "these are exempted but no longer exist as sections").toEqual([]);
  });

  it("is short enough to still mean something", () => {
    expect(Object.keys(STRICTER_ON_PURPOSE).length).toBeLessThanOrEqual(8);
  });
});

describe("the guard is not vacuous", () => {
  it("recognises a real admin guard when it sees one", () => {
    // /users is requireAdmin() and IS flagged — if this stops matching, the whole
    // "never looser" check silently passes for everything.
    expect(ADMIN_GUARDS.some((re) => re.test(code(pageSource("/users"))))).toBe(true);
    expect(allSectionItems().find((i) => i.href === "/users")?.admin).toBe(true);
  });

  it("does not mistake an isAdmin PROP for a guard", () => {
    // task-types passes isAdmin into its client but admits everyone; reports has no
    // notion of admin at all. Neither must count as "turns a non-admin away".
    for (const href of ["/work-orders/task-types", "/reports"]) {
      expect(
        ADMIN_GUARDS.some((re) => re.test(code(pageSource(href)))),
        `${href} was misread as admin-guarded`,
      ).toBe(false);
    }
  });
});
