"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action } from "@/lib/actions";
import { ActionError } from "@/lib/action-error";
import { executeBottling, deleteBottling, editBottling, type BottlingInput } from "@/lib/bottling/run";
import { assertMandatoryPackaging, MANDATORY_PACKAGING_SELECT } from "@/lib/bottling/mandatory-packaging";

function parseInt10(raw: unknown, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new ActionError(`${label} must be a non-negative whole number.`);
  return n;
}

function parseVintage(raw: unknown): number {
  const y = Number(raw);
  if (!Number.isInteger(y) || y < 1900 || y > 2027) throw new ActionError("Enter a valid vintage year.");
  return y;
}

function parseAbv(raw: unknown): number {
  const a = Number(raw);
  if (!Number.isFinite(a) || a <= 0) throw new ActionError("Enter the wine's alcohol by volume (%) — required for TTB tax classification.");
  return Math.round(a * 100) / 100;
}

/** Plan 056: the packaging BoM is serialized to a JSON hidden field ([{materialId, qty}] in eaches).
 * Malformed entries are dropped; absent/empty ⇒ liquid-only run (unchanged). */
function parsePackaging(raw: unknown): { materialId: string; qty: number }[] | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return undefined;
    const lines = arr
      .map((p) => ({ materialId: String((p as Record<string, unknown>)?.materialId ?? ""), qty: Number((p as Record<string, unknown>)?.qty ?? 0) }))
      .filter((p) => p.materialId && p.qty > 0);
    return lines.length ? lines : undefined;
  } catch {
    return undefined;
  }
}

function parseInput(formData: FormData): BottlingInput {
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(date.getTime())) throw new ActionError("Invalid bottling date.");
  return {
    vesselIds: formData.getAll("vesselIds").map(String).filter(Boolean),
    destinationLocationId: String(formData.get("destinationLocationId") ?? ""),
    skuName: String(formData.get("skuName") ?? "").trim(),
    skuVintage: parseVintage(formData.get("skuVintage")),
    bottlesProduced: parseInt10(formData.get("bottlesProduced"), "Bottles produced"),
    abv: parseAbv(formData.get("abv")),
    date,
    packaging: parsePackaging(formData.get("packaging")),
  };
}

function revalidate() {
  revalidatePath("/bottling");
  revalidatePath("/bulk");
  revalidatePath("/inventory");
}

/** Resolve the consumed packaging materials' name/kind for the mandatory-packaging guard (tenant-scoped). */
function loadPackagingMaterials(ids: string[]) {
  return prisma.cellarMaterial.findMany({ where: { id: { in: ids } }, select: MANDATORY_PACKAGING_SELECT });
}

export const createBottlingRun = action(async ({ actor }, formData: FormData) => {
  const input = parseInput(formData);
  // P0: a bottling run must consume a bottle, a closure (e.g. cork) and a label — server backstop for the
  // client guard (a crafted submit can't slip a corkless run past this).
  await assertMandatoryPackaging(input.packaging, loadPackagingMaterials);
  await executeBottling(input, actor);
  revalidate();
});

export const editBottlingRun = action(async ({ actor }, runId: string, formData: FormData) => {
  if (!runId) throw new ActionError("Missing run id.");
  const input = parseInput(formData);
  await assertMandatoryPackaging(input.packaging, loadPackagingMaterials);
  await editBottling(runId, input, actor);
  revalidate();
});

export const deleteBottlingRun = action(async ({ actor }, runId: string) => {
  if (!runId) throw new ActionError("Missing run id.");
  await deleteBottling(runId, actor);
  revalidate();
});
