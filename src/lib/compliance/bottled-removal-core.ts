import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { runInTenantTx } from "@/lib/tenant/tx";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Unit 4 (§B complement) — remove BOTTLED wine from finished-goods inventory with a disposition, so
// the §B removal lines (B8/B11/B12/B13/B14/B18) are accurate instead of everything reading as B8.
//
// Bottled wine already left the tank at bottling (A13 → B2); its removals come out of INVENTORY, not
// the vessel ledger. So this decrements the BottledInventory count AND writes a negative BOTTLED_WINE
// StockMovement tagged with the disposition (the fold reads that tag → the right §B line). It does
// NOT touch the bulk ledger. This is also the exact path a Commerce7 depletion webhook would call.

export const BOTTLED_REMOVAL_DISPOSITIONS = ["TAXPAID", "TASTING", "EXPORT", "FAMILY_USE", "TESTING", "BREAKAGE"] as const;
export type BottledRemovalDisposition = (typeof BOTTLED_REMOVAL_DISPOSITIONS)[number];

export const BOTTLED_REMOVAL_LABELS: Record<BottledRemovalDisposition, string> = {
  TAXPAID: "Removed taxpaid (sold)",
  TASTING: "Used for tasting",
  EXPORT: "Removed for export",
  FAMILY_USE: "Removed for family use",
  TESTING: "Used for testing",
  BREAKAGE: "Breakage",
};

export const isBottledRemovalDisposition = (v: string): v is BottledRemovalDisposition =>
  (BOTTLED_REMOVAL_DISPOSITIONS as readonly string[]).includes(v);

export type BottledRemovalInput = {
  wineSkuId: string;
  locationId: string;
  bottles: number;
  disposition: BottledRemovalDisposition;
  note?: string | null;
};

export type BottledRemovalResult = { movementId: string; message: string };

export async function removeBottledCore(actor: LedgerActor, input: BottledRemovalInput): Promise<BottledRemovalResult> {
  if (!Number.isInteger(input.bottles) || input.bottles < 1) throw new ActionError("Enter a whole number of bottles (≥1).");
  if (!isBottledRemovalDisposition(input.disposition)) throw new ActionError("Unknown bottled disposition.");

  return runInTenantTx(async (tx) => {
    const inv = await tx.bottledInventory.findFirst({
      where: { wineSkuId: input.wineSkuId, locationId: input.locationId },
      include: { wineSku: { select: { name: true, vintage: true } }, location: { select: { name: true } } },
    });
    if (!inv) throw new ActionError("No bottled inventory for that SKU at that location.", "CONFLICT");
    if (inv.totalBottles < input.bottles) {
      throw new ActionError(`Only ${inv.totalBottles} bottle(s) on hand there — can't remove ${input.bottles}.`, "CONFLICT");
    }

    await tx.bottledInventory.update({ where: { id: inv.id }, data: { totalBottles: { decrement: input.bottles } } });
    const label = BOTTLED_REMOVAL_LABELS[input.disposition];
    // The disposition rides on the movement's `reason` — the compliance fold maps it to the §B line.
    const mv = await tx.stockMovement.create({
      data: {
        itemKind: "BOTTLED_WINE",
        wineSkuId: input.wineSkuId,
        locationId: input.locationId,
        kind: "ADJUST",
        deltaUnits: -input.bottles,
        reason: input.disposition,
        createdById: actor.actorUserId,
        createdByEmail: actor.actorEmail,
      },
      select: { id: true },
    });
    const skuLabel = `${inv.wineSku.name}${inv.wineSku.vintage ? ` ${inv.wineSku.vintage}` : ""}`;
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "StockMovement",
      entityId: mv.id,
      summary: `${label}: ${input.bottles} bottle(s) of "${skuLabel}" from ${inv.location.name}`,
    });
    return { movementId: mv.id, message: `${label}: removed ${input.bottles} bottle(s) of "${skuLabel}".` };
  });
}
