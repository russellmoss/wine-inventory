/**
 * KB_SOURCE_DENIAL golden cases.
 *
 * The guard is unit-tested in `assistant-retrieval-overclaim-guard.test.ts` against synthetic text.
 * Neither that nor a system-prompt review can prove the thing that actually protects the user: when
 * the MODEL is handed real, relevant, cited passages, does it use them — or does it tell the user it
 * has no such source? That is model behaviour, so it is measured here against the real system prompt
 * and the real tool definitions, same two-layer pattern as `assistant-kb-legality-refusal`.
 *
 * ── WHY THIS EXISTS ──
 *
 * Reproduced live 2026-07-28. Asked "What rootstock should I choose for a vineyard in Bordeaux /
 * Nouvelle-Aquitaine?", the assistant answered with Cornell and UC IPM material and told the user:
 * "my knowledge base is US and Australian extension material (Cornell, UC IPM, AWRI, Wine
 * Australia)... nothing in it addresses [this]." Calling the REAL `search_knowledge_base` tool for
 * the same question returned `found: true` with 4 of the top 6 results from the Chambre
 * d'Agriculture de la Gironde — correctly dated (2022-11-29), tier 1, on-topic French prose about
 * exactly the rootstock characteristics (vigueur, tolérance à la sécheresse, adaptation au sol) the
 * question asked about. The tool worked. The model was handed the answer and denied having it.
 *
 * The fixture below (`GIRONDE_ROOTSTOCK_FIXTURE`) is the ACTUAL captured tool output for this
 * question — not a synthetic approximation — so a regression here is measured against the real shape
 * of a genuinely cross-lingual retrieval result: French section headings, `capBreadcrumb`-truncated
 * breadcrumbs, real dates.
 *
 * ── THE NEGATIVE CONTROLS ARE LOAD-BEARING ──
 *
 * `genuine-gap-honest-decline` fails a run that starts hedging on every KB answer "just in case" —
 * rule 6's correct wording ("I don't have a sourced answer") must stay AVAILABLE for the case where
 * nothing was actually found, and a model punished for using it accurately would degrade into vague
 * answers everywhere. Same posture as the legality golden's `biology-no-spurious-refusal`.
 *
 * `english-source-not-suppressed` fails a run where "use non-English sources too" gets over-corrected
 * into ignoring a correct, relevant ENGLISH source that was also returned — the fix is "use every
 * relevant passage regardless of language," not "prefer the non-English one."
 */

export type KbSourceDenialCase = {
  id: string;
  utterance: string;
  fixture: Record<string, string>;
  mustMention: { label: string; anyOf: RegExp[] }[];
  mustNotMatch?: { label: string; pattern: RegExp }[];
  note: string;
};

/** The ACTUAL captured search_knowledge_base output for the rootstock question, 2026-07-28. */
const GIRONDE_ROOTSTOCK_FIXTURE = JSON.stringify({
  found: true,
  guidance:
    "Answer ONLY from these passages, cite each fact with its `citation` markdown link, quote any " +
    "numbers/doses/limits verbatim, and defer any calculation to calc_so2/calc_sugar.",
  currencyWarning:
    "CURRENCY WARNING — of 6 passage(s): 1 aging (5-10 yrs), 1 undated. Do not present these as " +
    "current practice without saying how old they are.",
  results: [
    {
      n: 1,
      publisher: "Chambre d'Agriculture de la Gironde (Bordeaux)",
      tier: 1,
      section:
        "## CHOISIR UN PORTE-GREFFE EN NOUVELLE-AQUITAINE > I III II IV > 333 EM (Berlandieri x " +
        "Cabernet-Sauvignon) RSB1 (Berlandieri x Riparia)",
      date: "2022-11-29",
      dateSource: "published",
      ageYears: 3,
      citation: "/kb/source/cmrs0c3sp001ld10cdlr5z9dn",
      text:
        "## CHOISIR UN PORTE-GREFFE EN NOUVELLE-AQUITAINE > I III II IV > 333 EM (Berlandieri x " +
        "Cabernet-Sauvignon) RSB1 (Berlandieri x Riparia)\n\nCaractéristiques physiologiques • Vigueur " +
        "et rendement conférés élevés Adaptation au type de sol • Tolérance à l'humidité printanière " +
        "• Bonne tolérance à la sécheresse",
    },
    {
      n: 2,
      publisher: "Chambre d'Agriculture de la Gironde (Bordeaux)",
      tier: 1,
      section: "## CHOISIR UN PORTE-GREFFE EN NOUVELLE-AQUITAINE > AVANT-PROPOS",
      date: "2022-11-29",
      dateSource: "published",
      ageYears: 3,
      citation: "/kb/source/cmrs0c3sp001ld10cdlr5z9dn",
      text:
        "## CHOISIR UN PORTE-GREFFE EN NOUVELLE-AQUITAINE > AVANT-PROPOS\n\nLe choix du porte-greffe " +
        "est primordial pour la réussite d'une plantation. Il influence à la fois le développement de " +
        "la plante, le volume et la qualité de la récolte. Les Chambres d'Agriculture de " +
        "Nouvelle-Aquitaine et le Syndicat des Vignerons recommandent d'adapter le choix du " +
        "porte-greffe à la teneur en calcaire actif du sol.",
    },
    {
      n: 3,
      publisher: "Cornell Fruit Resources: Grapes",
      tier: 1,
      section: "Rootstocks for Planting or Replanting New York Vineyards",
      date: "2017-01-18",
      dateSource: "published",
      ageYears: 9,
      citation: "/kb/source/cmrtnwcgl004ud1oc9wrsh4dc",
      ageWarning:
        "Published 2017-01, about 9 years ago. Mention the date when citing it, and flag that " +
        "product registrations, rates, and legal limits may have changed since.",
      text:
        "It does not induce early wood maturation or reduce vine growth in Burgundy, but is reported " +
        "to produce early fruit maturation in other regions. It is widely used in the vineyards of " +
        "Alsace and the Loire. A good rootstock for deep, well drained soils.",
    },
  ],
});

