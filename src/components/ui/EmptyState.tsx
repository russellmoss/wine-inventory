import React from "react";

export interface EmptyStateProps {
  /** What is true right now: "No open work orders." */
  title: React.ReactNode;
  /** Why it is empty, in one line. This is the part most empty states skip. */
  children?: React.ReactNode;
  /**
   * One or two ways forward. REQUIRED in spirit: an empty state with no action is
   * a dead end, and the field-notes "Ask an admin to assign your vineyard" screen is
   * the anti-model the handoff calls out by name.
   */
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * EmptyState — what is true · why · 1–2 next actions (v2 §B30). Never a dead end.
 *
 * The `/work-orders` empty state is the model. The app has ~108 ad-hoc empty states;
 * this ships the component and its styleguide entry, and screens adopt it as later
 * phases touch them (Phase 3+ for shell/screen work, Phase 12 for the tail). Phase 1
 * does not force-migrate call sites.
 */
export function EmptyState({ title, children, actions, style }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: "var(--space-6) var(--space-5)",
        textAlign: "center",
        fontFamily: "var(--font-body)",
        ...style,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: "var(--weight-semibold)" as unknown as number, color: "var(--text-primary)" }}>
        {title}
      </div>
      {children ? (
        <p
          style={{
            margin: "6px auto 0",
            maxWidth: "52ch",
            fontSize: 13.5,
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
          }}
        >
          {children}
        </p>
      ) : null}
      {actions ? (
        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>{actions}</div>
      ) : null}
    </div>
  );
}
