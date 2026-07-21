"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { usePrefersReducedMotion } from "@/components/ui/Collapsible";
import type { HostVoiceStatus } from "@/app/(app)/assistant/AssistantChat";

// Phase 038: a global, collapsible assistant dock — the same AssistantChat brain on every authed page.
// Hidden on /assistant (that's the full-page chat, so the two never double-mount + fight over history).
// Lazy: AssistantChat (and its history fetch) only mount on first open. z-index 60 sits above modals (50).
// Voice: honors the same server gate as the full page (`voiceEnabled`). The overlay is a full-screen,
// fixed dialog that escapes the panel. Because the dock keeps AssistantChat mounted (display:none) after
// first open to preserve chat state, we pass `active={open}` so the chat force-closes any live voice
// session when the dock collapses — otherwise the mic/audio loop would keep running invisibly.
// Reduced-motion aware; Escape closes; focus is managed for a11y.
//
// Movable + growable (assistant-widget-drag-resize): in the DOCKED (non-expanded) state the panel is
// pinned by its BOTTOM-RIGHT corner (CSS right/bottom + width/height). Dragging the title bar moves it
// (adjusts right/bottom); dragging the TOP-LEFT corner handle grows it (adjusts width/height while the
// bottom-right stays anchored — so it only ever grows toward open screen space). Floor size = the old
// default (440×620, or the viewport if smaller) so it can grow but never shrink below the baseline.
// Everything is clamped on-screen. The dock always OPENS at the original default place + size, and drag/
// resize changes are ephemeral for that open session — closing (×) and reopening snaps it back to default,
// which is the easy "reset" gesture. The "expand to center" focus mode is unchanged; drag/resize are
// disabled while expanded. During a drag we mutate the panel DOM imperatively and only commit to React
// state on pointer-up, so the heavy AssistantChat subtree doesn't re-render mid-drag.

const AssistantChat = React.lazy(() =>
  import("@/app/(app)/assistant/AssistantChat").then((m) => ({ default: m.AssistantChat })),
);
const VoiceHeaderOrb = React.lazy(() =>
  import("@/app/(app)/assistant/voice/VoiceHeaderOrb").then((m) => ({ default: m.VoiceHeaderOrb })),
);

const DOCK_MARGIN = 12; // keep this much gap between the panel and the viewport edges
// The historical opening size: capped at the viewport like the old CSS (width min(440,94vw), height
// min(620,80vh)) so the dock opens IDENTICALLY to before. This size is also the resize floor.
const BASE_W = 440;
const BASE_H = 620;

type DockRect = { right: number; bottom: number; width: number; height: number };

const clampNum = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

// The default opening rect — pinned bottom-right at 24px, sized like the old CSS (min(440,94vw) ×
// min(620,80vh)), so the dock opens exactly as it always has. Also the resize floor. Client-only.
function defaultDockRect(): DockRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    right: 24,
    bottom: 24,
    width: Math.min(BASE_W, vw * 0.94),
    height: Math.min(BASE_H, vh * 0.8),
  };
}

// Minimum size = the default opening size (so it can grow but never shrink below how it opened).
function minDockSize(): { w: number; h: number } {
  const d = defaultDockRect();
  return { w: d.width, h: d.height };
}

// Keep the panel fully on-screen and within [min, viewport] for size. Reads live window dims — client only.
function clampDockRect(r: DockRect): DockRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { w: minW, h: minH } = minDockSize();
  const maxW = Math.max(minW, vw - 2 * DOCK_MARGIN);
  const maxH = Math.max(minH, vh - 2 * DOCK_MARGIN);
  const width = clampNum(r.width, minW, maxW);
  const height = clampNum(r.height, minH, maxH);
  const right = clampNum(r.right, DOCK_MARGIN, Math.max(DOCK_MARGIN, vw - width - DOCK_MARGIN));
  const bottom = clampNum(r.bottom, DOCK_MARGIN, Math.max(DOCK_MARGIN, vh - height - DOCK_MARGIN));
  return { right, bottom, width, height };
}

