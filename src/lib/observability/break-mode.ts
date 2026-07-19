// Pure state logic for Break Mode (Plan 080 Unit 9).
//
// Break Mode is the deliberate "I'm hunting bugs" switch for developer-role users. It starts a
// Sentry replay in session mode, tags the hunt, arms the interaction trail, and shows a persistent
// recording indicator. Everything decision-shaped lives here so it is unit-testable without React.
//
// The indicator encodes RISK, not just state (design review): recording a REAL customer tenant is
// the dangerous case and gets the loud danger treatment, while the sandbox stays calm. A developer
// must never be able to glance at the screen and be unsure whose data they are capturing.

import type { ReplayFidelity } from "./sentry-replay";

/** A hunt auto-stops after this long so a forgotten toggle can't burn the capped replay quota. */
export const HUNT_TIMEOUT_MS = 30 * 60 * 1000;

/** Token-backed tone for the indicator. Maps to --danger / --warning / --text-muted. */
export type IndicatorTone = "danger" | "warning" | "muted";

export type IndicatorState = {
  tone: IndicatorTone;
  label: string;
  /** Whether the dot should pulse (callers must still honor prefers-reduced-motion). */
  pulse: boolean;
};

/** Format remaining hunt time as m:ss (clamped at zero). */
export function formatCountdown(msRemaining: number): string {
  const safe = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Remaining time for a hunt started at `startedAt`, given `now`. */
export function huntMsRemaining(startedAt: number, now: number, timeoutMs = HUNT_TIMEOUT_MS): number {
  return Math.max(0, startedAt + timeoutMs - now);
}

/** Whether a hunt has outlived its auto-off window. */
export function isHuntExpired(startedAt: number, now: number, timeoutMs = HUNT_TIMEOUT_MS): boolean {
  return huntMsRemaining(startedAt, now, timeoutMs) <= 0;
}

/**
 * Derive what the indicator should say and how loudly.
 *
 * - `replayAvailable === false` → degraded: the replay could not start (quota exhausted, Sentry
 *   absent). We say so plainly instead of showing a red dot that implies a recording exists. The
 *   first-party trail is quota-independent and keeps running, so the hunt is still worth doing.
 * - `fidelity === "full"` → sandbox tenant. Calmer amber: capture is rich but the data is fake.
 * - otherwise → a REAL customer tenant. Loud danger red, and the label says "metadata only" so the
 *   developer knows bodies are not being captured.
 */
export function deriveIndicator(input: {
  fidelity: ReplayFidelity;
  tenantName: string;
  replayAvailable: boolean;
  msRemaining?: number;
}): IndicatorState {
  const suffix =
    typeof input.msRemaining === "number" ? ` · ${formatCountdown(input.msRemaining)} left` : "";

  if (!input.replayAvailable) {
    return {
      tone: "muted",
      label: `⚠ quota exhausted — replay unavailable · trail still capturing${suffix}`,
      pulse: false,
    };
  }
  if (input.fidelity === "full") {
    return {
      tone: "warning",
      label: `REC · ${input.tenantName} · full capture${suffix}`,
      pulse: true,
    };
  }
  return {
    tone: "danger",
    label: `REC · ${input.tenantName} · metadata only${suffix}`,
    pulse: true,
  };
}

/** CSS custom property backing each tone. Never hardcode colors at the call site. */
export function toneColorVar(tone: IndicatorTone): string {
  if (tone === "danger") return "var(--danger)";
  if (tone === "warning") return "var(--warning)";
  return "var(--text-muted)";
}

/** Build a hunt id. `rand` is injectable so tests stay deterministic. */
export function newHuntId(now: number, rand: () => number = Math.random): string {
  return `hunt_${now.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
}

// --- client session state ---------------------------------------------------
// Module-level so the report form can stamp the active hunt onto a ticket without threading React
// context through the whole app. Set by BreakModeControl, read at submit (Plan 080 Unit 10).

let activeHuntId: string | null = null;

export function setActiveHuntId(id: string | null): void {
  activeHuntId = id;
}

export function getActiveHuntId(): string | null {
  return activeHuntId;
}
