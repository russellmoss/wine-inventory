"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";
import {
  HUNT_TIMEOUT_MS,
  deriveIndicator,
  huntMsRemaining,
  isHuntExpired,
  newHuntId,
  setActiveHuntId,
  toneColorVar,
} from "@/lib/observability/break-mode";
import {
  armInteractionCapture,
  clearInteractionTrail,
  disarmInteractionCapture,
} from "@/lib/observability/interaction-buffer";
import { setConsoleBufferEscalated } from "@/lib/observability/console-buffer";
import {
  readReplayFidelityFromCookieString,
  type ReplayFidelity,
} from "@/lib/observability/sentry-replay";
import { syncReplayFidelity } from "@/lib/observability/replay-fidelity";

/**
 * Break Mode (Plan 080 Unit 9) — the deliberate "I'm hunting bugs" switch, developer-role only.
 *
 * ON: starts a Sentry replay in session mode, tags the hunt, arms the interaction/network trail,
 * and grows the console ring. A persistent indicator states WHOSE data is being recorded, because
 * the whole privacy story depends on the developer noticing they are in a real customer tenant.
 *
 * The hunt auto-stops after HUNT_TIMEOUT_MS so a forgotten toggle can't burn the capped free-plan
 * replay quota, and stops on tab close. We deliberately do NOT stop on tab *hide* — switching tabs
 * to read docs mid-hunt is normal and killing the recording there would lose the repro.
 */
export function BreakModeControl({ tenantName }: { tenantName: string }) {
  const [armed, setArmed] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [replayAvailable, setReplayAvailable] = React.useState(true);
  // Fidelity is only meaningful once a hunt is running, and start() reads the live cookie then —
  // so there is no initial-read effect to go stale (or to fight hydration).
  const [fidelity, setFidelity] = React.useState<ReplayFidelity>("masked");

  const reducedMotion = React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false, // server snapshot: assume motion allowed, corrected on hydration
  );

  // Keep the fidelity hint cookie current so the NEXT full load initializes Sentry correctly.
  React.useEffect(() => {
    void syncReplayFidelity().catch(() => {
      /* non-fatal: an absent/stale cookie simply means masked (fail closed) */
    });
  }, []);

  const stop = React.useCallback(() => {
    try {
      Sentry.getReplay()?.stop();
    } catch {
      /* stopping a replay must never throw into the app */
    }
    Sentry.setTag("hunt", undefined);
    Sentry.setTag("huntId", undefined);
    setActiveHuntId(null);
    disarmInteractionCapture();
    clearInteractionTrail();
    setConsoleBufferEscalated(false);
    setArmed(false);
    setStartedAt(null);
  }, []);

  const start = React.useCallback(() => {
    const at = Date.now();
    const huntId = newHuntId(at);
    let available = true;
    try {
      const replay = Sentry.getReplay();
      if (replay) replay.start();
      else available = false;
    } catch {
      // Quota exhausted / replay unavailable: the hunt still runs on the first-party trail, and
      // the indicator says so rather than showing a red dot that implies a recording exists.
      available = false;
    }
    Sentry.setTag("hunt", "true");
    Sentry.setTag("huntId", huntId);
    setActiveHuntId(huntId);
    const active = readReplayFidelityFromCookieString(document.cookie);
    setFidelity(active);
    armInteractionCapture(active);
    setConsoleBufferEscalated(true);
    setReplayAvailable(available);
    setStartedAt(at);
    setNow(at);
    setArmed(true);
  }, []);

  // Countdown tick + auto-off.
  React.useEffect(() => {
    if (!armed || startedAt === null) return;
    const id = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      if (isHuntExpired(startedAt, tick)) stop();
    }, 1000);
    return () => window.clearInterval(id);
  }, [armed, startedAt, stop]);

  // Stop on tab close so a hunt never outlives the session.
  React.useEffect(() => {
    if (!armed) return;
    const onUnload = () => stop();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [armed, stop]);

  const indicator = armed
    ? deriveIndicator({
        fidelity,
        tenantName,
        replayAvailable,
        msRemaining: startedAt === null ? HUNT_TIMEOUT_MS : huntMsRemaining(startedAt, now),
      })
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => (armed ? stop() : start())}
        aria-pressed={armed}
        // Excluded from bug-report screenshots so the capture shows the page, not our own chrome.
        data-feedback-capture-exclude=""
        data-assistant-surface=""
        style={{
          position: "fixed",
          right: "var(--space-4)",
          bottom: "calc(var(--space-4) + 72px)",
          zIndex: 60,
          minHeight: 44,
          padding: "0 var(--space-3)",
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${armed ? toneColorVar(indicator!.tone) : "var(--border-strong)"}`,
          background: "var(--surface-raised)",
          color: armed ? toneColorVar(indicator!.tone) : "var(--text-secondary)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-body-sm)",
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true">{armed ? "■" : "●"}</span>
        {armed ? "Stop break mode" : "Break mode"}
      </button>

      {armed && indicator ? (
        <div
          role="status"
          aria-live="polite"
          data-feedback-capture-exclude=""
          data-assistant-surface=""
          style={{
            position: "fixed",
            top: "var(--space-3)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 61,
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "6px var(--space-3)",
            borderRadius: "var(--radius-md)",
            border: `1px solid ${toneColorVar(indicator.tone)}`,
            background: "var(--surface-raised)",
            color: toneColorVar(indicator.tone),
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-body-sm)",
            boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.08))",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: toneColorVar(indicator.tone),
              // Honor prefers-reduced-motion: a static dot still reads as "recording".
              animation: indicator.pulse && !reducedMotion ? "cbhBreakModePulse 1.4s ease-in-out infinite" : undefined,
            }}
          />
          {indicator.label}
          <style>{"@keyframes cbhBreakModePulse{0%,100%{opacity:1}50%{opacity:.35}}"}</style>
        </div>
      ) : null}
    </>
  );
}
