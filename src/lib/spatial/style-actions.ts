"use server";

// VI-P3 — saved NDVI STYLE actions (SpatialStyle): SYSTEM presets + per-VINEYARD saved defaults (Q3; TENANT
// scope deferred). One-off styles ride URL params and are never persisted. READY-USER gated via `action`;
// writes go through the tenant-scoped extended client (RLS + the scope↔vineyardId CHECK enforce correctness).
import { action } from "@/lib/actions";
// D9 vineyard-membership scoping — a VINEYARD-scope style belongs to one vineyard; SYSTEM presets are
// tenant-wide and stay admin-only (see requireSpatialStyleAccess).
import { requireVineyardAccess, requireSpatialStyleAccess } from "@/lib/vineyard/scope";
import { prisma } from "@/lib/prisma";

export type SpatialStylePayload = {
  id: string;
  scope: "SYSTEM" | "VINEYARD";
  vineyardId: string | null;
  name: string;
  mode: string;
  paletteId: string;
  reverse: boolean;
  percentileLow: number | null;
  percentileHigh: number | null;
  fixedMin: number | null;
  fixedMax: number | null;
};

function serialize(r: {
  id: string; scope: string; vineyardId: string | null; name: string; mode: string; paletteId: string;
  reverse: boolean; percentileLow: unknown; percentileHigh: unknown; fixedMin: unknown; fixedMax: unknown;
}): SpatialStylePayload {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r.id, scope: r.scope as "SYSTEM" | "VINEYARD", vineyardId: r.vineyardId, name: r.name, mode: r.mode,
    paletteId: r.paletteId, reverse: r.reverse, percentileLow: num(r.percentileLow), percentileHigh: num(r.percentileHigh),
    fixedMin: num(r.fixedMin), fixedMax: num(r.fixedMax),
  };
}

/** SYSTEM presets + this vineyard's saved styles (SYSTEM first, then vineyard, each alphabetical). */
export const listSpatialStylesAction = action(async (_ctx, vineyardId: string) => {
  await requireVineyardAccess(vineyardId);
  const rows = await prisma.spatialStyle.findMany({
    where: { metric: "NDVI", OR: [{ scope: "SYSTEM" }, { scope: "VINEYARD", vineyardId }] },
    orderBy: [{ scope: "asc" }, { name: "asc" }],
  });
  return { styles: rows.map(serialize) };
});

export type SaveVineyardStyleInput = {
  vineyardId: string;
  name: string;
  mode: string;
  paletteId: string;
  reverse: boolean;
  percentileLow?: number | null;
  percentileHigh?: number | null;
  fixedMin?: number | null;
  fixedMax?: number | null;
};

/** Save (or overwrite) a per-vineyard NDVI style. Upsert on the partial unique (tenant, vineyard, metric, name). */
export const saveVineyardStyleAction = action(async ({ actor }, input: SaveVineyardStyleInput) => {
  await requireVineyardAccess(input.vineyardId);
  const name = input.name.trim();
  if (!name) throw new Error("A style needs a name.");
  const data = {
    scope: "VINEYARD" as const,
    vineyardId: input.vineyardId,
    metric: "NDVI" as const,
    name,
    mode: input.mode,
    paletteId: input.paletteId,
    reverse: input.reverse,
    percentileLow: input.percentileLow ?? null,
    percentileHigh: input.percentileHigh ?? null,
    fixedMin: input.fixedMin ?? null,
    fixedMax: input.fixedMax ?? null,
    createdBy: actor.actorUserId,
  };
  // Partial-unique target → find-then-write (Prisma upsert can't target a filtered index).
  const existing = await prisma.spatialStyle.findFirst({ where: { scope: "VINEYARD", vineyardId: input.vineyardId, metric: "NDVI", name } });
  const row = existing
    ? await prisma.spatialStyle.update({ where: { id: existing.id }, data })
    : await prisma.spatialStyle.create({ data });
  return { style: serialize(row) };
});

/** Delete a saved style (a VINEYARD one; SYSTEM presets are not user-deletable here). */
export const deleteSpatialStyleAction = action(async (_ctx, id: string) => {
  const row = await prisma.spatialStyle.findUnique({ where: { id } });
  if (!row) return { deleted: false };
  // Scope-check only once we know the row exists, so a probe cannot distinguish "not yours" from
  // "no such id" (both already return/throw indistinguishably for a missing row).
  await requireSpatialStyleAccess(id);
  if (row.scope === "SYSTEM") throw new Error("System presets can't be deleted.");
  await prisma.spatialStyle.delete({ where: { id } });
  return { deleted: true };
});
