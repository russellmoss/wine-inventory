import { describe, it, expect } from "vitest";
import {
  daysAgo,
  dedupePhysicalTreatments,
  filterOperationItems,
  operationLabel,
  rankByStaleness,
  resolveOperationFilter,
  tallyByType,
  type SweepInput,
} from "@/lib/cellar/operation-history";
import type { OpItem, TimelineItem } from "@/lib/lot/timeline";

// Pure-logic tests for the assistant's operation-history read (query_operations). No DB, no React —
// these pin the judgment calls that decide whether an answer is honest: which ops a filter word
// reaches, whether a reversed op counts as having happened, and whether a vessel that has never been
// punched down can vanish from an "overdue" answer.

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-22T12:00:00.000Z");

function op(over: Partial<OpItem> & { id: number; type: string }): OpItem {
  const observedAt = over.observedAt ?? new Date(NOW).toISOString();
  return {
    kind: "OP",
    observedAt,
    dateLabel: observedAt.slice(0, 10),
    timeLabel: "12:00",
    enteredBy: "cellar@demowinery.test",
    captureMethod: "MANUAL",
    note: null,
    supplementalNote: null,
    displayLabel: null,
    summary: `${over.type} summary`,
    legs: [],
    treatments: [],
    isCorrection: false,
    correctsId: null,
    corrected: false,
    voided: false,
    ...over,
  } as OpItem;
}

describe("resolveOperationFilter — cellar words to ledger types", () => {
  it("returns no filter for an empty list", () => {
    expect(resolveOperationFilter([])).toEqual({ types: null, unknown: [] });
  });

  it("maps the vernacular a winemaker actually says", () => {
    expect(resolveOperationFilter(["additions"]).types).toEqual(["ADDITION"]);
    expect(resolveOperationFilter(["punchdowns"]).types).toEqual(["CAP_MGMT"]);
    expect(resolveOperationFilter(["pump-over"]).types).toEqual(["CAP_MGMT"]);
    expect(resolveOperationFilter(["batonnage"]).types).toEqual(["CAP_MGMT"]);
    expect(resolveOperationFilter(["racking"]).types).toEqual(["RACK"]);
    expect(resolveOperationFilter(["transfers"]).types).toEqual(["RACK"]);
    expect(resolveOperationFilter(["toppings"]).types).toEqual(["TOPPING"]);
    expect(resolveOperationFilter(["filtration"]).types).toEqual(["FILTRATION"]);
    expect(resolveOperationFilter(["bottling"]).types).toEqual(["BOTTLE"]);
  });

  it("accepts canonical ledger type names verbatim, including the underscored one", () => {
    expect(resolveOperationFilter(["CAP_MGMT"]).types).toEqual(["CAP_MGMT"]);
    expect(resolveOperationFilter(["cap mgmt"]).types).toEqual(["CAP_MGMT"]);
    expect(resolveOperationFilter(["REMOVE_TAXPAID"]).types).toEqual(["REMOVE_TAXPAID"]);
  });

  it("expands a word that legitimately covers two types, without duplicating", () => {
    expect(resolveOperationFilter(["treatments"]).types).toEqual(["ADDITION", "FINING"]);
    expect(resolveOperationFilter(["additions", "adds", "dose"]).types).toEqual(["ADDITION"]);
  });

  it("reports an unrecognized word rather than silently narrowing the question", () => {
    const r = resolveOperationFilter(["additions", "sparging"]);
    expect(r.types).toEqual(["ADDITION"]);
    expect(r.unknown).toEqual(["sparging"]);
  });

  it("returns types:null when NOTHING matched, so the caller can refuse instead of returning everything", () => {
    const r = resolveOperationFilter(["sparging"]);
    expect(r.types).toBeNull();
    expect(r.unknown).toEqual(["sparging"]);
  });
});

describe("operationLabel", () => {
  it("labels a cap-management op with its specific technique", () => {
    expect(operationLabel("CAP_MGMT", "PUNCHDOWN")).toBe("Punch-down");
    expect(operationLabel("CAP_MGMT", null)).toBe("Cap mgmt");
  });

  it("falls back to sentence case for a type with no chip label", () => {
    expect(operationLabel("RACK")).toBe("Rack");
    expect(operationLabel("BLEND")).toBe("Blend");
  });
});

