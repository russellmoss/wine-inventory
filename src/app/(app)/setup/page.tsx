import { requireAdmin } from "@/lib/dal";
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
 * Admin-gated to match the destination's own `admin: true`. Individual children
 * keep their OWN guards; the flags in `sections.ts` mirror them so the hub never
 * shows a card that leads to a `notFound()`.
 */
export default async function SetupPage() {
  await requireAdmin();
  const ctx = await navContext();
  const items = SECTIONS["/setup"].items.filter((i) => isSectionVisible(i, ctx));

  return (
    <div>
      <PageHeader
        eyebrow="The business"
        title="Setup"
        summary="Reference data and configuration. Everything here is set once and used everywhere else."
      />
      <SetupHub items={items} />
    </div>
  );
}
