"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";
import type { VineyardPolygon } from "@/lib/gis/geometry";
import type { MigrationProposal } from "./migration-core";
import { proposePlantingAreasFromBlocksCore, confirmProposedPlantingAreasCore } from "./migration-core";
import {
  createPlantingAreaCore,
  updatePlantingGeometryCore,
  oneBlockFromPlantingCore,
  splitIntoBlocksCore,
  assignBlockToPlantingCore,
  describePlantingStructureCore,
  PlantingAreaError,
  type PlantingStructure,
} from "./planting-area-core";

const PATH = "/vineyards";

function toActionError<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((e) => {
    if (e instanceof PlantingAreaError) throw new ActionError(e.message);
    throw e;
  });
}

/** Create a planting area (drawn or imported). */
export const createPlantingArea = action(
  async ({ actor }, input: { vineyardId: string; name: string; geometry: VineyardPolygon; source?: "DRAW" | "IMPORT"; code?: string }) => {
    const vineyard = await prisma.vineyard.findUnique({ where: { id: input.vineyardId }, select: { id: true, name: true } });
    if (!vineyard) throw new ActionError("Vineyard not found.");
    const result = await toActionError(() =>
      runInTenantTx(async (tx) => {
        const created = await createPlantingAreaCore(tx, {
          vineyardId: input.vineyardId,
          name: input.name,
          code: input.code ?? null,
          geometry: input.geometry,
          source: input.source ?? "DRAW",
          createdBy: actor.actorEmail,
        });
        await writeAudit(tx, {
          ...actor,
          action: "CREATE",
          entityType: "VineyardPlantingArea",
          entityId: created.id,
          changes: diff(null, { vineyardId: input.vineyardId, name: input.name, source: input.source ?? "DRAW" }),
          summary: summarize("CREATE", "VineyardPlantingArea", { label: input.name }),
        });
        return created;
      }),
    );
    revalidatePath(PATH);
    return result;
  },
);

/** Edit a planting area's geometry (IoU-gated). Row-locks the subject + carries a stale-write guard. */
export const updatePlantingGeometry = action(
  async ({ actor }, input: { plantingAreaId: string; geometry: VineyardPolygon; expectedVersion?: number }) => {
    const before = await prisma.vineyardPlantingArea.findUnique({ where: { id: input.plantingAreaId }, select: { id: true, name: true, geometryVersion: true } });
    if (!before) throw new ActionError("Planting area not found.");
    const result = await toActionError(() =>
      runInTenantTx(async (tx) => {
        // Row-lock the subject so concurrent edits serialize (council C3/S2/S3).
        await tx.$executeRaw`SELECT "id" FROM "vineyard_planting_area" WHERE "id" = ${input.plantingAreaId} FOR UPDATE`;
        const out = await updatePlantingGeometryCore(tx, {
          plantingAreaId: input.plantingAreaId,
          nextGeometry: input.geometry,
          expectedVersion: input.expectedVersion,
        });
        if (out.transition !== "NO_OP") {
          await writeAudit(tx, {
            ...actor,
            action: "UPDATE",
            entityType: "VineyardPlantingArea",
            entityId: input.plantingAreaId,
            changes: diff({ transition: null }, { transition: out.transition }),
            summary: summarize("UPDATE", "VineyardPlantingArea", { label: `${before.name} (${out.transition})` }),
          });
        }
        return out;
      }),
    );
    revalidatePath(PATH);
    return result;
  },
);

/** Create one block from the whole planting geometry. */
export const oneBlockFromPlanting = action(
  async ({ actor }, input: { plantingAreaId: string; blockLabel?: string; code?: string }) => {
    const result = await toActionError(() =>
      runInTenantTx(async (tx) => {
        const out = await oneBlockFromPlantingCore(tx, { plantingAreaId: input.plantingAreaId, blockLabel: input.blockLabel, code: input.code });
        await writeAudit(tx, {
          ...actor,
          action: "CREATE",
          entityType: "VineyardBlock",
          entityId: out.blockId,
          changes: diff(null, { plantingAreaId: input.plantingAreaId, from: "planting" }),
          summary: summarize("CREATE", "VineyardBlock", { label: input.blockLabel ?? "Block 1" }),
        });
        return out;
      }),
    );
    revalidatePath(PATH);
    return result;
  },
);

