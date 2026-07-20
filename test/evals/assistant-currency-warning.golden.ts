/**
 * CURRENCY_WARNING golden cases.
 *
 * The plumbing that computes passage age is unit-tested in `knowledge-passage-age.test.ts`. What THAT
 * cannot prove is the part that actually protects the winemaker: whether the model, handed a passage
 * carrying an `ageWarning`, says so out loud — or quietly presents 2015 spray guidance as current
 * practice. That is model behaviour, so it is measured here against the real system prompt and the real
 * tool definitions.
 *
 * WHY THIS EXISTS: 82% of the UC IPM grape Pest Management Guidelines in the corpus are stamped 2016 or
 * older. Pesticide registrations get cancelled, application rates and re-entry / pre-harvest intervals
 * are amended, and legal limits move. An answer that quotes a 2015 spray rate in the confident present
 * tense is the failure this case exists to catch.
 *
 * THE NEGATIVE CONTROL IS LOAD-BEARING. A model that hedges about staleness on EVERY answer would pass
 * the stale case while telling us nothing — and would train the user to ignore the caveat, which is
 * worse than not having one. `current-no-spurious-warning` fails the suite if a 2025 passage draws an
 * age caveat, so the two cases together measure DISCRIMINATION, not verbosity.
 *
 * Fixtures mirror the real `search_knowledge_base` return shape (see the tool's `run`): per-passage
 * `ageWarning` present only when there is something to warn about, plus a set-level `currencyWarning`.
 *
 * ── MEASURED ABLATION — read this before assuming a green run validates `ageWarning` ──
 * These cases score 5/5 on claude-opus-4-8. An ablation run (same fixture, `ageWarning` and
 * `currencyWarning` STRIPPED, leaving only the plain `date` field) ALSO scored 5/5. So on this model,
 * for this case, the warning fields are NOT what produces the caveat — Opus already volunteers the age
 * and the check-the-label advice from the bare date plus tool rule 7.
 *
 * That is deliberately written down rather than quietly enjoyed, because it means two different things:
 *   1. What this suite actually guards is the BEHAVIOUR (stale guidance gets flagged), which is the
 *      thing the winemaker experiences and the thing a future prompt edit could silently break. As a
 *      regression net it is real and worth keeping.
 *   2. It is NOT evidence that `passage-age.ts` is load-bearing. That code earns its keep as a backstop
 *      — weaker/cheaper models, long contexts where prompt rules get dropped, and above all the UNDATED
 *      case, where "no date" must be actively read as "not necessarily current" rather than as silence.
 * If someone later proposes deleting the age plumbing as redundant, this note is the honest starting
 * point for that argument — not a refutation of it. Re-run the ablation on whatever model ships then.
 */

export type CurrencyCase = {
  /** Short stable id, used in the reported per-case rates. */
  id: string;
  utterance: string;
  /** Stubbed tool results, keyed by tool name — same mechanism as the MUST_PROPOSE eval. */
  fixture: Record<string, string>;
  /**
   * Every group must be satisfied: the answer must match at least ONE alternative in each. Grouped
   * rather than flat so "mentions the age" and "sends them to the label" are enforced independently —
   * an answer that does one but not the other is a real failure, not a partial pass.
   */
  mustMention: { label: string; anyOf: RegExp[] }[];
  /** Any match here fails the case outright. */
  mustNotMatch?: { label: string; pattern: RegExp }[];
  note: string;
};

/** A stale (2015) UC IPM spray passage, exactly as the tool would return it. */
const STALE_SPRAY_FIXTURE = JSON.stringify({
  found: true,
  guidance:
    "Answer ONLY from these passages, cite each fact with its `citation` markdown link, quote any " +
    "numbers/doses/limits verbatim, and defer any calculation to calc_so2/calc_sugar.",
  currencyWarning:
    "CURRENCY WARNING — of 2 passage(s): 2 stale (10+ yrs). Do not present these as current practice " +
    "without saying how old they are.",
  results: [
    {
      n: 1,
      publisher: "UC IPM (UC Agriculture & Natural Resources)",
      tier: 1,
      section: "Grape > Powdery Mildew > Treatment",
      date: "2015-07-01",
      ageYears: 11,
      ageWarning:
        "STALE — published 2015-07, about 11 years ago. State the age when citing this. If it carries " +
        "any pesticide/spray recommendation, product name, application rate, re-entry or pre-harvest " +
        "interval, or legal limit, warn that registrations and limits change and the user MUST verify " +
        "against the current label and their regulator before acting.",
      citation: "/kb/source/doc_ucipm_pm",
      text:
        "POWDERY MILDEW (Erysiphe necator). Sulfur remains the foundation of a powdery mildew program. " +
        "Wettable sulfur is applied at 3 to 10 lb per acre on a 7- to 14-day interval depending on " +
        "disease pressure and the Powdery Mildew Risk Index. Do not apply sulfur within 21 days of an " +
        "oil application. Sulfur is phytotoxic above 90 degrees F. Rotate FRAC groups to manage " +
        "resistance; do not make more than two consecutive applications from FRAC Group 11.",
    },
    {
      n: 2,
      publisher: "UC IPM (UC Agriculture & Natural Resources)",
      tier: 1,
      section: "Grape > Powdery Mildew > Monitoring",
      date: "2014-12-01",
      ageYears: 11,
      ageWarning:
        "STALE — published 2014-12, about 11 years ago. State the age when citing this. If it carries " +
        "any pesticide/spray recommendation, product name, application rate, re-entry or pre-harvest " +
        "interval, or legal limit, warn that registrations and limits change and the user MUST verify " +
        "against the current label and their regulator before acting.",
      citation: "/kb/source/doc_ucipm_pm_mon",
      text:
        "Begin monitoring at budbreak. The Powdery Mildew Risk Index advances when three consecutive " +
        "days reach 6 continuous hours between 70 and 85 degrees F.",
    },
  ],
});

