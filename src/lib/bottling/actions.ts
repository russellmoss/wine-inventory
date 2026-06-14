"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { ActionError } from "@/lib/action-error";
import { executeBottling, deleteBottling, editBottling, type BottlingInput } from "@/lib/bottling/run";

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

function parseInput(formData: FormData): BottlingInput {
  const dateStr = String(formData.get("date") ?? "");
  const date = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(date.getTime())) throw new ActionError("Invalid bottling date.");
  return {
    vesselId: String(formData.get("vesselId") ?? ""),
    destinationLocationId: String(formData.get("destinationLocationId") ?? ""),
    skuName: String(formData.get("skuName") ?? "").trim(),
    skuVintage: parseVintage(formData.get("skuVintage")),
    bottlesProduced: parseInt10(formData.get("bottlesProduced"), "Bottles produced"),
    date,
  };
}

function revalidate() {
  revalidatePath("/bottling");
  revalidatePath("/bulk");
  revalidatePath("/inventory");
}

export const createBottlingRun = action(async ({ actor }, formData: FormData) => {
  await executeBottling(parseInput(formData), actor);
  revalidate();
});

export const editBottlingRun = action(async ({ actor }, runId: string, formData: FormData) => {
  if (!runId) throw new ActionError("Missing run id.");
  await editBottling(runId, parseInput(formData), actor);
  revalidate();
});

export const deleteBottlingRun = action(async ({ actor }, runId: string) => {
  if (!runId) throw new ActionError("Missing run id.");
  await deleteBottling(runId, actor);
  revalidate();
});