/** Split a planting area into N blocks via a true blade. */
export const splitPlantingIntoBlocks = action(
  async ({ actor }, input: { plantingAreaId: string; lineCoords: number[][]; labels?: string[] }) => {
    const result = await toActionError(() =>
      runInTenantTx(async (tx) => {
        const out = await splitIntoBlocksCore(tx, { plantingAreaId: input.plantingAreaId, lineCoords: input.lineCoords, labels: input.labels });
        await writeAudit(tx, {
          ...actor,
          action: "CREATE",
          entityType: "VineyardBlock",
          entityId: out.blockIds[0] ?? input.plantingAreaId,
          changes: diff(null, { plantingAreaId: input.plantingAreaId, split: out.blockIds.length }),
          summary: summarize("CREATE", "VineyardBlock", { label: `split into ${out.blockIds.length} blocks` }),
        });
        return out;
      }),
    );
    revalidatePath(PATH);
    return result;
  },
);

/** Assign a legacy block to a planting area (warn-only on outside-parent). */
export const assignBlockToPlanting = action(
  async ({ actor }, input: { blockId: string; plantingAreaId: string }) => {
    const result = await toActionError(() =>
      runInTenantTx(async (tx) => {
        const out = await assignBlockToPlantingCore(tx, input);
        await writeAudit(tx, {
          ...actor,
          action: "UPDATE",
          entityType: "VineyardBlock",
          entityId: input.blockId,
          changes: diff({ plantingAreaId: null }, { plantingAreaId: input.plantingAreaId }),
          summary: summarize("UPDATE", "VineyardBlock", { label: "assigned to planting" }),
        });
        return out;
      }),
    );
    revalidatePath(PATH);
    return result;
  },
);

/** READ: propose migration parents from existing block polygons (review before confirm). */
export const proposePlantingMigration = action(
  async (_ctx, vineyardId: string): Promise<{ proposals: MigrationProposal[]; blocksWithoutGeometry: string[] }> => {
    return proposePlantingAreasFromBlocksCore(vineyardId);
  },
);

/** Confirm migration (all-or-nothing per vineyard). Never mutates source block polygons. */
export const confirmPlantingMigration = action(
  async ({ actor }, input: { vineyardId: string; proposals: Array<{ name: string; geometry: VineyardPolygon; memberBlockIds: string[] }> }) => {
    const result = await toActionError(() =>
      runInTenantTx(async (tx) => {
        const out = await confirmProposedPlantingAreasCore(tx, { vineyardId: input.vineyardId, proposals: input.proposals, createdBy: actor.actorEmail });
        await writeAudit(tx, {
          ...actor,
          action: "CREATE",
          entityType: "VineyardPlantingArea",
          entityId: out.createdIds[0] ?? input.vineyardId,
          changes: diff(null, { migratedFrom: "blocks", created: out.createdIds.length, migrated: out.migrated }),
          summary: summarize("CREATE", "VineyardPlantingArea", { label: `migrated ${out.createdIds.length} planting area(s)` }),
        });
        return out;
      }),
    );
    revalidatePath(PATH);
    return result;
  },
);

/** READ: planting/block structure for a vineyard (also the assistant tool's core). */
export const getPlantingStructure = action(async (_ctx, vineyardId: string): Promise<PlantingStructure> => {
  return describePlantingStructureCore(vineyardId);
});

export type PlantingAreaMapRow = {
  id: string;
  name: string;
  geometry: VineyardPolygon;
  reviewStatus: string;
  source: string;
  geometryVersion: number;
  areaGeodesicM2: number | null;
};

/** READ: serialized planting areas (with geometry) for the map overlay. */
export const loadPlantingAreasForMap = action(async (_ctx, vineyardId: string): Promise<PlantingAreaMapRow[]> => {
  const rows = await prisma.vineyardPlantingArea.findMany({ where: { vineyardId }, orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    geometry: r.geometry as unknown as VineyardPolygon,
    reviewStatus: r.reviewStatus as string,
    source: r.source as string,
    geometryVersion: r.geometryVersion,
    areaGeodesicM2: r.areaGeodesicM2 ? Number(r.areaGeodesicM2) : null,
  }));
});
