// Plan 079 — Reciprocal Rank Fusion. Combines the dense (pgvector) and lexical (tsvector) ranked lists
// into one, rewarding chunks that rank well in EITHER arm. This is the council C4 fix: dense embeddings
// miss exact numbers/acronyms ("<2.0 NTU", "group-11"), the lexical arm catches them, and RRF fuses both
// without needing to reconcile their incomparable score scales. k=60 is the standard constant.

export interface FusedResult {
  id: string;
  score: number;
}

export function rrfFuse(rankedLists: string[][], k = 60): FusedResult[] {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/** Min-max normalize fused scores into [0,1] so they're comparable to cosine similarity in MMR. */
export function normalizeScores(results: FusedResult[]): Map<string, number> {
  if (results.length === 0) return new Map();
  const scores = results.map((r) => r.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  return new Map(results.map((r) => [r.id, (r.score - min) / span]));
}