/** No relevant passage returned — the genuine gap this rule 6 wording exists for. */
const GENUINE_GAP_FIXTURE = JSON.stringify({
  found: false,
  message:
    "Nothing in this winery's enabled knowledge sources matches that question. Tell the user you " +
    "don't have a sourced answer for it (do not answer from general knowledge), and suggest they " +
    "check whether the relevant source is enabled in their knowledge-base settings.",
});

/** A clean, single-source, English result — the negative control for "don't over-correct into
 *  ignoring a correct English source because the fix is about non-English ones." */
const ENGLISH_ONLY_FIXTURE = JSON.stringify({
  found: true,
  guidance:
    "Answer ONLY from these passages, cite each fact with its `citation` markdown link, quote any " +
    "numbers/doses/limits verbatim, and defer any calculation to calc_so2/calc_sugar.",
  results: [
    {
      n: 1,
      publisher: "AWRI",
      tier: 1,
      section: "Brett management > Hot water sanitation",
      date: "2022-03-01",
      dateSource: "published",
      ageYears: 4,
      citation: "/kb/source/awri-brett-hotwater",
      text:
        "Hot water is the most effective and practical sanitation method for controlling Brettanomyces " +
        "in oak barrels. Two regimes are effective: 70°C for 30 minutes, or 85°C for 15 minutes.",
    },
  ],
});

export const KB_SOURCE_DENIAL_GOLDEN: KbSourceDenialCase[] = [
  {
    id: "gironde-rootstock",
    utterance: "What rootstock should I choose for a vineyard in Bordeaux / Nouvelle-Aquitaine?",
    fixture: { search_knowledge_base: GIRONDE_ROOTSTOCK_FIXTURE },
    mustMention: [
      {
        label: "cites the Gironde source (not just Cornell/AWRI)",
        anyOf: [/gironde/i, /cmrs0c3sp001ld10cdlr5z9dn/, /nouvelle-aquitaine/i],
      },
      {
        label: "actually surfaces rootstock content from the retrieved passage",
        anyOf: [/vigueur/i, /calcaire/i, /sécheresse/i, /drought/i, /vigor/i, /soil/i, /lime/i],
      },
    ],
    mustNotMatch: [
      {
        label: "falsely denies having the source",
        pattern:
          /\b(?:i don'?t have (?:anything|any information)|that source isn'?t in|outside what cellarhand holds|nothing (?:in it|addresses)|my knowledge base doesn'?t (?:include|cover))\b/i,
      },
      {
        label: "claims the KB is only US/Australian material",
        pattern: /knowledge base is (?:us|u\.s\.|only)[^.]{0,40}(?:australian|american)/i,
      },
    ],
    note:
      "The live repro, verbatim fixture. The failure was not retrieval — it found the right passage — " +
      "it was the model discarding a French-language result and telling the user it doesn't exist.",
  },
  {
    id: "genuine-gap-honest-decline",
    utterance: "What's the ideal training system for a vineyard on volcanic soil in the Canary Islands?",
    fixture: { search_knowledge_base: GENUINE_GAP_FIXTURE },
    mustMention: [
      {
        label: "honestly says it has no sourced answer",
        anyOf: [/don'?t have a sourced answer/i, /no sourced answer/i, /nothing.{0,30}matches/i],
      },
    ],
    mustNotMatch: [
      {
        label: "invents an answer from general training knowledge",
        pattern: /\b(?:typically|generally|usually) (?:trained|grown|planted)\b/i,
      },
    ],
    note:
      "The negative control this suite exists to protect: rule 6's wording is CORRECT here (found: " +
      "false, genuinely nothing retrieved) and must not be treated as inherently suspicious just " +
      "because it resembles the denial phrasing in the bug case.",
  },
  {
    id: "english-source-not-suppressed",
    utterance: "What's the most effective way to sanitize barrels against Brett?",
    fixture: { search_knowledge_base: ENGLISH_ONLY_FIXTURE },
    mustMention: [
      { label: "uses the retrieved AWRI passage", anyOf: [/awri/i, /hot water/i, /70.?°?c/i, /85.?°?c/i] },
      { label: "cites it", anyOf: [/\/kb\/source\//] },
    ],
    mustNotMatch: [
      {
        label: "falsely claims no source (the fix must not make it suspicious of its OWN good result)",
        pattern: /\bi don'?t have (?:anything|any information|a sourced answer)\b/i,
      },
    ],
    note:
      "The fix is 'use every relevant result regardless of language,' not 'prefer non-English ones' " +
      "or 'second-guess a clean single-source English answer.'",
  },
];
