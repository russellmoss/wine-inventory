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
    await db.complianceReport.deleteMany({ where: { tenantId: t } });
    await db.complianceProfile.deleteMany({ where: { tenantId: t } });
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

async function main() {
  console.log("Scrubbing synthetic tenant…");
  await runAsSystem((db) => db.organization.upsert({ where: { id: TENANT }, update: {}, create: { id: TENANT, name: "ZZ TTB Synthetic Winery", slug: TENANT } }));
  await scrub();

  await runAsTenant(TENANT, async () => {
    // Reference data.
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

    // ── File → reverse a removal (024 undo, C5 period) → amend ──
    console.log("Filing, then amending after a correction…");
    await markReportFiled(gen.reportId, ACTOR.actorEmail);
    const filed = await prisma.complianceReport.findUnique({ where: { id: gen.reportId }, select: { status: true } });
    assert(filed!.status === "FILED", "report marked FILED (immutable)");

    await reverseOperationCore(ACTOR, { operationId: rmB.operationId }); // undo the 50 L class-b (port) taxpaid removal
    const amend = await generateReport(TENANT, { periodStart: START, periodEnd: END, cadence: "MONTHLY", amendsReportId: gen.reportId });
    const amended = await prisma.complianceReport.findUnique({ where: { id: amend.reportId }, select: { version: true, amendsReportId: true } });
    assert(amended!.version === "AMENDED", "regeneration after a correction is an AMENDED report");
    assert(amended!.amendsReportId === gen.reportId, "AMENDED report references the original (immutable) report");
    const amendSnap = amend.fold;
    assert(amendSnap.balanced, "amended report still foots after the correction");
    // The reversed removal's CORRECTION lands in July (C5) → A14 class b nets to zero.
    const a14bAfterAmend = amendSnap.cells.find((c) => c.section === "A" && c.line === 14 && c.column === "B_16_21")?.gallons ?? 0;
    assert(a14bAfterAmend < cell("A", 14, "B_16_21"), `A14 class b reduced after undoing the port removal (${a14bAfterAmend} < ${cell("A", 14, "B_16_21")})`);

    console.log(`\n✅ verify-ttb: ${passed} assertions passed. Synthetic tenant '${TENANT}' left seeded for inspection.`);
  });
}

main()
  .catch((e) => {
    console.error("\n❌ verify-ttb FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
