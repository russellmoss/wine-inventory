import { prisma } from "@/lib/prisma";
import type { LotForm } from "@/lib/ledger/vocabulary";
import { deriveTaxClass } from "./tax-class";
import { resolveTaxAbvForLots } from "./abv";
import { litersToGallons } from "./gallons";
import { mapLineToForm, type MovementSource, type ReportableOpType } from "./form-map";
import {
  foldPeriodCells,
  type BeginCell,
  type LineContribution,
  type OnHand,
  type FoldPeriodResult,
} from "./period-fold";
import type { SparklingMethodLike, SparklingSub, WineTaxClass } from "./types";
import { OPS_FORM, formScope } from "./form-type";

// Unit 8 — the DB orchestration that turns the tenant ledger into the pure fold's inputs, then folds.
// It resolves each lot's tax class (ABV as-of the event + productType/carbonation/sparkling method,
// with saved overrides), computes physical on-hand at the period boundaries, maps within-period
// movements to §A/§B lines via mapLineToForm, and hands everything to foldPeriodCells (the GATE-
// validated arithmetic). Footing is guaranteed by construction (S1 drift → A9/A30/B19).
//
// v1 captures the still-wine path (ferment→A2, bottle→A13/B2, remove-taxpaid→A14–A23, loss→A29,
// cross-class blend→A5/A20) + sparkling in-process (BOTTLE_STORAGE) fully; anything uncaptured lands
// on the reconcile line and is flagged, never silently mis-posted.

const num = (d: unknown) => Number(d as number);

export type PerLotClass = {
  lotId: string;
  lotCode: string;
  taxClass: WineTaxClass;
  sparklingSub: SparklingSub;
  needsAbvReview: boolean;
  abv: number | null;
  overridden: boolean;
  reason: string;
};

export type GeneratedFold = FoldPeriodResult & {
  /** Per-lot classification (for the audit backing + override UI + anomaly checks). */
  perLot: PerLotClass[];
  /** Lots whose class rests on a missing/edge ABV — these BLOCK filing until resolved (OV#6). */
  needsAbvLotIds: string[];
};

type LineRow = {
  lotId: string;
  deltaL: number;
  bucket: string;
  reason: string | null;
  lotCode: string;
  opId: number;
  opType: string;
  observedAt: Date;
  metadata: unknown;
  correctsOperationId: number | null;
};

/** Lot form as-of a timestamp, from LotStateEvent FORM transitions (fallback: the lot's current form). */
async function formAsOfMap(lotIds: string[], asOf: Date): Promise<Map<string, LotForm>> {
  const out = new Map<string, LotForm>();
  if (lotIds.length === 0) return out;
  const lots = await prisma.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, form: true } });
  for (const l of lots) out.set(l.id, l.form);
  const events = await prisma.lotStateEvent.findMany({
    where: { lotId: { in: lotIds }, kind: "FORM", observedAt: { lte: asOf } },
    orderBy: { observedAt: "asc" },
    select: { lotId: true, toValue: true },
  });
  // The latest FORM transition ≤ asOf wins (events are asc → last write per lot is newest).
  for (const e of events) out.set(e.lotId, e.toValue as LotForm);
  return out;
}

/** MUST/JUICE→WINE transitions in [start,end] → the "produced by fermentation" (A2) volume per lot. */
async function fermentToWineEvents(start: Date, end: Date): Promise<{ lotId: string; observedAt: Date }[]> {
  const events = await prisma.lotStateEvent.findMany({
    where: { kind: "FORM", toValue: "WINE", observedAt: { gte: start, lte: end } },
    select: { lotId: true, observedAt: true },
  });
  return events;
}