function applyRect(el: HTMLElement | null, r: DockRect) {
  if (!el) return;
  el.style.right = `${r.right}px`;
  el.style.bottom = `${r.bottom}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
}

export function AssistantDock({ userLabel, voiceEnabled = false }: { userLabel: string; voiceEnabled?: boolean }) {
  const pathname = usePathname();
  const reduced = usePrefersReducedMotion();
  const titleId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [everOpened, setEverOpened] = React.useState(false);
  // Position/size of the docked panel, pinned by its bottom-right corner. Starts at the static default
  // (SSR-safe — no window); reset to the viewport-aware default every time the dock opens (see openDock),
  // so it always opens where/how it used to and closing is the reset.
  const [rect, setRect] = React.useState<DockRect>({ right: 24, bottom: 24, width: BASE_W, height: BASE_H });
  // Voice status lifted out of the chat so the title bar can draw the orb and Escape can
  // be routed. Set only when the state ENUM changes, so this never churns per audio frame.
  const [voiceStatus, setVoiceStatus] = React.useState<HostVoiceStatus | null>(null);
  // Brief close-out so ending voice is not a silent disappearance ("did it stop
  // listening?" is not an anxiety a mic-bearing feature may leave hanging).
  const [justEnded, setJustEnded] = React.useState(false);
  const fabRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const mounted = React.useRef(false);
  // Live rect during a drag (kept out of React state so the chat subtree doesn't re-render each move).
  const liveRect = React.useRef<DockRect>(rect);
  const dragState = React.useRef<
    { mode: "move" | "resize"; startX: number; startY: number; start: DockRect } | null
  >(null);

  // Keep the live-rect ref in sync with committed state (but never stomp it mid-drag).
  React.useEffect(() => {
    if (!dragState.current) liveRect.current = rect;
  }, [rect]);

  // Re-clamp if the window shrinks so the panel can't end up off-screen or larger than the viewport.
  React.useEffect(() => {
    const onResize = () => {
      if (dragState.current) return;
      setRect((r) => clampDockRect(r));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Manage focus on genuine open/close transitions only — NOT on initial mount (else the FAB would steal
  // focus on every page load). Focus into the panel on open; return it to the FAB when the user closes.
  React.useEffect(() => {
    if (open) panelRef.current?.focus();
    else if (mounted.current) fabRef.current?.focus();
    mounted.current = true;
  }, [open]);

  // The dock is the SINGLE owner of Escape, and routes it by precedence:
  //   voice live -> end voice (the dock stays open)   [most specific]
  //   expanded   -> shrink
  //   otherwise  -> close the dock
  //
  // This used to defer to `[role=dialog][aria-modal=true]`, i.e. the full-screen voice
  // overlay. Inline voice deletes that attribute (a modal is exactly what it must not
  // be), which would have silently turned "Escape ends voice" into "Escape collapses the
  // dock mid-conversation". The dual guard keeps the old overlay working on the
  // /assistant route until it is retired; drop it with the overlay.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (voiceStatus) {
        voiceStatus.end();
        return;
      }
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (expanded) setExpanded(false);
      else closeDock();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, open, voiceStatus]);

  // Show "Voice ended" for a beat after a live session goes away, then clear it. Skipped
  // when the dock itself is closing — there is no title bar left to read it on.
  const hadVoice = React.useRef(false);
  React.useEffect(() => {
    if (voiceStatus) {
      hadVoice.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a transient notice when voice restarts
      setJustEnded(false);
      return;
    }
    if (!hadVoice.current || !open) return;
    hadVoice.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the notice IS an effect of the session ending
    setJustEnded(true);
    const t = setTimeout(() => setJustEnded(false), 2000);
    return () => clearTimeout(t);
  }, [voiceStatus, open]);

  // --- Drag to move / drag-corner to grow -------------------------------------------------------------
  // Shared pointer loop. `move` shifts the bottom-right anchor (right/bottom); `resize` grows width/height
  // from the top-left corner (bottom-right stays pinned). We write to the DOM imperatively for a smooth
  // drag and commit to state + localStorage once, on pointer-up.
  const beginDrag = React.useCallback(
    (mode: "move" | "resize", e: React.PointerEvent) => {
      if (expanded) return; // free positioning only applies to the docked state
      e.preventDefault();
      dragState.current = { mode, startX: e.clientX, startY: e.clientY, start: { ...liveRect.current } };

      const onMove = (ev: PointerEvent) => {
        const ds = dragState.current;
        if (!ds) return;
        const dx = ev.clientX - ds.startX;
        const dy = ev.clientY - ds.startY;
        const next =
          ds.mode === "move"
            ? { ...ds.start, right: ds.start.right - dx, bottom: ds.start.bottom - dy }
            : { ...ds.start, width: ds.start.width - dx, height: ds.start.height - dy };
        const clamped = clampDockRect(next);
        liveRect.current = clamped;
        applyRect(panelRef.current, clamped);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        if (!dragState.current) return;
        dragState.current = null;
        setRect(liveRect.current); // commit the drag; ephemeral — reset on next open, not persisted
      };

      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [expanded],
  );

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    // Don't start a move when the pointer lands on a header control (enlarge / close).
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button !== 0) return;
    beginDrag("move", e);
  };

  // The full-page assistant lives at /assistant — don't stack a dock on top of it.
  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) return null;

  const openDock = () => {
    setEverOpened(true);
    setExpanded(false);
    // Always open at the original default place + size — closing then reopening is the "reset" gesture.
    setRect(defaultDockRect());
    setOpen(true);
  };

  function closeDock() {
    setExpanded(false);
    setOpen(false);
  }

  const transition = reduced ? "none" : "opacity var(--duration-normal) var(--ease-out), transform var(--duration-normal) var(--ease-out)";
  const panelPosition: React.CSSProperties = expanded
    ? {
        left: "50%",
        top: "50%",
        width: "min(94vw, clamp(520px, 75vw, 1040px))",
        height: "min(86vh, max(75vh, 620px))",
        transform: "translate(-50%, -50%)",
      }
    : {
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        transform: open ? "none" : "translateY(8px)",
      };

  return (
    <>
      {/* Collapsed FAB */}
      {!open ? (
        <button
          ref={fabRef}
          type="button"
          onClick={openDock}
          aria-label="Open the assistant"
          data-assistant-surface
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
        <>
          {open && expanded ? (
            <button
              type="button"
              aria-label="Shrink the assistant"
              onClick={() => setExpanded(false)}
              data-assistant-surface
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 59,
                border: "none",
                padding: 0,
                cursor: "default",
                background: "rgba(20, 19, 15, 0.28)",
              }}
            />
          ) : null}
          <div
            ref={panelRef}
            role="dialog"
            aria-labelledby={titleId}
            aria-modal={false}
            tabIndex={-1}
            data-assistant-surface
            style={{
              position: "fixed",
              zIndex: expanded ? 61 : 60,
              ...panelPosition,
              display: open ? "flex" : "none", flexDirection: "column",
              background: "var(--surface-raised)", border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xl)", overflow: "hidden",
              opacity: open ? 1 : 0,
              transition,
            }}
          >
          {/* Top-left corner resize grip — drag outward (up/left) to grow; docked state only. */}
          {!expanded ? (
            <div
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                beginDrag("resize", e);
              }}
              aria-hidden="true"
              title="Drag to resize"
              style={{
                position: "absolute", top: 0, left: 0, width: 20, height: 20, zIndex: 2,
                cursor: "nwse-resize", touchAction: "none",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: "block" }}>
                <path d="M4 10 L4 4 L10 4 M4 4 L9 9" fill="none" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ) : null}
          <div
            onPointerDown={expanded ? undefined : onHeaderPointerDown}
            style={{
              // 3 columns, not space-between: the orb has to sit in the OPTICAL centre
              // regardless of how wide the title or the button cluster are.
              display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8,
              padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-strong)", flex: "none",
              cursor: expanded ? "default" : "move", touchAction: expanded ? "auto" : "none", userSelect: "none",
            }}
          >
            <span id={titleId} style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 15, color: "var(--text-primary)", minWidth: 0 }}>Assistant</span>
            {/* Middle column of the 3-column grid: the voice orb, optically centred no
                matter how wide the title or the button cluster get. It is pointer-inert
                (see VoiceHeaderOrb) so a drag started here still moves the panel. */}
            <span style={{ display: "flex", justifyContent: "center", minWidth: 0, overflow: "hidden" }}>
              {voiceStatus ? (
                <React.Suspense fallback={null}>
                  <VoiceHeaderOrb state={voiceStatus.state} getLevel={voiceStatus.getLevel} />
                </React.Suspense>
              ) : justEnded ? (
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                    transition: "opacity var(--duration-normal, 220ms) ease",
                  }}
                >
                  Voice ended
                </span>
              ) : null}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Shrink the assistant" : "Enlarge the assistant"}
                title={expanded ? "Shrink" : "Enlarge"}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 6, lineHeight: 0, borderRadius: "var(--radius-md)" }}
              >
                {expanded ? (
                  <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
                    <path d="M6.5 2.5v4h-4M10.5 14.5v-4h4M2.8 6.2 6.5 2.5M14.2 10.8l-3.7 3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
                    <path d="M6.5 2.5h-4v4M10.5 14.5h4v-4M2.8 2.8l3.7 3.7M14.2 14.2l-3.7-3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={closeDock}
                aria-label="Close the assistant"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: "var(--text-muted)", padding: 4 }}
              >
                ×
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "0 var(--space-4) var(--space-4)" }}>
            <React.Suspense fallback={<div style={{ padding: "var(--space-4)", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)" }}>Loading…</div>}>
              <AssistantChat
                userLabel={userLabel}
                embedded
                voiceEnabled={voiceEnabled}
                active={open}
                onVoiceStatus={setVoiceStatus}
              />
            </React.Suspense>
          </div>
        </div>
        </>
      ) : null}
    </>
  );
}
