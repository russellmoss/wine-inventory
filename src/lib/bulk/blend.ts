import { round2 } from "@/lib/round";

export type Component = { varietyId: string; varietyName: string; volumeL: number };

export type VarietyShare = { varietyId: string; varietyName: string; volumeL: number; pct: number };

export type BlendInfo = {
  totalL: number;
  isBlend: boolean; // >1 distinct VARIETY (vineyards alone don't make a blend)
  varieties: VarietyShare[];
};

/**
 * Classify a vessel's contents by VARIETY ratio. Per the domain review:
 * 100% one variety = unblended (even if it spans multiple vineyards); two or
 * more varieties = a blend. Shares are computed across the whole vessel.
 */
export function classifyBlend(components: Component[]): BlendInfo {
  const totalL = round2(components.reduce((a, c) => a + c.volumeL, 0));
  const byVariety = new Map<string, VarietyShare>();
  for (const c of components) {
    const cur = byVariety.get(c.varietyId);
    if (cur) cur.volumeL = round2(cur.volumeL + c.volumeL);
    else byVariety.set(c.varietyId, { varietyId: c.varietyId, varietyName: c.varietyName, volumeL: round2(c.volumeL), pct: 0 });
  }
  const varieties = [...byVariety.values()]
    .map((v) => ({ ...v, pct: totalL > 0 ? Math.round((v.volumeL / totalL) * 1000) / 10 : 0 }))
    .sort((a, b) => b.volumeL - a.volumeL);
  return { totalL, isBlend: varieties.length > 1, varieties };
}
