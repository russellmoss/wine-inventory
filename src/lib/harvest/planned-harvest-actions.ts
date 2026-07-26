"use server";

// Spray Intelligence S3a — server entry points for planned-harvest editing (Unit 14).
// plannedDate crosses this boundary as an ISO YYYY-MM-DD STRING (KD-13/C6). Actions return
// { ok: false, error } rather than throwing (prod redacts thrown errors) and wrap their body
// in the tenant context.

import { prisma } from "@/lib/prisma";
import { requireReadyUser } from "@/lib/dal";
import { runAsTenant } from "@/lib/tenant/context";
import { resolveActiveTenantId } from "@/lib/tenant/resolve";
import { revalidatePath } from "next/cache";
import {
  currentPlannedHarvestDatesCore,
  retractPlannedHarvestDateCore,
  setPlannedHarvestDateCore,
  type CurrentPlannedHarvestDate,
} from "./planned-harvest-core";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function withTenant<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireReadyUser();
    const tenantId = await resolveActiveTenantId();
    if (!tenantId) return { ok: false, error: "No active organization on your session — sign in to a winery first." };
    const data = await runAsTenant(tenantId, async () => await fn());
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export interface PlannedHarvestBlockRow {
  blockId: string;
  blockLabel: string;
  vineyardName: string;
  open: CurrentPlannedHarvestDate[];
}

/** Every block with its OPEN planned dates for a vintage (plural — split picks, council G4). */
export async function loadPlannedHarvestBoard(vintageYear: number): Promise<ActionResult<PlannedHarvestBlockRow[]>> {
  return withTenant(async () => {
    const [blocks, vineyards] = await Promise.all([
      prisma.vineyardBlock.findMany({ select: { id: true, blockLabel: true, code: true, vineyardId: true }, orderBy: { sortOrder: "asc" } }),
      prisma.vineyard.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const vname = new Map(vineyards.map((v) => [v.id, v.name]));
    const rows: PlannedHarvestBlockRow[] = [];
    for (const b of blocks) {
      if (!vname.has(b.vineyardId)) continue;
      const open = await currentPlannedHarvestDatesCore(b.id, vintageYear);
      rows.push({
        blockId: b.id,
        blockLabel: b.blockLabel?.trim() || b.code?.trim() || b.id,
        vineyardName: vname.get(b.vineyardId)!,
        open,
      });
    }
    return rows;
  });
}

export async function submitPlannedHarvestDate(input: {
  blockId: string;
  vintageYear: number;
  harvestPassLabel?: string;
  plannedDate: string; // ISO YYYY-MM-DD
  reason?: string;
}): Promise<ActionResult<{ version: number; previousDate: string | null }>> {
  const user = await requireReadyUser();
  const result = await withTenant(() =>
    setPlannedHarvestDateCore(
      { userId: user.id ?? null, email: user.email },
      { blockId: input.blockId, vintageYear: input.vintageYear, harvestPassLabel: input.harvestPassLabel, plannedDate: input.plannedDate, reason: input.reason ?? null },
    ),
  );
  if (result.ok) revalidatePath("/vineyards/sprays/planned-harvest");
  return result;
}

export async function submitPlannedHarvestRetraction(input: {
  blockId: string;
  vintageYear: number;
  harvestPassLabel?: string;
  reason?: string;
}): Promise<ActionResult<{ retractedDate: string }>> {
  const user = await requireReadyUser();
  const result = await withTenant(() =>
    retractPlannedHarvestDateCore({ userId: user.id ?? null, email: user.email }, input),
  );
  if (result.ok) revalidatePath("/vineyards/sprays/planned-harvest");
  return result;
}
