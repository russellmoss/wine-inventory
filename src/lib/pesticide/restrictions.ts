/**
 * Spray S2 Unit 7 — pure county / SLN restriction detection over label text. No I/O, no DB.
 *
 * The output is structured and NON-BINARY (plan 086's measured finding): Luna Experience's NY
 * county restriction carries "except as permitted under FIFRA 24(c), Special Local Need
 * registration" — a boolean banned flag would be wrong. `quote` is the label sentence VERBATIM so
 * the citation is the source, not our paraphrase. An aerial-application prohibition is its own
 * distinct restriction, never folded into the county one.
 *
 * Detection is deliberately narrow: a sentence must name a restricted geography AND carry a
 * prohibition verb. /Nassau|Suffolk/ alone caught 4/4 restricted products with zero false positives
 * across four sentence structures (plan 086) — the prohibition-verb requirement keeps it that way if
 * a future label mentions a county in passing.
 */

export interface DetectedRestriction {
  state: string;
  counties: string[];
  kind: "county-prohibition" | "aerial-application-prohibited";
  exception: "24c-sln" | null;
  /** The label sentence verbatim — the citation. */
  quote: string;
}

const PROHIBITION = /not for (?:sale|use|distribution)|do not (?:use|apply|sell)|not registered|prohibited|may not be (?:used|sold|applied)/i;
const SLN_EXCEPTION = /24\s*\(?c\)?|special local need/i;
const NY_COUNTIES = ["Nassau", "Suffolk"] as const;

/** Rough sentence segmentation good enough for label text: periods followed by whitespace, or
 * newline-delimited standalone statements (labels often set restrictions as their own lines). */
function sentences(text: string): string[] {
  return text
    .split(/(?<=\.)\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function detectRestrictions(labelText: string): DetectedRestriction[] {
  const out: DetectedRestriction[] = [];
  for (const sentence of sentences(labelText)) {
    const mentionsNy = /new york/i.test(sentence);

    // Aerial prohibition — its own restriction, checked FIRST so it is never folded into a county hit.
    if (/aerial applicat\w*/i.test(sentence) && /prohibit/i.test(sentence) && mentionsNy) {
      out.push({ state: "NY", counties: [], kind: "aerial-application-prohibited", exception: null, quote: sentence });
      continue;
    }

    const counties = NY_COUNTIES.filter((c) => new RegExp(`\\b${c}\\b`, "i").test(sentence));
    if (counties.length > 0 && PROHIBITION.test(sentence)) {
      out.push({
        state: "NY", // Nassau/Suffolk are NY counties; the sentence usually names the state too
        counties: [...counties],
        kind: "county-prohibition",
        exception: SLN_EXCEPTION.test(sentence) ? "24c-sln" : null,
        quote: sentence,
      });
    }
  }
  return out;
}
