// A deterministic backstop for the INVERSE of the over-claim: the assistant asserting that a write
// did NOT happen, or diagnosing a client-side failure, with no evidence either way.
//
// Reproduced live in feedback ticket cmsgbjgov000fl704f36c47p7 (Demo Winery, 2026-08-05). The
// assistant told the user:
//
//   "That's a display problem on our end (the tool ran and returned the preview, but the card isn't
//    rendering for you), so nothing got saved."
//
// Every word of that was false. All SEVEN write proposals in that session had been COMMITTED —
// proven by the `assistant_confirmation` nonce burns plus the artifacts themselves (work orders
// #80-#83, WineSku "Ojai 2026 Syrah", EquipmentAsset "Main Bottling Line", and the feedback ticket
// the user was filing at the time). The user was told to redo work that already existed, which is
// how you get duplicate work orders in a cellar.
//
// `overclaim-guard.ts` catches the model claiming a write it never made. This is the mirror image,
// and the harm runs the other way: an over-claim leaves work UNDONE, an under-claim gets it done
// TWICE. It is also the more insidious failure, because "sorry, that didn't save" reads as candour.
//
// The principle the regexes encode: **the model runs server-side and cannot observe the client.**
// It never sees whether a card rendered, whether the browser painted, or whether a prior turn's
// confirmation was tapped. It may say what it attempted; it may not say what did or did not persist.
// When it wants to know, it has read tools — the repair prompt below tells it to use them.

import { sentences } from "./overclaim-guard";

/**
 * What the RUN actually observed. Structural ground truth, never the model's self-report — the same
 * discipline as `emittedProposal` in the over-claim guard and `found: true` in the retrieval one.
 */
export type WriteOutcomeEvidence = {
  /** A write tool emitted a proposal/draft card this run. A card demonstrably reached the client. */
  cardShown: boolean;
  /** A tool returned `is_error`, or the run itself threw. The model HAS a failure to report — say so. */
  observedFailure: boolean;
};

/**
 * Claims about the USER'S SCREEN. Ungated by evidence on purpose: there is no tool result, no
 * stream event and no database row that could ever ground one of these. The assistant is not in the
 * browser. Any sentence in this set is unfounded by construction, which is what makes it a safe,
 * high-precision trigger.
 *
 * Contractions allow a typographic apostrophe (`['’]`) as well as a straight one — the model emits
 * both, and matching only U+0027 would leave the net down on half the real replies.
 */
