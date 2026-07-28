import { Skeleton } from "@/components/ui";

/**
 * Route-level loading UI (v2 §B29). This app had ONE loading.tsx across 65 routes,
 * so a slow server render showed nothing at all.
 *
 * The skeleton boxes are sized to the resolved layout, not decorative, so
 * cumulative layout shift stays at 0 when the real content arrives (AC-C11).
 */
export default function Loading() {
  return (
    <div style={{ padding: "var(--page-pad-y) 0" }}>
      <Skeleton variant="line" width={220} height={30} label="Loading the cellar floor…" />
      <div style={{ marginTop: "var(--section-gap)" }}>
        <Skeleton variant="text" height={46} count={8} label={null} />
      </div>
    </div>
  );
}
