import { Skeleton } from "@/components/ui";
import { NAV_V2_ENABLED } from "@/lib/nav/flag";
import { TankBoardSkeleton } from "./TankBoard";

/**
 * Route-level loading UI (v2 §B29). This app had ONE loading.tsx across 65 routes,
 * so a slow server render showed nothing at all.
 *
 * The skeleton boxes are sized to the resolved layout, not decorative, so
 * cumulative layout shift stays at 0 when the real content arrives (AC-C11).
 *
 * Phase 6 (SC-10): with the board on, the tiles render as outlines at the real size in the
 * real grid. "Never a spinner over an empty page" — the board's shape is known before its
 * contents are, so showing it is honest and the page does not reflow when data lands.
 */
export default function Loading() {
  return (
    <div style={{ padding: "var(--page-pad-y) 0" }}>
      <Skeleton variant="line" width={220} height={30} label="Loading the cellar floor…" />
      <div style={{ marginTop: "var(--section-gap)" }}>
        {NAV_V2_ENABLED ? <TankBoardSkeleton /> : <Skeleton variant="text" height={46} count={8} label={null} />}
      </div>
    </div>
  );
}
