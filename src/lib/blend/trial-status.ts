/**
 * BlendTrialStatus → StatusChip variant.
 *
 * This exists because TrialsClient used to call the WORK-ORDER `statusTone()` on a
 * `BlendTrialStatus`. None of CHOSEN / PROMOTED / DISCARDED is a key in that map, so
 * every trial past DRAFT silently fell through to neutral and the screen showed no
 * status colour at all. A different enum gets its own function, not a key overload.
 *
 * DISCARDED maps to `neutral`, deliberately NOT `attention`: discarding a losing
 * blend trial is a normal, intentional, successful terminal state in winemaking.
 * Flagging it would make routine trial history read as a wall of errors.
 *
 * Pure + isomorphic — no imports beyond the type, unit-tested in test/blend-trial-status.test.ts.
 */
import type { StatusVariant } from "@/components/ui/status-variants";

export const BLEND_TRIAL_TONE: Record<string, StatusVariant> = {
  DRAFT: "neutral",
  CHOSEN: "active",
  PROMOTED: "done",
  DISCARDED: "neutral",
};

/** Unknown → neutral (fail-soft, never a blank chip). */
export function blendTrialStatusTone(status: string): StatusVariant {
  return BLEND_TRIAL_TONE[status] ?? "neutral";
}
