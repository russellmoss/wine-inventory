"use client";

import React from "react";
import { Button } from "./Button";

export interface ConfirmButtonProps {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * Two-step delete: first click arms it ("Sure? / Cancel"), second confirms.
 * Auto-disarms after 4s so a stray arm doesn't linger.
 */
export function ConfirmButton({ onConfirm, children, confirmLabel = "Delete", disabled, size = "sm" }: ConfirmButtonProps) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
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
