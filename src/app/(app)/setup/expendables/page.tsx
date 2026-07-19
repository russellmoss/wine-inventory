import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Plan 080 U6: consumables folded into the unified Inventory page (/inventory?section=consumables).
// Kept as a PERMANENT redirect rather than deleted — this path is reachable from bookmarks, older
// assistant `navigate` payloads, revalidatePath() calls in the cellar/ingest actions, and the ingest
// review screen's back-links. A 404 on any of those would read as data loss to the operator.
export default async function ExpendablesRedirect(): Promise<never> {
  permanentRedirect("/inventory?section=consumables");
}
