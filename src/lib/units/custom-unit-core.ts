import { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { resolveUnit, canonicalUnitFor, type MeasureDimension } from "@/lib/units/measure";

// Plan 075: the data layer for user-defined units. A custom unit is a { dimension, perCanonical } row — the
// same shape the pure engine (src/lib/units/measure.ts) uses for a built-in. Cores return a discriminated
// result ({ok:false, error}) rather than throwing ActionError — a thrown ActionError is redacted to an opaque
// string in prod, so the review UI would show a useless message. Custom units feed cost math, so validation is
// strict: a positive finite factor, a real dimension, no shadowing a built-in.

export const MAX_UNIT_NAME = 32;

const CU_SELECT = { id: true, name: true, normalizedName: true, dimension: true, perCanonical: true, label: true } as const;

export type CustomUnitRow = {
  id: string;
  name: string;
  normalizedName: string;
  dimension: MeasureDimension;
  perCanonical: number;
  label: string | null;
};

export type CreateCustomUnitInput = {
  name: string;
  dimension: string; // validated to MeasureDimension
  /** canonical base units (g / mL / count) per 1 of this unit; must be finite and > 0. */
  perCanonical: number;
  label?: string | null;
};

export type CreateCustomUnitResult = { ok: true; unit: CustomUnitRow } | { ok: false; error: string };

/** Lowercased/trimmed lookup + de-dupe key (mirrors how the engine's `extra` map is keyed). */
export function normalizeUnitName(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

function toRow(r: { id: string; name: string; normalizedName: string; dimension: string; perCanonical: Prisma.Decimal; label: string | null }): CustomUnitRow {
  return { id: r.id, name: r.name, normalizedName: r.normalizedName, dimension: r.dimension as MeasureDimension, perCanonical: Number(r.perCanonical), label: r.label };
}

const isP2002 = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Create a custom unit for the current tenant. Validates name (non-empty, ≤ MAX_UNIT_NAME), dimension, and a
 * positive finite factor, and REJECTS any name that already resolves to a built-in or alias (a unit named "kg"
 * would silently corrupt every conversion). Per-tenant uniqueness is enforced by the DB @@unique; we pre-check
 * for a friendly message and still catch the P2002 race. Reuses an injected tx (assistant/UI batch) or opens
 * its own. The tenant extension auto-injects tenantId on create.
 */
export async function createCustomUnitCore(
  actor: LedgerActor,
  input: CreateCustomUnitInput,
  injectedTx?: Prisma.TransactionClient,
): Promise<CreateCustomUnitResult> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "Enter a name for the unit." };
  if (name.length > MAX_UNIT_NAME) return { ok: false, error: `Unit name is too long (max ${MAX_UNIT_NAME} characters).` };

  const dimension = input.dimension;
  if (dimension !== "mass" && dimension !== "volume" && dimension !== "count") {
    return { ok: false, error: "Choose whether the unit measures weight, volume, or count." };
  }

  const perCanonical = Number(input.perCanonical);
  if (!Number.isFinite(perCanonical) || perCanonical <= 0) {
    return { ok: false, error: "The conversion factor must be a positive number (how many base units one of this unit is worth)." };
  }

  const normalizedName = normalizeUnitName(name);
  // A custom unit may never shadow a built-in unit or alias (case-insensitive) — that would silently change
  // what "kg"/"g"/"gal" mean for this tenant and corrupt cost math.
  if (resolveUnit(name) != null || resolveUnit(normalizedName) != null) {
    return { ok: false, error: `"${name}" is already a standard unit — pick a different name.` };
  }

  const label = input.label?.trim() || null;

  const body = async (tx: Prisma.TransactionClient): Promise<CreateCustomUnitResult> => {
    const clash = await tx.customUnit.findFirst({ where: { normalizedName }, select: { id: true } });
    if (clash) return { ok: false, error: `You already have a unit called "${name}".` };
    try {
      const row = await tx.customUnit.create({
        data: { name, normalizedName, dimension, perCanonical, label, createdBy: actor.actorUserId },
        select: CU_SELECT,
      });
      await writeAudit(tx, {
        ...actor,
        action: "CREATE",
        entityType: "CustomUnit",
        entityId: row.id,
        summary: `Created custom unit "${name}" (${dimension}: 1 ${name} = ${perCanonical} ${canonicalUnitFor(dimension)})`,
      });
      return { ok: true, unit: toRow(row) };
    } catch (e) {
      if (isP2002(e)) return { ok: false, error: `You already have a unit called "${name}".` };
      throw e;
    }
  };

  return injectedTx ? body(injectedTx) : runInTenantTx(body);
}

/** List the current tenant's custom units (name-sorted). Reuses an injected tx or opens its own. */
export async function listCustomUnitsCore(injectedTx?: Prisma.TransactionClient): Promise<CustomUnitRow[]> {
  const run = async (tx: Prisma.TransactionClient) =>
    (await tx.customUnit.findMany({ orderBy: { name: "asc" }, select: CU_SELECT })).map(toRow);
  return injectedTx ? run(injectedTx) : runInTenantTx(run);
}
