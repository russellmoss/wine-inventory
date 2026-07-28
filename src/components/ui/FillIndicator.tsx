import React from "react";
import type { Fill } from "@/lib/vessels/fill";
import { fillHeightPx } from "@/lib/vessels/fill-geometry";

export interface FillIndicatorProps {
  fill: Fill;
  /** `vertical` for tank tiles (height IS the data, §B22); `horizontal` for list rows. */
  orientation?: "vertical" | "horizontal";
  /** Track length in px: height when vertical, thickness when horizontal. */
  track?: number;
  /**
   * The volume in words, rendered beside the bar. §B22 requires the text to accompany the
   * gauge, but not necessarily to live INSIDE this component: a tile that prints its own
   * "2,140 / 5,000 L" line passes `null` here rather than showing it twice. Passed in rather
   * than formatted internally so the tenant's unit preference stays at the call site.
   */
  text: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * FillIndicator (v2 §B22) — the shared fill bar.
 *
 * There were two hand-rolled copies with different markup: the private `FillBar` in `/bulk`
 * (now migrated onto this) and an inline `<span style={{ width: pct% }}>` in `/vessels`.
 * Doc 06 §65 only knew about one of them. **The `/vessels` copy is NOT yet migrated** — that
 * screen builds its own row shape and is out of Phase 6's scope; it is logged in TODOS.md
 * rather than left implied as done.
 *
 * Height encodes volume, a hairline marks the level, and the volume text always accompanies
 * it. The bar itself is `aria-hidden` because the text carries the meaning, the same
 * contract `StatusChip`'s glyph follows.
 *
 * Barrels use it advisorily only (§B22) — a barrel is never blocked for being "full", so
 * `over` is styled as a warning here and enforcement lives in the domain layer, not the UI.
 */
export function FillIndicator({
  fill,
  orientation = "horizontal",
  track = orientation === "vertical" ? 86 : 8,
  text,
  style,
}: FillIndicatorProps) {
  const vertical = orientation === "vertical";
  const filledPx = fillHeightPx(fill.pct, track);
  const colour = fill.over ? "var(--danger)" : "var(--accent)";

  const bar = vertical ? (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        width: 13,
        height: track,
        // The track needs to read as a VESSEL, not as a border artifact. On
        // `--surface-raised` a bare `--paper-200` fill is nearly invisible, and an
        // invisible gauge cannot do the one job §B22 gives it: let you compare fills
        // across the board at a glance, without reading a single number.
        background: "var(--surface-sunken, var(--paper-200))",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        flex: "0 0 auto",
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: filledPx, background: colour }} />
      {/* The hairline that marks the level (§B22). Suppressed at the extremes, where the
          edge of the track already reads as the level and a rule on top of it is noise. */}
      {fill.pct > 1 && fill.pct < 100 ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: filledPx, height: 1, background: "var(--ink-700)", opacity: 0.55 }} />
      ) : null}
    </div>
  ) : (
    <div
      aria-hidden="true"
      style={{ flex: 1, height: track, background: "var(--paper-200)", borderRadius: 999, overflow: "hidden", minWidth: 60 }}
    >
      <div style={{ width: `${fillHeightPx(fill.pct, 100)}%`, height: "100%", background: colour }} />
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: vertical ? "flex-end" : "center",
        gap: 8,
        ...(vertical ? {} : { minWidth: 160, flex: 1 }),
        ...style,
      }}
    >
      {bar}
      <span
        style={{
          fontSize: 12.5,
          color: fill.over ? "var(--red-ink, var(--danger))" : "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    </div>
  );
}
