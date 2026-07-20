// Plan 084 — pure matching helpers for the knowledge-base eval gate (scripts/verify-knowledge-base.ts).
//
// Extracted so they can be unit-tested: verify-knowledge-base.ts runs main() at import, so the test
// suite cannot import from it directly. Same split as scripts/feedback-fence-rules.ts.

/**
 * Match an off-topic term as a WORD, not a substring.
 *
 * The rejection cases exist to prove that no genuinely on-topic BEER or COFFEE content is retrievable
 * from a wine corpus. A naive `text.includes(term)` check does not prove that, and quietly gets worse as
 * the corpus grows. Measured when the Cornell source was added: 4 of 8 sampled Cornell grape PDFs
 * "contain ipa" — via `principally`, `anticipated`, and `riparia` (as in Vitis riparia, a grape species).
 * `hops` inside `workshops` is the same trap, and extension sites are full of workshops.
 *
 * Returns the offending term (for a useful failure message) or null.
 *
 * Terms are regex-escaped, so metacharacters are literal. Known limitation: a term ending in a non-word
 * character (e.g. "c++") can never satisfy the trailing \b and so never matches. No off-topic term has
 * that shape, and the failure direction is safe — a missed term makes the rejection gate harder to
 * satisfy, not easier.
 */
export function mentionsOffTopic(text: string, terms: string[]): string | null {
  const t = text.toLowerCase();
  for (const term of terms) {
    const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(t)) return term;
  }
  return null;
}
