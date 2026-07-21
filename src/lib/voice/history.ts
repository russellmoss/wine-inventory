// The voice session's rolling conversation history.
//
// Why this is its own module: the session keeps history in a ref that it snapshots
// once at mount and then appends to. For a long time only VOICE turns could append,
// because the full-screen overlay made the text composer unreachable. Inline voice
// (plan 089) makes the composer usable mid-session, so a TYPED turn must land in the
// same history or the assistant answers the next spoken question against a history
// that is missing what the user just wrote ("make it 23" -> "make what 23?").
//
// Appending is therefore a shared operation with one trim rule, not three call sites
// each doing their own `push` + `slice`. Pure and isomorphic so it can be tested at
// all — the components that use it cannot be (vitest runs `environment: "node"`).

export type VoiceHistoryTurn = { role: "user" | "assistant"; content: string };

/** Turn cap. The send path clamps again by token budget; this bounds memory growth. */
export const MAX_VOICE_HISTORY = 40;

/**
 * Append one turn and keep only the most recent `max`. Returns a NEW array — callers
 * reassign rather than mutate, so a superseded turn holding an old reference cannot
 * retroactively grow the live history.
 *
 * Empty/whitespace-only content is dropped: an empty turn carries no meaning to the
 * model and would only burn a history slot.
 */
export function appendTurn(
  history: readonly VoiceHistoryTurn[],
  turn: VoiceHistoryTurn,
  max: number = MAX_VOICE_HISTORY,
): VoiceHistoryTurn[] {
  if (!turn.content.trim()) return history.slice();
  return trimHistory([...history, turn], max);
}

/** Append several turns in order (a typed question plus its reply), trimming once. */
export function appendTurns(
  history: readonly VoiceHistoryTurn[],
  turns: readonly VoiceHistoryTurn[],
  max: number = MAX_VOICE_HISTORY,
): VoiceHistoryTurn[] {
  const kept = turns.filter((t) => t.content.trim());
  if (kept.length === 0) return history.slice();
  return trimHistory([...history, ...kept], max);
}

/** Keep the most recent `max` turns. A non-positive cap means "keep nothing". */
export function trimHistory(
  history: readonly VoiceHistoryTurn[],
  max: number = MAX_VOICE_HISTORY,
): VoiceHistoryTurn[] {
  if (max <= 0) return [];
  return history.length > max ? history.slice(-max) : history.slice();
}
