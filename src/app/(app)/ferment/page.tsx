import { requireActiveTenant } from "@/lib/dal";
import { loadFermentWorksheet } from "@/lib/ferment/worksheet-data";
import { FermentWorksheetClient } from "./FermentWorksheetClient";

/**
 * `/ferment` — the Fermentations index (OD-8).
 *
 * This route did NOT exist before Phase 3. The design handoff lists
 * "Fermentations → /ferment" as one of its 13 global destinations, but the
 * directory only held /ferment/crush, /press and /process — so shipping the new
 * nav verbatim would have put a top-level nav item on a 404. It also means the
 * handoff's "four new routes total" claim was wrong; this is a fifth.
 *
 * Additive, so it breaks no existing URL, and it makes doc 01 §4 true as written
 * ("/ferment/process is reached from the Fermentations page primary action").
 */
export default async function FermentPage() {
  await requireActiveTenant();
  const rows = await loadFermentWorksheet();
  return <FermentWorksheetClient rows={rows} />;
}
