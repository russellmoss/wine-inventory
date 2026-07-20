// Age assessment for a retrieved knowledge passage.
//
// WHY: the corpus is not uniformly current. Adding UC IPM's grape Pest Management Guidelines surfaced
// this concretely — 82% of that source is stamped 2016 or older, with the bulk at 2015. For enology
// fundamentals (how a protein heat test works) a decade changes nothing. For PESTICIDE guidance it
// changes everything: registrations get cancelled, REIs and rates are amended, resistance-management
// ratings move. An assistant that cites 2015 spray guidance in the confident present tense is the
// failure mode worth engineering against.
//
// DESIGN: this is a DETERMINISTIC computation attached to every passage, not a line in the prompt. A
// prose instruction ("mention the date if it's old") is advisory — the model can and does drop it under
// a long context. Computing the age server-side means the warning is present in the tool result as data
// the model has to actively contradict rather than merely forget.
//
// SPLIT OF JUDGMENT: the AGE is computed here (a fact). Whether age MATTERS for a given question is left
// to the model, which has the question in hand — a 2015 page on grapevine biology is fine, the same
// vintage of spray-rate table is not. So the note states the age plainly and names the class of risk;
// the prompt rule tells the model when to lead with it.

/** Below this, content is treated as current and carries no warning. */
export const AGING_YEARS = 5;
/** At or beyond this, content is called out as stale rather than merely aging. */
export const STALE_YEARS = 10;

export type PassageAgeLevel = "current" | "aging" | "stale" | "unknown";

export interface PassageAge {
  level: PassageAgeLevel;
  /** Whole years since publication; null when the document carries no trustworthy date. */
  ageYears: number | null;
  /** Human-readable warning for the model to surface, or null when the passage is current. */
  warning: string | null;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Assess how current a passage is from its document's revision date.
 *
 * A null date yields "unknown" WITH a warning, deliberately: an undated document is not the same as a
 * fresh one, and silently treating it as fine is how stale guidance gets laundered into confident advice.
 */
export function assessPassageAge(publishedAt: Date | null | undefined, now: Date = new Date()): PassageAge {
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) {
    return {
      level: "unknown",
      ageYears: null,
      warning:
        "Publication date unknown — currency cannot be assessed. Say so, and tell the user to confirm " +
        "against the cited source before relying on any rate, limit, or product recommendation.",
    };
  }

  const ageYears = Math.floor((now.getTime() - publishedAt.getTime()) / MS_PER_YEAR);
  // A slightly-future stamp (timezone edge, a source that post-dates an issue) is not a warning case.
  if (ageYears < AGING_YEARS) return { level: "current", ageYears: Math.max(ageYears, 0), warning: null };

  const stamp = publishedAt.toISOString().slice(0, 7);
  if (ageYears >= STALE_YEARS) {
    return {
      level: "stale",
      ageYears,
      warning:
        `STALE — published ${stamp}, about ${ageYears} years ago. State the age when citing this. If it ` +
        "carries any pesticide/spray recommendation, product name, application rate, re-entry or " +
        "pre-harvest interval, or legal limit, warn that registrations and limits change and the user " +
        "MUST verify against the current label and their regulator before acting.",
    };
  }
  return {
    level: "aging",
    ageYears,
    warning:
      `Published ${stamp}, about ${ageYears} years ago. Mention the date when citing it, and flag that ` +
      "product registrations, rates, and legal limits may have changed since.",
  };
}

/**
 * Summarize a whole result set, so the model gets one unmissable signal alongside the per-passage notes.
 * Returns null when every passage is current (nothing worth saying).
 */
export function summarizeCorpusAge(ages: PassageAge[]): string | null {
  const stale = ages.filter((a) => a.level === "stale").length;
  const unknown = ages.filter((a) => a.level === "unknown").length;
  const aging = ages.filter((a) => a.level === "aging").length;
  if (!stale && !unknown && !aging) return null;

  const parts: string[] = [];
  if (stale) parts.push(`${stale} stale (10+ yrs)`);
  if (aging) parts.push(`${aging} aging (5-10 yrs)`);
  if (unknown) parts.push(`${unknown} undated`);
  return (
    `CURRENCY WARNING — of ${ages.length} passage(s): ${parts.join(", ")}. Do not present these as ` +
    "current practice without saying how old they are."
  );
}
