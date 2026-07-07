/**
 * Phase 2 (TAXPAID-1) — the tax-paid boundary is a terminal one-way state, END-TO-END against a
 * dedicated synthetic tenant.
 *
 * Proves: reversibilityOf(REMOVE_TAXPAID) is non-reversible AND the generic reverser (the timeline
 * Undo) REFUSES it; the central admissibility guard at the write chokepoint blocks an ADJUST that adds
 * in-bond volume to a tax-paid-removed lot (the "behind the reverser's back" path — not just Undo);
 * and the ONLY sanctioned re-admission — a refund-flagged RETURN_TO_BOND — succeeds and posts §A11
 * (taxpaid wine returned to bulk).
 *
 * Run:  npx tsx --conditions=react-server --env-file=.env scripts/verify-taxpaid.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { removeTaxpaidCore } from "@/lib/compliance/removal-core";
import { returnToBondCore } from "@/lib/compliance/return-to-bond-core";
import { reverseOperationCore, reversibilityOf } from "@/lib/ledger/reverse";
import { generateReport } from "@/lib/compliance/generate";

const T = "org_zz_taxpaid_synth";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-taxpaid" };
const Y = 2026;
const JUNE = new Date(Date.UTC(Y, 5, 20));
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
    await db.analysisReading.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.analysisPanel.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lotOperationLine.deleteMany({ where: { tenantId: T } });
    await db.lotOperation.deleteMany({ where: { tenantId: T } });
    await db.vesselLot.deleteMany({ where: { tenantId: T } });
    await db.lotIdentifier.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lotCodeEvent.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lot.deleteMany({ where: { tenantId: T } });
    await db.bond.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.vessel.deleteMany({ where: { tenantId: T } });
  });
}

const cell = (snap: { cells: { section: string; line: number; column: string; gallons: number }[] }, s: "A" | "B", line: number) =>
  snap.cells.filter((c) => c.section === s && c.line === line).reduce((a, c) => a + c.gallons, 0);

async function main() {
  await runAsSystem((db) => db.organization.upsert({ where: { id: T }, update: {}, create: { id: T, name: "ZZ TAXPAID Synthetic", slug: T } }));
  await scrub();

  // (0) Pure verdict: REMOVE_TAXPAID + RETURN_TO_BOND are terminal by TYPE (no DB).
  assert(reversibilityOf("REMOVE_TAXPAID").reversible === false, "reversibilityOf(REMOVE_TAXPAID) is non-reversible (terminal)");
  assert(reversibilityOf("RETURN_TO_BOND").reversible === false, "reversibilityOf(RETURN_TO_BOND) is non-reversible (it IS the refund event)");

  await runAsTenant(T, async () => {
    await prisma.bond.create({ data: { registryNumber: "BWN-TP-0001", isPrimary: true } });
    const v = await prisma.vessel.create({ data: { code: "TP-T1", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });
    const lot = await prisma.lot.create({ data: { code: "TP-X-2025", form: "WINE", vintageYear: 2025 }, select: { id: true, code: true } });
    await runLedgerWrite((tx) =>
      writeLotOperation(tx, {
        type: "SEED",
        lines: [ { lotId: lot.id, vesselId: v.id, deltaL: 1000 }, { lotId: lot.id, vesselId: null, deltaL: -1000, reason: "seed" } ] as LedgerLine[],
        actorUserId: ACTOR.actorUserId, enteredBy: ACTOR.actorEmail, observedAt: JUNE,
        lotCodes: new Map([[lot.id, lot.code]]), vesselCodes: new Map([[v.id, "TP-T1"]]), capacityByVessel: new Map(),
      }),
    );
    const panel = await prisma.analysisPanel.create({ data: { lotId: lot.id, observedAt: JUNE, enteredByEmail: ACTOR.actorEmail }, select: { id: true } });
    await prisma.analysisReading.create({ data: { panelId: panel.id, analyte: "ALCOHOL", value: 13.5, unit: "% ABV" } });

    // Remove 200 L taxpaid (bulk → §A14).
    const rm = await removeTaxpaidCore(ACTOR, { vesselId: v.id, volumeL: 200, disposition: "TAXPAID" });
    assert(rm.removedL === 200, "removed 200 L taxpaid (bulk §A14)");

    // (1) The generic reverser REFUSES it — the tax-paid boundary is terminal.
    let undoRefused = false;
    try { await reverseOperationCore(ACTOR, { operationId: rm.operationId }); } catch { undoRefused = true; }
    assert(undoRefused, "reverseOperationCore (the timeline Undo) REFUSES a REMOVE_TAXPAID");

    // (2) The admissibility guard blocks an ADJUST that adds in-bond volume to the tax-paid lot — the
    //     path that would re-admit tax-paid volume behind the reverser's back (CO-1). NOT just Undo.
    let adjustBlocked = false;
    try {
      await runLedgerWrite((tx) =>
        writeLotOperation(tx, {
          type: "ADJUST",
          lines: [ { lotId: lot.id, vesselId: v.id, deltaL: 50 }, { lotId: lot.id, vesselId: null, deltaL: -50, reason: "adjust" } ] as LedgerLine[],
          actorUserId: ACTOR.actorUserId, enteredBy: ACTOR.actorEmail,
          lotCodes: new Map([[lot.id, lot.code]]), vesselCodes: new Map([[v.id, "TP-T1"]]), capacityByVessel: new Map([[v.id, 5000]]),
        }),
      );
    } catch { adjustBlocked = true; }
    assert(adjustBlocked, "a positive in-bond ADJUST on a tax-paid-removed lot is BLOCKED (the ADJUST path, not just Undo — CO-1)");

    // (3) The ONE sanctioned re-admission: a refund-flagged RETURN_TO_BOND succeeds + posts §A11.
    const ret = await returnToBondCore(ACTOR, { lotId: lot.id, vesselId: v.id, volumeL: 200 });
    assert(ret.volumeL === 200, "RETURN_TO_BOND (refund) re-admits 200 L in-bond");
    const retOp = await prisma.lotOperation.findUnique({ where: { id: ret.operationId }, select: { type: true, metadata: true } });
    assert(retOp!.type === "RETURN_TO_BOND", "the re-admission is a RETURN_TO_BOND op");
    assert((retOp!.metadata as { refundFlagged?: boolean })?.refundFlagged === true, "the RETURN_TO_BOND is refund-flagged");

    const rep = await generateReport(T, { periodStart: JUL.start, periodEnd: JUL.end });
    assert(cell(rep.fold, "A", 14) > 0, `§A14 removed-taxpaid still present (terminal — ${cell(rep.fold, "A", 14)} gal)`);
    assert(cell(rep.fold, "A", 11) > 0, `§A11 taxpaid-wine-returned-to-bulk present after the return (${cell(rep.fold, "A", 11)} gal)`);
    assert(rep.fold.balanced, "the report foots (§A14 removal + §A11 return both posted; net on-hand restored)");

    console.log(`\n✅ verify-taxpaid: ${passed} assertions passed. Synthetic tenant '${T}' left seeded for inspection.`);
  });
}

main()
  .catch((e) => {
    console.error("\n❌ verify-taxpaid FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
