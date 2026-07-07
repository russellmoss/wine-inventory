/**
 * Phase 14 — TTB F 5120.17 compliance engine, END-TO-END verification against a DEDICATED synthetic
 * tenant (never prod Bhutan — keeps fake TTB data out of the real winery, RLS-isolated).
 *
 * Seeds a full US-winery month (multi-class still a + b, a fermented lot for A2, a still bottling,
 * bulk taxpaid removals, a loss), then drives the REAL pipeline the UI calls:
 *   • generateReport → asserts every §A/§B column foots, §A13 == §B2, no ABV blockers,
 *   • fillTtbPdf → asserts the filled AcroForm round-trips the snapshot values,
 *   • file → reverse a removal (024 undo, C5 period) → amend → asserts a new AMENDED row.
 * Data is left seeded so it can be inspected (switch the active org to the synthetic tenant).
 *
 * Run:  npx tsx --env-file=.env scripts/verify-ttb.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { executeBottling } from "@/lib/bottling/run";
import { recordLossCore } from "@/lib/cellar/loss";
import { removeTaxpaidCore } from "@/lib/compliance/removal-core";
import { removeBottledCore } from "@/lib/compliance/bottled-removal-core";
import { returnToBondCore } from "@/lib/compliance/return-to-bond-core";
import { generateReport, markReportFiled } from "@/lib/compliance/generate";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import { fillTtbPdf } from "@/lib/compliance/fill-pdf";
import { PDFDocument } from "pdf-lib";
import type { LotForm } from "@/lib/ledger/vocabulary";

const TENANT = "org_zz_ttb_synth";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-ttb" };
const YEAR = 2026;
const MONTH = 7; // July (current month — flows recorded "now" land here; begin seeded in June)
const START = new Date(Date.UTC(YEAR, MONTH - 1, 1));
const END = new Date(Date.UTC(YEAR, MONTH, 0, 23, 59, 59, 999));
const JUNE = new Date(Date.UTC(YEAR, MONTH - 2, 20)); // prior-period seed date

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

async function scrub() {
  // Delete the synthetic tenant's rows in FK-safe order (owner client bypasses RLS).
  await runAsSystem(async (db) => {
    const t = TENANT;
    await db.complianceReport.deleteMany({ where: { tenantId: t } }); // references bond → delete first
    await db.complianceProfile.deleteMany({ where: { tenantId: t } });
    await db.bond.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.changeOfTaxClassEvent.deleteMany({ where: { tenantId: t } }).catch(() => {});
    // Cost artifacts + the Phase-15 accounting outbox reference bottling runs / snapshots / ops via
    // RESTRICT FKs (bottling freezes a BottlingCostSnapshot, so a run can't be deleted while its
    // snapshot stands). Delete them FIRST, in child→parent order, or the scrub hits P2003 on a prior
    // run's orphan (bottling_cost_snapshot_tenantId_runId_fkey).
    await db.accountingDelivery.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.costExportEvent.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.costVarianceEvent.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.bottlingCostSnapshot.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.barrelFill.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.barrelAsset.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.supplyConsumption.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.costLine.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.supplyLot.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.cellarMaterial.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.stockMovement.deleteMany({ where: { tenantId: t } });
    await db.bottledInventory.deleteMany({ where: { tenantId: t } });
    await db.bottlingSource.deleteMany({ where: { tenantId: t } });
    await db.bottlingRun.deleteMany({ where: { tenantId: t } });
    await db.finishedGoodInventory.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.finishedGood.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.wineSku.deleteMany({ where: { tenantId: t } });
    await db.finishedGoodCategory.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.analysisReading.deleteMany({ where: { tenantId: t } });
    await db.analysisPanel.deleteMany({ where: { tenantId: t } });
    await db.lotStateEvent.deleteMany({ where: { tenantId: t } });
    await db.lotOperationLine.deleteMany({ where: { tenantId: t } });
    await db.lotOperation.deleteMany({ where: { tenantId: t } });
    await db.vesselLot.deleteMany({ where: { tenantId: t } });
    await db.lotVineyard.deleteMany({ where: { tenantId: t } });
    await db.lotHarvestSource.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.lotIdentifier.deleteMany({ where: { tenantId: t } }).catch(() => {}); // Phase 1 FK → lot
    await db.lotCodeEvent.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await db.lot.deleteMany({ where: { tenantId: t } });
    await db.vessel.deleteMany({ where: { tenantId: t } });
    await db.location.deleteMany({ where: { tenantId: t } });
  });
}

async function seedReading(lotId: string, abv: number, observedAt: Date) {
  const panel = await prisma.analysisPanel.create({
    data: { lotId, observedAt, enteredByEmail: ACTOR.actorEmail },
    select: { id: true },
  });
  await prisma.analysisReading.create({ data: { panelId: panel.id, analyte: "ALCOHOL", value: abv, unit: "% ABV" } });
}

async function seedLot(code: string, vesselId: string, volumeL: number, observedAt: Date, form: LotForm) {
  const lot = await prisma.lot.create({ data: { code, form, vintageYear: 2025 }, select: { id: true, code: true } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: lot.id, vesselId, deltaL: volumeL },
        { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      observedAt,
      lotCodes: new Map([[lot.id, lot.code]]),
      vesselCodes: new Map([[vesselId, code]]),
      capacityByVessel: new Map(),
    }),
  );
  return lot.id;
}

// ─────────────────────────── AMEND-1 multi-period chain (V4 i–iii) ───────────────────────────
// A dedicated synthetic tenant, three consecutive FILED monthly periods on one lot. Appending a
// BACKDATED op into the earliest FILED period must (i) flip EVERY later report to NEEDS_AMENDMENT,
// (ii) keep the carry-forward chaining through the marked reports (a marked P2 still carries its
// last-filed onHandEnd — the A2 "sharpest catch"), and (iii) once P1/P2 are re-filed AMENDED, P3's
// begin picks up the corrected upstream onHandEnd.
async function verifyAmendChain() {
  const T = "org_zz_amend_synth";
  const gal = (fold: { cells: { section: string; line: number; column: string; gallons: number }[] }) =>
    fold.cells.find((c) => c.section === "A" && c.line === 1 && c.column === "A_LE16")?.gallons ?? 0;
  const storedEnd = async (reportId: string) => {
    const r = await prisma.complianceReport.findUnique({ where: { id: reportId }, select: { onHandEnd: true } });
    const cells = (r!.onHandEnd as unknown as { section: string; column: string; gallons: number }[]) ?? [];
    return cells.find((c) => c.section === "A" && c.column === "A_LE16")?.gallons ?? 0;
  };

  console.log("\nAMEND-1 chain: scrubbing + seeding a 3-period tenant…");
  await runAsSystem((db) => db.organization.upsert({ where: { id: T }, update: {}, create: { id: T, name: "ZZ AMEND Synthetic", slug: T } }));
  await runAsSystem(async (db) => {
    await db.complianceReport.deleteMany({ where: { tenantId: T } });
    await db.bond.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.analysisReading.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.analysisPanel.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.changeOfTaxClassEvent.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lotOperationLine.deleteMany({ where: { tenantId: T } });
    await db.lotOperation.deleteMany({ where: { tenantId: T } });
    await db.vesselLot.deleteMany({ where: { tenantId: T } });
    await db.lotIdentifier.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lotCodeEvent.deleteMany({ where: { tenantId: T } }).catch(() => {});
    await db.lot.deleteMany({ where: { tenantId: T } });
    await db.vessel.deleteMany({ where: { tenantId: T } });
  });

  await runAsTenant(T, async () => {
    await prisma.bond.create({ data: { registryNumber: "BWN-AMD-0001", isPrimary: true } });
    const v = await prisma.vessel.create({ data: { code: "AMD-T1", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });
    // Seed 2000 L class-a before P1 (April), with an ABV so it classifies cleanly (no filing blocker).
    const lot = await prisma.lot.create({ data: { code: "AMD-CAB-2025", form: "WINE", vintageYear: 2025 }, select: { id: true, code: true } });
    const seedAt = new Date(Date.UTC(2026, 3, 15));
    await runLedgerWrite((tx) =>
      writeLotOperation(tx, {
        type: "SEED",
        lines: [
          { lotId: lot.id, vesselId: v.id, deltaL: 2000 },
          { lotId: lot.id, vesselId: null, deltaL: -2000, reason: "seed" },
        ] as LedgerLine[],
        actorUserId: ACTOR.actorUserId, enteredBy: ACTOR.actorEmail, observedAt: seedAt,
        lotCodes: new Map([[lot.id, lot.code]]), vesselCodes: new Map([[v.id, "AMD-T1"]]), capacityByVessel: new Map(),
      }),
    );
    const panel = await prisma.analysisPanel.create({ data: { lotId: lot.id, observedAt: seedAt, enteredByEmail: ACTOR.actorEmail }, select: { id: true } });
    await prisma.analysisReading.create({ data: { panelId: panel.id, analyte: "ALCOHOL", value: 13.5, unit: "% ABV" } });

    // A balanced LOSS of `v` liters at `at` (backdate-able) — the chain's per-period on-hand changer.
    const loss = (at: Date, liters: number) =>
      runLedgerWrite((tx) =>
        writeLotOperation(tx, {
          type: "LOSS",
          lines: [
            { lotId: lot.id, vesselId: v.id, deltaL: -liters },
            { lotId: lot.id, vesselId: null, deltaL: liters, reason: "loss" },
          ] as LedgerLine[],
          actorUserId: ACTOR.actorUserId, enteredBy: ACTOR.actorEmail, observedAt: at,
          lotCodes: new Map([[lot.id, lot.code]]), vesselCodes: new Map([[v.id, "AMD-T1"]]), capacityByVessel: new Map(),
        }),
      );

    const period = (m: number) => ({ start: new Date(Date.UTC(2026, m - 1, 1)), end: new Date(Date.UTC(2026, m, 0, 23, 59, 59, 999)) });
    const P1 = period(5), P2 = period(6), P3 = period(7); // May / June / July 2026

    // Each period loses 100 L, then files. Carry-forward: P1 end 1900 → P2 begin 1900 → end 1800 → P3 begin 1800 → end 1700.
    await loss(new Date(Date.UTC(2026, 4, 10)), 100);
    const g1 = await generateReport(T, { periodStart: P1.start, periodEnd: P1.end }); await markReportFiled(g1.reportId, ACTOR.actorEmail);
    await loss(new Date(Date.UTC(2026, 5, 10)), 100);
    const g2 = await generateReport(T, { periodStart: P2.start, periodEnd: P2.end }); await markReportFiled(g2.reportId, ACTOR.actorEmail);
    await loss(new Date(Date.UTC(2026, 6, 10)), 100);
    const g3 = await generateReport(T, { periodStart: P3.start, periodEnd: P3.end }); await markReportFiled(g3.reportId, ACTOR.actorEmail);
    const p2End = await storedEnd(g2.reportId); // P2's last-filed onHandEnd (≈1800 L in gallons)
    assert(p2End > 0, `AMEND-1 chain: P1→P2→P3 filed with carry-forward (P2 onHandEnd = ${p2End} gal)`);

    // (i) Append a BACKDATED loss into the FILED P1 (May) → cascade marks P1, P2, P3.
    await loss(new Date(Date.UTC(2026, 4, 20)), 50);
    const statuses = await prisma.complianceReport.findMany({
      where: { id: { in: [g1.reportId, g2.reportId, g3.reportId] } }, select: { id: true, status: true },
    });
    assert(statuses.every((s) => s.status === "NEEDS_AMENDMENT"), "AMEND-1 (i): a backdated op into filed P1 flips P1, P2 AND P3 to NEEDS_AMENDMENT");

    // (ii) Regenerate P3 (no re-file yet): its begin must still read P2's LAST-FILED onHandEnd — the
    // carry-forward reads FILED OR NEEDS_AMENDMENT, so a marked P2 doesn't break the chain (A2).
    const p3draft = await generateReport(T, { periodStart: P3.start, periodEnd: P3.end, amendsReportId: g3.reportId });
    assert(Math.abs(gal(p3draft.fold) - p2End) < 0.01, `AMEND-1 (ii): P3 begin still chains through the marked P2 (${gal(p3draft.fold)} == P2 ${p2End}), not P1`);

    // (iii) Re-file P1 then P2 as AMENDED; regenerate P3 → its begin now picks up the CORRECTED P2 end.
    const a1 = await generateReport(T, { periodStart: P1.start, periodEnd: P1.end, amendsReportId: g1.reportId }); await markReportFiled(a1.reportId, ACTOR.actorEmail);
    const a2 = await generateReport(T, { periodStart: P2.start, periodEnd: P2.end, amendsReportId: g2.reportId }); await markReportFiled(a2.reportId, ACTOR.actorEmail);
    const p2AmendEnd = await storedEnd(a2.reportId);
    assert(Math.abs(p2AmendEnd - p2End) > 0.01, `AMEND-1 (iii): the re-filed P2 onHandEnd changed after the backdated loss (${p2AmendEnd} != ${p2End})`);
    const p3draft2 = await generateReport(T, { periodStart: P3.start, periodEnd: P3.end, amendsReportId: g3.reportId });
    assert(Math.abs(gal(p3draft2.fold) - p2AmendEnd) < 0.01, `AMEND-1 (iii): P3 begin now picks up the AMENDED P2 onHandEnd (${gal(p3draft2.fold)} == ${p2AmendEnd})`);
  });
  console.log(`  ✓ AMEND-1 chain assertions passed.`);
}

async function main() {
  console.log("Scrubbing synthetic tenant…");
  await runAsSystem((db) => db.organization.upsert({ where: { id: TENANT }, update: {}, create: { id: TENANT, name: "ZZ TTB Synthetic Winery", slug: TENANT } }));
  await scrub();

  await runAsTenant(TENANT, async () => {
    // Reference data. Phase 2: every tenant needs a primary bond (backfill created one for existing
    // tenants; this synthetic tenant is fresh, so seed it — generateReport defaults the 5120.17 to it).
    await prisma.bond.create({ data: { registryNumber: "BWN-ZZ-0001", isPrimary: true, premises: "ZZ Bonded Premises" } });
    const loc = await prisma.location.create({ data: { name: "ZZ Case Storage", isActive: true }, select: { id: true } });
    const v1 = await prisma.vessel.create({ data: { code: "ZZ-T1", type: "TANK", capacityL: 5000, isActive: true }, select: { id: true } });
    const v2 = await prisma.vessel.create({ data: { code: "ZZ-T2", type: "TANK", capacityL: 2000, isActive: true }, select: { id: true } });
    const v3 = await prisma.vessel.create({ data: { code: "ZZ-T3", type: "TANK", capacityL: 2000, isActive: true }, select: { id: true } });

    // Prior-period stock (June) → July on-hand beginning.
    const lotA = await seedLot("ZZ-CAB-2025", v1.id, 2000, JUNE, "WINE"); // still, class a
    const lotB = await seedLot("ZZ-PORT-2025", v2.id, 500, JUNE, "WINE"); // port, class b
    await seedReading(lotA, 13.5, new Date(Date.UTC(YEAR, MONTH - 2, 21)));
    await seedReading(lotB, 18.5, new Date(Date.UTC(YEAR, MONTH - 2, 21)));

    // A fermented lot (MUST→WINE in July) to demonstrate line A2 "produced by fermentation".
    const lotC = await seedLot("ZZ-CHARD-2025", v3.id, 800, new Date(Date.UTC(YEAR, MONTH - 1, 2)), "MUST");
    await seedReading(lotC, 12.0, new Date(Date.UTC(YEAR, MONTH - 1, 3)));
    await prisma.lotStateEvent.create({
      data: { lotId: lotC, kind: "FORM", fromValue: "MUST", toValue: "WINE", observedAt: new Date(Date.UTC(YEAR, MONTH - 1, 3)), enteredByEmail: ACTOR.actorEmail },
    });
    await prisma.lot.update({ where: { id: lotC }, data: { form: "WINE" } });

    // July flows: bottle 800 bottles (600 L) of lot A, remove taxpaid (bulk), and a loss.
    await executeBottling({ vesselIds: [v1.id], destinationLocationId: loc.id, skuName: "ZZ Cabernet", skuVintage: 2025, bottlesProduced: 800, abv: 13.5, date: new Date() }, ACTOR);
    await removeTaxpaidCore(ACTOR, { vesselId: v1.id, volumeL: 200, disposition: "TAXPAID" });
    const rmB = await removeTaxpaidCore(ACTOR, { vesselId: v2.id, volumeL: 50, disposition: "TAXPAID" }); // V2 has no later activity → cleanly reversible (LIFO)
    await recordLossCore(ACTOR, { vesselId: v1.id, lossL: 15 });

    // Bottled removal: pour 12 bottles for tasting (§B line 11) out of finished goods.
    const inv = await prisma.bottledInventory.findFirst({ where: { locationId: loc.id }, select: { wineSkuId: true, locationId: true } });
    if (inv) await removeBottledCore(ACTOR, { wineSkuId: inv.wineSkuId, locationId: inv.locationId, bottles: 12, disposition: "TASTING" });

    // ── Generate + assert ──
    console.log("Generating July report…");
    const gen = await generateReport(TENANT, { periodStart: START, periodEnd: END, cadence: "MONTHLY" });
    const report = await prisma.complianceReport.findUnique({ where: { id: gen.reportId } });
    const snap = report!.computed as unknown as import("@/lib/compliance/generate").ComputedSnapshot;

    assert(gen.fold.balanced, "every §A/§B column foots (Begin + Add − Remove = End)");
    assert(gen.fold.a13EqualsB2, "§A line 13 (bottled) == §B line 2 (bottled in)");
    assert(gen.fold.needsAbvLotIds.length === 0, "no ABV-review blockers (all lots classified)");

    const cell = (section: "A" | "B", line: number, col: string) =>
      snap.cells.find((c) => c.section === section && c.line === line && c.column === col)?.gallons ?? 0;
    assert(cell("A", 2, "A_LE16") > 0, `A2 produced-by-fermentation present (${cell("A", 2, "A_LE16")} gal, lot C)`);
    assert(cell("A", 13, "A_LE16") > 0, `A13 bottled present (${cell("A", 13, "A_LE16")} gal)`);
    assert(cell("A", 14, "A_LE16") > 0, `A14 removed-taxpaid class a present (${cell("A", 14, "A_LE16")} gal)`);
    assert(cell("A", 14, "B_16_21") > 0, `A14 removed-taxpaid class b (port) present (${cell("A", 14, "B_16_21")} gal)`);
    assert(cell("A", 29, "A_LE16") > 0, `A29 loss present (${cell("A", 29, "A_LE16")} gal)`);
    assert(cell("B", 2, "A_LE16") > 0, `B2 bottled-in present (${cell("B", 2, "A_LE16")} gal)`);
    assert(Math.abs(cell("A", 13, "A_LE16") - cell("B", 2, "A_LE16")) < 0.01, "A13 gallons == B2 gallons (ftn 3)");
    assert(cell("B", 11, "A_LE16") > 0, `B11 used-for-tasting present from a bottled removal (${cell("B", 11, "A_LE16")} gal)`);
    assert(cell("B", 8, "A_LE16") === 0, "the tasting removal did NOT mis-post as B8 taxpaid");

    // ── PDF round-trip ──
    console.log("Filling + re-reading the TTB PDF…");
    const { bytes, unmappedCells } = await fillTtbPdf({
      computed: snap,
      periodStart: report!.periodStart,
      periodEnd: report!.periodEnd,
      cadence: report!.cadence,
      version: report!.version,
      isFinalBusinessReport: report!.isFinalBusinessReport,
      remarks: report!.remarks,
      profile: { ein: "12-3456789", registryNumber: "BWN-ZZ-0001", operatedBy: "ZZ TTB Synthetic Winery" },
    });
    assert(bytes.length > 1000, `filled PDF produced (${Math.round(bytes.length / 1024)} KB)`);
    assert(unmappedCells.length === 0, `every snapshot cell mapped to a form field (unmapped: ${unmappedCells.join(", ") || "none"})`);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    assert(form.getTextField("a1.13").getText() === cell("A", 13, "A_LE16").toFixed(2), "PDF §A13 cell == snapshot");
    assert(form.getTextField("a2.2").getText() === cell("B", 2, "A_LE16").toFixed(2), "PDF §B2 cell == snapshot");
    assert(form.getTextField("EIN").getText() === "12-3456789", "PDF header EIN filled");

    // ── File → TAXPAID-1 terminal + RETURN_TO_BOND (R1) + AMEND-1 cascade ──
    console.log("Filing, then proving tax-paid is terminal + AMEND-1 cascade…");
    await markReportFiled(gen.reportId, ACTOR.actorEmail);
    const filed = await prisma.complianceReport.findUnique({ where: { id: gen.reportId }, select: { status: true, filerSnapshot: true, bondId: true } });
    assert(filed!.status === "FILED", "report marked FILED (immutable)");
    assert(filed!.bondId != null, "filed 5120.17 is scoped to a bond (C6 per-bond chain)");
    assert(filed!.filerSnapshot != null, "filer identity snapshotted onto the report at FILE (OQ-2/CO-8)");

    // TAXPAID-1 (R1, IRON RULE): the port removal is now TERMINAL — the generic reverser REFUSES it
    // (was: reverseOperationCore undid it and A14 shrank). This is the reversal-step update R1 mandates.
    let refused = false;
    try {
      await reverseOperationCore(ACTOR, { operationId: rmB.operationId });
    } catch {
      refused = true;
    }
    assert(refused, "reverseOperationCore REFUSES a REMOVE_TAXPAID (tax-paid boundary is terminal — R1)");

    // The ONE sanctioned re-admission: RETURN_TO_BOND the 50 L port back into v2. Recorded in July (a
    // now-FILED period) → the AMEND-1 cascade flips July's report to NEEDS_AMENDMENT.
    await returnToBondCore(ACTOR, { lotId: rmB.lotId, vesselId: v2.id, volumeL: 50 });
    const afterReturn = await prisma.complianceReport.findUnique({ where: { id: gen.reportId }, select: { status: true } });
    assert(afterReturn!.status === "NEEDS_AMENDMENT", "AMEND-1: an op appended into the FILED July period flips it to NEEDS_AMENDMENT");

    const amend = await generateReport(TENANT, { periodStart: START, periodEnd: END, cadence: "MONTHLY", amendsReportId: gen.reportId });
    const amended = await prisma.complianceReport.findUnique({ where: { id: amend.reportId }, select: { version: true, amendsReportId: true } });
    assert(amended!.version === "AMENDED", "regeneration after the return is an AMENDED report");
    assert(amended!.amendsReportId === gen.reportId, "AMENDED report references the original (immutable) report");
    assert(amend.fold.balanced, "amended report still foots after the return-to-bond");
    // RETURN_TO_BOND posts §A11 (taxpaid wine returned to bulk); the original A14 removal stays (terminal).
    const a11b = amend.fold.cells.find((c) => c.section === "A" && c.line === 11 && c.column === "B_16_21")?.gallons ?? 0;
    const a14bAmend = amend.fold.cells.find((c) => c.section === "A" && c.line === 14 && c.column === "B_16_21")?.gallons ?? 0;
    assert(a11b > 0, `A11 taxpaid-returned-to-bulk (class b) present after the return (${a11b} gal)`);
    assert(Math.abs(a14bAmend - cell("A", 14, "B_16_21")) < 0.01, "A14 class b UNCHANGED (removal is terminal; the return posts A11, never a reversal)");

    console.log(`\n✅ verify-ttb: ${passed} assertions passed. Synthetic tenant '${TENANT}' left seeded for inspection.`);
  });

  await verifyAmendChain();
}

main()
  .catch((e) => {
    console.error("\n❌ verify-ttb FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
