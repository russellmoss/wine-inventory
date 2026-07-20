// Pure state logic for developer diagnostics (Plan 080, reshaped).
//
// ORIGINALLY this was "Break Mode": a toggle a developer flipped on before hunting bugs. That was the
// wrong shape for how it is actually used. Our developer-role testers spend their whole day trying to
// break the app and file reports, so hunting is the DEFAULT state, not an occasional act — and a
// button you must remember to press before an unpredictable event fails exactly when it matters:
// the bug happens with the recorder off.
//
// So diagnostics are now always on for developer-role users, and the two things the toggle bundled
// are separated by what they actually cost:
//   - the first-party trail (clicks / routes / API metadata) costs NOTHING and always records;
//   - the Sentry replay records into an in-memory BUFFER (also free) and is only uploaded — i.e.
//     only billed — when a bug report is actually filed.
// Quota spend therefore tracks bugs reported, not time spent hunting, and nobody has to remember
// anything. The ~60s rrweb buffer window is the tradeoff: the replay video covers the moments before
// the report, while the (unbounded-by-comparison) first-party trail keeps the longer action history.
//
// What survives from the old design is the honest-disclosure signal: an indicator saying diagnostics
// are on, stated LOUDLY when the session is a real customer tenant rather than the sandbox.

import type { ReplayFidelity } from "./sentry-replay";

/** Token-backed tone for the indicator. Maps to --danger / --text-muted. */
export type IndicatorTone = "danger" | "muted";

export type IndicatorState = {
  tone: IndicatorTone;
  label: string;
};

/**
 * Derive the diagnostics indicator.
 *
 * A permanently-lit alarm becomes wallpaper, so the sandbox case is deliberately QUIET — diagnostics
 * are unremarkable there and the data is synthetic. A real customer tenant is the case worth
 * interrupting for, so it gets `--danger` and names the tenant: a developer must never be unsure
 * whose data a session is capturing. `fidelity` is the same value that gates Sentry body capture, so
 * the label cannot drift from what is actually being recorded.
 */
export function deriveIndicator(input: {
  fidelity: ReplayFidelity;
  tenantName: string;
}): IndicatorState {
  if (input.fidelity === "full") {
    // Sandbox: full capture is allowed precisely because nothing here belongs to a customer.
    return { tone: "muted", label: `Diagnostics on · ${input.tenantName}` };
  }
  return {
    tone: "danger",
    label: `Diagnostics on · ${input.tenantName} · real tenant, metadata only`,
  };
}

/** CSS custom property backing each tone. Never hardcode colors at the call site. */
export function toneColorVar(tone: IndicatorTone): string {
  return tone === "danger" ? "var(--danger)" : "var(--text-muted)";
}

/** Build a diagnostics session id. `rand` is injectable so tests stay deterministic. */
export function newDiagnosticsSessionId(now: number, rand: () => number = Math.random): string {
  return `hunt_${now.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`;
}

// --- client session state ---------------------------------------------------
// Module-level so the report form can stamp the active diagnostics session onto a ticket without
// threading React context through the whole app. Set once when diagnostics arm, read at submit.
//
// The persisted field stays `debugContext.huntId` (schema v3, already shipped) so this reshape needs
// no schema change; it correlates every report filed during one browser session.

let activeSessionId: string | null = null;

export function setActiveHuntId(id: string | null): void {
  activeSessionId = id;
}

export function getActiveHuntId(): string | null {
  return activeSessionId;
}
