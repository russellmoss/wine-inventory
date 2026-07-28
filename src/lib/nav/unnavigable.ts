/**
 * The two escape hatches in the reachability contract (plan 104 D3).
 *
 * `test/route-reachability.test.ts` requires every static route to be accounted for
 * by the nav model, a section, a palette-only destination, a CONTEXTUAL ENTRY POINT,
 * or an explicit EXEMPTION. This module holds the last two.
 *
 * ## Why both carry proof rather than prose
 * The lesson of the gap this phase closes is that `route-stability` had two
 * hard-coded lists which both asserted "this page exists" and neither noticed that
 * nothing linked to it. So the two claims that CAN be checked mechanically are:
 *
 *   - a contextual entry point names the FILE that links to it, and the guard reads
 *     that file and looks for the link. Delete the link, CI goes red.
 *   - a `redirect` exemption is checked against the page's own source for a
 *     `redirect(` call, so a real page cannot be waved through as a stub.
 *
 * The `auth` and `dev-tool` exemptions are the honest gap: nothing can prove a page
 * "should have no way in", so those 8 entries rest on their `reason` string and on
 * review. That is also why the total is capped at an absolute 15 rather than a share
 * of the route count — an escape hatch that widens as the app grows is not a hatch.
 *
 * Adding an entry here is the one way to make an unreachable route pass. Make the
 * reason one a reviewer would accept out loud.
 */

export type ExemptionKind = "auth" | "dev-tool" | "redirect";

export interface Exemption {
  href: string;
  kind: ExemptionKind;
  reason: string;
}

/** Routes that correctly have no way in from the app's navigation. */
export const INTENTIONALLY_UNNAVIGABLE: Exemption[] = [
  // --- Auth and account state. Reached from the auth flow or from a guard redirect,
  //     never from a nav a signed-in user is looking at.
  { href: "/login", kind: "auth", reason: "the sign-in page — reached when there is no session" },
  { href: "/forgot-password", kind: "auth", reason: "linked from the login page" },
  { href: "/reset-password", kind: "auth", reason: "reached from the emailed reset link" },
  { href: "/change-password", kind: "auth", reason: "dal.ts redirects here while mustChangePassword is set" },
  { href: "/no-winery", kind: "auth", reason: "dal.ts redirects here when the account has no org membership" },

  // --- Developer / internal tooling. Role-gated and deliberately not in the operator IA.
  { href: "/developer", kind: "dev-tool", reason: "developer-role console; reached by URL, never advertised to a tenant" },
  { href: "/migration", kind: "dev-tool", reason: "one-off data migration console, developer-only" },
  { href: "/styleguide", kind: "dev-tool", reason: "the design-system preview (DESIGN.md), not an operator surface" },

  // --- Permanent redirect stubs. Kept so bookmarks, QR codes on barrels and older
  //     assistant `navigate` payloads keep working; linking to one would send the
  //     user somewhere other than where the label said.
  { href: "/bottled", kind: "redirect", reason: "folded into /inventory (plan 080 U6)" },
  { href: "/finished-goods", kind: "redirect", reason: "folded into /inventory (plan 080 U6)" },
  { href: "/setup/equipment", kind: "redirect", reason: "folded into /inventory?section=equipment (plan 080 U6)" },
  { href: "/setup/expendables", kind: "redirect", reason: "folded into /inventory?section=consumables (plan 080 U6)" },
  { href: "/vineyards/ndvi", kind: "redirect", reason: "folded into the unified Map Explorer at /vineyards/maps" },
  { href: "/vineyards/planting-setup", kind: "redirect", reason: "folded into the Reference vineyard editor at /reference" },
];

export interface ContextualEntryPoint {
  href: string;
  /** Repo-relative path to the file that MUST link here. The guard reads it. */
  from: string;
  /** The control, in operator language. Shown in the failure message. */
  via: string;
}

/**
 * Routes reached from a control on another screen rather than from navigation.
 *
 * This is the honest version of `CONTEXTUAL_DESTINATIONS` in `model.ts`: same idea,
 * but each claim names a file and is checked. Thirteen of that list's twenty-two
 * claims were false when plan 104 measured them, precisely because nothing checked.
 */
export const CONTEXTUAL_ENTRY_POINTS: ContextualEntryPoint[] = [
  { href: "/", from: "src/components/AppShell.tsx", via: "the Cellarhand brand mark, in the sidebar and the mobile bar" },
  { href: "/inbox", from: "src/components/AppShell.tsx", via: "the avatar in the sidebar footer" },
  { href: "/help/feedback", from: "src/components/AppShell.tsx", via: "the sidebar footer, beside Sign out" },
  { href: "/ferment/process", from: "src/app/(app)/ferment/FermentWorksheetClient.tsx", via: "the Fermentations page primary action" },
  { href: "/blend/trials", from: "src/app/(app)/blend/BlendBuilderClient.tsx", via: "the blend builder's trials link" },
  { href: "/work-orders/new", from: "src/app/(app)/work-orders/WorkOrdersClient.tsx", via: "the New work order button" },
  { href: "/work-orders/templates/new", from: "src/app/(app)/work-orders/templates/TemplatesClient.tsx", via: "the New template button" },
  { href: "/vineyards/sprays/new", from: "src/app/(app)/vineyards/sprays/page.tsx", via: "the Record a spray button" },
  { href: "/vineyards/sprays/products", from: "src/app/(app)/vineyards/sprays/page.tsx", via: "the Custom products button" },
  { href: "/vineyards/sprays/planned-harvest", from: "src/app/(app)/vineyards/sprays/page.tsx", via: "the Planned harvest button" },
  { href: "/setup/expendables/ingest", from: "src/app/(app)/inventory/sections/ConsumablesSection.tsx", via: "the invoice upload flow, deep-linked with its ?batch=" },
];
