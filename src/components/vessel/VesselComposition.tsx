"use client";

import React from "react";
import { formatL } from "@/lib/lot/timeline";
import { compositionAriaLabel, summarizeVesselComposition, type CompositionComponent, type CompositionSlice } from "@/lib/vessel/composition";
import { usePrefersReducedMotion } from "@/components/ui/Collapsible";

/**
 * "82% Pinot Noir · 18% Cabernet Sauvignon" — one line, tap to expand.
 *
 * The third question a vessel answers, after WHAT IS THIS (lot identity) and HOW MUCH (fill). It sits
 * below both deliberately: loud enough to answer "where did my Cabernet go" at a glance, quiet enough
 * that it never outranks the wine's name. Compact inline list when expanded — not a card grid.
 *
 * Collapsed by default, including on mobile, where expanded it can run six rows deep and push the fill
 * bar off a 375px screen.
 */
export function VesselComposition({
  totalVolumeL,
  components,
  style,
}: {
  totalVolumeL: number;
  components: CompositionComponent[];
  style?: React.CSSProperties;
}) {
  const reduced = usePrefersReducedMotion();
  const bodyId = React.useId();
  const [open, setOpen] = React.useState(false);
  const comp = React.useMemo(() => summarizeVesselComposition(totalVolumeL, components), [totalVolumeL, components]);

  if (!comp.summary) return null; // an empty vessel has no composition to state

  return (
    <div style={style}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%", minHeight: 44,
          padding: "4px 0", background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left", fontFamily: "var(--font-body)", fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        <svg
          width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"
          style={{
            flex: "none", color: "var(--text-muted)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: reduced ? "none" : "transform var(--duration-normal) var(--ease-out)",
          }}
        >
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          {comp.byVariety.map((s, i) => (
            <React.Fragment key={s.key}>
              {i > 0 ? <span style={{ color: "var(--text-muted)" }}> · </span> : null}
              <span
                aria-label={compositionAriaLabel(s)}
                style={s.unrecorded ? { color: "var(--text-muted)", fontStyle: "italic" } : undefined}
              >
                {s.pctLabel} {s.label}
              </span>
            </React.Fragment>
          ))}
        </span>
      </button>

      {open ? (
        <div id={bodyId} role="region" aria-label="Composition detail" style={{ padding: "0 0 8px 18px" }}>
          {comp.detail.map((s) => <DetailRow key={s.key} slice={s} />)}
          {!comp.provenanceComplete ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-muted)", maxWidth: "52ch" }}>
              Part of this wine&rsquo;s source isn&rsquo;t recorded — {formatL(comp.unrecordedL)} L arrived without a
              vineyard and vintage on it. The volume is right; only the breakdown is short.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ slice }: { slice: CompositionSlice }) {
  const origin = [slice.vineyardName, slice.vintage == null ? null : String(slice.vintage)].filter(Boolean).join(" · ");
  return (
    <div
      style={{
        display: "flex", alignItems: "baseline", gap: 8, padding: "3px 0", fontSize: 12.5,
        color: slice.unrecorded ? "var(--text-muted)" : "var(--text-primary)",
        fontStyle: slice.unrecorded ? "italic" : undefined,
      }}
    >
      <span style={{ minWidth: 42, fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{slice.pctLabel}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {slice.label}
        {origin ? <span style={{ color: "var(--text-muted)" }}> · {origin}</span> : null}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatL(slice.volumeL)} L</span>
    </div>
  );
}
