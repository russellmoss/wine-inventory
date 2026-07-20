import { runAsSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { deriveOpeningLot } from "@/lib/cost/intake-cost";
import { toExtraUnits } from "@/lib/units/custom-units";
import { coerceStockUnit } from "@/lib/cellar/materials-shared";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Plan 080 U14 (repair half): unwind stock that was booked by DESCRIBING a consumable rather than
// receiving it. Until U14, createStockMaterialCore inferred an opening SupplyLot from package size, so
// setting up e.g. a "50-count roll of labels" booked 50 units nobody ever received (#377).
//
// CORRECTION-AS-EVENT, NOT DELETION. The phantom lot row is never deleted and its qtyReceived is never
// rewritten -- history is what actually happened, including the mistake (LEDGER-6, LEDGER-8, LEDGER-10).
// The unwind is a NEGATIVE adjustment through the normal adjustConsumableCore path, so it lands as an
// audited correction that nets the phantom units to zero and leaves the original rows readable.
//
//   npx tsx --env-file=.env scripts/unwind-phantom-opening-stock.ts                 # dry run (default)
//   npx tsx --env-file=.env scripts/unwind-phantom-opening-stock.ts --apply         # perform the unwind
//   TENANT_ID=org_demo_winery npx tsx --env-file=.env scripts/unwind-phantom-opening-stock.ts
//
// IDENTIFICATION IS DELIBERATELY CONSERVATIVE. A lot is only a candidate when all three hold:
//   1. it is an opening lot (supplierNote "Opening stock") -- the only note the old derivation wrote;
//   2. it is still FULLY UNUSED (qtyRemaining == qtyReceived) -- anything consumed is real history and is
//      left alone regardless, because reversing it would corrupt costs already charged to wine;
//   3. its quantity EXACTLY equals what the old package derivation would have produced for that material's
//      recorded packageAmount/packageUnit -- the fingerprint of an inferred lot rather than a typed one;
//   4. a HUMAN created it. Seed/import scripts pass an explicit openingQty on purpose and often set a pack
//      size equal to it, so they match (1)-(3) by coincidence. The creating audit row's actorEmail tells
//      them apart: a "system@..." actor is deliberate seeding and is skipped.
// Condition 4 matters -- without it this pass flagged 28 lots on the live database, 23 of which were
// deliberate demo seed balances. With it, only the user-created lots remain. Even so, a deliberate manual
// entry that coincidentally matches its own pack size is still possible, which is exactly why this script
// defaults to a dry run and prints the tenant, actor and quantity of every candidate before --apply.

const ONLY = process.env.TENANT_ID?.trim() || null;
const APPLY = process.argv.includes("--apply");
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@unwind-phantom-opening-stock" };
const EPS = 1e-6;

type Candidate = {
  lotId: string;
  materialId: string;
  materialName: string;
  locationId: string;
  qty: number;
  stockUnit: string;
  packageAmount: number;
  packageUnit: string;
  actorEmail: string;
};

async function findCandidates(tenantId: string): Promise<Candidate[]> {
  const lots = await prisma.supplyLot.findMany({
    where: { supplierNote: "Opening stock" },
    select: {
      id: true, materialId: true, qtyReceived: true, qtyRemaining: true, stockUnit: true, locationId: true,
      material: { select: { name: true, packageAmount: true, packageUnit: true, stockUnit: true } },
    },
  });

  // Same read as loadCustomUnits, issued through the extended client (RLS-scoped by the surrounding
  // runAsTenant) rather than a transaction client, since this pass is read-only.
  const extraUnits = toExtraUnits(
    await prisma.customUnit.findMany({
      where: { tenantId },
      select: { normalizedName: true, dimension: true, perCanonical: true },
    }),
  );

  // (4) who created each lot. A "system@..." actor is a seed/import that meant to book stock.
  const audits = await prisma.auditLog.findMany({
    where: { entityType: "SupplyLot", entityId: { in: lots.map((l) => l.id) } },
    select: { entityId: true, actorEmail: true },
  });
  const actorByLot = new Map(audits.map((a) => [a.entityId, a.actorEmail ?? ""]));

  const out: Candidate[] = [];

  for (const lot of lots) {
    const received = Number(lot.qtyReceived);
    const remaining = Number(lot.qtyRemaining);
    // (2) anything already drawn against is real history -- never reverse it.
    if (Math.abs(received - remaining) > EPS || remaining <= EPS) continue;

    const m = lot.material;
    const packageAmount = m?.packageAmount == null ? null : Number(m.packageAmount);
    if (!m || packageAmount == null || !m.packageUnit) continue;

    // (4) skip deliberate seeding; keep only lots a person created through the UI.
    const actorEmail = actorByLot.get(lot.id) ?? "";
    if (actorEmail === "" || actorEmail.startsWith("system@")) continue;

    // (3) reproduce the removed derivation and require an exact match.
    const derived = deriveOpeningLot({
      packageAmount,
      packageUnit: m.packageUnit,
      totalCost: null,
      stockUnit: coerceStockUnit(m.stockUnit ?? lot.stockUnit),
      extraUnits,
    });
    if (derived.qtyInStockUnit == null) continue;
    if (Math.abs(derived.qtyInStockUnit - received) > EPS) continue;

    out.push({
      lotId: lot.id,
      materialId: lot.materialId,
      materialName: m.name,
      locationId: lot.locationId,
      qty: remaining,
      stockUnit: coerceStockUnit(m.stockUnit ?? lot.stockUnit),
      packageAmount,
      packageUnit: m.packageUnit,
      actorEmail,
    });
  }
  return out;
}

/**
 * Reverse THE SPECIFIC phantom lot.
 *
 * The first version of this used adjustConsumableCore with a negative delta, which does a FIFO draw --
 * it removes the right QUANTITY but from whichever lot is oldest, not necessarily the phantom. That is
 * fine when the phantom happens to be oldest and WRONG otherwise: on the live run, B12's phantom was
 * received after a real 1,000-unit lot, so the reversal ate 100 units of genuinely-received stock at
 * $0.64 and left the phantom sitting there at $0.44. On-hand was right; the cost basis was not (COST-1).
 *
 * So the reversal targets the lot by id. The guarded updateMany mirrors the house decrement (never goes
 * negative), and the MaterialMovement carries `supplyLotId` so the correction names exactly which lot it
 * unwound. The row itself is never deleted and qtyReceived is never rewritten (LEDGER-6/8/10).
 */
async function reverseSpecificLot(c: Candidate) {
  await runInTenantTx(async (tx) => {
    const res = await tx.supplyLot.updateMany({
      where: { id: c.lotId, qtyRemaining: { gte: c.qty } },
      data: { qtyRemaining: { decrement: c.qty } },
    });
    if (res.count === 0) throw new Error(`Lot ${c.lotId} changed under us (qtyRemaining < ${c.qty}); re-run the dry run.`);

    await tx.materialMovement.create({
      data: {
        materialId: c.materialId,
        locationId: c.locationId,
        kind: "ADJUST",
        deltaQty: -c.qty,
        supplyLotId: c.lotId,
        reason: "Correction: opening stock inferred from package size was never physically received (plan 080 U14)",
        createdById: ACTOR.actorUserId,
        createdByEmail: ACTOR.actorEmail,
      },
    });

    await writeAudit(tx, {
      ...ACTOR,
      action: "UPDATE",
      entityType: "SupplyLot",
      entityId: c.lotId,
      summary: `Reversed ${c.qty} ${c.stockUnit} of phantom opening stock on "${c.materialName}" (inferred from pack size, never received)`,
    });
  });
}

async function processTenant(tenantId: string) {
  return runAsTenant(tenantId, async () => {
    const candidates = await findCandidates(tenantId);
    if (candidates.length === 0) return { tenantId, found: 0, unwound: 0 };

    console.log(`\n${tenantId} — ${candidates.length} phantom opening lot(s):`);
    for (const c of candidates) {
      console.log(
        `  ${c.materialName}: ${c.qty} ${c.stockUnit}  — set up by ${c.actorEmail}` +
        `  (matches recorded pack size ${c.packageAmount} ${c.packageUnit}; lot ${c.lotId})`,
      );
    }

    if (!APPLY) return { tenantId, found: candidates.length, unwound: 0 };

    let unwound = 0;
    for (const c of candidates) {
      await reverseSpecificLot(c);
      unwound++;
    }
    return { tenantId, found: candidates.length, unwound };
  });
}

async function main() {
  const tenants = await runAsSystem(async (db) => {
    const rows = await db.organization.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    return rows.map((r) => r.id);
  });
  const targets = ONLY ? tenants.filter((t) => t === ONLY) : tenants;
  if (ONLY && targets.length === 0) throw new Error(`Tenant ${ONLY} not found.`);

  console.log(APPLY ? "APPLYING unwind (writes a reversing adjustment)." : "DRY RUN — no writes. Re-run with --apply to unwind.");

  let found = 0;
  let unwound = 0;
  for (const t of targets) {
    const r = await processTenant(t);
    found += r.found;
    unwound += r.unwound;
  }

  console.log(`\nDone. ${found} phantom lot(s) found across ${targets.length} tenant(s); ${unwound} unwound.`);
  if (found > 0 && !APPLY) console.log("Read the list above, then re-run with --apply to book the reversals.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
