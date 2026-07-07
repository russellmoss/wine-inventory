/**
 * Phase 2 (BOND-1) — bond isolation + symmetric TRANSFER_IN_BOND, END-TO-END against a dedicated
 * synthetic tenant (never prod Bhutan / Demo — keeps fake multi-bond data RLS-isolated).
 *
 * Proves: a legacy lot derives the PRIMARY bond; a bond-moving op needs an explicit dest bond; after
 * a TRANSFER_IN_BOND the lot's bond is DERIVED point-in-time from the line (dest bond); the transfer
 * posts SYMMETRIC removed-in-bond (§A15, source report) / received-in-bond (§A7, dest report) across
 * the two bonds' 5120.17; per-bond carry-forward chains never cross; a single-parent lineage child
 * walks to its parent's bond (not primary); a CROSS-BOND blend is refused; a backdated transfer into a
 * filed period cascades AMEND-1 onto BOTH bond chains.
 *
 * Run:  npx tsx --conditions=react-server --env-file=.env scripts/verify-bond.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { transferInBondCore } from "@/lib/compliance/transfer-in-bond-core";
import { deriveBond } from "@/lib/compliance/bond";
import { blendLotsCore } from "@/lib/blend/blend-core";
import { generateReport, markReportFiled } from "@/lib/compliance/generate";

const T = "org_zz_bond_synth";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-bond" };
const YEAR = 2026, MONTH = 7;
const START = new Date(Date.UTC(YEAR, MONTH - 1, 1));
const END = new Date(Date.UTC(YEAR, MONTH, 0, 23, 59, 59, 999));
const JUNE = new Date(Date.UTC(YEAR, MONTH - 2, 20));

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

async function scrub() {
  await runAsSystem(async (db) => {
    // Both complianceReport AND lotOperationLine carry composite FKs → bond (ON DELETE RESTRICT), so
    // bond MUST be deleted AFTER them (a transfer line references the bond it moved onto).
    await db.complianceReport.deleteMany({ where: { tenantId: T } });
    await db.changeOfTaxClassEvent.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.analysisReading.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.analysisPanel.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lotStateEvent.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lotOperationLine.deleteMany({ where: { tenantId: T } });
    await db.lotOperation.deleteMany({ where: { tenantId: T } });
    await db.vesselLot.deleteMany({ where: { tenantId: T } });
    await db.lotLineage.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lotIdentifier.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lotCodeEvent.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lot.deleteMany({ where: { tenantId: T } });
    await db.bond.deleteMany({ where: { tenantId: T } }).catch(() => {}); // after reports + lines
    await db.vessel.deleteMany({ where: { tenantId: T } });
  });
}

async function seedLot(code: string, vesselId: string, volumeL: number, abv: number, at: Date) {
  const lot = await prisma.lot.create({ data: { code, form: "WINE", vintageYear: 2025 }, select: { id: true, code: true } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: lot.id, vesselId, deltaL: volumeL },
        { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId, enteredBy: ACTOR.actorEmail, observedAt: at,
      lotCodes: new Map([[lot.id, lot.code]]), vesselCodes: new Map([[vesselId, code]]), capacityByVessel: new Map(),
    }),
  );
  const panel = await prisma.analysisPanel.create({ data: { lotId: lot.id, observedAt: at, enteredByEmail: ACTOR.actorEmail }, select: { id: true } });
  await prisma.analysisReading.create({ data: { panelId: panel.id, analyte: "ALCOHOL", value: abv, unit: "% ABV" } });
  return lot.id;
}

const cell = (snap: { cells: { section: string; line: number; column: string; gallons: number }[] }, s: "A" | "B", line: number) =>
  snap.cells.filter((c) => c.section === s && c.line === line).reduce((a, c) => a + c.gallons, 0);

async function main() {
  await runAsSystem((db) => db.organization.upsert({ where: { id: T }, update: {}, create: { id: T, name: "ZZ BOND Synthetic", slug: T } }));
  await scrub();

  await runAsTenant(T, async () => {
    const bondA = await prisma.bond.create({ data: { registryNumber: "BWN-ZZ-A", isPrimary: true, premises: "Estate bond" }, select: { id: true } });
    const bondB = await prisma.bond.create({ data: { registryNumber: "BWN-ZZ-B", isPrimary: false, premises: "Custom-crush bond" }, select: { id: true } });
    const vA = await prisma.vessel.create({ data: { code: "ZZ-A1", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });
    const vB = await prisma.vessel.create({ data: { code: "ZZ-B1", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });
    const vC = await prisma.vessel.create({ data: { code: "ZZ-B2", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });

    // A lot seeded on the estate (bond A = primary) before the period.
    const lotX = await seedLot("ZZ-X-2025", vA.id, 1000, 13.5, JUNE);

    // (1) A legacy/origination lot with no bond op derives the PRIMARY bond.
    assert((await deriveBond(lotX, JUNE)) === bondA.id, "a legacy lot derives the primary bond (bond A)");

    // (2) A bond-moving op MUST carry an explicit dest bond (empty toBondId rejected).
    let rejectedNoBond = false;
    try { await transferInBondCore(ACTOR, { lotId: lotX, toVesselId: vB.id, toBondId: "" }); } catch { rejectedNoBond = true; }
    assert(rejectedNoBond, "a TRANSFER_IN_BOND with no explicit dest bond is rejected (asymmetric fallback)");

    // (3) Transfer lotX estate(A) → custom-crush(B), early in the period (before "now" so the
    //     as-of-now derivations below see it — the suite runs in the current month, like verify-ttb).
    const xfer = await transferInBondCore(ACTOR, { lotId: lotX, toVesselId: vB.id, toBondId: bondB.id, observedAt: new Date(Date.UTC(YEAR, MONTH - 1, 2)) });
    assert(xfer.fromBondId === bondA.id && xfer.toBondId === bondB.id, "transfer records source bond A → dest bond B");
    assert((await deriveBond(lotX, END)) === bondB.id, "after the transfer, lotX's bond is DERIVED point-in-time from the line (bond B, not a mutable column)");

    // (4) Symmetric posting: bond A report shows §A15 removed; bond B report shows §A7 received.
    const repA = await generateReport(T, { periodStart: START, periodEnd: END, bondId: bondA.id });
    const repB = await generateReport(T, { periodStart: START, periodEnd: END, bondId: bondB.id });
    assert(cell(repA.fold, "A", 15) > 0, `bond A: §A15 transfers-in-bond REMOVED present (${cell(repA.fold, "A", 15)} gal)`);
    assert(cell(repA.fold, "A", 7) === 0, "bond A: §A7 received is NOT posted (removed side only)");
    assert(cell(repB.fold, "A", 7) > 0, `bond B: §A7 received-in-bond present (${cell(repB.fold, "A", 7)} gal)`);
    assert(cell(repB.fold, "A", 15) === 0, "bond B: §A15 removed is NOT posted (received side only)");
    assert(Math.abs(cell(repA.fold, "A", 15) - cell(repB.fold, "A", 7)) < 0.01, "symmetric: bond A §A15 gallons == bond B §A7 gallons");
    assert(cell(repA.fold, "A", 31) === 0, "bond A: lotX gone at period end (on-hand 0 — derived off bond A)");
    assert(cell(repB.fold, "A", 31) > 0, `bond B: lotX on-hand at period end (${cell(repB.fold, "A", 31)} gal)`);
    assert(repA.fold.balanced && repB.fold.balanced, "both per-bond reports foot");

    // (5) Per-bond chains never cross: file both July reports; bond B's next-period begin reads bond
    //     B's own onHandEnd, NOT bond A's.
    await markReportFiled(repA.reportId, ACTOR.actorEmail);
    await markReportFiled(repB.reportId, ACTOR.actorEmail);
    const AUG = { start: new Date(Date.UTC(YEAR, MONTH, 1)), end: new Date(Date.UTC(YEAR, MONTH + 1, 0, 23, 59, 59, 999)) };
    const augB = await generateReport(T, { periodStart: AUG.start, periodEnd: AUG.end, bondId: bondB.id });
    assert(cell(augB.fold, "A", 1) > 0 && Math.abs(cell(augB.fold, "A", 1) - cell(repB.fold, "A", 31)) < 0.01, "bond B August begin carries bond B's own July end (chains don't cross)");
    const augBBeginA = augB.fold.cells.find((c) => c.section === "A" && c.line === 1);
    assert(augBBeginA != null, "bond B August has a begin balance (its own chain), independent of bond A");

    // (6) A single-parent lineage child of a lot on bond B derives bond B, not primary (eng A4).
    const childLot = await prisma.lot.create({ data: { code: "ZZ-X-PRESS-2025", form: "WINE", vintageYear: 2025 }, select: { id: true } });
    await prisma.lotLineage.create({ data: { parentLotId: lotX, childLotId: childLot.id, kind: "SPLIT" } });
    assert((await deriveBond(childLot.id, END)) === bondB.id, "a single-parent lineage child walks to its parent's bond (B), not primary (A4)");

    // (7) A cross-bond blend is refused (wine can't straddle two bonds — CO-2 / Gemini-CRIT3).
    const lotY = await seedLot("ZZ-Y-2025", vA.id, 400, 13.0, JUNE); // on bond A (estate)
    let blendRefused = false;
    try {
      await blendLotsCore(ACTOR, { mode: "NEW_LOT", token: "XB", components: [ { vesselId: vB.id, lotId: lotX, drawL: 100 }, { vesselId: vA.id, lotId: lotY, drawL: 100 } ], toVesselId: vC.id });
    } catch { blendRefused = true; }
    assert(blendRefused, "a blend drawing from lots on different bonds is refused (transfer first)");

    // (8) A backdated transfer into a FILED period cascades AMEND-1 onto BOTH bond chains.
    const lotZ = await seedLot("ZZ-Z-2025", vA.id, 300, 13.0, JUNE); // bond A
    await transferInBondCore(ACTOR, { lotId: lotZ, toVesselId: vC.id, toBondId: bondB.id, observedAt: new Date(Date.UTC(YEAR, MONTH - 1, 4)) });
    const [aStatus, bStatus] = await Promise.all([
      prisma.complianceReport.findUnique({ where: { id: repA.reportId }, select: { status: true } }),
      prisma.complianceReport.findUnique({ where: { id: repB.reportId }, select: { status: true } }),
    ]);
    assert(aStatus!.status === "NEEDS_AMENDMENT" && bStatus!.status === "NEEDS_AMENDMENT", "a backdated cross-bond transfer marks BOTH the source and dest (formType, bond) chains NEEDS_AMENDMENT");

    console.log(`\n✅ verify-bond: ${passed} assertions passed. Synthetic tenant '${T}' left seeded for inspection.`);
  });
}

main()
  .catch((e) => {
    console.error("\n❌ verify-bond FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
