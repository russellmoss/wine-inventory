import { requireActiveTenant, requireReadyUser } from "@/lib/dal";
import { PageHeader } from "@/components/ui";
import { SECTIONS, isSectionVisible } from "@/lib/nav/sections";
import { navContext } from "@/lib/nav/server-context";
import { SetupHub } from "./SetupHub";

export const metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

/**
 * `/setup` — the admin hub (plan 104 D4, OD-3b-1 ratified).
 *
 * ADDITIVE. Nothing moved and no URL changed: `/settings` still exists at
 * `/settings` and is now one of the children here. What changed is the sidebar's
 * "Setup" entry, which used to open the Settings page — a screen about sparkling
 * toggles and base currency, not about setting the winery up. Eight surfaces had
 * no way in at all once the v2 sidebar dropped to 13 destinations.
 *
 * NOT admin-gated. Four of the eight children (Vessels, Locations, Varieties &
 * vineyards, Vendors) are `requireActiveTenant()` only and were ungated in the
 * legacy sidebar; locking the hub would have taken them away from every non-admin
 * and left Ctrl-K — which needs a keyboard — as the only way back. Each card is
 * filtered by the same role/program rules the sub-navs and the palette use, and
 * every child still enforces its own guard, so an admin-only screen stays
 * admin-only whether or not its card was ever drawn.
 */
export default async function SetupPage() {
  await requireReadyUser();
  await requireActiveTenant();
  const ctx = await navContext();
  const items = SECTIONS["/setup"].items.filter((i) => isSectionVisible(i, ctx));

  return (
    <div>
      {/* No `summary`: PageHeader's contract says the summary is "one sentence about
          what needs attention — NOT a description of the page", and an index has
          nothing needing attention. The cards carry the orientation instead. */}
      <PageHeader eyebrow="The business" title="Setup" />
      <SetupHub items={items} />
    </div>
  );
}
