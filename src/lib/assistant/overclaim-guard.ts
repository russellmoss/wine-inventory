// Fix (feedback cmri7ympe): a deterministic backstop for the assistant over-claiming a write.
//
// A confirmation card exists ONLY as the direct result of a write tool that actually ran this turn. The
// system prompt already forbids claiming otherwise, but LLM adherence is stochastic — the model still, on
// occasion, tells the user a change was "drafted/filed/done — review the card" without ever calling the
// tool, so nothing is written and the user is misled (a silent no-op). This pure check lets the run loop
// catch that exact inconsistency (a card-claim in the final text with NO proposal emitted) and append a
// correction, so the user is never told something was filed/changed when it wasn't.

/** High-precision: does the text POSITIVELY claim a confirmation card exists, or that a write was already
 * done? Tuned to avoid false positives on the correct blocker phrasing ("there is no card ..."). */
export function claimsWriteWithoutCard(assistantText: string): boolean {
  const t = assistantText.toLowerCase();
  // If the model already disclaims (correctly relaying a blocker/no-card/failure), never "correct" it —
  // avoids a false-positive correction on the CORRECT prompt behavior ("there is no card ...").
  if (/\b(?:no card|there is no card|nothing (?:was|has been)|not (?:been )?(?:filed|created|saved|drafted)|couldn't|could not|can't|cannot|wasn't|was not|isn't|didn't|did not|unable)\b/.test(t)) return false;
  // "review the card" / "review and confirm the card" / "confirm the card" (a card to act on = one exists)
  if (/\b(review|confirm)\b[^.\n]{0,24}\bthe card\b/.test(t)) return true;
  // "confirm it to send/file/apply/save" (the ticket's "confirm to send it")
  if (/\bconfirm (?:it|the change|to (?:send|file|apply|save))\b[^.\n]{0,20}\b(?:send|file|apply|save|it)\b/.test(t)) return true;
  // Past-tense write claims: "I've drafted/filed/created/queued/submitted", "the report was filed", etc.
  if (/\bi(?:'ve| have)?\s+(?:drafted|filed|created|queued|submitted|logged|recorded|set up|proposed)\b/.test(t)) return true;
  if (/\b(?:report|bug|feedback|request|change|work order|card)\s+(?:was|is|has been)\s+(?:filed|drafted|submitted|created|queued|logged|recorded|sent)\b/.test(t)) return true;
  return false;
}

export const OVERCLAIM_CORRECTION =
  "\n\n⚠️ Correction: I have not actually created or filed anything yet — there is no card to confirm and nothing was saved. Tell me to go ahead and I'll do it now.";
