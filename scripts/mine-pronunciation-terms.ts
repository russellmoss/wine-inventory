// Plan 091 — pure candidate-extraction heuristics for the pronunciation lexicon.
//
// Split out from the runner (scripts/mine-pronunciation-candidates.ts) so they can be
// unit-tested, exactly like scripts/kb-eval-match.ts is split from
// scripts/verify-knowledge-base.ts. The runner executes main() at import; a test
// cannot pull functions out of it.
//
// These heuristics are deliberately NOISY-BUT-CHEAP. They are the wide end of a
// funnel: extract anything that smells like domain vocabulary, rank by how many
// distinct documents use it, then let the TTS->STT screen decide what actually needs
// a pronunciation rule. Precision here is not worth much, because a junk candidate
// that the engine pronounces fine dies at the screen without costing a human anything.

/** Letters that mark a word as probably-not-English, i.e. French/German/Italian. */
const ACCENTED = /[àáâãäåçèéêëìíîïñòóôõöùúûüýÿ]/i;

/**
 * Genus endings that make a capitalized word plausibly a Latin/scientific genus.
 * These are the families that actually show up in enology: yeasts, bacteria, moulds.
 */
const GENUS_SUFFIXES = [
  "myces",
  "coccus",
  "bacter",
  "monas",
  "bacillus",
  "spora",
  "sporium",
  "ella",
  "opsis",
  "phora",
  "cladium",
];

/**
 * Species-epithet endings that mark the second half of a binomial.
 *
 * The species half carries the signal, not the genus. Testing the GENUS for Latin
 * endings looks tempting (Botrytis, Vitis) but "-is" and "-us" are also how ordinary
 * capitalized words end, so "This shows" and "Thus follows" start matching.
 */
const SPECIES_SUFFIXES = [
  "ae", "is", "us", "um", "ii", "ensis", "iae", "ata", "ans",
  "ineus", "icus", "osa", "osus", "ea", "ia", "ica", "ana", "ella",
];

/** Taxonomic suffixes — narrow enough that a 6-character minimum is safe. */
const TAXON_SUFFIXES = ["myces", "coccus", "bacter", "aceae", "mycota"];

/**
 * Chemical suffixes (sugars, enzymes). "-ose" and "-ase" are far too common in plain
 * English to gate on the suffix alone, so these carry a longer minimum: it separates
 * glucose/fructose/pectinase from close, rose, dose, phase, choose.
 */
const CHEM_SUFFIXES = ["ase", "ose"];
const CHEM_MIN_LENGTH = 7;

/**
 * Common English words that survive the other filters and would otherwise flood the
 * candidate list. Not a dictionary — just the recurring offenders in extension and
 * journal prose. The screen would reject them anyway; this keeps the screen budget
 * for terms that might actually matter.
 */
const COMMON = new Set([
  "table", "these", "those", "there", "their", "which", "while", "would", "could",
  "should", "about", "above", "after", "before", "between", "during", "under",
  "where", "whether", "however", "therefore", "because", "although", "based",
  "increase", "decrease", "sample", "samples", "result", "results", "study",
  "studies", "figure", "figures", "section", "chapter", "university", "extension",
  "research", "institute", "department", "journal", "volume", "issue", "pages",
  "author", "authors", "abstract", "introduction", "conclusion", "discussion",
  "method", "methods", "material", "materials", "analysis", "control", "treatment",
  "treatments", "significant", "average", "total", "value", "values", "level",
  "levels", "content", "quality", "production", "vineyard", "vineyards", "winery",
  "wineries", "grape", "grapes", "wine", "wines", "juice", "must", "fruit", "berry",
  "berries", "cluster", "clusters", "canopy", "harvest", "season", "growing",
  "disease", "diseases", "management", "practice", "practices", "growth", "yield",
  "close", "rose", "whose", "loose", "dose", "purpose", "response", "release",
  "increase", "please", "phase", "phrase", "database", "release", "disease",
  // Chemical-suffix leaks: real words long enough to clear CHEM_MIN_LENGTH.
  "purchase", "dispose", "propose", "expose", "compose", "suppose", "diagnose",
  "showcase", "decrease", "supposed", "proposed", "exposure",
  // Binomial leaks: ordinary words whose endings mimic Latin epithets
  // ("means" -> -ans, "this" -> -is). Cheap to list, expensive to leave in.
  "this", "with", "means", "thus", "plus", "various", "previous", "obvious",
  "series", "species", "process", "access", "basis", "axis", "his", "its",
  "was", "has", "does", "goes", "gives", "takes", "makes", "shows", "notes",
]);