export async function resolveClassesForLots(
  lotIds: string[],
  asOf: Date,
  overrides: Record<string, WineTaxClass>,
): Promise<Map<string, PerLotClass>> {
  const out = new Map<string, PerLotClass>();
  const ids = [...new Set(lotIds)].filter(Boolean);
  if (ids.length === 0) return out;

  const [lots, states, abvByLot] = await Promise.all([
    prisma.lot.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, productType: true, carbonation: true } }),
    prisma.bottledLotState.findMany({ where: { lotId: { in: ids } }, select: { lotId: true, method: true } }),
    resolveTaxAbvForLots(ids, asOf),
  ]);
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const methodByLot = new Map(states.map((s) => [s.lotId, s.method as SparklingMethodLike]));

  for (const id of ids) {
    const lot = lotById.get(id);
    const abvRes = abvByLot.get(id) ?? { abv: null, source: "none" as const };
    const method = methodByLot.get(id) ?? null;
    const override = overrides[id];
    const derived = deriveTaxClass({
      abv: abvRes.abv,
      productType: (lot?.productType as "WINE" | "HARD_CIDER") ?? "WINE",
      carbonation: (lot?.carbonation as "NONE" | "NATURAL" | "ARTIFICIAL") ?? "NONE",
      sparklingMethod: method,
    });
    out.set(id, {
      lotId: id,
      lotCode: lot?.code ?? id,
      taxClass: override ?? derived.taxClass,
      sparklingSub: (override ? (override === "E_SPARKLING" ? derived.sparklingSub : null) : derived.sparklingSub),
      needsAbvReview: override ? false : derived.needsAbvReview,
      abv: abvRes.abv,
      overridden: override != null,
      reason: override ? "manual-override" : derived.reason,
    });
  }
  return out;
}

/**
 * §B still-wine on-hand from FINISHED GOODS (BottledInventory/StockMovement), which is NOT in the
 * ledger (still bottling exits via an EXTERNAL "bottle" leg → finished goods). Bottles on hand as-of
 * T per SKU = Σ BOTTLED_WINE StockMovement.deltaUnits (createdAt ≤ T); volume = bottles × size; class
 * from the SKU's bottled ABV + method (R4: §B on-hand unions finished-goods + sparkling in-process).
 */
async function bottledGoodsCells(asOf: Date): Promise<OnHand[]> {
  const [runs, movements] = await Promise.all([
    prisma.bottlingRun.findMany({ orderBy: { date: "asc" }, select: { wineSkuId: true, bottledAbv: true, wineSku: { select: { bottleSizeMl: true, method: true } } } }),
    prisma.stockMovement.findMany({ where: { itemKind: "BOTTLED_WINE", createdAt: { lte: asOf } }, select: { wineSkuId: true, deltaUnits: true } }),
  ]);
  const skuInfo = new Map<string, { abv: number | null; method: SparklingMethodLike | null; sizeMl: number }>();
  for (const r of runs) if (r.wineSkuId) skuInfo.set(r.wineSkuId, { abv: r.bottledAbv == null ? null : num(r.bottledAbv), method: (r.wineSku.method as SparklingMethodLike) ?? null, sizeMl: r.wineSku.bottleSizeMl });
  const bottlesBySku = new Map<string, number>();
  for (const m of movements) if (m.wineSkuId) bottlesBySku.set(m.wineSkuId, (bottlesBySku.get(m.wineSkuId) ?? 0) + m.deltaUnits);

  const acc = new Map<string, OnHand>();
  for (const [skuId, bottles] of bottlesBySku) {
    if (bottles <= 0) continue;
    const info = skuInfo.get(skuId);
    if (!info) continue;
    const liters = bottles * (info.sizeMl / 1000);
    const cls = deriveTaxClass({ abv: info.abv, productType: "WINE", carbonation: "NONE", sparklingMethod: info.method });
    const key = `${cls.taxClass}:${cls.sparklingSub ?? "-"}`;
    const cur = acc.get(key);
    if (cur) cur.liters += liters;
    else acc.set(key, { section: "B", column: cls.taxClass, sub: cls.sparklingSub, liters });
  }
  return [...acc.values()];
}

/**
 * §B bottled removals = NEGATIVE BOTTLED_WINE StockMovements in the period, mapped to the right §B
 * line by the movement's disposition `reason` (tagged by removeBottledCore / Commerce7): TAXPAID→B8,
 * TASTING→B11, EXPORT→B12, FAMILY_USE→B13, TESTING→B14, BREAKAGE→B18. Movements with NO recognized
 * disposition are left to the B19 reconcile (an unexplained bottled shortage — honest, ftn 4), never
 * silently posted as a taxpaid removal.
 */
