import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { MaterialKind, RateBasis } from "@/lib/cellar/additions-math";
import {
  cleanMaterialName,
  coerceMaterialKind,
  coerceRateBasis,
  normalizeMaterialKey,
} from "@/lib/cellar/material-normalize";

// Script-safe core for the light CellarMaterial catalog (Phase 3). No "use server", no
// server-only, so the addition/fining cores + verification scripts can upsert directly;
// actions.ts wraps the mutating path as a server action for the UI datalist. Mirrors
// fieldnotes/input-actions.ts: dedup by (kind, normalizedKey), audit only on first create.
// Cost + inventory are deferred to Phase 8 (D-scope) — this is name + basis only.

export type CellarMaterialDTO = {
  id: string;
  name: string;
  kind: MaterialKind;
  defaultBasis: RateBasis | null;
  percentActive: number | null;
};

function toDTO(r: {
  id: string;
  name: string;
  kind: string;
  defaultBasis: string | null;
  percentActive: unknown;
}): CellarMaterialDTO {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as MaterialKind,
    defaultBasis: (r.defaultBasis as RateBasis | null) ?? null,
    percentActive: r.percentActive == null ? null : Number(r.percentActive),
  };
}

/** Active materials, ordered by name (optionally filtered by kind) — feeds the picker. */
export async function listMaterials(opts: { kind?: MaterialKind } = {}): Promise<CellarMaterialDTO[]> {
  const rows = await prisma.cellarMaterial.findMany({
    where: { isActive: true, ...(opts.kind ? { kind: opts.kind } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true },
  });
  return rows.map(toDTO);
}

export type UpsertMaterialInput = {
  name: string;
  kind?: string;
  defaultBasis?: string | null;
  percentActive?: number | null;
};

/**
 * Upsert-on-first-use. Sanitizes to a display name + dedup key, then finds-or-creates on
 * (kind, normalizedKey). A dedup hit returns the canonical row (reactivating + backfilling
 * a missing defaultBasis), without re-auditing. Returns the canonical DTO either way.
 */
export async function upsertMaterialCore(
  actor: LedgerActor,
  input: UpsertMaterialInput,
): Promise<CellarMaterialDTO> {
  const name = cleanMaterialName(input.name); // throws on empty
  const normalizedKey = normalizeMaterialKey(input.name);
  const kind = coerceMaterialKind(input.kind);
  const defaultBasis = coerceRateBasis(input.defaultBasis);
  const percentActive =
    input.percentActive == null || !Number.isFinite(input.percentActive) ? null : input.percentActive;

  const existing = await prisma.cellarMaterial.findUnique({
    where: { kind_normalizedKey: { kind, normalizedKey } },
    select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true, isActive: true },
  });

  if (existing) {
    const patch: { isActive?: boolean; defaultBasis?: string } = {};
    if (!existing.isActive) patch.isActive = true;
    if (!existing.defaultBasis && defaultBasis) patch.defaultBasis = defaultBasis; // backfill a missing basis
    if (Object.keys(patch).length > 0) {
      const updated = await prisma.cellarMaterial.update({
        where: { id: existing.id },
        data: patch,
        select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true },
      });
      return toDTO(updated);
    }
    return toDTO(existing);
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.cellarMaterial.create({
      data: { name, normalizedKey, kind, defaultBasis, percentActive },
      select: { id: true, name: true, kind: true, defaultBasis: true, percentActive: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "CellarMaterial",
      entityId: row.id,
      summary: `Added cellar material "${name}" (${kind.toLowerCase()})`,
    });
    return row;
  });
  return toDTO(created);
}
