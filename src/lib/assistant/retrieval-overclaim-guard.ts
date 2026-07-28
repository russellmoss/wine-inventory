// A deterministic backstop for the assistant DENYING knowledge-base coverage it was just handed.
//
// Reproduced live 2026-07-28: asked about the Chambre d'Agriculture de la Gironde (a real, live,
// `defaultEnabled` KB source — 17 documents), the assistant told the user "I don't have anything
// from the Gironde Chamber... that's outside what Cellarhand holds." Calling the real
// `search_knowledge_base` tool for the SAME question returned `found: true` with that exact
// publisher's passages in 4 of the top 6 results, correctly dated, tiered and cited. Retrieval was
// not the bug — the model was handed good, on-topic, cited passages and told the user it had none.
//
// This mirrors `overclaim-guard.ts` exactly in shape (a write claim with no proposal emitted), for
// the retrieval half: a "no coverage" claim when `search_knowledge_base` DID return results this
// run. The tool's own rule 6 gives the model its correct wording for the genuine-gap case ("say you
// don't have a sourced answer") — this guard exists for the OTHER case, where that same wording (or
// its paraphrases) is used despite the tool succeeding.

import { sentences } from "./overclaim-guard";

/**
 * Sentences that POSITIVELY deny knowledge-base coverage for the topic at hand — the exact
 * shapes observed in the live repro, generalized. Deliberately NOT source-specific (no fuzzy
 * matching on publisher names): the reliable, low-false-positive signal is "search_knowledge_base
 * returned something this turn" paired with "the reply denies having anything", not trying to prove
 * the denial named the specific retrieved publisher — a paraphrase ("Gironde Chamber" for "Chambre
 * d'Agriculture de la Gironde (Bordeaux)") would defeat a name-matching approach anyway.
 */
const KB_DENIAL: RegExp[] = [
  // "I don't have anything from X" / "I don't have any information from X"
  /\bi don'?t have (?:anything|any (?:information|data|material))\b/,
  // The tool's OWN rule-6 wording ("say you don't have a sourced answer") — correct when nothing was
  // found, a false claim when it fires here (this guard only checks sentences after `found: true`).
  /\bi don'?t have a sourced answer\b/,
  /\b(?:that|this) source (?:isn'?t|is not) in (?:cellarhand|my knowledge base|the knowledge base)\b/,
  /\boutside what cellarhand holds\b/,
  // "nothing in it/my knowledge base addresses X" / "nothing addresses X"
  /\bnothing (?:in (?:it|my knowledge base|the knowledge base) )?addresses\b/,
  /\bmy knowledge base (?:doesn'?t|does not) (?:include|cover|have)\b/,
  /\bi can'?t (?:give you|provide) a sourced\b/,
];

/**
 * High-precision: does the text POSITIVELY deny having any knowledge-base coverage for this topic?
 *
 * Evaluated per sentence, same technique as `claimsWriteWithoutCard` — a reply legitimately
 * disclaiming one aspect ("I can't confirm the legal status, but here's the agronomy") must not be
 * flagged for an unrelated sentence elsewhere that happens to deny coverage outright.
 */
export function claimsNoKbCoverage(assistantText: string): boolean {
  for (const raw of sentences(assistantText)) {
    const sentence = raw.toLowerCase();
    if (KB_DENIAL.some((re) => re.test(sentence))) return true;
  }
  return false;
}

/**
 * Injected as a USER turn when the model denies KB coverage in the same run that
 * `search_knowledge_base` actually returned results — one chance to correct itself before the
 * backstop below has to step in. Worded to allow the honest outcome too: if the retrieved passages
 * genuinely do not address the question, the model should say so plainly rather than claim no
 * source exists at all — those are different, and only the second one is the bug.
 *
 * Never shown to the user — goes into the conversation, not the stream. Same non-echo phrasing
 * discipline as `OVERCLAIM_REPAIR_PROMPT` (plan 083 Unit 1 found injected scaffolding gets echoed
 * back verbatim otherwise).
 */
export const KB_DENIAL_REPAIR_PROMPT =
  "Your last reply told the user you have no knowledge-base source or coverage for this topic, but " +
  "search_knowledge_base actually returned results this turn. Look at those results again: if any of " +
  "them are relevant, use and cite them now, including passages in a language other than the " +
  "question — translate or summarize the relevant part, do not discard a passage for being in French, " +
  "German, Spanish, or another language. Only repeat that you lack coverage if, having reviewed them, " +
  "none of the returned passages actually address the question. Do not apologise, do not explain this " +
  "message, and do not mention it to the user.";

export const KB_DENIAL_CORRECTION =
  "\n\n⚠️ Note: this app's knowledge base actually returned material for that search. If my answer " +
  "said otherwise, ask me to look again and cite it directly.";
