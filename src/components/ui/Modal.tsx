"use client";

import React from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number | string;
}

export function Modal({ open, onClose, title, subtitle, children, maxWidth = 600 }: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(20,19,15,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "56px 20px", zIndex: 50, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-raised)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xl)",
          width: "100%", maxWidth, padding: "var(--space-6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: 0 }}>{title}</h2>
            {subtitle ? <div style={{ color: "var(--text-muted)", fontSize: 13.5, marginTop: 4 }}>{subtitle}</div> : null}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
