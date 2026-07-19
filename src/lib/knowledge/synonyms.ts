// Plan 079 — acronym/unit synonym expansion for the LEXICAL arm of hybrid search (Unit 6). Dense
// embeddings handle paraphrase well; the keyword (tsvector) arm needs help matching domain acronyms and
// unit variants so a query for "KMBS" also matches "potassium metabisulfite", and "ppm" matches "mg/L".
// Expansion is applied ONLY to the lexical query text, never to the dense embedding (which is fine as-is).

const SYNONYMS: Record<string, string[]> = {
  kmbs: ["potassium metabisulfite", "potassium metabisulphite"],
  dap: ["diammonium phosphate"],
  yan: ["yeast assimilable nitrogen"],
  so2: ["sulfur dioxide", "sulphur dioxide", "sulfite", "sulphite"],
  mlf: ["malolactic fermentation", "malolactic"],
  ta: ["titratable acidity"],
  va: ["volatile acidity"],
  brett: ["brettanomyces"],
  ro: ["reverse osmosis"],
  ntu: ["nephelometric turbidity unit"],
  ppm: ["mg/l", "milligrams per litre", "milligrams per liter"],
};

/**
 * Expand a search query with domain synonyms for the lexical arm. Bidirectional: an acronym pulls in its
 * expansion, and a spelled-out term pulls in its acronym. Returns the original query plus appended terms.
 */
export function expandQueryTerms(query: string): string {
  const lower = query.toLowerCase();
  const extra = new Set<string>();
  for (const [term, syns] of Object.entries(SYNONYMS)) {
    if (new RegExp(`\\b${term}\\b`).test(lower)) {
      for (const s of syns) extra.add(s);
    } else {
      for (const s of syns) {
        if (lower.includes(s.toLowerCase())) {
          extra.add(term);
          break;
        }
      }
    }
  }
  return extra.size ? `${query} ${[...extra].join(" ")}` : query;
}
