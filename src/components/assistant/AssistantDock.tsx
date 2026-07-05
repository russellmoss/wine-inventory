"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { usePrefersReducedMotion } from "@/components/ui/Collapsible";

// Phase 038: a global, collapsible assistant dock — the same AssistantChat brain on every authed page.
// Hidden on /assistant (that's the full-page chat, so the two never double-mount + fight over history).
// Lazy: AssistantChat (and its history fetch) only mount on first open. z-index 60 sits above modals (50).
// Text-only by design: voice is a full-screen overlay that lives on the /assistant page — enabling it inside
// a collapsible dock would leave the mic/audio session running invisibly when the dock is closed.
// Reduced-motion aware; Escape closes; focus is managed for a11y.

const AssistantChat = React.lazy(() =>
  import("@/app/(app)/assistant/AssistantChat").then((m) => ({ default: m.AssistantChat })),
);

export function AssistantDock({ userLabel }: { userLabel: string }) {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();
  const titleId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [everOpened, setEverOpened] = React.useState(false);
  const fabRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const mounted = React.useRef(false);

  // Manage focus on genuine open/close transitions only — NOT on initial mount (else the FAB would steal
  // focus on every page load). Focus into the panel on open; return it to the FAB when the user closes.
  React.useEffect(() => {
    if (open) panelRef.current?.focus();
    else if (mounted.current) fabRef.current?.focus();
    mounted.current = true;
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
            position: "fixed", right: "var(--space-5)", bottom: "var(--space-5)", zIndex: 60,
            height: 52, padding: "0 var(--space-4)", borderRadius: "var(--radius-pill)",
            border: "none", cursor: "pointer", background: "var(--accent)", color: "var(--accent-on)",
            boxShadow: "var(--shadow-xl)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", fontWeight: 500,
            display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: "none" }}>
            <path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6l-3 2.4V11.5H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          Ask
        </button>
      ) : null}

      {/* Expanded panel — kept mounted after first open so chat state survives collapse. */}
      {everOpened ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={titleId}
          aria-modal={false}
          tabIndex={-1}
          style={{
            position: "fixed", right: "var(--space-5)", bottom: "var(--space-5)", zIndex: 60,
            width: "min(440px, 94vw)", height: "min(620px, 80vh)",
            display: open ? "flex" : "none", flexDirection: "column",
            background: "var(--surface-raised)", border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xl)", overflow: "hidden",
            opacity: open ? 1 : 0, transform: open ? "none" : "translateY(8px)", transition,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-strong)", flex: "none" }}>
            <span id={titleId} style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 15, color: "var(--text-primary)" }}>Assistant</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the assistant"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: "var(--text-muted)", padding: 4 }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "0 var(--space-4) var(--space-4)" }}>
            <React.Suspense fallback={<div style={{ padding: "var(--space-4)", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)" }}>Loading…</div>}>
              <AssistantChat userLabel={userLabel} embedded />
            </React.Suspense>
          </div>
        </div>
      ) : null}
    </>
  );
}
