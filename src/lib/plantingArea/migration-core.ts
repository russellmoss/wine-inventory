/**
 * Vineyard Intelligence P1 — migration-by-union: derive proposed planting-area parents from existing
 * block polygons WITHOUT touching the originals (brief §2.2 "existing users must not redraw everything").
 *
 * Council C3 guards folded in:
 *   - PRE-FLIGHT topology: overlaps among a group's blocks are reported on the proposal, never silently
 *     healed by the union.
 *   - STRICT <1 m continuity grouping: a group can't bridge a road/creek into one analysis mask.
 *   - ALL-OR-NOTHING confirm per vineyard (council Q3): assign every polygoned block atomically, set the
 *     `plantingMigratedAt` gate only when no unassigned blocks remain.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { VineyardPolygon } from "@/lib/gis/geometry";
import { groupByContinuity, unionPolygons } from "@/lib/gis/boolean";
import { geodesicAreaM2 } from "@/lib/gis/geometry-meta";
import { reviewTopology, type TopologyFinding } from "@/lib/gis/topology";
import { createPlantingAreaCore } from "./planting-area-core";

type Tx = Prisma.TransactionClient;

export type MigrationProposal = {
  index: number;
  name: string;
  geometry: VineyardPolygon;
  memberBlockIds: string[];
  areaGeodesicM2: number;
  /** pre-flight defects among the group's blocks (e.g. SIBLING_OVERLAP) — surfaced, never auto-healed. */
  defects: TopologyFinding[];
};

/**
 * READ: propose planting-area parents by unioning spatially-continuous groups of the vineyard's block
 * polygons. Blocks without a polygon cannot be grouped and are returned separately. Uses extended prisma.
 */
export async function proposePlantingAreasFromBlocksCore(
  vineyardId: string,
): Promise<{ proposals: MigrationProposal[]; blocksWithoutGeometry: string[] }> {
  const blocks = await prisma.vineyardBlock.findMany({
    where: { vineyardId },
    select: { id: true, blockLabel: true, polygon: true },
    orderBy: { sortOrder: "asc" },
  });

  const withGeom = blocks.filter((b) => b.polygon) as Array<{ id: string; blockLabel: string | null; polygon: unknown }>;
  const blocksWithoutGeometry = blocks.filter((b) => !b.polygon).map((b) => b.id);
  if (withGeom.length === 0) return { proposals: [], blocksWithoutGeometry };

  const geoms = withGeom.map((b) => b.polygon as unknown as VineyardPolygon);
  const groups = groupByContinuity(geoms, 1); // strict 1 m — never bridge a road

  const proposals: MigrationProposal[] = groups.map((idxs, i) => {
    const memberGeoms = idxs.map((k) => geoms[k]);
    const parent = memberGeoms.length === 1 ? memberGeoms[0] : unionPolygons(memberGeoms);
    // pre-flight: run topology with the union as the parent to expose overlaps among members.
    const review = reviewTopology({
      planting: { id: `proposal-${i}`, geometry: parent },
      blocks: idxs.map((k) => ({ id: withGeom[k].id, geometry: geoms[k] })),
    });
    const defects = review.findings.filter((f) => f.severity === "MASK_BREAKING");
    return {
      index: i,
      name: groups.length === 1 ? "Main Planting" : `Planting ${i + 1}`,
      geometry: parent,
      memberBlockIds: idxs.map((k) => withGeom[k].id),
      areaGeodesicM2: geodesicAreaM2(parent),
      defects,
    };
  });

  return { proposals, blocksWithoutGeometry };
}

/**
 * Persist proposed parents (source=DERIVED, reviewStatus=CONFIRMED), link member blocks, and set the
 * all-or-nothing `plantingMigratedAt` gate when the vineyard has no unassigned blocks left. NEVER mutates
 * a source block's polygon. Idempotent: a vineyard already migrated returns its existing areas.
 */
export async function confirmProposedPlantingAreasCore(
  tx: Tx,
  input: { vineyardId: string; proposals: Array<{ name: string; geometry: VineyardPolygon; memberBlockIds: string[] }>; createdBy?: string | null },
): Promise<{ createdIds: string[]; migrated: boolean }> {
  const vineyard = await tx.vineyardPlantingArea.findFirst({ where: { vineyardId: input.vineyardId }, select: { id: true } });
  // If planting areas already exist for this vineyard, treat as already migrated (idempotent).
  const vy = await tx.vineyard.findUnique({ where: { id: input.vineyardId }, select: { plantingMigratedAt: true } });
  if (vy?.plantingMigratedAt && vineyard) {
    const existing = await tx.vineyardPlantingArea.findMany({ where: { vineyardId: input.vineyardId }, select: { id: true } });
    return { createdIds: existing.map((e) => e.id), migrated: true };
  }

  const createdIds: string[] = [];
  for (const p of input.proposals) {
    const { id } = await createPlantingAreaCore(tx, {
      vineyardId: input.vineyardId,
      name: p.name,
      geometry: p.geometry,
      source: "DERIVED",
      reviewStatus: "CONFIRMED",
      createdBy: input.createdBy ?? null,
    });
    createdIds.push(id);
    // link members WITHOUT touching their polygon (only plantingAreaId).
    if (p.memberBlockIds.length > 0) {
      await tx.vineyardBlock.updateMany({
        where: { id: { in: p.memberBlockIds }, vineyardId: input.vineyardId },
        data: { plantingAreaId: id },
      });
    }
  }

  // All-or-nothing gate: mark migrated only if no block in the vineyard is left unassigned.
  const remaining = await tx.vineyardBlock.count({ where: { vineyardId: input.vineyardId, plantingAreaId: null } });
  const migrated = remaining === 0;
  if (migrated) {
    await tx.vineyard.update({ where: { id: input.vineyardId }, data: { plantingMigratedAt: new Date() } });
  }
  return { createdIds, migrated };
}
