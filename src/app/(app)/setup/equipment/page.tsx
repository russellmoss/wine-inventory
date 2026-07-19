import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Plan 080 U6: the equipment registry folded into the unified Inventory page
// (/inventory?section=equipment). Permanent redirect rather than a delete — the route was previously
// unlinked from the sidebar but is still reachable from bookmarks and the work-order builder's
// equipment-picker help links.
export default async function EquipmentRedirect(): Promise<never> {
  permanentRedirect("/inventory?section=equipment");
}