describe("daysAgo", () => {
  it("floors to whole days", () => {
    expect(daysAgo(NOW - 3 * DAY - 3600_000, NOW)).toBe(3);
    expect(daysAgo(NOW, NOW)).toBe(0);
  });

  it("clamps a future-dated (backdated-forward) observation to 0 rather than reporting negative days", () => {
    expect(daysAgo(NOW + 2 * DAY, NOW)).toBe(0);
  });
});

describe("filterOperationItems", () => {
  const items: TimelineItem[] = [
    op({ id: 10, type: "ADDITION", observedAt: new Date(NOW - 1 * DAY).toISOString() }),
    op({ id: 9, type: "CAP_MGMT", observedAt: new Date(NOW - 2 * DAY).toISOString() }),
    op({ id: 8, type: "ADDITION", observedAt: new Date(NOW - 10 * DAY).toISOString() }),
    op({ id: 7, type: "RACK", observedAt: new Date(NOW - 12 * DAY).toISOString() }),
    { kind: "MEASUREMENT", id: "p1", observedAt: new Date(NOW).toISOString() } as unknown as TimelineItem,
    { kind: "WORK_ORDER", id: "w1", observedAt: new Date(NOW).toISOString() } as unknown as TimelineItem,
  ];

  it("keeps only OP rows — chemistry and work orders have their own readers", () => {
    const out = filterOperationItems(items);
    expect(out.every((o) => o.kind === "OP")).toBe(true);
    expect(out.map((o) => o.id)).toEqual([10, 9, 8, 7]);
  });

  it("narrows to the requested ledger types", () => {
    expect(filterOperationItems(items, { types: ["ADDITION"] }).map((o) => o.id)).toEqual([10, 8]);
  });

  it("applies the since bound", () => {
    expect(filterOperationItems(items, { sinceMs: NOW - 5 * DAY }).map((o) => o.id)).toEqual([10, 9]);
  });

  it("EXCLUDES a reversed operation by default — a reversed addition was never made", () => {
    const withReversed: TimelineItem[] = [
      op({ id: 20, type: "ADDITION", corrected: true, voided: true }),
      op({ id: 21, type: "ADDITION" }),
    ];
    expect(filterOperationItems(withReversed, { types: ["ADDITION"] }).map((o) => o.id)).toEqual([21]);
  });

  it("brings reversed operations back on request, flag intact (the ledger is immutable — this is a filter, not a delete)", () => {
    const withReversed: TimelineItem[] = [op({ id: 20, type: "ADDITION", corrected: true, voided: true })];
    const out = filterOperationItems(withReversed, { includeCorrected: true });
    expect(out).toHaveLength(1);
    expect(out[0].corrected).toBe(true);
  });

  it("preserves the caller's order (fold order desc), never re-sorting by the backdatable observedAt", () => {
    const backdated: TimelineItem[] = [
      op({ id: 30, type: "ADDITION", observedAt: new Date(NOW - 9 * DAY).toISOString() }),
      op({ id: 29, type: "ADDITION", observedAt: new Date(NOW - 1 * DAY).toISOString() }),
    ];
    expect(filterOperationItems(backdated).map((o) => o.id)).toEqual([30, 29]);
  });
});

describe("tallyByType", () => {
  it("counts by type, most frequent first", () => {
    const ops = [op({ id: 3, type: "ADDITION" }), op({ id: 2, type: "ADDITION" }), op({ id: 1, type: "RACK" })];
    expect(tallyByType(ops)).toEqual([
      { type: "ADDITION", label: "Addition", count: 2 },
      { type: "RACK", label: "Rack", count: 1 },
    ]);
  });

  it("is empty for no operations", () => {
    expect(tallyByType([])).toEqual([]);
  });
});