export type Candidate = {
  term: string;
  /** How many distinct documents contained it — the ranking signal. */
  docFrequency: number;
  /** Total occurrences across the corpus. */
  occurrences: number;
  /** Which heuristics fired, for auditability. */
  reasons: string[];
};

function isCommon(word: string): boolean {
  return COMMON.has(word.toLowerCase());
}

function endsWithAny(word: string, suffixes: string[]): boolean {
  const lower = word.toLowerCase();
  return suffixes.some((s) => lower.endsWith(s));
}

/**
 * Latin binomials: "Saccharomyces cerevisiae", "Botrytis cinerea", "Vitis vinifera".
 *
 * Requires BOTH a capitalized genus and a lowercase species, AND that one of the two
 * halves carries Latin morphology. Without that second condition the pattern happily
 * matches "The wine" and "Tank thirty", which is how a naive binomial regex turns a
 * 12-million-token corpus into noise.
 */
export function extractBinomials(text: string): string[] {
  const out: string[] = [];
  const re = /\b([A-Z][a-z]{3,})\s+([a-z]{4,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, genus, species] = m;
    const taxonomicGenus = endsWithAny(genus, GENUS_SUFFIXES);
    const latinSpecies = endsWithAny(species, SPECIES_SUFFIXES);
    if (!taxonomicGenus && !latinSpecies) continue;
    if (isCommon(genus) || isCommon(species)) continue;
    out.push(`${genus} ${species}`);
  }
  return out;
}

/**
 * Function words that mark a passage as French or German rather than English.
 *
 * This matters more than it looks. The accented-word heuristic assumes an accent marks
 * a BORROWED term inside English prose ("Gewürztraminer", "bâtonnage"). Inside a
 * French document that assumption inverts: every other word is accented, and the
 * heuristic returns "année", "région", "cépage", "référence" — ordinary French the
 * assistant will never say aloud. The corpus has 177 French Champagne documents (umc)
 * and 79 German ones (wbi), and unfiltered they dominate the entire candidate list.
 */
const FOREIGN_STOPWORDS = [
  // French
  "le", "la", "les", "des", "une", "dans", "pour", "est", "que", "qui", "sur",
  "avec", "sont", "plus", "cette", "aux", "par",
  // German
  "und", "der", "die", "das", "mit", "für", "ist", "den", "von", "auf", "nicht",
  "auch", "eine", "werden",
  // Spanish / Catalan
  "el", "los", "las", "del", "con", "para", "por", "una", "como", "más", "són",
  "amb", "dels",
];

/**
 * Knowledge sources published in a language other than English.
 *
 * 9 of the 25 sources are non-English, which is why the corpus produced "acidité",
 * "contrôlée" and "variété" as top candidates: ordinary foreign words, not borrowed
 * cellar terms. Gating by source key is deterministic and costs nothing, where the
 * text-based detector needs a threshold that cannot separate a French glossary block
 * from an English sentence naming two varietals.
 */
export const FOREIGN_SOURCE_KEYS = new Set([
  "chambre-gironde", // French
  "icvv", // Spanish
  "ifv-france", // French
  "ifv-occitanie", // French
  "incavi", // Catalan
  "lvwo", // German
  "mapa", // Spanish
  "umc", // French
  "wbi", // German
]);

/**
 * True when a passage reads as French or German rather than English-with-loanwords.
 *
 * Two independent signals, because the function-word test alone misses a whole class
 * of foreign chunk. French PDFs in this corpus carry keyword blocks, table headers and
 * figure captions that are dense in accented CONTENT words but contain almost no
 * function words, so they scored as English and flooded the accented stratum with
 * "acidité", "contrôlée", "variété". The accent-density test catches those: English
 * prose borrows the odd varietal, it does not run 12% accented.
 */