async function bottledGoodsRemovals(start: Date, end: Date): Promise<LineContribution[]> {
  const [runs, sales] = await Promise.all([
    prisma.bottlingRun.findMany({ orderBy: { date: "asc" }, select: { wineSkuId: true, bottledAbv: true, wineSku: { select: { bottleSizeMl: true, method: true } } } }),
    prisma.stockMovement.findMany({ where: { itemKind: "BOTTLED_WINE", createdAt: { gte: start, lte: end }, deltaUnits: { lt: 0 } }, select: { wineSkuId: true, deltaUnits: true, reason: true } }),
  ]);
  const skuInfo = new Map<string, { abv: number | null; method: SparklingMethodLike | null; sizeMl: number }>();
  for (const r of runs) if (r.wineSkuId) skuInfo.set(r.wineSkuId, { abv: r.bottledAbv == null ? null : num(r.bottledAbv), method: (r.wineSku.method as SparklingMethodLike) ?? null, sizeMl: r.wineSku.bottleSizeMl });

  const out: LineContribution[] = [];
  for (const m of sales) {
    if (!m.wineSkuId) continue;
    const info = skuInfo.get(m.wineSkuId);
    if (!info) continue;
    const reason = (m.reason ?? "").toUpperCase();
    const cls = deriveTaxClass({ abv: info.abv, productType: "WINE", carbonation: "NONE", sparklingMethod: info.method });
    const liters = Math.abs(m.deltaUnits) * (info.sizeMl / 1000);
    // Route the disposition through the single form-map authority (E4).
    const target =
      reason === "BREAKAGE"
        ? mapLineToForm({ opType: "LOSS", reason: "loss", source: "BOTTLED", deltaSign: 1, taxClass: cls.taxClass, sparklingSub: cls.sparklingSub }).target
        : mapLineToForm({ opType: "REMOVE_TAXPAID", reason, source: "BOTTLED", deltaSign: 1, taxClass: cls.taxClass, sparklingSub: cls.sparklingSub }).target;
    if (!target) continue; // untagged / unrecognized → falls to the B19 shortage reconcile
    out.push({ section: target.section, line: target.line, column: cls.taxClass, sub: target.sub, liters });
  }
  return out;
}

/** Fold ledger lines (bucket, observedAt ≤ asOf) into per-lot liters. */
function onHandByLot(lines: LineRow[], bucket: string, asOf: Date): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (l.bucket !== bucket) continue;
    if (l.observedAt > asOf) continue;
    m.set(l.lotId, (m.get(l.lotId) ?? 0) + l.deltaL);
  }
  return m;
}

/** Group per-lot liters into §-column on-hand cells (WINE-form filter for §A). */
function onHandCells(
  section: "A" | "B",
  byLot: Map<string, number>,
  classes: Map<string, PerLotClass>,
  forms: Map<string, LotForm> | null,
  wineOnly: boolean,
): OnHand[] {
  const acc = new Map<string, OnHand>();
  for (const [lotId, liters] of byLot) {
    if (liters <= 0.01) continue;
    if (wineOnly && forms && forms.get(lotId) !== "WINE") continue; // §A bulk = WINE-form only (C2)
    const c = classes.get(lotId);
    if (!c) continue;
    const key = `${c.taxClass}:${c.sparklingSub ?? "-"}`;
    const cur = acc.get(key);
    if (cur) cur.liters += liters;
    else acc.set(key, { section, column: c.taxClass, sub: c.sparklingSub, liters });
  }
  return [...acc.values()];
}

/**
 * Fold one period into the §A/§B grid. `tenantId` is explicit (K12: never read the ALS tenant here).
 * Returns the pure fold result plus per-lot classification + the ABV-review blocker list.
 */
