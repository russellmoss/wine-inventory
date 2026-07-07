/**
 * Phase 2 (TAXCLASS-1) — Change-Of-Tax-Class event + cross-class blend, END-TO-END against a
 * dedicated synthetic tenant.
 *
 * Proves: a dated Change-Of-Tax-Class event moves a lot's volume out of the old class (§A24) into the
 * new class (§A10) and the lot then carries the DECLARED class; a cross-class blend posts symmetric
 * produced-by-blending (§A5) / used-for-blending (§A20) and warns; and — the R6/T5 no-double-count
 * guard — a same-period class change on a cross-class-blend CHILD does NOT also post §A10/§A24 (its
 * §A5 already carries the corrected class), which the report FOOTING proves (a double count wouldn't).
 *
 * Run:  npx tsx --conditions=react-server --env-file=.env scripts/verify-taxclass.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { changeTaxClassCore } from "@/lib/compliance/tax-class-event-core";
import { blendLotsCore } from "@/lib/blend/blend-core";
import { resolveClassesForLots, generateReport, markReportFiled } from "@/lib/compliance/generate";

const T = "org_zz_taxclass_synth";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-taxclass" };
const Y = 2026;
const MAY = new Date(Date.UTC(Y, 4, 15));
const JUN = { start: new Date(Date.UTC(Y, 5, 1)), end: new Date(Date.UTC(Y, 6, 0, 23, 59, 59, 999)) };
const JUL = { start: new Date(Date.UTC(Y, 6, 1)), end: new Date(Date.UTC(Y, 7, 0, 23, 59, 59, 999)) };

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

async function scrub() {
  await runAsSystem(async (db) => {
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
    await db.bond.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.vessel.deleteMany({ where: { tenantId: T } });
  });
}

async function seedLot(code: string, vesselId: string, volumeL: number, abv: number) {
  const lot = await prisma.lot.create({ data: { code, form: "WINE", vintageYear: 2025 }, select: { id: true, code: true } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: lot.id, vesselId, deltaL: volumeL },
        { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId, enteredBy: ACTOR.actorEmail, observedAt: MAY,
      lotCodes: new Map([[lot.id, lot.code]]), vesselCodes: new Map([[vesselId, code]]), capacityByVessel: new Map(),
    }),
  );
  const panel = await prisma.analysisPanel.create({ data: { lotId: lot.id, observedAt: MAY, enteredByEmail: ACTOR.actorEmail }, select: { id: true } });
  await prisma.analysisReading.create({ data: { panelId: panel.id, analyte: "ALCOHOL", value: abv, unit: "% ABV" } });
  return lot.id;
}

const cell = (snap: { cells: { section: string; line: number; column: string; gallons: number }[] }, s: "A" | "B", line: number, col?: string) =>
  snap.cells.filter((c) => c.section === s && c.line === line && (col ? c.column === col : true)).reduce((a, c) => a + c.gallons, 0);

async function main() {
  await runAsSystem((db) => db.organization.upsert({ where: { id: T }, update: {}, create: { id: T, name: "ZZ TAXCLASS Synthetic", slug: T } }));
  await scrub();

  await runAsTenant(T, async () => {
    await prisma.bond.create({ data: { registryNumber: "BWN-TC-0001", isPrimary: true } });
    const v1 = await prisma.vessel.create({ data: { code: "TC-T1", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });
    const v2 = await prisma.vessel.create({ data: { code: "TC-T2", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });
    const v3 = await prisma.vessel.create({ data: { code: "TC-T3", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });
    const v4 = await prisma.vessel.create({ data: { code: "TC-T4", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } }); // empty blend dest

    // Seed (May) three lots: lotA class a (13%), lotB class b (18.5%), lotP class b (18.5%).
    const lotA = await seedLot("TC-A-2025", v1.id, 100, 13.0);
    const lotB = await seedLot("TC-B-2025", v2.id, 100, 18.5);
    const lotP = await seedLot("TC-P-2025", v3.id, 500, 18.5);

    // File June so July's begin carries the PRE-event classes (a=100, b=600) via carry-forward.
    const jun = await generateReport(T, { periodStart: JUN.start, periodEnd: JUN.end });
    assert(jun.fold.balanced, "June baseline report foots");
    await markReportFiled(jun.reportId, ACTOR.actorEmail);

    // July: (A) blend lotA(a)+lotB(b) → cross-class child, then declare the child class c; (B) correct
    // lotP from class b → a via a standalone Change-Of-Tax-Class event.
    const blend = await blendLotsCore(ACTOR, { mode: "NEW_LOT", token: "XC", components: [ { vesselId: v1.id, lotId: lotA, drawL: 100 }, { vesselId: v2.id, lotId: lotB, drawL: 100 } ], toVesselId: v4.id });
    const evChild = await changeTaxClassCore(ACTOR, { lotId: blend.childLotId, toClass: "C_21_24" });
    assert(!evChild.noop && evChild.toClass === "C_21_24", "change-of-class event recorded on the blend child (→ class c)");
    const evP = await changeTaxClassCore(ACTOR, { lotId: lotP, toClass: "A_LE16" });
    assert(evP.fromClass === "B_16_21" && evP.toClass === "A_LE16", "lotP premature declaration corrected b → a (fromClass derived from ABV)");

    // The lot now carries the DECLARED class (event supersedes ABV derivation).
    const classes = await resolveClassesForLots([lotP, blend.childLotId], JUL.end, {});
    assert(classes.get(lotP)!.taxClass === "A_LE16", "lotP resolves to the declared class a (event supersedes the 18.5% ABV)");
    assert(classes.get(blend.childLotId)!.taxClass === "C_21_24", "the blend child resolves to the declared class c");

    const rep = await generateReport(T, { periodStart: JUL.start, periodEnd: JUL.end });
    const f = rep.fold;

    // (A) cross-class blend posts §A5 (produced-by-blending, into the child's class c) + §A20 (used).
    assert(cell(f, "A", 5, "C_21_24") > 0, `§A5 produced-by-blending into class c present (${cell(f, "A", 5, "C_21_24")} gal)`);
    assert(cell(f, "A", 20) > 0, `§A20 used-for-blending present (${cell(f, "A", 20)} gal)`);
    assert(f.partX.some((p) => /cross-class blend/i.test(p)), "the winemaker is warned: a cross-class blend note is on Part X");

    // (B) standalone change posts §A24 out of the old class b + §A10 into the new class a.
    assert(cell(f, "A", 24, "B_16_21") > 0, `§A24 changed-OUT-of class b present (${cell(f, "A", 24, "B_16_21")} gal)`);
    assert(cell(f, "A", 10, "A_LE16") > 0, `§A10 changed-INTO class a present (${cell(f, "A", 10, "A_LE16")} gal)`);

    // (R6/T5) NO double count: the blend child's class change is NOT also posted via §A10/§A24 — its
    // §A5 already carries class c. So §A10 class c is ZERO, and the whole report still FOOTS (a double
    // count of the child's 200 gal would put class c out of balance).
    assert(cell(f, "A", 10, "C_21_24") === 0, "R6: the blend child's class change did NOT double-post via §A10 (suppressed — §A5 already carries class c)");
    assert(cell(f, "A", 24, "C_21_24") === 0, "R6: the blend child's class change did NOT post §A24 either");
    assert(f.balanced, "the combined blend + class-change report FOOTS (proves no double count of the child volume)");

    console.log(`\n✅ verify-taxclass: ${passed} assertions passed. Synthetic tenant '${T}' left seeded for inspection.`);
  });
}

main()
  .catch((e) => {
    console.error("\n❌ verify-taxclass FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
