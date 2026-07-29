"use client";

import React from "react";

export interface ActionReceiptProps {
  /** What was recorded, naming the object and the figure: "Rack recorded — 218 L into T-04". */
  summary: React.ReactNode;
  /** "Written to the lot ledger at 12:47 by you." Omit only when nothing was written. */
  provenance?: React.ReactNode;
  /** Opens the correction flow for this entry. */
  onCorrect?: () => void;
  /** Link/handler to the ledger line itself. */
  onSeeLedgerLine?: () => void;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

const ACTION: React.CSSProperties = {
  // ≥48px per v2 §B26 — these are the two actions a cellar hand reaches for with wet
  // hands, and they are the whole point of the receipt.
  minHeight: 48,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 14px",
  background: "transparent",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-accent)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  cursor: "pointer",
};

/**
 * ActionReceipt — the persistent confirmation of a recorded act (v2 §B26).
 *
 * Deliberately NOT a toast. A ledger write is not a notification; it is a fact the
 * user may need to read, check and correct. So it persists until dismissed or
 * superseded, it is focusable, and it carries "Correct this entry" and "See the
 * ledger line" rather than fading out at 4 seconds. There is no app-wide toast
 * system today and success is re-implemented across ~69 sites; this is the
 * replacement, but Phase 1 ships the component only.
 *
 * Wiring it into real recording flows is later work: Phase 5 for the work-order
 * screens, Phase 12 ("Spillover") for the rest. That end date is the point — a
 * primitive with no adoption plan just adds a third way of doing things.
 */
export function ActionReceipt({
  summary,
  provenance,
  onCorrect,
  onSeeLedgerLine,
  onDismiss,
  style,
}: ActionReceiptProps) {
  return (
    <div
      role="status"
      tabIndex={-1}
      style={{
        display: "flex",
        gap: 10,
        padding: "14px 16px",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-tint-success)",
        border: "1px solid var(--green-ink)",
        fontFamily: "var(--font-body)",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ color: "var(--green-ink)", fontSize: 15, lineHeight: 1.5, flexShrink: 0 }}>
        ✓
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--text-primary)" }}>
          {summary}
        </div>
        {provenance ? (
          // NOT --text-meta: this sits on --surface-tint-success, and meta grey only
          // clears 4.5:1 against the PAGE surfaces (white / cream / paper-100). On a
          // tint it measured 3.86:1. Tinted surfaces have their own ink in this system
          // (--green-ink, --red-ink, --blue-ink, --golden-ink, each documented with its
          // ratio on cream); --text-secondary is the neutral that still clears the tint.
          <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-secondary)" }}>{provenance}</div>
        ) : null}
        {onCorrect || onSeeLedgerLine ? (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onCorrect ? (
              <button type="button" onClick={onCorrect} style={ACTION}>
                Correct this entry
              </button>
            ) : null}
            {onSeeLedgerLine ? (
              <button type="button" onClick={onSeeLedgerLine} style={ACTION}>
                See the ledger line
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss this receipt"
          style={{
            width: "var(--touch-min)",
            height: "var(--touch-min)",
            flexShrink: 0,
            background: "transparent",
            border: "none",
            borderRadius: "var(--radius-md)",
            color: "var(--text-muted)",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