export async function foldPeriod(
  tenantId: string,
  range: { start: Date; end: Date },
  overrides: Record<string, WineTaxClass> = {},
): Promise<GeneratedFold> {
  const { start, end } = range;

  // 1. Load every ledger line up to period end (single winery scale; batched — E5).
  const rawLines = await prisma.lotOperationLine.findMany({
    where: { operation: { observedAt: { lte: end } } },
    select: {
      lotId: true,
      deltaL: true,
      bucket: true,
      reason: true,
      lotCode: true,
      operation: { select: { id: true, type: true, observedAt: true, metadata: true, correctsOperationId: true } },
    },
  });
  const lines: LineRow[] = rawLines.map((l) => ({
    lotId: l.lotId,
    deltaL: num(l.deltaL),
    bucket: l.bucket,
    reason: l.reason,
    lotCode: l.lotCode,
    opId: l.operation.id,
    opType: l.operation.type,
    observedAt: l.operation.observedAt,
    metadata: l.operation.metadata,
    correctsOperationId: l.operation.correctsOperationId,
  }));

  const allLotIds = [...new Set(lines.map((l) => l.lotId))];
  const [classes, forms] = await Promise.all([
    resolveClassesForLots(allLotIds, end, overrides),
    formAsOfMap(allLotIds, end),
  ]);

  // 2. Begin balances — carry forward from the prior FILED report (S3), else first-report full fold.
  // C4/E1: scope to the 5120.17 form or an excise return would become the operations carry-forward.
  const prior = await prisma.complianceReport.findFirst({
    where: { ...formScope(OPS_FORM), status: "FILED", periodEnd: { lt: start } },
    orderBy: [{ periodEnd: "desc" }, { generatedAt: "desc" }],
    select: { onHandEnd: true },
  });
  let begin: BeginCell[];
  if (prior) {
    begin = (prior.onHandEnd as unknown as { section: "A" | "B"; column: WineTaxClass; sub: SparklingSub; gallons: number }[]) ?? [];
  } else {
    // First report: fold physical on-hand strictly BEFORE the period start, convert to gallons.
    const beforeStart = new Date(start.getTime() - 1);
    const bulkBegin = onHandCells("A", onHandByLot(lines, "VESSEL", beforeStart), classes, forms, true);
    const bottleBegin = onHandCells("B", onHandByLot(lines, "BOTTLE_STORAGE", beforeStart), classes, forms, false);
    const goodsBegin = await bottledGoodsCells(beforeStart);
    begin = [...bulkBegin, ...bottleBegin, ...goodsBegin].map((c) => ({ section: c.section, column: c.column, sub: c.sub, gallons: litersToGallons(c.liters) }));
  }

  // 3. Physical on-hand at period END (the reconciliation anchor). §B unions sparkling in-process
  //    (BOTTLE_STORAGE ledger) + still finished goods (BottledInventory/StockMovement) — R4.
  const endLiters: OnHand[] = [
    ...onHandCells("A", onHandByLot(lines, "VESSEL", end), classes, forms, true),
    ...onHandCells("B", onHandByLot(lines, "BOTTLE_STORAGE", end), classes, forms, false),
    ...(await bottledGoodsCells(end)),
  ];

  // 4. Within-period flows → contributions (mapLineToForm per boundary leg).
  const periodLines = lines.filter((l) => l.observedAt >= start && l.observedAt <= end);
  const contributions: LineContribution[] = [];
  const partX = new Set<string>();

  // 4a. Produced-by-fermentation (A2): MUST/JUICE→WINE transitions in the period.
  const fermentEvents = await fermentToWineEvents(start, end);
  for (const ev of fermentEvents) {
    const c = classes.get(ev.lotId);
    if (!c) continue;
    // A2 volume = the lot's bulk volume as-of the transition.
    const vol = onHandByLot(lines.filter((l) => l.lotId === ev.lotId), "VESSEL", ev.observedAt).get(ev.lotId) ?? 0;
    if (vol <= 0.01) continue;
    const r = mapLineToForm({ opType: "FERMENT_TO_WINE", reason: null, source: "BULK", deltaSign: 1, taxClass: c.taxClass, sparklingSub: c.sparklingSub });
    if (r.target) contributions.push({ section: r.target.section, line: r.target.line, column: c.taxClass, sub: r.target.sub, liters: vol });
  }

  // 4b. Ledger-line-driven flows.
  // Precompute per-op the set of tax classes among its lots (for cross-class blend detection, ftn5).
  const opLotClasses = new Map<number, Set<string>>();
  for (const l of periodLines) {
    const c = classes.get(l.lotId);
    if (!c) continue;
    if (!opLotClasses.has(l.opId)) opLotClasses.set(l.opId, new Set());
    opLotClasses.get(l.opId)!.add(c.taxClass);
  }
  // Per-op type + metadata (so a CORRECTION line can resolve WHAT it reverses). A CORRECTION's lines
  // already carry the exact-negated deltaL, so its external leg is −V; using that signed delta makes
  // it NET against the original in the same line/column (no separate sign handling needed).
  const typeByOp = new Map<number, string>();
  const metaByOp = new Map<number, { disposition?: string; source?: string }>();
  for (const l of lines) {
    typeByOp.set(l.opId, l.opType);
    metaByOp.set(l.opId, (l.metadata ?? {}) as { disposition?: string; source?: string });
  }

  // Push a contribution using the leg's SIGNED liters (forward +V, correction −V → nets to zero).
  const push = (opType: ReportableOpType, l: LineRow, source: MovementSource, signedLiters: number, reason: string | null, crosses?: boolean) => {
    const c = classes.get(l.lotId);
    if (!c) return;
    const r = mapLineToForm({ opType, reason, source, deltaSign: signedLiters >= 0 ? 1 : -1, taxClass: c.taxClass, sparklingSub: c.sparklingSub, crossesTaxClass: crosses });
    if (r.partXReason) partX.add(r.partXReason);
    if (!r.target) return;
    contributions.push({ section: r.target.section, line: r.target.line, column: c.taxClass, sub: r.target.sub, liters: signedLiters });
  };

  for (const l of periodLines) {
    const baseOp = l.opType === "CORRECTION" && l.correctsOperationId ? l.correctsOperationId : l.opId;
    const meta = metaByOp.get(baseOp) ?? {};
    const effType = typeByOp.get(baseOp) ?? l.opType; // for a CORRECTION, the type it reverses

    if (l.bucket === "EXTERNAL") {
      const r = l.reason ?? "";
      if (r === "bottle") {
        // Bulk out → A13; mirror the same signed volume into §B B2 (ftn 3).
        push("BOTTLE", l, "BULK", l.deltaL, null);
        push("BOTTLE", l, "BOTTLED", l.deltaL, null);
      } else if (r === "tax_removal") {
        push("REMOVE_TAXPAID", l, meta.source === "BOTTLED" ? "BOTTLED" : "BULK", l.deltaL, meta.disposition ?? null);
      } else if (r === "loss" || r === "dump" || r === "filtration" || r === "evaporation") {
        push("LOSS", l, "BULK", l.deltaL, r);
      }
      // "seed" / "crush_origination" / "dosage" external legs are not §A/§B summary flows.
    } else if (l.bucket === "VESSEL" && effType === "BLEND") {
      // Cross-class blend (ftn 5): parent draws (−) → A20 used; child (+) → A5 produced (both positive
      // magnitudes; the leg sign only picks the line). Same-class → null.
      const crosses = (opLotClasses.get(l.opId)?.size ?? 1) > 1;
      if (crosses) {
        const c = classes.get(l.lotId);
        if (c) {
          const r = mapLineToForm({ opType: "BLEND", reason: null, source: "BULK", deltaSign: l.deltaL >= 0 ? 1 : -1, taxClass: c.taxClass, sparklingSub: c.sparklingSub, crossesTaxClass: true });
          if (r.partXReason) partX.add(r.partXReason);
          if (r.target) contributions.push({ section: r.target.section, line: r.target.line, column: c.taxClass, sub: r.target.sub, liters: Math.abs(l.deltaL) });
        }
      }
    }
    // Other VESSEL legs (rack/topping/press/crush internal) net to zero within the section → skip.
  }

  // 4c. §B bottled taxpaid removals (sales) from finished-goods stock movements.
  contributions.push(...(await bottledGoodsRemovals(start, end)));

  const fold = foldPeriodCells({ begin, contributions, endLiters, partX: [...partX] });

  const perLot = [...classes.values()];
  const needsAbvLotIds = perLot.filter((c) => c.needsAbvReview).map((c) => c.lotId);
  return { ...fold, perLot, needsAbvLotIds };
}

