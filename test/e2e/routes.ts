/**
 * The audited-route fixture for Phase-1 accessibility and visual regression.
 *
 * The handoff's acceptance criteria repeatedly say "all 24 audited routes" but never
 * list them. Generated instead from the real route tree
 * (`find src/app/(app) -name page.tsx`), which has **51** static routes — so 24 was a
 * subset, and this is the honest denominator. Dynamic segments (`[id]`) are excluded:
 * they need seeded fixture ids, which belongs to whichever phase touches those screens.
 *
 * Kept in its own module so the a11y spec and any future visual-regression spec walk
 * the same list, and so adding a route to the app is one edit here, not two.
 */

/** Routes every Demo Winery owner can reach with no per-tenant feature flag. */
export const AUDITED_ROUTES: readonly string[] = [
  "/",
  "/accounting",
  "/assistant",
  "/audit",
  "/blend",
  "/blend/trials",
  "/bottled",
  "/bottling",
  "/bulk",
  "/compliance",
  "/finished-goods",
  "/help/feedback",
  "/inbox",
  "/inventory",
  "/locations",
  "/lots",
  "/reference",
  "/reports",
  "/samples",
  "/settings",
  "/setup", // plan 104 D4 — the new admin hub
  "/setup/equipment",
  "/setup/expendables",
  "/setup/growers",
  "/setup/vendors",
  "/users",
  "/vessels",
  "/vineyards/field-notes",
  "/vineyards/harvest",
  "/vineyards/harvest/weigh-tags",
  "/vineyards/maps",
  "/vineyards/sprays",
  "/vineyards/sprays/products",
  "/vineyards/weather",
  "/winemaking-calculator",
  "/work-orders",
  "/work-orders/new",
  "/work-orders/review",
  "/work-orders/task-types",
  "/work-orders/templates",
  "/styleguide",
];

/**
 * Routes deliberately left out of the sweep, with the reason. Listed rather than
 * silently dropped — a coverage number with invisible exclusions reads as "we checked
 * everything" when it did not.
 */
export const EXCLUDED_ROUTES: Readonly<Record<string, string>> = {
  "/cellar/en-tirage": "gated on the sparkling program flag",
  "/setup/clients": "gated on the custom-crush flag",
  "/developer": "gated on isDeveloper",
  "/migration": "admin migration tool, gated + destructive",
  "/no-winery": "only reachable with no active org, so unreachable under the authed fixture",
  "/ferment/process": "needs an in-flight harvest to render anything",
  "/vineyards/ndvi": "needs an NDVI raster pulled for the tenant",
  "/vineyards/planting-setup": "needs planting geometry seeded",
  "/vineyards/sprays/new": "form requires products seeded first",
  "/vineyards/sprays/planned-harvest": "needs a planned harvest",
  "/work-orders/templates/new": "form route, covered by /work-orders/templates",
  "[dynamic]": "every [id] route — needs seeded fixture ids, owned by the phase that touches those screens",
};

/** The two widths every criterion in the handoff is stated against. */
export const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