const CLIENT_STATE_CLAIM: RegExp[] = [
  // "a display problem on our end", "rendering issue", "UI bug", "front-end glitch"
  /\b(?:display|rendering|render|ui|front-?end|client-?side|browser)[ -](?:problem|issue|bug|glitch|error|failure)\b/,
  // "the card isn't rendering for you", "the preview never displayed", "the card didn't load".
  // The subject is restricted to the card/preview/dialog rather than a bare "it": an ordinary read
  // answer says "I looked for that lot and it didn't show up", which is about query results, not the
  // user's screen, and must not be corrected.
  /\b(?:card|preview|dialog|modal)\b[^.\n]{0,20}\b(?:isn['’]?t|is not|wasn['’]?t|was not|didn['’]?t|did not|never)\b[^.\n]{0,24}\b(?:render(?:ing|ed|s)?|display(?:ing|ed|s)?|appear(?:ing|ed|s)?|load(?:ing|ed|s)?|show(?:ing|ed)? up)\b/,
  // "no confirmation card rendered" — the exact assertion the assistant-authored ticket body made as
  // fact, which sent triage after a phantom for a session in which every write had committed.
  /\bno (?:confirmation )?card (?:render(?:ed|s)?|appear(?:ed|s)?|display(?:ed|s)?|show(?:ed|s)? up|was (?:shown|rendered|displayed))\b/,
];

/**
 * Claims that a write did NOT persist. Unlike the screen claims above these are only unfounded when
 * the run actually emitted a card — then the model is contradicting its own turn, exactly mirroring
 * `claimsWriteWithoutCard`. With no card emitted, "nothing was saved" is usually TRUE and is in fact
 * what `OVERCLAIM_CORRECTION` itself says, so it must never be flagged on that path.
 *
 * Scoped to past-tense/perfect NON-PERSISTENCE only. Present tense ("nothing IS saved until you
 * confirm") is the correct description of an unconfirmed card and is deliberately absent, as is
 * "I couldn't create it" — a tool-reported blocker is a legitimate thing to relay.
 */
const NON_PERSISTENCE_CLAIM: RegExp[] = [
  // The auxiliary and the intensifier are INDEPENDENTLY optional — "nothing was actually created"
  // stacks both, and an alternation that allows only one of them misses it.
  /\bnothing (?:(?:got|was|were|has been|have been|had been) )?(?:actually |really |ever )?(?:saved|created|written|persisted|recorded|committed|filed)\b/,
  // Both tenses of the verb — the model writes "it never WENT through" as readily as "it didn't GO
  // through", and matching only the bare infinitive leaves half the real phrasings uncaught.
  /\b(?:it|that|the (?:change|record|write|work order|data|entry)) (?:didn['’]?t|did not|never) (?:saved?|got? saved|persist(?:ed)?|go through|went through|commit(?:ted)?|stick|stuck|take|took)\b/,
  /\b(?:wasn['’]?t|was not|weren['’]?t|were not) (?:actually )?(?:saved|persisted|written|created|committed|recorded)\b/,
  // The operationally expensive one: telling the user to redo work that already exists.
  /\byou['’]?ll (?:need|have) to (?:redo|re-?enter|re-?create|start over|try again|do (?:it|that|them) (?:all )?again)\b/,
];

/**
 * Sentences that are NOT assertions about outcome, and must never be corrected.
 *
 * - a question ("did the card not appear?") — the model asking, which is the desired behaviour;
 * - a conditional ("if the card didn't appear, reload") — hedged advice, not a diagnosis;
 * - anything framed as not-yet ("I haven't saved anything yet", "nothing has been saved yet") —
 *   honest, and the correct thing to say about a card the user has not confirmed. A bare `yet` is
 *   enough: it frames the write as PENDING rather than lost, which is the distinction that matters
 *   here, and it never appears in the flat diagnoses this guard exists to catch;
 * - the confirmation contract ("nothing is saved until you confirm") — literally true of a card;
 * - an offer ("want me to check?") — the model deferring instead of asserting;
 * - ATTRIBUTION ("the user reports the card did not appear") — relaying what someone else observed
 *   is not a claim about what the model can see, and it is the exact wording the system prompt and
 *   the file_feedback description ask for. Correcting it would punish the desired behaviour.
 */
const HEDGE =
  /\?\s*$|\bif\b|\byet\b|\b(?:until|unless) you\b|\b(?:want me to|shall i|should i|tell me to|say the word|let me know)\b|\b(?:the user|they|you|she|he) (?:reports?|reported|says?|said|mentions?|mentioned|told me|is seeing|are seeing|is reporting)\b|\b(?:according to|reportedly|per your)\b/;

/**
 * High-precision: does the text assert a write outcome the run gives it no basis to assert?
 *
 * Evaluated PER SENTENCE, same technique as `claimsWriteWithoutCard` and `claimsNoKbCoverage` — a
 * reply that correctly hedges one aspect must not immunize a flat false diagnosis elsewhere in the
 * same message. The whole guard stands down when the run observed a real failure: a tool that
 * errored is exactly the evidence this check demands, and the model relaying it is doing its job.
 */
export function claimsUnverifiedWriteFailure(
  assistantText: string,
  evidence: WriteOutcomeEvidence,
): boolean {
  if (evidence.observedFailure) return false;
  for (const raw of sentences(assistantText)) {
    const sentence = raw.toLowerCase();
    if (HEDGE.test(sentence)) continue;
    if (CLIENT_STATE_CLAIM.some((re) => re.test(sentence))) return true;
    if (evidence.cardShown && NON_PERSISTENCE_CLAIM.some((re) => re.test(sentence))) return true;
  }
  return false;
}

/**
 * Injected as a USER turn when the model asserts an outcome it cannot see — one chance to replace a
 * guess with a fact before the backstop has to soften it. Unlike the other two repair prompts this
 * one has a concrete recovery available: the model holds read tools, so "you can't know" comes with
 * "go find out".
 *
 * Never shown to the user — it goes into the conversation, not the stream. Same non-echo phrasing
 * discipline as `OVERCLAIM_REPAIR_PROMPT` (plan 083 Unit 1 ablation B showed injected scaffolding
 * gets reproduced verbatim otherwise).
 */
export const UNVERIFIED_FAILURE_REPAIR_PROMPT =
  "Your last reply asserted that something did not save, or diagnosed a display or rendering problem. " +
  "You run on the server: you cannot see the user's screen, and you cannot tell from here whether a " +
  "card rendered or whether an earlier change was confirmed. Do not assert either. Use a read tool now " +
  "to check whether the record actually exists and tell the user plainly what you find. If no read tool " +
  "can answer it, say you can't confirm from here and offer to look. Never tell the user to redo work " +
  "before you have checked whether it is already there. Do not apologise, do not explain this message, " +
  "and do not mention it to the user.";

export const UNVERIFIED_FAILURE_CORRECTION =
  "\n\n⚠️ Correction: I can't see your screen and I can't confirm from here whether that saved — I shouldn't have said it didn't. Check the record (or ask me to look it up) before redoing anything, so you don't end up with a duplicate.";

/**
 * The caveat appended to an assistant-AUTHORED feedback ticket whose body asserts client-side state.
 *
 * The ticket that prompted this file said "no confirmation card rendered" as flat fact, and triage
 * spent its time chasing a rendering bug that did not exist while seven committed writes sat in the
 * database. A bug report is a claim about the world; when the reporter is an LLM that cannot observe
 * the surface it is describing, that provenance belongs in the report.
 */
export const UNVERIFIED_CLIENT_STATE_CAVEAT =
  "\n\n---\nNote (added automatically): this report was composed by the assistant, which runs server-side " +
  "and cannot observe the user's screen or confirm whether a change persisted. Statements above about a " +
  "card not rendering, or about data not being saved, are UNVERIFIED — check the records (and the " +
  "assistant_confirmation nonce burns) before treating them as fact.";
