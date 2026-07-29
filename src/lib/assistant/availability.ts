// Is the assistant actually usable right now, and what do we say if not? Plan 105 U5 / DM-58.
//
// SC-12's row (02-screen-inventory.md:285): "AI unavailable — the dock says so; the page and the
// manual New work order flow are unaffected." Two halves, and the second is the one with teeth:
// 03-interaction-spec.md:183 forbids AI-only affordances for anything a user must be able to do
// without AI. A degraded assistant must therefore be a quiet corner of the app, not a wall.
//
// ONE SERVER-OWNED GATE (council, Codex S4). Before this, the only signal was an `error` event
// emitted mid-stream from run.ts once the user had already typed and sent a message. If the dock
// decided availability on its own the two could disagree — the composer says "unavailable" while
// /api/assistant happily opens a stream and fails later with different wording. Both now call
// assistantAvailability().
//
// DELIBERATELY NOT BUILT: the approved "Ranking is off right now. / Now is showing the plain queue…"
// copy (09-content-terminology.md:183). It describes the ranked "Now" queue, which is a Phase 5+
// surface that does not exist — there is no /now route and SavedViews/Narrow are unbuilt. Building a
// degraded state for a surface that has no working state is fiction. Deferred, and DM-58 says so.

/** Mirrors the voice/knowledge gates: a null reason means available. */
export type AssistantAvailability = {
  available: boolean;
  /** Why it is off, in the user's language. Null when it is on. */
  unavailableReason: string | null;
};

export const ASSISTANT_AVAILABLE: AssistantAvailability = { available: true, unavailableReason: null };

/**
 * The sentence shown wherever the assistant would have been.
 *
 * Second half is verbatim approved copy (09-content-terminology.md:183) and it is the important
 * half: it names what still works, so a user who needs to record something goes and does it instead
 * of assuming the app is down.
 */
export const ASSISTANT_UNAVAILABLE_REASON =
  "The assistant is off right now. Search, records and recording are unaffected — use the sidebar, " +
  "or press Ctrl K to find anything.";

/**
 * True when the assistant can actually run a turn. Server-only in practice (it reads the key), but
 * kept dependency-free so the copy above can be unit-tested without an environment.
 *
 * Deliberately the SAME condition run.ts:180 already fails on, so the proactive state and the
 * mid-stream error can never disagree about whether the thing works.
 */
export function assistantAvailability(): AssistantAvailability {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { available: false, unavailableReason: ASSISTANT_UNAVAILABLE_REASON };
  }
  return ASSISTANT_AVAILABLE;
}
