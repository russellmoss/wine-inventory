/**
 * plan-026 — TTB F 5000.24 wine EXCISE-return engine, END-TO-END against a dedicated synthetic tenant
 * (never prod — keeps fake TTB data out of the real winery, RLS-isolated).
 *
 * Seeds taxpaid removals across TWO semimonthly periods in one calendar year, one crossing the 30k CBMA
 * tier, then drives the REAL pipeline the UI calls:
 *   • generateExciseReturn (period 1 + period 2) → asserts gross = Σ gal×rate, CBMA credit, net,
 *     and the STATELESS YTD ladder step-down (period 2 credited partly at the lower tier),
 *   • an EXEMPT (EXPORT) removal → $0 tax (council C5 taxpaid-only base),
 *   • fillExcisePdf → asserts the filled 5000.24 round-trips Tax.10 (gross) + Tax.21 (net),
 *   • file → reverse a removal (024 undo) → amend → asserts a reduced-tax AMENDED return,
 *   • C4/E1 regression: a FILED excise return must NOT feed the 5120.17 operations carry-forward.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-excise.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { removeTaxpaidCore } from "@/lib/compliance/removal-core";
import { generateExciseReturn } from "@/lib/compliance/generate-excise";
import { generateReport, markReportFiled } from "@/lib/compliance/generate";
import { fillExcisePdf } from "@/lib/compliance/fill-5000-24-pdf";
import { returnPeriodBounds } from "@/lib/compliance/return-cadence";
import { LITERS_PER_US_GALLON } from "@/lib/compliance/gallons";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import { PDFDocument } from "pdf-lib";
import type { LotForm } from "@/lib/ledger/vocabulary";

const TENANT = "org_zz_excise_synth";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-excise" };
const YEAR = 2026;
const gal2L = (g: number) => Math.round(g * LITERS_PER_US_GALLON * 100) / 100;

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

async function scrub() {
  await runAsSystem(async (db) => {
    const t = TENANT;
    await db.complianceReport.deleteMany({ where: { tenantId: t } });
    await db.complianceProfile.deleteMany({ where: { tenantId: t } });
    await db.analysisReading.deleteMany({ where: { tenantId: t } });
    await db.analysisPanel.deleteMany({ where: { tenantId: t } });
    await db.lotStateEvent.deleteMany({ where: { tenantId: t } });
    await db.lotOperationLine.deleteMany({ where: { tenantId: t } });
    await db.lotOperation.deleteMany({ where: { tenantId: t } });
    await db.vesselLot.deleteMany({ where: { tenantId: t } });
    await db.lot.deleteMany({ where: { tenantId: t } });
    await db.vessel.deleteMany({ where: { tenantId: t } });
    await db.location.deleteMany({ where: { tenantId: t } });
  });
}

async function seedReading(lotId: string, abv: number, observedAt: Date) {
  const panel = await prisma.analysisPanel.create({ data: { lotId, observedAt, enteredByEmail: ACTOR.actorEmail }, select: { id: true } });
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
  await runAsSystem((db) => db.organization.upsert({ where: { id: TENANT }, update: {}, create: { id: TENANT, name: "ZZ Excise Synthetic Winery", slug: TENANT } }));
  await scrub();

  await runAsTenant(TENANT, async () => {
    const p1 = returnPeriodBounds(YEAR, "SEMIMONTHLY", 0); // Jan 1–15
    const p2 = returnPeriodBounds(YEAR, "SEMIMONTHLY", 1); // Jan 16–31

    const v1 = await prisma.vessel.create({ data: { code: "ZZ-E1", type: "TANK", capacityL: 200_000, isActive: true }, select: { id: true } });
    const v2 = await prisma.vessel.create({ data: { code: "ZZ-E2", type: "TANK", capacityL: 20_000, isActive: true }, select: { id: true } });
    const v3 = await prisma.vessel.create({ data: { code: "ZZ-E3", type: "TANK", capacityL: 20_000, isActive: true }, select: { id: true } });

    const lotA = await seedLot("ZZ-E-A", v1.id, 150_000, new Date(Date.UTC(YEAR - 1, 11, 20)), "WINE"); // class a
    const lotB = await seedLot("ZZ-E-B", v2.id, 12_000, new Date(Date.UTC(YEAR - 1, 11, 20)), "WINE");
    const lotC = await seedLot("ZZ-E-C", v3.id, 12_000, new Date(Date.UTC(YEAR - 1, 11, 20)), "WINE");
    await seedReading(lotA, 13.5, new Date(Date.UTC(YEAR - 1, 11, 21)));
    await seedReading(lotB, 13.5, new Date(Date.UTC(YEAR - 1, 11, 21)));
    await seedReading(lotC, 13.5, new Date(Date.UTC(YEAR - 1, 11, 21)));

    // Period 1: remove 29,000 taxpaid gal (all tier-1 CBMA). Period 2: 2,000 gal (straddles 30k).
    await removeTaxpaidCore(ACTOR, { vesselId: v1.id, volumeL: gal2L(29_000), disposition: "TAXPAID", observedAt: new Date(Date.UTC(YEAR, 0, 10)) });
    const rmP2 = await removeTaxpaidCore(ACTOR, { vesselId: v2.id, volumeL: gal2L(2_000), disposition: "TAXPAID", observedAt: new Date(Date.UTC(YEAR, 0, 20)) });
    // An EXPORT removal in period 2 — tax-EXEMPT, must NOT be taxed (C5).
    await removeTaxpaidCore(ACTOR, { vesselId: v3.id, volumeL: gal2L(1_000), disposition: "EXPORT", observedAt: new Date(Date.UTC(YEAR, 0, 21)) });

    // ── Period 1 ──
    console.log("Generating period 1 (Jan 1–15)…");
    const g1 = await generateExciseReturn(TENANT, { periodStart: p1.start, periodEnd: p1.end, cadence: "SEMIMONTHLY" });
    assert(near(g1.computed.grossTax, 29_000 * 1.07, 2), `P1 gross ≈ 29000×$1.07 (${g1.computed.grossTax})`);
    assert(near(g1.computed.cbmaCredit, 29_000 * 1.0, 2), `P1 CBMA credit ≈ 29000×$1.00 (${g1.computed.cbmaCredit})`);
    assert(near(g1.netTax, g1.computed.grossTax - g1.computed.cbmaCredit, 0.01), `P1 net = gross − credit (${g1.netTax})`);
    assert(g1.computed.ladder.ytdRemovedStart === 0, "P1 YTD ladder starts at 0");

    // ── Period 2 (stateless YTD step-down) ──
    console.log("Generating period 2 (Jan 16–31)…");
    const g2 = await generateExciseReturn(TENANT, { periodStart: p2.start, periodEnd: p2.end, cadence: "SEMIMONTHLY" });
    assert(near(g2.computed.grossTax, 2_000 * 1.07, 2), `P2 gross ≈ 2000×$1.07 (${g2.computed.grossTax}) — EXPORT excluded (C5)`);
    assert(near(g2.computed.ladder.ytdRemovedStart, 29_000, 1), `P2 YTD ladder starts ≈ 29,000 (stateless recompute, C3) (${g2.computed.ladder.ytdRemovedStart})`);
    // Credit steps down: 1,000 gal @ $1.00 + 1,000 gal @ $0.90 = $1,900 (not 2,000 @ $1.00).
    assert(near(g2.computed.cbmaCredit, 1_900, 2), `P2 CBMA credit ≈ $1,900 (ladder step-down $1.00/$0.90) (${g2.computed.cbmaCredit})`);
    assert(g2.computed.cbmaCredit < g1.computed.cbmaCredit / 29 * 2 + 1, "P2 per-gallon credit is lower than P1 (tier step-down)");

    // ── PDF round-trip on period 2 ──
    console.log("Filling + re-reading the 5000.24 PDF (period 2)…");
    const { bytes, unmapped } = await fillExcisePdf({ computed: g2.computed, periodStart: p2.start, periodEnd: p2.end, profile: { ein: "12-3456789", registryNumber: "BWN-ZZ-0002", operatedBy: "ZZ Excise Synthetic Winery" } });
    assert(unmapped.length === 0, `every 5000.24 field mapped (unmapped: ${unmapped.join(", ") || "none"})`);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    assert(form.getTextField("Tax.10").getText() === g2.computed.grossTax.toFixed(2), "PDF Tax.10 == gross wine tax");
    assert(form.getTextField("Tax.21").getText() === g2.netTax.toFixed(2), "PDF Tax.21 (amount to pay) == net");
    assert(form.getTextField("Employer_ID").getText() === "12-3456789", "PDF header EIN filled");

    // ── File period 2 → reverse its removal → amend ──
    console.log("Filing period 2, then amending after reversing the removal…");
    await markReportFiled(g2.reportId, ACTOR.actorEmail);
    const filed = await prisma.complianceReport.findUnique({ where: { id: g2.reportId }, select: { status: true } });
    assert(filed!.status === "FILED", "period-2 return marked FILED (immutable)");

    await reverseOperationCore(ACTOR, { operationId: rmP2.operationId }); // undo the 2,000 gal taxpaid removal
    const amend = await generateExciseReturn(TENANT, { periodStart: p2.start, periodEnd: p2.end, cadence: "SEMIMONTHLY", amendsReportId: g2.reportId });
    const amended = await prisma.complianceReport.findUnique({ where: { id: amend.reportId }, select: { version: true, amendsReportId: true } });
    assert(amended!.version === "AMENDED", "regeneration after the reversal is an AMENDED return");
    assert(amended!.amendsReportId === g2.reportId, "AMENDED references the original FILED return");
    assert(amend.netTax < g2.netTax, `amended net tax reduced after the reversal (${amend.netTax} < ${g2.netTax})`);

    // ── C4/E1 regression: a FILED excise return must NOT feed the 5120.17 carry-forward ──
    console.log("C4 regression: 5120.17 carry-forward must ignore the FILED excise return…");
    await markReportFiled(g1.reportId, ACTOR.actorEmail); // a FILED excise return exists for Jan 1–15
    const ops = await generateReport(TENANT, {
      periodStart: new Date(Date.UTC(YEAR, 2, 1)),
      periodEnd: new Date(Date.UTC(YEAR, 2, 31, 23, 59, 59, 999)),
      cadence: "MONTHLY",
    });
    // If the excise onHandEnd ({ytdRemovedGal}) had been used as the 5120.17 begin, the fold would be
    // corrupted (not a BeginCell[]) → not balanced. Scoping to OPS_FORM keeps it clean.
    assert(ops.fold.balanced, "the 5120.17 report still balances (excise return did NOT become its carry-forward)");

    console.log(`\n✅ verify-excise: ${passed} assertions passed. Synthetic tenant '${TENANT}' left seeded for inspection.`);
  });
}

main()
  .catch((e) => {
    console.error("\n❌ verify-excise FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
