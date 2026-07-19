import { ActionError } from "@/lib/action-error";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import { missingRolesForMaterials, type PackagingRole } from "@/lib/bottling/packaging-bom";

// P0 — mandatory-packaging guard. Every bottling run must consume a bottle, a closure (e.g. cork) and a
// label; a run can't ship without all three. This is the server backstop that guards the two real write
// paths — the standalone /bottling action and the work-order BOTTLE task (both of which also mirror it in
// the UI). It classifies each consumed material by its display name/kind (the same signal the pickers use)
// and rejects the run, naming what's missing, before any ledger/COGS write happens. Accepts either the
// RLS-extended `prisma` (standalone action) or an in-flight `tx` (WO completion) so it runs tenant-scoped.

export type MandatoryPackagingLine = { materialId: string; qty: number };

/** A material row the guard needs to classify a role — the fields `materialDisplayName` + the classifier read. */
export type PackagingMaterialRow = {
  name: string;
  kind: string;
  genericName?: string | null;
  brandName?: string | null;
  preferGeneric?: boolean | null;
};

/**
 * Throw an ActionError if the packaging BoM for a bottling run is missing any mandatory role (bottle /
 * closure / label). Only lines with a real material AND a positive quantity count. `loadMaterials` resolves
 * the consumed materials' name/kind (pass a `prisma`- or `tx`-backed reader so it runs tenant-scoped). A
 * no-op-safe read: an empty BoM fails with all three missing (which is the point — you can't bottle nothing).
 */
export async function assertMandatoryPackaging(
  packaging: MandatoryPackagingLine[] | undefined,
  loadMaterials: (ids: string[]) => Promise<PackagingMaterialRow[]>,
): Promise<void> {
  const ids = [...new Set((packaging ?? []).filter((l) => l && l.materialId && l.qty > 0).map((l) => l.materialId))];
  const materials = ids.length ? await loadMaterials(ids) : [];
  const missing: { role: PackagingRole; label: string }[] = missingRolesForMaterials(
    materials.map((m) => ({ name: materialDisplayName(m), kind: m.kind })),
  );
  if (missing.length > 0) {
    throw new ActionError(
      `Bottling needs ${missing.map((m) => m.label).join(", ")} — every bottling run must include a bottle, a closure (e.g. cork) and a label. Add the missing packaging and try again.`,
    );
  }
}

/** The `select` the guard's `loadMaterials` must project (shared so every caller reads the same shape). */
export const MANDATORY_PACKAGING_SELECT = { name: true, kind: true, genericName: true, brandName: true, preferGeneric: true } as const;
