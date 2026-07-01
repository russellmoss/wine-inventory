"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { action, ActionError, getActionUser } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { isValidHex } from "@/lib/vineyard/colors";
import { ftToM, toCanonicalSpacing, type Unit } from "@/lib/vineyard/units";
import { serializeBlock, serializeDetail, type VineyardDetailPayload } from "@/lib/vineyard/data";
import { normalizeToken } from "@/lib/lot/code";

const PATH = "/reference";

/**
 * Everything the vineyard modal needs in one round-trip, fully serialized (no
 * Decimals cross the boundary). Lazy-loaded per vineyard on modal open. Lives
 * in this "use server" module so it can be called from a client component
 * without dragging server-only deps into the client bundle.
 */
export async function loadVineyardDetail(vineyardId: string): Promise<VineyardDetailPayload> {
  await getActionUser();
  const [detail, blocks] = await Promise.all([
    prisma.vineyardDetail.findUnique({ where: { vineyardId } }),
    prisma.vineyardBlock.findMany({
      where: { vineyardId },
      orderBy: { sortOrder: "asc" },
      include: {
        variety: { select: { id: true, name: true, color: true } },
        subblocks: { orderBy: { sortOrder: "asc" }, select: { id: true, code: true, label: true, sortOrder: true } },
      },
    }),
  ]);
  return {
    detail: detail ? serializeDetail(detail) : null,
    blocks: blocks.map(serializeBlock),
  };
}

// ── Parsing helpers (everything optional; validate only when present) ──────

function optStr(v: FormDataEntryValue | null, max = 200): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  if (s.length > max) throw new ActionError("That value is too long.");
  return s;
}

function optInt(
  v: FormDataEntryValue | null,
  label: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ActionError(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

function optFloat(
  v: FormDataEntryValue | null,
  label: string,
  { min, max }: { min?: number; max?: number } = {},
): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new ActionError(`${label} must be a number.`);
  if (min != null && n < min) throw new ActionError(`${label} must be at least ${min}.`);
  if (max != null && n > max) throw new ActionError(`${label} must be at most ${max}.`);
  return n;
}

function optColor(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  if (!isValidHex(s)) throw new ActionError("That isn't a valid color.");
  return s;
}

function readUnit(formData: FormData): Unit {
  return formData.get("unit") === "metric" ? "metric" : "imperial";
}

type BlockData = {
  blockLabel: string | null;
  numRows: number | null;
  rowSpacingM: number | null;
  vineSpacingM: number | null;
  varietyId: string | null;
  clone: string | null;
  rootstock: string | null;
  vineCount: number | null;
  yearPlanted: number | null;
  irrigated: boolean | null;
  color: string | null;
};

/**
 * Parse a block form into canonical (metric) data. Shared by create + update so
 * the two can't drift. Spacing is entered in the active unit and stored in meters.
 */
function parseBlockForm(formData: FormData, unit: Unit): BlockData {
  const rowSpacing = optFloat(formData.get("rowSpacing"), "Row spacing", { min: 0 });
  const vineSpacing = optFloat(formData.get("vineSpacing"), "Vine spacing", { min: 0 });
  const irrigatedRaw = String(formData.get("irrigated") ?? "").trim();
  return {
    blockLabel: optStr(formData.get("blockLabel"), 80),
    numRows: optInt(formData.get("numRows"), "Number of rows", { max: 100000 }),
    rowSpacingM: toCanonicalSpacing(rowSpacing, unit),
    vineSpacingM: toCanonicalSpacing(vineSpacing, unit),
    varietyId: optStr(formData.get("varietyId"), 40),
    clone: optStr(formData.get("clone"), 80),
    rootstock: optStr(formData.get("rootstock"), 80),
    vineCount: optInt(formData.get("vineCount"), "Number of vines", { max: 100000000 }),
    yearPlanted: optInt(formData.get("yearPlanted"), "Year planted", { min: 1800, max: 2100 }),
    irrigated: irrigatedRaw === "" ? null : irrigatedRaw === "yes",
    color: optColor(formData.get("color")),
  };
}

async function assertVarietyExists(varietyId: string | null) {
  if (!varietyId) return;
  const v = await prisma.variety.findUnique({ where: { id: varietyId }, select: { id: true } });
  if (!v) throw new ActionError("That variety no longer exists.");
}

// ── GeoJSON polygon validation (do not trust the client) ──────────────────

const MAX_POLYGON_BYTES = 64 * 1024;
const MAX_POLYGON_VERTICES = 2000;

function validatePolygon(geojson: unknown): void {
  if (JSON.stringify(geojson).length > MAX_POLYGON_BYTES) {
    throw new ActionError("That shape is too large to save.");
  }
  const g = geojson as { type?: unknown; coordinates?: unknown };
  if (!g || g.type !== "Polygon" || !Array.isArray(g.coordinates)) {
    throw new ActionError("Invalid polygon geometry.");
  }
  let vertices = 0;
  for (const ring of g.coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new ActionError("A polygon ring needs at least 4 points.");
    }
    for (const pos of ring) {
      if (!Array.isArray(pos) || pos.length < 2) throw new ActionError("Invalid polygon point.");
      const [lng, lat] = pos as number[];
      if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat)) {
        throw new ActionError("Polygon points must be numbers.");
      }
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new ActionError("Polygon points are out of range.");
      }
      vertices++;
    }
  }
  if (vertices > MAX_POLYGON_VERTICES) throw new ActionError("That shape has too many points.");
}