export function looksForeignLanguage(text: string): boolean {
  const words = text.toLowerCase().match(/[\p{L}]+/gu);
  if (!words || words.length < 12) return false;

  const foreign = new Set(FOREIGN_STOPWORDS);
  let stopwordHits = 0;
  let accentedHits = 0;
  for (const w of words) {
    if (foreign.has(w)) stopwordHits++;
    if (ACCENTED.test(w)) accentedHits++;
  }
  if (stopwordHits / words.length > 0.06) return true;
  // 12% and no lower. Tightening to 7% to catch a French glossary block also flagged
  // English prose that merely names two varietals in one sentence (8% accented), and
  // losing real terms is the worse failure direction. Foreign-language SOURCES are
  // excluded by source key in the runner instead, which needs no threshold at all.
  return accentedHits / words.length > 0.12;
}

/** Words carrying non-English orthography — the French and German cellar vocabulary. */
export function extractAccented(text: string): string[] {
  const out: string[] = [];
  const re = /[\p{L}]{4,}/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    if (!ACCENTED.test(word)) continue;
    if (isCommon(word)) continue;
    out.push(word);
  }
  return out;
}

/** Single tokens with scientific suffixes: -myces, -coccus, -aceae, -ase, -ose. */
export function extractScientificTokens(text: string): string[] {
  const out: string[] = [];
  const re = /\b[A-Za-z]{6,}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    if (isCommon(word)) continue;
    const taxon = endsWithAny(word, TAXON_SUFFIXES);
    const chem = word.length >= CHEM_MIN_LENGTH && endsWithAny(word, CHEM_SUFFIXES);
    if (!taxon && !chem) continue;
    out.push(word);
  }
  return out;
}

/**
 * Capitalized words that are not sentence-initial — proper nouns, which in this corpus
 * means varieties, regions, and appellations. Also the noisiest heuristic by far
 * (author names, institutions), which is why doc-frequency ranking and the screen
 * both sit downstream of it.
 */
export function extractProperNouns(text: string): string[] {
  const out: string[] = [];
  // Require a preceding word character or comma, so the token is mid-sentence.
  const re = /(?<=[a-z,]\s)([A-Z][a-zà-ÿ]{3,})\b/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[1];
    if (isCommon(word)) continue;
    out.push(word);
  }
  return out;
}

/**
 * Run every heuristic over one chunk, returning term -> reasons that fired.
 *
 * `foreignSource` short-circuits the language check for documents whose PUBLISHER is
 * non-English (see FOREIGN_SOURCE_KEYS) — cheaper and exact, where the text detector
 * is a fallback for foreign-language documents hosted on an English source.
 */
export function extractFromChunk(
  text: string,
  opts: { foreignSource?: boolean } = {},
): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const add = (term: string, reason: string) => {
    const key = term.trim();
    if (!key) return;
    const existing = found.get(key);
    if (existing) existing.add(reason);
    else found.set(key, new Set([reason]));
  };

  // Latin binomials are language-independent — a French paper names Botrytis cinerea
  // the same way an Australian one does, so those stay. The orthography- and
  // capitalization-based heuristics do not survive a language switch.
  for (const t of extractBinomials(text)) add(t, "binomial");
  for (const t of extractScientificTokens(text)) add(t, "scientific");
  if (!opts.foreignSource && !looksForeignLanguage(text)) {
    for (const t of extractAccented(text)) add(t, "accented");
    for (const t of extractProperNouns(text)) add(t, "proper-noun");
  }
  return found;
}

/**
 * Merge per-chunk hits into ranked candidates.
 *
 * Ranked by DOCUMENT frequency rather than raw occurrences: a real domain term recurs
 * across many papers, while an author name repeats many times inside one. Raw counts
 * rank the author name higher, which is exactly backwards.
 */
export function rankCandidates(
  tally: Map<string, { docs: Set<string>; occurrences: number; reasons: Set<string> }>,
): Candidate[] {
  const out: Candidate[] = [];
  for (const [term, v] of tally) {
    out.push({
      term,
      docFrequency: v.docs.size,
      occurrences: v.occurrences,
      reasons: [...v.reasons].sort(),
    });
  }
  return out.sort(
    (a, b) => b.docFrequency - a.docFrequency || b.occurrences - a.occurrences ||
      a.term.localeCompare(b.term),
  );
}