// ─────────────────────────── Persistence (DRAFT generation + amendment) ───────────────────────────

export type ReportCadenceValue = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export type GenerateReportInput = {
  periodStart: Date;
  periodEnd: Date;
  cadence?: ReportCadenceValue;
  /** AMENDED: the ORIGINAL FILED report this supersedes (re-folds the period incl. corrections, C5). */
  amendsReportId?: string | null;
  overrides?: Record<string, WineTaxClass>;
  remarks?: string;
};

/** The stored `computed` Json snapshot shape (frozen at FILE — E2; re-derived for DRAFT). */
export type ComputedSnapshot = {
  cells: FoldPeriodResult["cells"];
  footings: FoldPeriodResult["footings"];
  balanced: boolean;
  a13EqualsB2: boolean;
  partX: string[];
  perLot: PerLotClass[];
  needsAbvLotIds: string[];
};

export type GenerateReportResult = { reportId: string; fold: GeneratedFold; downstreamStale: boolean };

/**
 * Generate + persist a DRAFT report for a period. Carry-forward begin comes from the prior FILED
 * report (S3). An AMENDED report re-folds the period (corrections assigned to it via C5) and appends
 * a Part X delta note. FILED rows are never mutated (E1) — this always writes a NEW row.
 */
export async function generateReport(tenantId: string, input: GenerateReportInput): Promise<GenerateReportResult> {
  const overrides = input.overrides ?? {};
  const fold = await foldPeriod(tenantId, { start: input.periodStart, end: input.periodEnd }, overrides);

  const version: "ORIGINAL" | "AMENDED" = input.amendsReportId ? "AMENDED" : "ORIGINAL";

  // Auto Part X remarks: the fold's material-discrepancy notes + a blocking-ABV heads-up.
  const autoRemarks = [...fold.partX];
  if (fold.needsAbvLotIds.length > 0) {
    autoRemarks.push(`${fold.needsAbvLotIds.length} lot(s) need an ABV before filing (defaulted to class a to keep the volume visible).`);
  }
  if (version === "AMENDED" && input.amendsReportId) {
    autoRemarks.push(`Amends report ${input.amendsReportId} — see corrected entries below.`);
  }
  const remarks = [input.remarks?.trim(), autoRemarks.join(" ")].filter(Boolean).join("\n\n");

  const computed: ComputedSnapshot = {
    cells: fold.cells,
    footings: fold.footings,
    balanced: fold.balanced,
    a13EqualsB2: fold.a13EqualsB2,
    partX: fold.partX,
    perLot: fold.perLot,
    needsAbvLotIds: fold.needsAbvLotIds,
  };

  const created = await prisma.complianceReport.create({
    data: {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      cadence: input.cadence ?? "MONTHLY",
      formType: OPS_FORM, // C4/E1: explicit even though it is the column default
      status: "DRAFT",
      version,
      amendsReportId: input.amendsReportId ?? null,
      onHandEnd: fold.onHandEndGallons as unknown as object,
      computed: computed as unknown as object,
      overrides: overrides as unknown as object,
      remarks,
    },
    select: { id: true },
  });

  // OV#7: amending a period invalidates the carried-forward begin of any later FILED report.
  // C4/E1: only later FILED 5120.17 reports are affected by a 5120.17 amendment.
  const downstreamStale =
    version === "AMENDED"
      ? (await prisma.complianceReport.count({ where: { ...formScope(OPS_FORM), status: "FILED", periodStart: { gte: input.periodEnd } } })) > 0
      : false;

  return { reportId: created.id, fold, downstreamStale };
}

