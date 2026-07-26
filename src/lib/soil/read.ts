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
import { validateVineyardPolygon } from "@/lib/gis/geometry";
import type { LegendEntry, MapOverlay } from "@/lib/gis/overlay";
import { isLikelyUsLocation, polygonCentroid } from "./us-region";
import { buildSoilOverlays } from "./overlay-core";
import type { SoilDisplayGeometry } from "./wkt-parse";
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

/** Whether a block can be pulled at all, so the UI gates the button before any network call. */
export type SoilEligibility = "ok" | "no-polygon" | "invalid-polygon" | "out-of-region";

export type BlockSoilContext = { view: SoilSnapshotView | null; eligibility: SoilEligibility };

/** Everything the block-panel soil section needs in one round trip: the current snapshot + whether a
 *  pull is even possible (has a valid boundary, in SSURGO territory). */
export async function getBlockSoilContext(blockId: string): Promise<BlockSoilContext> {
  const [view, block] = await Promise.all([
    getCurrentSoilSnapshot(blockId),
    prisma.vineyardBlock.findFirst({
      where: { id: blockId },
      select: { polygon: true, vineyard: { select: { detail: { select: { gpsLat: true, gpsLng: true } } } } },
    }),
  ]);

  let eligibility: SoilEligibility = "ok";
  if (!block || block.polygon == null) {
    eligibility = "no-polygon";
  } else {
    const validated = validateVineyardPolygon(block.polygon);
    if (!validated.ok) {
      eligibility = "invalid-polygon";
    } else {
      const detail = block.vineyard?.detail;
      const gpsLat = detail?.gpsLat == null ? null : Number(detail.gpsLat);
      const gpsLng = detail?.gpsLng == null ? null : Number(detail.gpsLng);
      const [lng, lat] = gpsLat != null && gpsLng != null ? [gpsLng, gpsLat] : polygonCentroid(validated.value);
      if (!isLikelyUsLocation(lat, lng)) eligibility = "out-of-region";
    }
  }
  return { view, eligibility };
}

/** A map unit enriched with its snapshot's provenance — the data behind the click-to-inspect panel. */
export type SoilUnitDetail = SoilComponent & {
  pulledAt: Date;
  surveyAreaSymbol: string | null;
  surveyAreaVersion: string | null;
  attribution: string | null;
};

export type VineyardSoilOverlays = {
  overlays: MapOverlay[];
  legend: { title: string; entries: LegendEntry[] };
  /** Per-mukey unit metadata for the click-to-inspect detail panel. */
  units: SoilUnitDetail[];
};

/** Assemble the soil MAP overlays for every block in a vineyard that has a current snapshot with display
 *  geometry. Returns null when nothing has renderable soil geometry yet (nothing to paint). */
export async function getVineyardSoilOverlays(vineyardId: string): Promise<VineyardSoilOverlays | null> {
  const snaps = await prisma.blockSoilSnapshot.findMany({ where: { vineyardId, supersededAt: null } });
  const overlays: MapOverlay[] = [];
  const entries: LegendEntry[] = [];
  const units: SoilUnitDetail[] = [];
  const seenLegend = new Set<string>();
  const seenUnit = new Set<string>();
  for (const snap of snaps) {
    const components = parseStoredComponents(snap.components);
    const displayGeometry = (snap.displayGeometry ?? null) as SoilDisplayGeometry | null;
    if (!components || !displayGeometry) continue;
    const built = buildSoilOverlays({ blockId: snap.blockId, components, displayGeometry });
    if (!built) continue;
    overlays.push(...built.overlays);
    for (const e of built.legend.entries) {
      if (seenLegend.has(e.label)) continue; // dedupe repeated soils across blocks
      seenLegend.add(e.label);
      entries.push(e);
    }
    for (const c of components) {
      if (c.class === "uncovered" || seenUnit.has(c.mukey)) continue;
      seenUnit.add(c.mukey);
      units.push({ ...c, pulledAt: snap.pulledAt, surveyAreaSymbol: snap.surveyAreaSymbol, surveyAreaVersion: snap.surveyAreaVersion, attribution: snap.attribution });
    }
  }
  if (overlays.length === 0) return null;
  return { overlays, legend: { title: "Soil (NRCS SSURGO)", entries }, units };
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
