/**
 * Vineyard Intelligence P1 — planting-area domain cores.
 *
 * Plain server-side module (NOT "use server"): the `*Core` functions are wrapped by the actions in
 * `./actions.ts` and reached from the assistant tool (verify:ai-native). Each mutating core takes the
 * tenant tx client; the action supplies `runInTenantTx` + `writeAudit` around it.
 *
 * Geometry writes go through the P1 GIS layer: validate (`validateVineyardPolygon`) → fingerprint in a
 * pinned frame (`geometry-meta`) → append/close geometry versions (`geometry-version`). The append-only
 * `VineyardGeometryVersion` history is the "never silently rewrite" mechanism (runbook §6 / brief §2.3).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateVineyardPolygon, type VineyardPolygon } from "@/lib/gis/geometry";
import { splitPolygonByLine } from "@/lib/gis/boolean";
import {
  canonicalAnchorFor,
  geometryFingerprint,
  geodesicAreaM2,
  projectedAreaM2,
  type CanonicalAnchor,
} from "@/lib/gis/geometry-meta";
import { planNextVersion, type GeometryTransition } from "@/lib/gis/geometry-version";
import { reviewTopology, type TopologyFinding } from "@/lib/gis/topology";

type Tx = Prisma.TransactionClient;
type Source = "DRAW" | "IMPORT" | "DERIVED";

export class PlantingAreaError extends Error {
  constructor(
    readonly code: "invalid_geometry" | "not_found" | "blade_error",
    message: string,
  ) {
    super(message);
    this.name = "PlantingAreaError";
  }
}

function validateOrThrow(geometry: VineyardPolygon): VineyardPolygon {
  const res = validateVineyardPolygon(geometry);
  if (!res.ok) throw new PlantingAreaError("invalid_geometry", res.message);
  return res.value;
}

function anchorJson(a: CanonicalAnchor): Prisma.InputJsonValue {
  return { epsg: a.epsg, originX: a.originX, originY: a.originY } as Prisma.InputJsonValue;
}
function asJson(g: VineyardPolygon): Prisma.InputJsonValue {
  return g as unknown as Prisma.InputJsonValue;
}

/** Create a planting area (v1) + its opening geometry-version row. Returns the new id. */
export async function createPlantingAreaCore(
  tx: Tx,
  input: { vineyardId: string; name: string; code?: string | null; geometry: VineyardPolygon; source: Source; createdBy?: string | null; reviewStatus?: "PROPOSED" | "CONFIRMED" },
): Promise<{ id: string }> {
  const geom = validateOrThrow(input.geometry);
  const anchor = canonicalAnchorFor(geom);
  const fingerprint = geometryFingerprint(geom, anchor);

  const last = await tx.vineyardPlantingArea.findFirst({
    where: { vineyardId: input.vineyardId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await tx.vineyardPlantingArea.create({
    data: {
      vineyardId: input.vineyardId,
      name: input.name,
      code: input.code ?? null,
      sortOrder,
      geometry: asJson(geom),
      geometryVersion: 1,
      geometryFingerprint: fingerprint,
      canonicalAnchor: anchorJson(anchor),
      source: input.source,
      reviewStatus: input.reviewStatus ?? "PROPOSED",
      areaGeodesicM2: geodesicAreaM2(geom).toFixed(2),
      areaProjectedM2: projectedAreaM2(geom).toFixed(2),
      createdBy: input.createdBy ?? null,
    },
  });

  await tx.vineyardGeometryVersion.create({
    data: {
      subjectType: "PLANTING_AREA",
      subjectId: created.id,
      version: 1,
      geometry: asJson(geom),
      fingerprint,
      canonicalAnchor: anchorJson(anchor),
      reason: "create",
      createdBy: input.createdBy ?? null,
    },
  });
  return { id: created.id };
}

/**
 * Apply an IoU-gated geometry edit to a planting area. NO_OP does nothing; CORRECT_IN_PLACE updates the
 * current version's geometry; NEW_VERSION closes the open row and appends the next. Returns the transition
 * so the action can audit/notify. NOTE: the ACTION must row-lock the subject + carry a stale-write guard
 * (`WHERE geometryVersion = expected`) around this call (council C3/S2) — this core assumes it holds.
 */
export async function updatePlantingGeometryCore(
  tx: Tx,
  input: { plantingAreaId: string; nextGeometry: VineyardPolygon; expectedVersion?: number },
): Promise<{ transition: GeometryTransition["kind"] }> {
  const geom = validateOrThrow(input.nextGeometry);
  const pa = await tx.vineyardPlantingArea.findUnique({ where: { id: input.plantingAreaId } });
  if (!pa) throw new PlantingAreaError("not_found", "Planting area not found.");
  if (input.expectedVersion != null && pa.geometryVersion !== input.expectedVersion) {
    throw new PlantingAreaError("not_found", "Planting area changed since it was loaded (stale edit).");
  }

  const anchor = pa.canonicalAnchor as unknown as CanonicalAnchor;
  const t = planNextVersion({
    current: {
      geometry: pa.geometry as unknown as VineyardPolygon,
      version: pa.geometryVersion,
      anchor,
      fingerprint: pa.geometryFingerprint,
    },
    next: geom,
    subjectId: pa.id,
  });

  if (t.kind === "NO_OP") return { transition: "NO_OP" };

  const now = new Date();
  if (t.kind === "CORRECT_IN_PLACE") {
    await tx.vineyardPlantingArea.update({
      where: { id: pa.id },
      data: {
        geometry: asJson(t.geometry),
        geometryFingerprint: t.fingerprint,
        areaGeodesicM2: t.areaGeodesicM2.toFixed(2),
        areaProjectedM2: projectedAreaM2(t.geometry).toFixed(2),
      },
    });
    await tx.vineyardGeometryVersion.updateMany({
      where: { subjectType: "PLANTING_AREA", subjectId: pa.id, effectiveTo: null },
      data: { geometry: asJson(t.geometry), fingerprint: t.fingerprint },
    });
    return { transition: "CORRECT_IN_PLACE" };
  }

  // NEW_VERSION: close the open row, append the next, advance the subject pointer.
  await tx.vineyardGeometryVersion.updateMany({
    where: { subjectType: "PLANTING_AREA", subjectId: pa.id, effectiveTo: null },
    data: { effectiveTo: now },
  });
  await tx.vineyardGeometryVersion.create({
    data: {
      subjectType: "PLANTING_AREA",
      subjectId: pa.id,
      version: t.version,
      geometry: asJson(t.geometry),
      fingerprint: t.fingerprint,
      canonicalAnchor: anchorJson(t.anchor),
      effectiveFrom: now,
      iouFromPrev: t.iouFromPrev.toFixed(5),
      reason: "boundary change",
    },
  });
  await tx.vineyardPlantingArea.update({
    where: { id: pa.id },
    data: {
      geometry: asJson(t.geometry),
      geometryVersion: t.version,
      geometryFingerprint: t.fingerprint,
      canonicalAnchor: anchorJson(t.anchor),
      effectiveFrom: now,
      areaGeodesicM2: t.areaGeodesicM2.toFixed(2),
      areaProjectedM2: projectedAreaM2(t.geometry).toFixed(2),
    },
  });
  // t.stale is [] in P1; when P2/P4 land, invalidate those dependents here.
  return { transition: "NEW_VERSION" };
}

/** Create ONE block whose geometry equals the planting area (brief §2.2 "this planting is one block"). */
export async function oneBlockFromPlantingCore(
  tx: Tx,
  input: { plantingAreaId: string; blockLabel?: string | null; code?: string | null },
): Promise<{ blockId: string }> {
  const pa = await tx.vineyardPlantingArea.findUnique({ where: { id: input.plantingAreaId } });
  if (!pa) throw new PlantingAreaError("not_found", "Planting area not found.");
  const geom = pa.geometry as unknown as VineyardPolygon;
  const blockId = await createBlockWithGeometry(tx, {
    vineyardId: pa.vineyardId,
    plantingAreaId: pa.id,
    geometry: geom,
    blockLabel: input.blockLabel ?? "Block 1",
    code: input.code ?? null,
  });
  return { blockId };
}

/** Split a planting area into N blocks via a true blade (shared exact edge). Returns the new block ids. */
export async function splitIntoBlocksCore(
  tx: Tx,
  input: { plantingAreaId: string; lineCoords: number[][]; labels?: string[] },
): Promise<{ blockIds: string[] }> {
  const pa = await tx.vineyardPlantingArea.findUnique({ where: { id: input.plantingAreaId } });
  if (!pa) throw new PlantingAreaError("not_found", "Planting area not found.");
  const planting = pa.geometry as unknown as VineyardPolygon;
  let parts: VineyardPolygon[];
  try {
    parts = splitPolygonByLine(planting, input.lineCoords as number[][]);
  } catch (e) {
    throw new PlantingAreaError("blade_error", (e as Error).message);
  }
  const blockIds: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const blockId = await createBlockWithGeometry(tx, {
      vineyardId: pa.vineyardId,
      plantingAreaId: pa.id,
      geometry: parts[i],
      blockLabel: input.labels?.[i] ?? `Block ${i + 1}`,
      code: null,
    });
    blockIds.push(blockId);
  }
  return { blockIds };
}

/** Assign an existing block to a planting area. Warn-only: an outside-parent finding is returned, not thrown. */
export async function assignBlockToPlantingCore(
  tx: Tx,
  input: { blockId: string; plantingAreaId: string },
): Promise<{ warnings: TopologyFinding[] }> {
  const [block, pa] = await Promise.all([
    tx.vineyardBlock.findUnique({ where: { id: input.blockId } }),
    tx.vineyardPlantingArea.findUnique({ where: { id: input.plantingAreaId } }),
  ]);
  if (!block) throw new PlantingAreaError("not_found", "Block not found.");
  if (!pa) throw new PlantingAreaError("not_found", "Planting area not found.");

  await tx.vineyardBlock.update({ where: { id: block.id }, data: { plantingAreaId: pa.id } });

  let warnings: TopologyFinding[] = [];
  const blockGeom = block.polygon as unknown as VineyardPolygon | null;
  if (blockGeom) {
    const review = reviewTopology({
      planting: { id: pa.id, geometry: pa.geometry as unknown as VineyardPolygon },
      blocks: [{ id: block.id, geometry: blockGeom }],
    });
    warnings = review.findings.filter((f) => f.code === "BLOCK_OUTSIDE_PARENT");
  }
  return { warnings };
}

/** Shared block-create that fingerprints + versions the block geometry (subjectType BLOCK). */
async function createBlockWithGeometry(
  tx: Tx,
  input: { vineyardId: string; plantingAreaId: string; geometry: VineyardPolygon; blockLabel: string; code: string | null },
): Promise<string> {
  const geom = validateOrThrow(input.geometry);
  const anchor = canonicalAnchorFor(geom);
  const fingerprint = geometryFingerprint(geom, anchor);

  const last = await tx.vineyardBlock.findFirst({
    where: { vineyardId: input.vineyardId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const block = await tx.vineyardBlock.create({
    data: {
      vineyardId: input.vineyardId,
      plantingAreaId: input.plantingAreaId,
      blockLabel: input.blockLabel,
      code: input.code,
      sortOrder,
      polygon: asJson(geom),
      geometryVersion: 1,
      geometryFingerprint: fingerprint,
    },
  });
  await tx.vineyardGeometryVersion.create({
    data: {
      subjectType: "BLOCK",
      subjectId: block.id,
      version: 1,
      geometry: asJson(geom),
      fingerprint,
      canonicalAnchor: anchorJson(anchor),
      reason: "create",
    },
  });
  return block.id;
}

// ───────────────────────── Read core (assistant-reachable) ─────────────────────────

export type PlantingStructure = {
  vineyardId: string;
  migrated: boolean;
  plantingAreas: Array<{
    id: string;
    name: string;
    reviewStatus: string;
    source: string;
    geometryVersion: number;
    areaGeodesicM2: number | null;
    blockCount: number;
    topology: TopologyFinding[];
  }>;
  unassignedBlocks: Array<{ id: string; label: string | null }>;
};

/**
 * READ: describe a vineyard's planting/block structure for the assistant (Q&A). This is the edge that
 * makes the planting-area cores reachable in verify:ai-native's import graph. Uses the extended prisma
 * (tenant auto-resolved from the request/ALS context).
 */
export async function describePlantingStructureCore(vineyardId: string): Promise<PlantingStructure> {
  const [vineyard, areas, blocks] = await Promise.all([
    prisma.vineyard.findUnique({ where: { id: vineyardId }, select: { plantingMigratedAt: true } }),
    prisma.vineyardPlantingArea.findMany({ where: { vineyardId }, orderBy: { sortOrder: "asc" } }),
    prisma.vineyardBlock.findMany({ where: { vineyardId }, select: { id: true, blockLabel: true, plantingAreaId: true, polygon: true } }),
  ]);

  const plantingAreas = areas.map((pa) => {
    const members = blocks.filter((b) => b.plantingAreaId === pa.id);
    const topology =
      members.length > 0
        ? reviewTopology({
            planting: { id: pa.id, geometry: pa.geometry as unknown as VineyardPolygon },
            blocks: members
              .filter((b) => b.polygon)
              .map((b) => ({ id: b.id, geometry: b.polygon as unknown as VineyardPolygon })),
          }).findings
        : [];
    return {
      id: pa.id,
      name: pa.name,
      reviewStatus: pa.reviewStatus as string,
      source: pa.source as string,
      geometryVersion: pa.geometryVersion,
      areaGeodesicM2: pa.areaGeodesicM2 ? Number(pa.areaGeodesicM2) : null,
      blockCount: members.length,
      topology,
    };
  });

  const unassignedBlocks = blocks.filter((b) => !b.plantingAreaId).map((b) => ({ id: b.id, label: b.blockLabel }));

  return {
    vineyardId,
    migrated: !!vineyard?.plantingMigratedAt,
    plantingAreas,
    unassignedBlocks,
  };
}
