"use client";

import React from "react";
import { Button } from "./Button";

export interface ConfirmButtonProps {
  onConfirm: () => void;
  children: React.ReactNode;
  /**
   * The confirm step's label. REQUIRED, and it must name the object:
   * "Archive CH-NEUTRAL-14", not "Delete" and not "OK" (v2 §B27 + doc 09's rule
   * that a button which writes names the value or object it writes to).
   */
  confirmLabel: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * Two-step destructive action: first click arms it ("Sure? / Cancel"), second confirms.
 *
 * It used to auto-disarm after 4 seconds. That is a WCAG 2.2.1 failure (an arbitrary
 * time limit on completing an action while the user is still engaged) and a mis-click
 * trap besides, because the layout shifted back underneath the pointer.
 *
 * A time limit and no limit at all are not the only two options, though: on a shared
 * cellar device an indefinitely-armed destructive control is a real hazard if someone
 * else picks up the tablet. So the disarm is EVENT-based instead —
 * `visibilitychange`/`pagehide` (tab backgrounded, app switched, screen locked) and
 * Escape, plus unmount, which React gives us for free on navigation. None of those is
 * a time limit: they only fire once the user has demonstrably stopped looking at the
 * screen, which is exactly the moment the hand-off risk appears.
 */
export function ConfirmButton({ onConfirm, children, confirmLabel, disabled, size = "sm" }: ConfirmButtonProps) {
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    if (!armed) return;
    const disarm = () => setArmed(false);
    const onHide = () => {
      if (document.visibilityState === "hidden") disarm();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") disarm();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", disarm);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", disarm);
      document.removeEventListener("keydown", onKey);
    };
  }, [armed]);

  if (!armed) {
    return (
      <Button variant="ghost" size={size} disabled={disabled} onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12.5, color: "var(--danger)" }}>Sure?</span>
      <Button
        variant="primary"
        size={size}
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        style={{ background: "var(--danger)" }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size={size} disabled={disabled} onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
