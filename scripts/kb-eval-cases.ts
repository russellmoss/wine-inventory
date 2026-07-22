// Plan 090 Unit 1 — the knowledge-base eval CASE DEFINITIONS, extracted so more than one consumer can
// read them.
//
// Extracted from scripts/verify-knowledge-base.ts, which runs main() at import and therefore cannot be
// imported from. Two consumers now share this list:
//   - scripts/verify-knowledge-base.ts — the pass/fail gate (is the expected doc in top-k?)
//   - scripts/kb-snapshot.ts           — the ranked-snapshot artifact (what did the WHOLE result set do?)
// They must score the same queries. A snapshot of a different query set than the suite asserts on would
// be evidence about nothing.

/** The original hardcoded diversity query (verify-knowledge-base.ts:219 before plan 090 Unit 2). */
const DIVERSITY_QUERY_TEXT = "managing downy mildew in the vineyard";

export interface RetrievalCase {
  q: string;
  // Any ONE of these URL substrings in top-k counts — some questions have several valid authoritative
  // sources (e.g. barrel sanitation is covered by both the Brett fact sheet AND AWRI's dedicated
  // barrel-cleaning page). The expectFact check still enforces that the correct facts are actually present.
  expectPaths: string[];
  expectFact: string[]; // key terms the retrieved passages should contain (faithfulness of retrieval)
}

export const RETRIEVAL_CASES: RetrievalCase[] = [
  { q: "What is a good pre-infection fungicide I can use for downy mildew?", expectPaths: ["managing-downy-mildew", "downy-mildew"], expectFact: ["copper", "mancozeb"] },
  { q: "Are group 11 strobilurin good fungicides to use against downy mildew and powdery mildew?", expectPaths: ["s1482.pdf"], expectFact: ["resistance"] },
  { q: "What is the most effective way to remove the aromas from Brett?", expectPaths: ["Brett-fact-sheet.pdf", "brettanomyces"], expectFact: ["reverse osmosis"] },
  { q: "What is the most effective way to sanitize barrels against Brett?", expectPaths: ["Brett-fact-sheet.pdf", "barrel-cleaning-storage-and-maintenance", "brettanomyces-faq"], expectFact: ["70", "85"] },
  { q: "What is the most ideal YAN concentration for a white must?", expectPaths: ["/wine_fermentation/yan/"], expectFact: ["250", "350"] },
  { q: "Are there risks to consider with whole cluster (whole bunch) fermentation?", expectPaths: ["whole-bunch-fermentation"], expectFact: ["green", "bunch"] },
  { q: "What are the optimal conditions for the heat test for protein stability?", expectPaths: ["protein-stability-fact-sheet.pdf"], expectFact: ["80", "NTU"] },
  { q: "Does the carbon product used for smoke aroma reduction matter?", expectPaths: ["activated-carbon.pdf"], expectFact: ["carbon"] },
  // New sources (Plan 079 source expansion): each expects its own source's doc in top-k.
  { q: "How do I choose a wine yeast strain and what nitrogen nutrient does it need?", expectPaths: ["scott-labs-yeast", "yeast-choosing", "yeast-nutrient", "yeast-nutrition", "winemaking%20handbook"], expectFact: ["yeast"] }, // Scott Labs
  { q: "Does wildfire smoke exposure affect wine grapes and the resulting wine?", expectPaths: ["smoke-exposure", "impact-smoke"], expectFact: ["smoke"] }, // OSU Extension
  { q: "How do I monitor for grapevine leafroll virus and mealybugs in the vineyard?", expectPaths: ["leafroll", "mealybug"], expectFact: ["mealybug"] }, // OSU Extension
  // International source expansion 2 (multilingual + sparkling). An English query retrieves the native
  // French/Spanish chunks (voyage-4 is multilingual) + the sparkling specialists.
  { q: "How much sugar do I add at tirage to reach the right bottle pressure in méthode champenoise sparkling wine?",
    expectPaths: ["le-tirage", "le-dosage", "prise-de-mousse", "maisons-champagne", "SparklingHandbook", "Enartis-Sparkling", "FG_EN_Spark"], expectFact: ["tirage"] }, // UMC / sparkling PDFs
  { q: "What are the integrated pest management thresholds for wine grapes?",
    // MAPA (ES) + PNW IPM + UC IPM. uc-ipm was added after this case was written and now outranks the
    // other two: its grape Pest Management Guidelines are the canonical US source for treatment
    // thresholds, so retrieving them here is the retrieval getting BETTER, not regressing. Widened rather
    // than repointed — all three remain valid authoritative answers, which is exactly what the multi-value
    // expectPaths contract above is for. Caveat worth remembering when reading these results: most of the
    // uc-ipm corpus is stamped 2015 or older, so "authoritative" here means canonical, not current.
    expectPaths: ["guiauvadetransformacion", "mapa.gob", "pnw-644", "field-monitoring", "ipm.ucanr.edu"], expectFact: ["grape"] },
  { q: "How do I test for TCA cork taint and haloanisoles in my wine?",
    expectPaths: ["etslabs", "publications/publication"], expectFact: ["haloanisole"] }, // ETS Laboratories (analysis authority)
  // Plan 084 — Cornell. The corpus previously had no cool-climate eastern-US authority, so these
  // questions were answered from Australian / Pacific-Northwest sources written for a different climate
  // and a different pest complex. Phomopsis and black rot are eastern-US disease-pressure signatures.
  { q: "What fungicide program controls Phomopsis and black rot in an eastern US vineyard?",
    expectPaths: ["blogs.cornell.edu", "grape-disease-control", "wilcox"], expectFact: ["phomopsis", "black rot"] },
  // Plan 090 Unit 2 — VOLATILE ACIDITY. Added as a REGRESSION GUARD, not to close a gap: this query was
  // probed before any change and retrieval is already excellent. AWRI's VA page is HTML, so its heading
  // structure survives extraction and chunk.ts produces real breadcrumbs
  // ("Measurement of volatile acidity (VA) in wine > Steam distillation/titration"), giving the enzymatic
  // assay, the steam-distillation/Cash-still method and HPLC as three separately retrievable passages.
  //
  // That is exactly the behaviour the PDF fix is trying to give the rest of the corpus, so it is pinned
  // BEFORE the chunking work starts. If this case ever goes red, the chunker change broke the one path
  // that was already right.
  { q: "What is the best way to measure volatile acidity?",
    expectPaths: ["/laboratory_methods/chemical/va/"], expectFact: ["distillation", "cash"] },
];

