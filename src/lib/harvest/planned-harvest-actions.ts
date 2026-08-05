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
import { unstable_rethrow } from "next/navigation";
// D9 vineyard-membership scoping. harvest/actions.ts gates every one of its mutations with
// requireBlockAccess; this sibling module in the SAME domain gated none, which is the inconsistency.
import { requireBlockAccess, currentVineyardScope, narrowVineyardFilter } from "@/lib/vineyard/scope";
import {
  currentPlannedHarvestDatesCore,
  retractPlannedHarvestDateCore,
  setPlannedHarvestDateCore,
  type CurrentPlannedHarvestDate,
} from "./planned-harvest-core";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ⚠️ `unstable_rethrow(e)` is load-bearing and must stay the FIRST statement in the catch.
// `requireReadyUser()` does NOT return a decision — it calls Next's `redirect()`, which signals by
// THROWING `NEXT_REDIRECT`. Because the gate runs inside this `try`, the catch-all below used to
// swallow that control-flow throw and hand the browser the literal string
// "NEXT_REDIRECT;replace;/login;307;" as `error` — so a user whose session had expired saw that
// gibberish on the planned-harvest board instead of being bounced to /login. `getCurrentUser()` also
// reads `headers()`, whose request-time bailout throws the same way. `unstable_rethrow` re-throws only
// the framework-controlled errors (redirect / permanentRedirect / notFound / dynamic-API bailouts) and
// falls through for genuine app errors, so the `{ ok: false }` contract is unchanged.
// Ref: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md
async function withTenant<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireReadyUser();
    const tenantId = await resolveActiveTenantId();
    if (!tenantId) return { ok: false, error: "No active organization on your session — sign in to a winery first." };
    const data = await runAsTenant(tenantId, async () => await fn());
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
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
