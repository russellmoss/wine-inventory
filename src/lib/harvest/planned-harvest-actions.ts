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
import { settleWithCapture } from "@/lib/action-settle";
import { ActionError } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
// D9 vineyard-membership scoping. harvest/actions.ts gates every one of its mutations with
// requireBlockAccess; this sibling module in the SAME domain gated none, which is the inconsistency.
import { requireBlockAccess, currentVineyardScope, narrowVineyardFilter } from "@/lib/vineyard/scope";
import {
  currentPlannedHarvestDatesCore,
  retractPlannedHarvestDateCore,
  setPlannedHarvestDateCore,
  type CurrentPlannedHarvestDate,
} from "./planned-harvest-core";

// Settles through `settleWithCapture`: an expected ActionError comes back verbatim with its code, an
// unexpected one is captured to Sentry and replaced with a generic message rather than leaking
// `e.message` to the browser. `unstable_rethrow` runs first inside the helper, so a redirect from
// `requireReadyUser` stays a redirect (REDIRECT-1).
async function withTenant<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return settleWithCapture(
    async () => {
      await requireReadyUser();
      const tenantId = await resolveActiveTenantId();
      if (!tenantId) {
        throw new ActionError("No active organization on your session — sign in to a winery first.", "FORBIDDEN");
      }
      return runAsTenant(tenantId, async () => await fn());
    },
    { action: "plannedHarvest.withTenant", area: "harvest" },
  );
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
    // D9: filter, don't throw — a manager with a subset of vineyards should see a board with their
    // blocks on it, and one with no memberships sees an empty board (fail closed).
    const { scope } = await currentVineyardScope();
    const only = narrowVineyardFilter(scope, null);
    const [blocks, vineyards] = await Promise.all([
      prisma.vineyardBlock.findMany({ where: only === null ? {} : { vineyardId: { in: only } }, select: { id: true, blockLabel: true, code: true, vineyardId: true }, orderBy: { sortOrder: "asc" } }),
      prisma.vineyard.findMany({ where: only === null ? { isActive: true } : { isActive: true, id: { in: only } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
  const result = await withTenant(async () => {
    // Inside withTenant so a FORBIDDEN denial comes back as { ok:false, error } — this module returns
    // errors as data (see the header); a throw from out here would be redacted to an opaque string.
    await requireBlockAccess(input.blockId);
    return setPlannedHarvestDateCore(
      { userId: user.id ?? null, email: user.email },
      { blockId: input.blockId, vintageYear: input.vintageYear, harvestPassLabel: input.harvestPassLabel, plannedDate: input.plannedDate, reason: input.reason ?? null },
    );
  });
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
  const result = await withTenant(async () => {
    await requireBlockAccess(input.blockId); // inside: a denial must return, not throw
    return retractPlannedHarvestDateCore({ userId: user.id ?? null, email: user.email }, input);
  });
  if (result.ok) revalidatePath("/vineyards/sprays/planned-harvest");
  return result;
}