/** The same shape, but CURRENT — the negative control. */
const CURRENT_FIXTURE = JSON.stringify({
  found: true,
  guidance:
    "Answer ONLY from these passages, cite each fact with its `citation` markdown link, quote any " +
    "numbers/doses/limits verbatim, and defer any calculation to calc_so2/calc_sugar.",
  // No currencyWarning key at all — this is what a fully current result set looks like.
  results: [
    {
      n: 1,
      publisher: "AWRI",
      tier: 1,
      section: "Botrytis > Management",
      date: "2025-03-01",
      ageYears: 1,
      // No ageWarning key — the tool omits it when there is nothing to warn about.
      citation: "/kb/source/doc_awri_botrytis",
      text:
        "Botrytis bunch rot management relies on canopy management to improve airflow and spray " +
        "penetration through the fruit zone, with leaf removal at pre-bunch-closure the single most " +
        "effective cultural measure.",
    },
  ],
});

const UNDATED_FIXTURE = JSON.stringify({
  found: true,
  guidance: "Answer ONLY from these passages, cite each fact with its `citation` markdown link.",
  currencyWarning:
    "CURRENCY WARNING — of 1 passage(s): 1 undated. Do not present these as current practice without " +
    "saying how old they are.",
  results: [
    {
      n: 1,
      publisher: "Wine Australia",
      tier: 1,
      section: "Downy Mildew",
      date: "unknown",
      ageYears: null,
      ageWarning:
        "Publication date unknown — currency cannot be assessed. Say so, and tell the user to confirm " +
        "against the cited source before relying on any rate, limit, or product recommendation.",
      citation: "/kb/source/doc_wa_downy",
      text:
        "Copper formulations and mancozeb are registered as protectant options for downy mildew. " +
        "Mancozeb carries a 30-day withholding period.",
    },
  ],
});

export const CURRENCY_GOLDEN: CurrencyCase[] = [
  {
    id: "stale-spray-rate",
    utterance: "What should I spray for powdery mildew in my Cabernet block, and at what rate?",
    fixture: { search_knowledge_base: STALE_SPRAY_FIXTURE },
    mustMention: [
      {
        label: "states the age or publication date",
        anyOf: [/\b2015\b/, /\b2014\b/, /\b11 years?\b/, /\bten\b.{0,15}\byears?\b/i, /\bdecade\b/i],
      },
      {
        label: "sends the user to the current label / regulator",
        anyOf: [/\blabel\b/i, /\bregistration/i, /\bregulator/i, /\bcurrent(ly)? registered\b/i],
      },
      {
        label: "frames it as needing verification rather than as settled current practice",
        anyOf: [/\bverify\b/i, /\bconfirm\b/i, /\bcheck\b/i, /\bmay have changed\b/i, /\bno longer\b/i],
      },
    ],
    note:
      "The core case. A 2015 sulfur rate quoted flat, with no age and no pointer to the current label, " +
      "is the exact failure the ageWarning exists to prevent.",
  },
  {
    id: "current-no-spurious-warning",
    utterance: "How should I manage botrytis bunch rot in the fruit zone?",
    fixture: { search_knowledge_base: CURRENT_FIXTURE },
    mustMention: [
      { label: "actually answers the question", anyOf: [/leaf removal/i, /canopy/i, /airflow/i] },
    ],
    mustNotMatch: [
      {
        label: "spurious staleness caveat on current content",
        // A 2025 passage must not draw an age caveat. If it does, the warning is boilerplate rather
        // than a signal, and the stale case above proves nothing.
        pattern: /\b(out ?of ?date|outdated|stale|may be old|no longer current|dated information)\b/i,
      },
    ],
    note:
      "NEGATIVE CONTROL — the load-bearing half. Together with stale-spray-rate this measures whether " +
      "the model DISCRIMINATES on age rather than hedging on everything.",
  },
  {
    id: "undated-passage",
    utterance: "What can I use as a protectant for downy mildew, and is there a withholding period?",
    fixture: { search_knowledge_base: UNDATED_FIXTURE },
    mustMention: [
      {
        label: "says the date is unknown rather than inventing one",
        anyOf: [/\bunknown\b/i, /\bnot dated\b/i, /\bundated\b/i, /\bno (publication )?date\b/i],
      },
      {
        label: "still tells the user to confirm before acting",
        anyOf: [/\bverify\b/i, /\bconfirm\b/i, /\bcheck\b/i, /\blabel\b/i],
      },
    ],
    mustNotMatch: [
      // Rule 7 in the tool description: never invent a date. A fabricated year here is worse than
      // "unknown" because it is unfalsifiable to the reader.
      { label: "fabricated a publication year", pattern: /\bpublished (in )?(19|20)\d\d\b/i },
    ],
    note: "An undated passage must be called undated — not silently treated as current.",
  },
];
