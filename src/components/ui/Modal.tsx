"use client";

import React from "react";
import { shouldDismissOnOverlayInteraction } from "./modal-dismiss";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number | string;
  /** On phones (≤767px), render full-screen instead of a centered card — for dense workspaces
   *  like the vessel History (plan 045). Desktop is unchanged. */
  fullScreenOnMobile?: boolean;
  /** `data-*` attributes spread onto the outer overlay element (backdrop). Lets a caller attach
   *  hooks — e.g. so a page screenshot can exclude the WHOLE modal, backdrop + title bar included
   *  (see FeedbackTicketModal's capture). Our onClick/style always win over anything passed here. */
  overlayProps?: Record<`data-${string}`, string>;
}

/** Track the ≤767px breakpoint (DESIGN.md mobile breakpoint) for full-screen modals. SSR-safe. */
function useIsMobile(enabled: boolean): boolean {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [enabled]);
  return isMobile;
}

export function Modal({ open, onClose, title, subtitle, children, maxWidth = 600, fullScreenOnMobile = false, overlayProps }: ModalProps) {
  const mobileFull = useIsMobile(fullScreenOnMobile);
  // Only a genuine backdrop click dismisses. We remember whether the press STARTED on the backdrop
  // so a drag-select that begins inside the modal and releases on the backdrop (e.g. dragging a text
  // selection to the far-left screen edge) does NOT close the dialog and discard typed data (#310).
  const pressStartedOnOverlay = React.useRef(false);
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
      {...overlayProps}
      onPointerDown={(e) => {
        pressStartedOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          shouldDismissOnOverlayInteraction({
            pressStartedOnOverlay: pressStartedOnOverlay.current,
            clickTargetIsOverlay: e.target === e.currentTarget,
          })
        ) {
          onClose();
        }
      }}
      style={{
        position: "fixed", inset: 0, background: "rgba(20,19,15,0.45)",
        display: "flex", alignItems: mobileFull ? "stretch" : "flex-start", justifyContent: "center",
        padding: mobileFull ? 0 : "56px 20px", zIndex: 50, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-raised)",
          borderRadius: mobileFull ? 0 : "var(--radius-lg)",
          boxShadow: mobileFull ? "none" : "var(--shadow-xl)",
          width: "100%", maxWidth: mobileFull ? "100%" : maxWidth,
          minHeight: mobileFull ? "100dvh" : undefined,
          padding: mobileFull ? "var(--space-5)" : "var(--space-6)",
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
