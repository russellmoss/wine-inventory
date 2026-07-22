// Plan 090 Unit 1 — the knowledge-base eval CASE DEFINITIONS, extracted so more than one consumer can
// read them.
//
// Extracted from scripts/verify-knowledge-base.ts, which runs main() at import and therefore cannot be
// imported from. Two consumers now share this list:
//   - scripts/verify-knowledge-base.ts — the pass/fail gate (is the expected doc in top-k?)
//   - scripts/kb-snapshot.ts           — the ranked-snapshot artifact (what did the WHOLE result set do?)
// They must score the same queries. A snapshot of a different query set than the suite asserts on would
// be evidence about nothing.

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
 * A topic BOTH AWRI and Wine Australia cover should surface passages from >1 publisher, so the assistant
 * can present each authority's view rather than silently picking one. Plan 090 Unit 2 turns this into a
 * proper case TYPE; today it is the single hardcoded query that verify-knowledge-base.ts:219 used.
 */
export const DIVERSITY_QUERY = "managing downy mildew in the vineyard";

/**
 * Every query the snapshot captures, in a stable order. Rejection and diversity queries are included
 * deliberately: a rejection case starting to return on-topic wine content is exactly the kind of drift
 * worth seeing, and it is invisible to a gate that only asserts the absence of beer words.
 */
export function allSnapshotQueries(): string[] {
  return [...RETRIEVAL_CASES.map((c) => c.q), ...REJECTION_CASES.map((c) => c.q), DIVERSITY_QUERY];
}
