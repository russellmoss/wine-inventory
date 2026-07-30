import { Skeleton } from "@/components/ui";

/**
 * SC-09 Loading: "table skeleton + settings panel skeleton".
 *
 * Sized to the resolved layout rather than decorative — the header block, then one card per group
 * with its rollup strip — so cumulative layout shift stays at 0 when the real content arrives
 * (AC-C11). Never a spinner: a spinner reserves no box.
 */
export default function Loading() {
  return (
    <div style={{ padding: "var(--page-pad-y) 0" }}>
      <Skeleton variant="line" width={220} height={30} label="Loading barrel groups…" />
      <div style={{ marginTop: "var(--section-gap)", display: "grid", gap: "var(--space-4)" }}>
        <Skeleton variant="text" height={132} count={3} label={null} />
      </div>
    </div>
  );
}
