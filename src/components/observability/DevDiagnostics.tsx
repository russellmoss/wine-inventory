"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";
import {
  deriveIndicator,
  newDiagnosticsSessionId,
  setActiveHuntId,
  toneColorVar,
} from "@/lib/observability/dev-diagnostics";
import { armInteractionCapture } from "@/lib/observability/interaction-buffer";
import { setConsoleBufferEscalated } from "@/lib/observability/console-buffer";
import {
  readReplayFidelityFromCookieString,
  type ReplayFidelity,
} from "@/lib/observability/sentry-replay";
import { syncReplayFidelity } from "@/lib/observability/replay-fidelity";

/**
 * Developer diagnostics — always on for developer-role users, no button (Plan 080, reshaped).
 *
 * This replaced a "Break Mode" toggle. Our developer-role testers spend the day trying to break the
 * app and file reports, so a switch you must remember to flip before an unpredictable event fails at
 * exactly the wrong moment. Everything arms automatically on mount instead:
 *
 *  - the first-party interaction/network trail (free, in-memory) starts recording;
 *  - the console ring grows;
 *  - the Sentry replay starts BUFFERING (`startBuffering`), which costs no quota — the buffer is
 *    only uploaded, and therefore only billed, when a bug report is filed and FeedbackForm calls
 *    `flush()`. Spend tracks bugs reported, not time spent hunting.
 *
 * `startBuffering()` is a documented no-op if a replay is already recording (e.g. this session was
 * caught by ambient sampling), so it is safe to call unconditionally.
 *
 * The indicator is disclosure, not a control: quiet in the sandbox (a permanent alarm becomes
 * wallpaper), loud in a real customer tenant, where knowing whose data is being captured matters.
 */
export function DevDiagnostics({ tenantName }: { tenantName: string }) {
  // The fidelity this page actually initialized Sentry with. Read via useSyncExternalStore rather
  // than an effect+setState so the server snapshot ("masked") and the client read can't produce a
  // hydration mismatch — and so the label never briefly claims the wrong capture level.
  const fidelity = React.useSyncExternalStore<ReplayFidelity>(
    () => () => {}, // the cookie does not change within a page's lifetime
    () => readReplayFidelityFromCookieString(document.cookie),
    () => "masked", // server snapshot: fail closed
  );

  React.useEffect(() => {
    // Keep the fidelity hint cookie current so the NEXT full load initializes Sentry correctly.
    void syncReplayFidelity().catch(() => {
      /* non-fatal: an absent/stale cookie simply means masked (fail closed) */
    });

    setActiveHuntId(newDiagnosticsSessionId(Date.now()));
    setConsoleBufferEscalated(true);

    try {
      // Buffer in memory only. Nothing is uploaded (or billed) until a report flushes it.
      Sentry.getReplay()?.startBuffering();
    } catch {
      // Replay unavailable (quota, integration absent) must never break the app — the first-party
      // trail is quota-independent and keeps working on its own.
    }
    // Deliberately no teardown: diagnostics run for the life of the session. There is nothing to
    // stop, because nothing is being uploaded until a report is filed.
  }, []);

  // Arming is idempotent, so this can safely track fidelity if it ever resolves late.
  React.useEffect(() => {
    armInteractionCapture(fidelity);
  }, [fidelity]);

  const indicator = deriveIndicator({ fidelity, tenantName });

  return (
    <div
      role="status"
      aria-live="polite"
      // Excluded from bug-report screenshots so the capture shows the page, not our own chrome.
      data-feedback-capture-exclude=""
      data-assistant-surface=""
      style={{
        position: "fixed",
        bottom: "var(--space-2)",
        left: "var(--space-3)",
        zIndex: 60,
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-sm)",
        color: toneColorVar(indicator.tone),
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-body-sm)",
        // Loud only when it matters: a real customer tenant gets a border, the sandbox stays plain.
        border: indicator.tone === "danger" ? `1px solid ${toneColorVar(indicator.tone)}` : "none",
        background: indicator.tone === "danger" ? "var(--surface-raised)" : "transparent",
        opacity: indicator.tone === "danger" ? 1 : 0.6,
        pointerEvents: "none",
      }}
    >
      <span aria-hidden="true">●</span>
      {indicator.label}
    </div>
  );
}