// ── Detail upsert ─────────────────────────────────────────────────────────

export const upsertVineyardDetail = action(
  async ({ actor }, vineyardId: string, formData: FormData) => {
    const vineyard = await prisma.vineyard.findUnique({ where: { id: vineyardId } });
    if (!vineyard) throw new ActionError("Vineyard not found.");

    const unit = readUnit(formData);
    const gpsLat = optFloat(formData.get("gpsLat"), "Latitude", { min: -90, max: 90 });
    const gpsLng = optFloat(formData.get("gpsLng"), "Longitude", { min: -180, max: 180 });
    const elevationRaw = optFloat(formData.get("elevation"), "Elevation", { min: 0 });
    const elevationM = elevationRaw == null ? null : unit === "metric" ? elevationRaw : ftToM(elevationRaw);
    const soilType = optStr(formData.get("soilType"), 120);
    const manager = optStr(formData.get("manager"), 120);

    const data = { gpsLat, gpsLng, elevationM, soilType, manager, defaultUnit: unit };

    const before = await prisma.vineyardDetail.findUnique({ where: { vineyardId } });
    await runInTenantTx(async (tx) => {
      await tx.vineyardDetail.upsert({
        where: { vineyardId },
        create: { vineyardId, ...data },
        update: data,
      });
      const beforeForDiff = before
        ? {
            gpsLat: before.gpsLat?.toString() ?? null,
            gpsLng: before.gpsLng?.toString() ?? null,
            elevationM: before.elevationM?.toString() ?? null,
            soilType: before.soilType,
            manager: before.manager,
            defaultUnit: before.defaultUnit,
          }
        : null;
      const afterForDiff = {
        gpsLat: gpsLat?.toString() ?? null,
        gpsLng: gpsLng?.toString() ?? null,
        elevationM: elevationM?.toString() ?? null,
        soilType,
        manager,
        defaultUnit: unit,
      };
      await writeAudit(tx, {
        ...actor,
        action: before ? "UPDATE" : "CREATE",
        entityType: "VineyardDetail",
        entityId: vineyardId,
        changes: diff(beforeForDiff, afterForDiff),
        summary: summarize(before ? "UPDATE" : "CREATE", "VineyardDetail", {
          label: vineyard.name,
          changes: diff(beforeForDiff, afterForDiff),
        }),
      });
    });
    revalidatePath(PATH);
  },
);

// ── Block CRUD ────────────────────────────────────────────────────────────

export const createBlock = action(async ({ actor }, vineyardId: string, formData: FormData) => {
  const vineyard = await prisma.vineyard.findUnique({ where: { id: vineyardId } });
  if (!vineyard) throw new ActionError("Vineyard not found.");
  const data = parseBlockForm(formData, readUnit(formData));
  await assertVarietyExists(data.varietyId);

  const last = await prisma.vineyardBlock.findFirst({
    where: { vineyardId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  await runInTenantTx(async (tx) => {
    const created = await tx.vineyardBlock.create({ data: { vineyardId, sortOrder, ...data } });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "VineyardBlock",
      entityId: created.id,
      changes: diff(null, { ...data, vineyardId }),
      summary: summarize("CREATE", "VineyardBlock", { label: data.blockLabel ?? vineyard.name }),
    });
  });
  revalidatePath(PATH);
});

export const updateBlock = action(async ({ actor }, blockId: string, formData: FormData) => {
  const before = await prisma.vineyardBlock.findUnique({ where: { id: blockId } });
  if (!before) throw new ActionError("Block not found.");
  const data = parseBlockForm(formData, readUnit(formData));
  await assertVarietyExists(data.varietyId);

  const beforeForDiff = {
    blockLabel: before.blockLabel,
    numRows: before.numRows,
    rowSpacingM: before.rowSpacingM?.toString() ?? null,
    vineSpacingM: before.vineSpacingM?.toString() ?? null,
    varietyId: before.varietyId,
    clone: before.clone,
    rootstock: before.rootstock,
    vineCount: before.vineCount,
    yearPlanted: before.yearPlanted,
    irrigated: before.irrigated,
    color: before.color,
  };
  const afterForDiff = {
    ...data,
    rowSpacingM: data.rowSpacingM?.toString() ?? null,
    vineSpacingM: data.vineSpacingM?.toString() ?? null,
  };

  await runInTenantTx(async (tx) => {
    await tx.vineyardBlock.update({ where: { id: blockId }, data });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VineyardBlock",
      entityId: blockId,
      changes: diff(beforeForDiff, afterForDiff),
      summary: summarize("UPDATE", "VineyardBlock", {
        label: data.blockLabel ?? before.blockLabel ?? "block",
        changes: diff(beforeForDiff, afterForDiff),
      }),
    });
  });
  revalidatePath(PATH);
});

