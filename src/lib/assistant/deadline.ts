// A soft deadline for the assistant's tool-use loop.
//
// WHY THIS EXISTS. The route runs on Vercel with a hard `maxDuration`. When a turn overruns it, the
// platform KILLS the function mid-stream: the `catch` never runs, no assistant row is persisted, no
// exception is thrown, and nothing reaches Sentry. From the user's side it is indistinguishable from
// any other failure, and from ours it is invisible — the worst possible failure mode.
//
// Measured on 2026-08-04 against the live API (real tools, real DB): a no-tool reply cost 9.3s, a
// 40-message replay 20.8s, and a knowledge question that made three `search_knowledge_base` calls
// took 79.2s — 32% past the then-current 60s ceiling. Every request also carries ~97 tool schemas,
// so even the cheap turns are not cheap. Raising `maxDuration` buys room; it does not remove the
// cliff, because MAX_TURNS round-trips can always outrun any fixed ceiling.
//
// So we stop OURSELVES first. Before each additional model round-trip we ask whether there is room
// for another one. If not, the loop breaks, the user is told plainly that the answer was cut short,
// and the turn is persisted — a truthful partial answer instead of a silent death.
//
// Pure and dependency-free on purpose, so it is unit-testable without a DB, a clock, or a network.

/**
 * How long the loop may run before it must wind up, in ms.
 *
 * Deliberately BELOW the route's `maxDuration` so the wind-up, the final persist, and the stream
 * flush all happen inside the platform's window. The gap is headroom, not slack.
 */
export const TURN_BUDGET_MS = 240_000;

/**
 * Room reserved for one more model round-trip, in ms.
 *
 * Sized from the measurements above: the slowest single observed round-trip was ~33s, so 40s covers
 * it with margin. Over-reserving costs a truncated answer; under-reserving costs the silent kill we
 * are here to prevent. Prefer the truncation.
 */
export const TURN_RESERVE_MS = 40_000;

/**
 * Is there room for another model round-trip before the budget runs out?
 *
 * `elapsedMs` is measured from the start of the turn. Non-finite or negative inputs are treated as
 * "no room": a broken clock must fail toward the truthful partial answer, never toward the kill.
 */
export function hasRoomForAnotherRoundTrip(
  elapsedMs: number,
  budgetMs: number = TURN_BUDGET_MS,
  reserveMs: number = TURN_RESERVE_MS,
): boolean {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return false;
  if (!Number.isFinite(budgetMs) || !Number.isFinite(reserveMs)) return false;
  return elapsedMs + reserveMs <= budgetMs;
}

/**
 * What the user sees when the loop winds up early.
 *
 * Says the answer is incomplete and why, in the user's terms. Never blames them, never invents a
 * result, and never pretends the turn finished — the whole point is that a cut-short answer is
 * honest where a killed function is not.
 */
export const DEADLINE_NOTICE =
  "\n\n_I ran out of time on this one and stopped before finishing. What's above is what I got. " +
  "Asking a narrower question usually gets there — or send this again and I'll pick it back up._";
