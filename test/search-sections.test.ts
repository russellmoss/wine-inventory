/**
 * The palette's section coverage, EXECUTED (plan 104 D2).
 *
 * The first cut of this guard was six `expect(QUERY_SOURCE).toContain(...)`
 * assertions and nothing in the repo ever called `searchEverything`. Inserting a
 * single `continue;` into the section loop would have killed Ctrl-K for all 19
 * second-level routes with the whole suite still green — which is precisely the
 * "passes for the wrong reason" failure this phase was written to stop repeating.
 *
 * So this runs the real function. Prisma is stubbed to return nothing, because the
 * destination half of the search does no database work at all: it is pure role
 * filtering over `NAV_MODEL` + `SECTIONS`, and that is the half that can leak.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

// Every model the query touches, each returning []. The destination block runs
// before any of these resolve, so an empty DB is the cleanest possible fixture.
vi.mock("@/lib/prisma", () => {
  const none = { findMany: async () => [] };
  return { prisma: { vessel: none, lot: none, workOrder: none, vineyardBlock: none, cellarMaterial: none, vesselGroup: none } };
});

type Ctx = Parameters<typeof searchEverything>[1];
let searchEverything: typeof import("@/lib/search/query").searchEverything;

const USER: Ctx = { isAdmin: false, isDeveloper: false, hasVineyard: false, sparkling: true, customCrush: true };
const ADMIN: Ctx = { ...USER, isAdmin: true, hasVineyard: true };

beforeAll(async () => {
  ({ searchEverything } = await import("@/lib/search/query"));
});

const hrefs = async (q: string, ctx: Ctx) => (await searchEverything(q, ctx)).map((h) => h.href);

describe("Ctrl-K finds the second level, not just the 13 destinations", () => {
  it("returns a section route by its own label", () => {
    return expect(hrefs("templates", USER)).resolves.toContain("/work-orders/templates");
  });

  it("finds a section under a hub the caller cannot open", async () => {
    // /reports is requireActiveTenant() only, so it IS theirs — this is the case the
    // hub-visibility question turns on, and the answer is that the hit stays.
    expect(await hrefs("reports", USER)).toContain("/reports");
  });

  it("still returns the global destinations", async () => {
    expect(await hrefs("lots", USER)).toContain("/lots");
  });

  it("returns nothing for a query too short to be an intent", async () => {
    expect(await hrefs("l", ADMIN)).toEqual([]);
  });
});

describe("no admin-only section reaches a plain user", () => {
  it("hides Review and Task types, keeps Templates", async () => {
    const forUser = await hrefs("t", USER).catch(() => []);
    expect(forUser).not.toContain("/work-orders/review");
    const review = await hrefs("review", USER);
    expect(review, "an admin-only section leaked into a plain user's palette").not.toContain("/work-orders/review");
    expect(await hrefs("task types", USER)).not.toContain("/work-orders/task-types");
    expect(await hrefs("templates", USER)).toContain("/work-orders/templates");
  });

  it("shows Review to an admin — the filter is not just 'return nothing'", async () => {
    expect(await hrefs("review", ADMIN)).toContain("/work-orders/review");
  });

  it("hides Users and Settings from a plain user", async () => {
    expect(await hrefs("users", USER)).not.toContain("/users");
    expect(await hrefs("settings", USER)).not.toContain("/settings");
    expect(await hrefs("users", ADMIN)).toContain("/users");
  });

  it("hides the vineyard sections from a user with no membership", async () => {
    expect(await hrefs("map explorer", USER)).not.toContain("/vineyards/maps");
    expect(await hrefs("map explorer", { ...USER, hasVineyard: true })).toContain("/vineyards/maps");
  });

  it("hides En Tirage when the sparkling programme is off — the route 404s", async () => {
    expect(await hrefs("tirage", { ...ADMIN, sparkling: false })).not.toContain("/cellar/en-tirage");
    expect(await hrefs("tirage", ADMIN)).toContain("/cellar/en-tirage");
  });
});

describe("the subtitle does not name a hub the caller cannot see", () => {
  const subtitleFor = async (q: string, ctx: Ctx, href: string) =>
    (await searchEverything(q, ctx)).find((h) => h.href === href)?.subtitle;

  it("names the parent when the caller can see it", async () => {
    expect(await subtitleFor("reports", ADMIN, "/reports")).toBe("under Inventory");
  });

  it("names it for a plain user too, because /inventory is genuinely theirs", async () => {
    // Worth stating: after this phase there is NO section left under an admin-only
    // hub. /reports moved out of /accounting (its own h1 says "Inventory reports")
    // and /setup was opened to every role, so the "hide the parent name" branch has
    // no production data to fire on. It stays because the next hub added could
    // reintroduce the shape, and it is unit-tested directly in nav-sections.test.ts
    // (`sectionParentLabel("/accounting", USER)`). Removing a leak beats masking one.
    expect(await subtitleFor("reports", USER, "/reports")).toBe("under Inventory");
  });
});