/** Mark a DRAFT report FILED — freezes the snapshot as the legal audit record (E1/E2). Blocked when
 * any deterministic blocker is present (5120.17: ABV/balance OV#6; excise: ABV>24, missing rate,
 * negative tax — plan-026 U9). Returns the filed report id. */
export async function markReportFiled(reportId: string, filedByEmail: string): Promise<{ id: string }> {
  const report = await prisma.complianceReport.findUnique({ where: { id: reportId }, select: { status: true, formType: true, computed: true } });
  if (!report) throw new Error("Report not found.");
  if (report.status === "FILED") throw new Error("This report is already filed and immutable.");

  if (report.formType === "TTB_5000_24") {
    // Excise return: gate on the excise deterministic blockers (plan-026 U9).
    const { deterministicExciseAnomalies, hasFilingBlocker } = await import("./anomaly");
    const snapshot = report.computed as unknown as import("./excise").ExciseComputed;
    const findings = deterministicExciseAnomalies({ snapshot });
    const blocker = findings.find((f) => hasFilingBlocker([f]));
    if (blocker) throw new Error(`Can't file: ${blocker.message}`);
  } else {
    const computed = report.computed as unknown as ComputedSnapshot;
    if (computed?.needsAbvLotIds?.length) {
      throw new Error(`Can't file: ${computed.needsAbvLotIds.length} lot(s) still need an ABV. Resolve them (add a reading or a tax-ABV override) and regenerate.`);
    }
    if (computed && computed.balanced === false) {
      throw new Error("Can't file: the report does not balance. Review the flagged columns first.");
    }
  }

  await prisma.complianceReport.update({ where: { id: reportId }, data: { status: "FILED", filedAt: new Date(), filedByEmail } });
  return { id: reportId };
}
