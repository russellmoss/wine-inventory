// Plan 079 — Maximal Marginal Relevance for source-diverse retrieval (council: MMR over hard publisher
// caps, so we don't force irrelevant sources in just to hit a diversity quota). Iteratively picks the
// candidate that maximizes lambda*relevance - (1-lambda)*maxSimilarityToAlreadyPicked, using cosine
// similarity between chunk embeddings. lambda=0.7 favors relevance while still spreading across
// documents/publishers when they're genuinely relevant.

export interface MmrCandidate<T> {
  item: T;
  relevance: number; // normalized [0,1]
  vector: number[];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function mmrSelect<T>(candidates: MmrCandidate<T>[], k: number, lambda = 0.7): T[] {
  const remaining = [...candidates];
  const selected: MmrCandidate<T>[] = [];
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let maxSim = 0;
      for (const s of selected) {
        const sim = cosine(cand.vector, s.vector);
        if (sim > maxSim) maxSim = sim;
      }
      const score = lambda * cand.relevance - (1 - lambda) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected.map((s) => s.item);
}

export { cosine as _cosine };
