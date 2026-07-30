// ONE rollup renderer for both the barrel-group index and the detail page.
//
// This started as two near-identical local functions and they had ALREADY drifted before review —
// one took a `note` prop, the other a `derivation` prop, for the same slot. Two copies of the same
// job is how the index and the detail screen end up disagreeing about what a rollup looks like.
//
// The caption is not decoration. RFC-001 §4.6 / AC-10: every rollup is COMPUTED, never stored, and
// must state its derivation — a group's volume is a sum of DERIVED barrel volumes, not a
// measurement, and per DESIGN.md the words are always "measured" / "≈ estimated".

export function Rollup({ label, value, derivation }: { label: string; value: string; derivation?: string }) {
  return (
    <div>
      <dt style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
        {label}
      </dt>
      <dd style={{ margin: "2px 0 0", fontSize: 16, color: "var(--text-primary)" }}>{value}</dd>
      {derivation ? (
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{derivation}</p>
      ) : null}
    </div>
  );
}

/** Card-section heading. `var(--font-heading)` at 18 is the app's convention for these. */
export const SECTION_HEADING: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontSize: 18,
  margin: "0 0 10px",
};
