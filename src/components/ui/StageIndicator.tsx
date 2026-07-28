import React from "react";
import { STAGE_LABEL, stageSummary, type StageState } from "@/lib/work-orders/stage";

export interface StageIndicatorProps {
  states: StageState[];
  /** Hide the labels on a dense row; the accessible summary still carries them. */
  compact?: boolean;
  style?: React.CSSProperties;
}

/**
 * StageIndicator — six segments, always labelled (v2 §B24).
 *
 * Solid = recorded, hollow = not yet, accent = current. **Never colour-only:**
 * the fill state is also a shape difference, and the whole strip carries a
 * text summary for assistive tech. On a dense queue row the visible labels can
 * be dropped — the accessible summary never is.
 */
export function StageIndicator({ states, compact = false, style }: StageIndicatorProps) {
  const summary = stageSummary(states);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, ...style }}>
      <div style={{ display: "inline-flex", gap: 3 }} aria-hidden="true">
        {states.map((s) => (
          <span
            key={s.stage}
            title={STAGE_LABEL[s.stage]}
            style={{
              width: compact ? 18 : 26,
              height: 6,
              borderRadius: 2,
              background: s.current
                ? "var(--accent)"
                : s.recorded
                  ? "var(--status-done-fg)"
                  : "transparent",
              // The hollow state is an outline, not a pale fill: a pale fill on
              // warm paper is nearly invisible and reads as "recorded, faintly".
              boxShadow: s.recorded || s.current ? "none" : "inset 0 0 0 1px var(--paper-400)",
            }}
          />
        ))}
      </div>
      {!compact ? (
        <div aria-hidden="true" style={{ display: "inline-flex", gap: 3 }}>
          {states.map((s) => (
            <span
              key={s.stage}
              style={{
                width: 26,
                fontSize: 9,
                letterSpacing: "0.02em",
                textAlign: "center",
                color: s.current ? "var(--text-accent)" : "var(--text-meta)",
                fontWeight: s.current ? 600 : 400,
              }}
            >
              {STAGE_LABEL[s.stage].slice(0, 4)}
            </span>
          ))}
        </div>
      ) : null}
      {/* The text alternative. Same sentence a sighted user reads off the strip. */}
      <span className="sr-only">{summary}</span>
    </div>
  );
}
