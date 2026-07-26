import "server-only";
/**
 * Vineyard Intelligence P4 — read the current soil snapshot for a block (UI server component + assistant
 * tool). `components` is validated ON READ: an older/unreadable shape returns `components: null` so the
 * caller shows an "unreadable — re-pull" badge instead of 500ing the block page (design §Storage).
 *
 * Staleness is a READ-time comparison of the block's current geometry against the snapshot's — a boundary
 * edit is surfaced as a badge, never a deletion (supersede-not-delete).
 */
import { prisma } from "@/lib/prisma";
import { parseStoredComponents, type CoverageState, type SoilComponent } from "./schema";

export type SoilSnapshotView = {
  blockId: string;
  pulledAt: Date;
  coveredPct: number;
  coverageState: CoverageState;
  blockAreaSqM: number;
  surveyAreaSymbol: string | null;
  surveyAreaVersion: string | null;
  attribution: string | null;
  components: SoilComponent[] | null; // null ⇒ unreadable snapshot (degrade to a badge)
  stale: boolean; // the block boundary changed since this snapshot was pulled
};

/** The one current snapshot for a block, or null if none has been pulled. */
export async function getCurrentSoilSnapshot(blockId: string): Promise<SoilSnapshotView | null> {
  const [snap, block] = await Promise.all([
    prisma.blockSoilSnapshot.findFirst({ where: { blockId, supersededAt: null } }),
    prisma.vineyardBlock.findFirst({ where: { id: blockId }, select: { geometryVersion: true, geometryFingerprint: true } }),
  ]);
  if (!snap) return null;

  const stale = block
    ? snap.geometryVersion !== block.geometryVersion ||
      (block.geometryFingerprint != null && snap.polygonFingerprint !== block.geometryFingerprint)
    : false;

  return {
    blockId,
    pulledAt: snap.pulledAt,
    coveredPct: Number(snap.coveredPct),
    coverageState: snap.coverageState as CoverageState,
    blockAreaSqM: Number(snap.blockAreaSqM),
    surveyAreaSymbol: snap.surveyAreaSymbol,
    surveyAreaVersion: snap.surveyAreaVersion,
    attribution: snap.attribution,
    components: parseStoredComponents(snap.components),
    stale,
  };
}

/** A compact, spoken-friendly soil summary for the assistant read tool. */
export function summarizeSoilSnapshot(view: SoilSnapshotView): string {
  if (view.components == null) return "The stored soil snapshot for this block is unreadable — pull it again to refresh.";
  const soils = view.components.filter((c) => c.class === "soil" || c.class === "mixed");
  const nonSoil = view.components.filter((c) => c.class === "water" || c.class === "non-soil");
  const parts: string[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  for (const c of soils) {
    const props = [c.ph != null ? `pH ${c.ph}` : null, c.drainageClass ?? null].filter(Boolean).join(", ");
    parts.push(`${pct(c.areaPct)} ${c.muname}${props ? ` (${props})` : ""}`);
  }
  for (const c of nonSoil) parts.push(`${pct(c.areaPct)} ${c.muname} (non-soil)`);
  const cov =
    view.coverageState === "partial"
      ? ` Coverage is partial (${pct(view.coveredPct)} of the boundary).`
      : view.coverageState === "over"
        ? " Coverage exceeds the boundary — treat the shares as approximate."
        : "";
  const staleNote = view.stale ? " The boundary changed since this was pulled — re-pull to refresh." : "";
  return `${parts.join("; ") || "No soil map units."}.${cov}${staleNote}`;
}
