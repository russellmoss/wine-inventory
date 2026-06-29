// Pure, isomorphic live-composition rollup for the blend builder + trial editor (Unit 8/9).
// Unlike lineage.composeRollup (which walks recorded lineage), this weights the CURRENTLY
// selected components by their draw/volume — a live preview before the blend is written.

export type ComposeItem = {
  weight: number; // litres (or mL for trials) — only the ratio matters
  varietyName: string | null;
  vineyardName: string | null;
  vintageYear: number | null;
};

export type ComposeSlice = { label: string; pct: number };

export type ComposeResult = {
  byVariety: ComposeSlice[];
  byVineyard: ComposeSlice[];
  byVintage: ComposeSlice[];
  vintageEligible: { year: string; pct: number } | null; // TTB ≥85% from one year
};

function bucket(items: ComposeItem[], total: number, pick: (i: ComposeItem) => string | null): ComposeSlice[] {
  const acc = new Map<string, number>();
  for (const i of items) {
    const label = pick(i);
    if (!label) continue;
    acc.set(label, (acc.get(label) ?? 0) + i.weight);
  }
  return [...acc.entries()]
    .map(([label, w]) => ({ label, pct: Math.round((w / total) * 1000) / 10 }))
    .sort((a, b) => b.pct - a.pct);
}

export function weightedRollup(items: ComposeItem[]): ComposeResult {
  const total = items.reduce((a, i) => a + i.weight, 0) || 1;
  const byVintage = bucket(items, total, (i) => (i.vintageYear != null ? String(i.vintageYear) : null));
  const topVintage = byVintage[0];
  return {
    byVariety: bucket(items, total, (i) => i.varietyName),
    byVineyard: bucket(items, total, (i) => i.vineyardName),
    byVintage,
    vintageEligible: topVintage && topVintage.pct >= 85 ? { year: topVintage.label, pct: topVintage.pct } : null,
  };
}