export const deleteBlock = action(async ({ actor }, blockId: string) => {
  const before = await prisma.vineyardBlock.findUnique({ where: { id: blockId } });
  if (!before) throw new ActionError("Block not found.");
  await runInTenantTx(async (tx) => {
    await tx.vineyardBlock.delete({ where: { id: blockId } });
    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "VineyardBlock",
      entityId: blockId,
      changes: diff({ blockLabel: before.blockLabel }, null),
      summary: summarize("DELETE", "VineyardBlock", { label: before.blockLabel ?? "block" }),
    });
  });
  revalidatePath(PATH);
});

// ── Subblock CRUD (geographic sub-divisions; feed the SUBBLOCK slot of a lot code) ──

export const createSubblock = action(async ({ actor }, blockId: string, formData: FormData) => {
  const block = await prisma.vineyardBlock.findUnique({ where: { id: blockId }, select: { id: true } });
  if (!block) throw new ActionError("Block not found.");
  const code = normalizeToken(formData.get("code"));
  if (!code) throw new ActionError("Enter a subblock code (letters or numbers).");
  if (code.length > 8) throw new ActionError("Subblock code is too long.");
  const label = String(formData.get("label") ?? "").trim() || null;
  const exists = await prisma.vineyardSubblock.findFirst({
    where: { blockId, code },
    select: { id: true },
  });
  if (exists) throw new ActionError(`Subblock "${code}" already exists on this block.`, "CONFLICT");
  const last = await prisma.vineyardSubblock.findFirst({
    where: { blockId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;
  await runInTenantTx(async (tx) => {
    const created = await tx.vineyardSubblock.create({ data: { blockId, code, label, sortOrder } });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "VineyardSubblock",
      entityId: created.id,
      changes: diff(null, { blockId, code, label }),
      summary: summarize("CREATE", "VineyardSubblock", { label: code }),
    });
  });
  revalidatePath(PATH);
});

export const deleteSubblock = action(async ({ actor }, id: string) => {
  const before = await prisma.vineyardSubblock.findUnique({ where: { id } });
  if (!before) throw new ActionError("Subblock not found.");
  await runInTenantTx(async (tx) => {
    await tx.vineyardSubblock.delete({ where: { id } });
    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "VineyardSubblock",
      entityId: id,
      changes: diff({ code: before.code }, null),
      summary: summarize("DELETE", "VineyardSubblock", { label: before.code }),
    });
  });
  revalidatePath(PATH);
});

/** Store, replace, or (with null) clear a block's polygon. One audit row per shape. */
export const saveBlockPolygon = action(
  async ({ actor }, blockId: string, geojson: unknown | null) => {
    const before = await prisma.vineyardBlock.findUnique({ where: { id: blockId } });
    if (!before) throw new ActionError("Block not found.");
    if (geojson != null) validatePolygon(geojson);
    const nextPolygon =
      geojson == null ? Prisma.DbNull : (geojson as Prisma.InputJsonValue);
    await runInTenantTx(async (tx) => {
      await tx.vineyardBlock.update({ where: { id: blockId }, data: { polygon: nextPolygon } });
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "VineyardBlock",
        entityId: blockId,
        changes: diff(
          { polygon: before.polygon ? "set" : "none" },
          { polygon: geojson ? "set" : "none" },
        ),
        summary: summarize("UPDATE", "VineyardBlock", {
          label: before.blockLabel ?? "block",
          changes: { polygon: { from: before.polygon ? "shape" : "—", to: geojson ? "shape" : "—" } },
        }),
      });
    });
    revalidatePath(PATH);
  },
);

/** Set or clear a block's polygon color override. */
export const setBlockColor = action(async ({ actor }, blockId: string, color: string | null) => {
  const next = color == null || color === "" ? null : color.trim();
  if (next !== null && !isValidHex(next)) throw new ActionError("That isn't a valid color.");
  const before = await prisma.vineyardBlock.findUnique({ where: { id: blockId } });
  if (!before) throw new ActionError("Block not found.");
  await runInTenantTx(async (tx) => {
    await tx.vineyardBlock.update({ where: { id: blockId }, data: { color: next } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VineyardBlock",
      entityId: blockId,
      changes: diff({ color: before.color }, { color: next }),
      summary: summarize("UPDATE", "VineyardBlock", {
        label: before.blockLabel ?? "block",
        changes: diff({ color: before.color }, { color: next }),
      }),
    });
  });
  revalidatePath(PATH);
});