/**
 * Plan 090 Unit 2 — MULTI-PUBLISHER COVERAGE, promoted from the single hardcoded diversity check that
 * lived at verify-knowledge-base.ts:219.
 *
 * `expectPaths` asks "is the right document present". It cannot express "the answer should draw on more
 * than one authority", which is a different failure: the nutrient query below returns the Oregon corpus
 * four ways and NO AWRI, despite AWRI owning the canonical YAN page that ranks #1 on a differently
 * phrased query. A winemaker asking about nutrient additions gets one region's research and never sees
 * the source with the actual target numbers.
 */
export interface CoverageCase {
  q: string;
  /** Publisher substrings (case-insensitive) that must ALL appear in the retrieved set. */
  expectPublishers: string[];
  /** The result set must span at least this many DISTINCT publishers. */
  minPublishers: number;
  /**
   * Set when the case encodes a TARGET state that does not hold yet. A known-failing case reports as
   * PENDING rather than failing the suite — otherwise the gate is red for the whole of plan 090 and
   * stops being able to catch anything else. It flips to a hard assertion the moment it passes.
   */
  knownFailing?: string;
}

export const COVERAGE_CASES: CoverageCase[] = [
  {
    // Preserved verbatim in intent from the old hardcoded check: a topic BOTH AWRI and Wine Australia
    // cover should surface more than one publisher, so the assistant can present each authority's view
    // rather than silently picking one.
    q: DIVERSITY_QUERY_TEXT,
    expectPublishers: [],
    minPublishers: 2,
  },
  {
    // The defect this plan exists to fix, stated as an assertion. Measured 2026-07-22 (top-8):
    // rank 1 was an OWRI newsletter MASTHEAD ("Welcome to the Summer 2015 Newsletter"), ranks 2/5/7/8
    // were 1996-1999 Oregon research reports (two of them the SAME document), and AWRI was absent
    // entirely. Root cause is the PDF breadcrumb collapse — every chunk of those reports carries the
    // same ~192-char page-one slab, so a nitrogen query matches all of them equally on the prefix alone.
    q: "what are the best nutrients to add to Pinot noir fermentation",
    expectPublishers: ["AWRI"],
    minPublishers: 3,
    knownFailing:
      "AWRI absent; OWRI PDFs dominate via the 192-char breadcrumb prefix (plan 090 Units 4-9 target this)",
  },
];

// NOTE for whoever runs this after adding Cornell: the leafroll/mealybug case above expects an OSU
// document, and Cornell also publishes authoritatively on leafroll. If that case starts failing because
// a Cornell doc displaced the OSU one in top-6, retrieval got BETTER, not worse — widen that case's
// expectPaths rather than narrowing the Cornell source. Deliberately not pre-widened here: that would
// weaken a real OSU coverage check on a guess.

// Must be REJECTED: nothing on-topic in the corpus.
export const REJECTION_CASES = [
  { q: "How do I brew a hoppy IPA beer with dry hopping?", offTopic: ["ipa", "hops", "dry hop"] },
  { q: "What is the best espresso grind size for a flat white?", offTopic: ["espresso", "grind", "coffee"] },
];

/**
 * Every query the snapshot captures, in a stable order and de-duplicated (a query may be both a
 * retrieval case and a coverage case). Rejection queries are included deliberately: a rejection case
 * starting to return on-topic wine content is exactly the kind of drift worth seeing, and it is
 * invisible to a gate that only asserts the absence of beer words.
 */
export function allSnapshotQueries(): string[] {
  return [
    ...new Set([
      ...RETRIEVAL_CASES.map((c) => c.q),
      ...REJECTION_CASES.map((c) => c.q),
      ...COVERAGE_CASES.map((c) => c.q),
    ]),
  ];
}
