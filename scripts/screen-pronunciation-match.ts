// Plan 091 Unit 2 — pure comparison logic for the TTS->STT pronunciation screen.
//
// Split from the runner so it can be unit-tested (the runner makes network calls and
// runs main() at import). Same split as scripts/kb-eval-match.ts.

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeHeard(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Did the term survive the round trip?
 *
 * Tolerant on purpose. We are asking "did the engine say something recognisably like
 * this word", not "did Scribe return a byte-identical string". A plural, a possessive,
 * or a dropped final -e is not a mispronunciation, and counting it as one would send
 * a human to listen to terms that were fine.
 */
export function termSurvived(term: string, transcript: string): boolean {
  const heard = normalizeHeard(transcript);
  const want = normalizeHeard(term);
  if (!want) return true;
  if (heard.includes(want)) return true;

  // Multi-word terms: every word must appear, but not necessarily adjacently —
  // Scribe sometimes splits a Latin binomial across a comma.
  const parts = want.split(" ");
  if (parts.length > 1 && parts.every((p) => heard.includes(p))) return true;

  // Single word: allow a light suffix difference (plural, dropped trailing vowel).
  if (parts.length === 1 && want.length >= 6) {
    const stem = want.slice(0, Math.max(6, Math.floor(want.length * 0.8)));
    if (heard.includes(stem)) return true;
  }
  return false;
}

export type CarrierStyle = "wine" | "neutral" | "bare";

/**
 * A carrier sentence. A word in isolation gets different prosody than one in a
 * sentence, so the default speaks it in context.
 *
 * BUT context cuts both ways on the STT side. The "wine" carrier names a winemaker and
 * a tasting, which hands Scribe exactly the domain prior it needs to snap a mangled
 * pronunciation back to the correct spelling — the false negative that makes the whole
 * screen useless. "neutral" keeps sentence prosody while starving that prior.
 */
export function carrierSentence(term: string, style: CarrierStyle = "wine"): string {
  if (style === "bare") return term;
  if (style === "neutral") return `The next word is ${term}, followed by a pause.`;
  return `The winemaker mentioned ${term} during the tasting.`;
}

export type ScreenVerdict = {
  term: string;
  transcript: string;
  survived: boolean;
};

/** Split verdicts into the two piles a human cares about. */
export function summarize(verdicts: ScreenVerdict[]) {
  const failed = verdicts.filter((v) => !v.survived);
  const passed = verdicts.filter((v) => v.survived);
  return { failed, passed, failureRate: verdicts.length ? failed.length / verdicts.length : 0 };
}