describe("dedupePhysicalTreatments — the co-resident-lot fan-out", () => {
  // Real Demo Winery rows: op 3650 is ONE pump-over on Tank T5 written as two lot_treatment rows
  // because the tank then held two lots. Eight such groups exist, one of them three rows deep — an
  // ADDITION fanned across three lots would otherwise report the same dose three times.
  it("collapses identical rows written per co-resident lot to one physical action", () => {
    const fanned = [
      { kind: "PUMPOVER", materialName: null, durationMin: 60 },
      { kind: "PUMPOVER", materialName: null, durationMin: 60 },
    ];
    expect(dedupePhysicalTreatments(fanned)).toEqual([{ kind: "PUMPOVER", materialName: null, durationMin: 60 }]);
  });

  it("collapses a three-lot fan-out of one dose (the amount must not triple)", () => {
    const dose = { kind: "ADDITION", materialName: "KMBS", rateValue: 30, rateBasis: "MG_L", computedTotal: 210, computedUnit: "g" };
    expect(dedupePhysicalTreatments([dose, { ...dose }, { ...dose }])).toHaveLength(1);
  });

  it("KEEPS two genuinely different doses in one operation", () => {
    const rows = [
      { kind: "ADDITION", materialName: "KMBS", computedTotal: 210, computedUnit: "g" },
      { kind: "ADDITION", materialName: "DAP", computedTotal: 500, computedUnit: "g" },
    ];
    expect(dedupePhysicalTreatments(rows)).toHaveLength(2);
  });

  it("keeps same-material rows that differ in amount — that is a real second dose, not a fan-out", () => {
    const rows = [
      { kind: "ADDITION", materialName: "KMBS", computedTotal: 210, computedUnit: "g" },
      { kind: "ADDITION", materialName: "KMBS", computedTotal: 90, computedUnit: "g" },
    ];
    expect(dedupePhysicalTreatments(rows)).toHaveLength(2);
  });

  it("passes an already-distinct list through untouched", () => {
    expect(dedupePhysicalTreatments([])).toEqual([]);
    const one = [{ kind: "PUNCHDOWN", durationMin: 15 }];
    expect(dedupePhysicalTreatments(one)).toEqual(one);
  });
});

describe("rankByStaleness — the overdue sweep", () => {
  const rows: SweepInput[] = [
    { vesselLabel: "Tank T1", lotCode: "26-SY-1", last: { opId: 50, type: "CAP_MGMT", summary: "Punch-down", observedAtMs: NOW - 1 * DAY } },
    { vesselLabel: "Tank T2", lotCode: "26-SY-2", last: { opId: 40, type: "CAP_MGMT", summary: "Punch-down", observedAtMs: NOW - 5 * DAY } },
    { vesselLabel: "Tank T3", lotCode: "26-SY-3", last: null },
    { vesselLabel: "Tank T4", lotCode: "26-SY-4", last: { opId: 45, type: "CAP_MGMT", summary: "Punch-down", observedAtMs: NOW - 3 * DAY } },
  ];

  it("ranks STALEST first — the question is always 'what has been neglected'", () => {
    const { ranked } = rankByStaleness(rows, NOW);
    expect(ranked.map((r) => r.vessel)).toEqual(["Tank T2", "Tank T4", "Tank T1"]);
    expect(ranked[0].daysAgo).toBe(5);
  });

  it("holds a vessel with NO matching op OUT of the ranking and names it separately", () => {
    const { ranked, neverInThisFill } = rankByStaleness(rows, NOW);
    expect(ranked.map((r) => r.vessel)).not.toContain("Tank T3");
    expect(neverInThisFill).toEqual(["Tank T3"]);
  });

  it("splits overdue from recent at the caller's threshold", () => {
    const { overdue } = rankByStaleness(rows, NOW, 3);
    expect(overdue.map((r) => r.vessel)).toEqual(["Tank T2", "Tank T4"]);
  });

  it("returns no overdue set when no threshold was given", () => {
    expect(rankByStaleness(rows, NOW).overdue).toEqual([]);
  });

  it("breaks an observedAt tie on fold order, so the ranking is deterministic for backdated entries", () => {
    const tied: SweepInput[] = [
      { vesselLabel: "Barrel B2", lotCode: null, last: { opId: 99, type: "TOPPING", summary: "Topped", observedAtMs: NOW - 2 * DAY } },
      { vesselLabel: "Barrel B1", lotCode: null, last: { opId: 12, type: "TOPPING", summary: "Topped", observedAtMs: NOW - 2 * DAY } },
    ];
    expect(rankByStaleness(tied, NOW).ranked.map((r) => r.vessel)).toEqual(["Barrel B1", "Barrel B2"]);
  });

  it("carries the lot code through, so an answer can name the wine and not just the vessel", () => {
    expect(rankByStaleness(rows, NOW).ranked[0].lot).toBe("26-SY-2");
  });

  it("handles an all-empty comparison without inventing a winner", () => {
    const none: SweepInput[] = [{ vesselLabel: "Tank T9", lotCode: null, last: null }];
    const { ranked, neverInThisFill } = rankByStaleness(none, NOW);
    expect(ranked).toEqual([]);
    expect(neverInThisFill).toEqual(["Tank T9"]);
  });
});
