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
   * The volume in words. Mandatory — §B22: "volume text always accompanies it". Passed in
   * rather than formatted here so the tenant's unit preference stays at the call site.
   */
  text: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * FillIndicator (v2 §B22) — one fill bar, app-wide.
 *
 * Before this there were two hand-rolled copies with different markup: the private `FillBar`
 * in `/bulk` and an inline `<span style={{ width: pct% }}>` in `/vessels`. Doc 06 §65 only
 * knew about one of them.
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
  const filledPx = fillHeightPx(fill.pct, vertical ? track : 0);
  const colour = fill.over ? "var(--danger)" : "var(--accent)";

  const bar = vertical ? (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        width: 10,
        height: track,
        background: "var(--paper-200)",
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
      <div style={{ width: `${Math.min(100, Math.max(0, fill.pct))}%`, height: "100%", background: colour }} />
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
          color: fill.over ? "var(--danger)" : "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    </div>
  );
}
