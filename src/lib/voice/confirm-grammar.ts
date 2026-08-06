// What counts as "yes, commit that write" when the user is speaking, and what the assistant says
// out loud before a write is armed.
//
// WHY THIS IS ITS OWN MODULE: both halves are pure string logic and the voice components are not
// unit-testable in this repo (vitest runs `environment: "node"`), so the rules that decide whether a
// write commits must live somewhere a test can reach. See test/voice-confirm-grammar.test.ts.
//
// ── The incident this comes from (feedback cmsgbjgov, 2026-08-05) ────────────────────────────────
// A reporter said confirmation cards never rendered. They HAD rendered, and seven writes were
// applied — the nonce burns prove it. Two properties combined to make that possible:
//
//   1. The confirm grammar accepted ordinary speech: `yes|yep|do it|go ahead|apply`. In a winery
//      "we apply the Fermaid on day two" and "go ahead and grab me the hose" are just sentences,
//      and the mic is open by design.
//   2. A ready-to-commit card was admitted SILENTLY. Only Drafts were spoken about, so the one kind
//      of card that can actually write nothing was announced; and because the slot is a queue, the
//      model narrates a turn once while cards arm one at a time underneath it.
//
// Hands-free is the point of voice mode, so "it was on screen" is not consent.

/**
 * Explicit assent only. `confirm` and `approve` are not words that turn up in cellar conversation
 * by accident — everything looser was removed deliberately, and MUST NOT be added back:
 *
 *   `yes` / `yep`      — the most common word in any conversation
 *   `do it` / `go ahead` — instructions to a person standing next to you
 *   `apply`            — a spray/addition verb in this domain, not assent
 *
 * If a user objects that "yes" ought to work, the answer is the announcement below: it now tells
 * them exactly which word commits.
 */
export const CONFIRM_RE = /\b(confirm|approve)\b/i;

/**
 * Cancel stays DELIBERATELY loose, and the asymmetry is the point: a false cancel discards a write
 * the user can simply ask for again, while a false confirm writes to the ledger. When the two
 * patterns disagree, cancel wins (see `classifyUtterance`) — the cheap mistake is preferred.
 */
export const CANCEL_RE = /\b(cancel|no|nope|stop|never ?mind|discard)\b/i;

export type UtteranceVerdict = "confirm" | "cancel" | "neither";

/**
 * How a transcript acts on the card currently armed. Cancel is tested first so a sentence carrying
 * both ("confirm — no, wait") never commits.
 */
export function classifyUtterance(transcript: string): UtteranceVerdict {
  if (typeof transcript !== "string" || transcript.trim() === "") return "neither";
  if (CANCEL_RE.test(transcript)) return "cancel";
  if (CONFIRM_RE.test(transcript)) return "confirm";
  return "neither";
}

/** Strip a preview down to something worth hearing: first line, no markdown bullets, trimmed. */
function spokenSummary(preview: string): string {
  const firstLine = String(preview ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "a change";
  const clean = firstLine.replace(/[*_`#]/g, "").trim();
  return clean.length > 120 ? `${clean.slice(0, 117).trimEnd()}…` : clean;
}

/**
 * What to say when a committable card takes the slot. Every armed write gets one of these — the
 * user is told what it is and, critically, the exact word that commits it.
 *
 * `queuedBehind` is how many other cards are already waiting; it is spoken so a user who hears two
 * announcements knows a second write exists rather than assuming the assistant repeated itself.
 */
export function announceArmedProposal(preview: string, queuedBehind = 0): string {
  const what = spokenSummary(preview);
  if (queuedBehind > 0) {
    const others = queuedBehind === 1 ? "one more after it" : `${queuedBehind} more after it`;
    return `Ready to apply: ${what}. Say confirm to apply it, or cancel. There's ${others}.`;
  }
  return `Ready to apply: ${what}. Say confirm to apply it, or cancel.`;
}
