"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { usePrefersReducedMotion } from "@/components/ui/Collapsible";

// Phase 038: a global, collapsible assistant dock — the same AssistantChat brain on every authed page.
// Hidden on /assistant (that's the full-page chat, so the two never double-mount + fight over history).
// Lazy: AssistantChat (and its history fetch) only mount on first open. z-index 60 sits above modals (50),
// below the voice overlay (1000). Reduced-motion aware; Escape closes; focus is managed for a11y.

const AssistantChat = React.lazy(() =>
  import("@/app/(app)/assistant/AssistantChat").then((m) => ({ default: m.AssistantChat })),
);

export function AssistantDock({ userLabel, voiceEnabled = false }: { userLabel: string; voiceEnabled?: boolean }) {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [everOpened, setEverOpened] = React.useState(false);
  const fabRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Move focus into the panel on open; return it to the FAB on close (a DOM side effect, not state).
  React.useEffect(() => {
    if (open) panelRef.current?.focus();
    else fabRef.current?.focus();
  }, [open]);

  // Escape closes the panel while it's open.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The full-page assistant lives at /assistant — don't stack a dock on top of it.
  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) return null;

  const openDock = () => {
    setEverOpened(true);
    setOpen(true);
  };

  const transition = reduced ? "none" : "opacity var(--duration-normal) var(--ease-out), transform var(--duration-normal) var(--ease-out)";

  return (
    <>
      {/* Collapsed FAB */}
      {!open ? (
        <button
          ref={fabRef}
          type="button"
          onClick={openDock}
          aria-label="Open the assistant"
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 60,
            height: 52, minWidth: 52, padding: "0 18px", borderRadius: "var(--radius-pill)",
            border: "none", cursor: "pointer", background: "var(--accent)", color: "var(--accent-on)",
            boxShadow: "var(--shadow-xl)", fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 500,
            display: "inline-flex", alignItems: "center", gap: 8,
          }}
        >
          <span aria-hidden="true">✦</span> Ask
        </button>
      ) : null}

      {/* Expanded panel — kept mounted after first open so chat state survives collapse. */}
      {everOpened ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Assistant"
          aria-modal={false}
          tabIndex={-1}
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 60,
            width: "min(460px, 94vw)", height: "min(640px, 82vh)",
            display: open ? "flex" : "none", flexDirection: "column",
            background: "var(--surface-raised)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xl)", overflow: "hidden",
            opacity: open ? 1 : 0, transform: open ? "none" : "translateY(8px)", transition,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border-strong)", flex: "none" }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 15, color: "var(--text-primary)" }}>Assistant</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the assistant"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: "var(--text-muted)", padding: 4 }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <React.Suspense fallback={<div style={{ padding: 20, color: "var(--text-muted)", fontSize: 14 }}>Loading…</div>}>
              <AssistantChat userLabel={userLabel} voiceEnabled={voiceEnabled} />
            </React.Suspense>
          </div>
        </div>
      ) : null}
    </>
  );
}
