// Fix (feedback cmri7ympe): a deterministic backstop for the assistant over-claiming a write.
//
// A confirmation card exists ONLY as the direct result of a write tool that actually ran this turn. The
// system prompt already forbids claiming otherwise, but LLM adherence is stochastic — the model still, on
// occasion, tells the user a change was "drafted/filed/done — review the card" without ever calling the
// tool, so nothing is written and the user is misled (a silent no-op). This pure check lets the run loop
// catch that exact inconsistency (a card-claim in the final text with NO proposal emitted) and append a
// correction, so the user is never told something was filed/changed when it wasn't.

/** A sentence that correctly relays a blocker/no-card/failure. Never "correct" such a sentence — that
 * would produce a false correction on the CORRECT prompt behavior ("there is no card ..."). */
const DISCLAIMER =
  /\b(?:no card|there is no card|nothing (?:was|has been)|not (?:been )?(?:filed|created|saved|drafted)|couldn't|could not|can't|cannot|wasn't|was not|isn't|didn't|did not|unable)\b/;

/** Sentences that POSITIVELY claim a card exists, or that a write already happened. */
const CLAIMS: RegExp[] = [
  // "review the card" / "review and confirm the card" / "confirm the card" (a card to act on = one exists)
  /\b(review|confirm)\b[^.\n]{0,24}\bthe card\b/,
  // "confirm it to send/file/apply/save" (the ticket's "confirm to send it")
  /\bconfirm (?:it|the change|to (?:send|file|apply|save))\b[^.\n]{0,20}\b(?:send|file|apply|save|it)\b/,
  // Past-tense write claims: "I've drafted/filed/created/queued/submitted", "the report was filed", etc.
  /\bi(?:'ve| have)?\s+(?:drafted|filed|created|queued|submitted|logged|recorded|set up|proposed)\b/,
  /\b(?:report|bug|feedback|request|change|work order|card)\s+(?:was|is|has been)\s+(?:filed|drafted|submitted|created|queued|logged|recorded|sent)\b/,
];

/**
 * Split a reply into sentences for per-sentence evaluation.
 *
 * Splits on a newline, or on .!? followed by whitespace OR a capital letter. The capital-letter case
 * is not cosmetic: streamed deltas routinely arrive glued together ("...lands correctly?I've proposed
 * the work order..."), and that join is exactly where a disclaimer and a claim end up adjacent.
 * Requiring whitespace-or-capital after the terminator keeps decimals ("24.2") and dates ("2026-09-15")
 * intact, since those are followed by a digit.
 */
function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])(?=\s|[A-Z])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * High-precision: does the text POSITIVELY claim a confirmation card exists, or that a write was
 * already done?
 *
 * Evaluated PER SENTENCE. A disclaimer only suppresses the sentence it appears in — it does not
 * immunize the rest of the message. The previous whole-text early-out meant any incidental
 * "can't"/"didn't"/"unable" anywhere disabled the guard entirely, and on the work-order path the
 * assistant says "I can't verify <assignee>'s account" constantly, so the net was down in precisely
 * the scenario it exists to police (plan 081 U1; proven against the live 2/7 repro transcript).
 */
export function claimsWriteWithoutCard(assistantText: string): boolean {
  // Split on the ORIGINAL casing (the splitter keys off capital letters), lowercase per sentence.
  for (const raw of sentences(assistantText)) {
    const sentence = raw.toLowerCase();
    if (DISCLAIMER.test(sentence)) continue; // this sentence disclaims; it says nothing false
    if (CLAIMS.some((re) => re.test(sentence))) return true;
  }
  return false;
}

export const OVERCLAIM_CORRECTION =
  "\n\n⚠️ Correction: I have not actually created or filed anything yet — there is no card to confirm and nothing was saved. Tell me to go ahead and I'll do it now.";
