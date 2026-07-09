import { describe, it, expect } from "vitest";
import {
  bucketOf,
  matchesFilter,
  chipLabel,
  opChipLabel,
  groupByDay,
  TIMELINE_FILTERS,
} from "@/lib/vessel/timeline-view";
import type { TimelineItem, OpItem } from "@/lib/lot/timeline";

// A minimal OP item factory — only the fields the view helpers read.
function op(type: string, capKind?: string, dateLabel = "2026-07-05"): OpItem {
  return {
    kind: "OP",
    id: 1,
    type: type as OpItem["type"],
    observedAt: `${dateLabel}T09:00:00.000Z`,
    dateLabel,
    timeLabel: "09:00",
    enteredBy: "a@b.test",
    captureMethod: "MANUAL",
    note: null,
    supplementalNote: null,
    displayLabel: null,
    summary: "x",
    legs: [],
    treatments: capKind
      ? [{ kind: capKind, materialName: null, rateValue: null, rateBasis: null, computedTotal: null, computedUnit: null, durationMin: null, medium: null, micron: null }]
      : [],
    isCorrection: false,
    correctsId: null,
    corrected: false,
    voided: false,
    reversible: false,
    reversalReason: null,
    workOrder: null,
    provenance: null,
  };
}

function nonOp(kind: TimelineItem["kind"], dateLabel = "2026-07-05"): TimelineItem {
  const base = {
    id: "x1",
    summary: "s",
    observedAt: `${dateLabel}T10:00:00.000Z`,
    dateLabel,
    timeLabel: "10:00",
    enteredBy: "a@b.test",
    captureMethod: "MANUAL",
    note: null,
    createdAt: `${dateLabel}T10:00:00.000Z`,
  };
  switch (kind) {
    case "MEASUREMENT":
      return { ...base, kind, readings: [], molecular: null, sampleId: null };
    case "TASTING":
      return { ...base, kind, appearance: null, aroma: null, flavor: null, structure: { tannin: null, acidity: null, body: null, finish: null }, score: null, scoreScale: null, readiness: null };
    case "SAMPLE":
      return { ...base, kind, status: "PULLED", source: null, lab: null };
    case "VESSEL_ACTIVITY":
      return { ...base, kind };
    case "WORK_ORDER":
      return { ...base, kind, workOrderId: "wo1", number: 7, title: "T", taskStatus: "ISSUED", woStatus: "ISSUED", tone: "blue", statusLabel: "Issued", issuedByEmail: null, issuedAt: base.observedAt };
    default:
      throw new Error("unreachable");
  }
}

describe("bucketOf", () => {
  it("maps op types to buckets", () => {
    expect(bucketOf(op("ADDITION"))).toBe("additions");
    expect(bucketOf(op("FINING"))).toBe("additions");
    expect(bucketOf(op("CAP_MGMT", "PUMPOVER"))).toBe("capMgmt");
    expect(bucketOf(op("RACK"))).toBe("movements");
    expect(bucketOf(op("FILTRATION"))).toBe("movements");
    expect(bucketOf(op("CORRECTION"))).toBe("movements");
  });
  it("maps non-op kinds to buckets", () => {
    expect(bucketOf(nonOp("MEASUREMENT"))).toBe("analyses");
    expect(bucketOf(nonOp("TASTING"))).toBe("analyses");
    expect(bucketOf(nonOp("SAMPLE"))).toBe("analyses");
    expect(bucketOf(nonOp("VESSEL_ACTIVITY"))).toBe("maintenance");
    expect(bucketOf(nonOp("WORK_ORDER"))).toBe("workOrders");
  });
});

describe("matchesFilter", () => {
  it("'all' always matches", () => {
    expect(matchesFilter(op("RACK"), "all")).toBe(true);
    expect(matchesFilter(nonOp("WORK_ORDER"), "all")).toBe(true);
  });
  it("narrows to the selected bucket", () => {
    expect(matchesFilter(op("ADDITION"), "additions")).toBe(true);
    expect(matchesFilter(op("ADDITION"), "movements")).toBe(false);
    expect(matchesFilter(nonOp("WORK_ORDER"), "workOrders")).toBe(true);
    expect(matchesFilter(nonOp("WORK_ORDER"), "maintenance")).toBe(false);
  });
  it("exposes a full chip set with 'all' first", () => {
    expect(TIMELINE_FILTERS[0].bucket).toBe("all");
    expect(TIMELINE_FILTERS.map((f) => f.bucket)).toContain("workOrders");
  });
});

describe("chipLabel / opChipLabel", () => {
  it("labels cap-management by its technique incl. bâtonnage", () => {
    expect(chipLabel(op("CAP_MGMT", "PUMPOVER"))).toBe("Pump-over");
    expect(chipLabel(op("CAP_MGMT", "PUNCHDOWN"))).toBe("Punch-down");
    expect(chipLabel(op("CAP_MGMT", "BATONNAGE"))).toBe("Bâtonnage (lees stir)");
    expect(chipLabel(op("CAP_MGMT", "PULSE_AIR"))).toBe("Pulse-air");
  });
  it("falls back to a generic cap label with no/unknown kind", () => {
    expect(opChipLabel("CAP_MGMT", null)).toBe("Cap mgmt");
    expect(opChipLabel("CAP_MGMT", "WHATEVER")).toBe("Cap mgmt");
  });
  it("labels additions, fining, movements", () => {
    expect(chipLabel(op("ADDITION"))).toBe("Addition");
    expect(chipLabel(op("FINING"))).toBe("Fining");
    expect(chipLabel(op("RACK"))).toBe("Rack");
    expect(chipLabel(op("LOSS"))).toBe("Dump");
  });
  it("labels non-op kinds", () => {
    expect(chipLabel(nonOp("MEASUREMENT"))).toBe("Analysis");
    expect(chipLabel(nonOp("TASTING"))).toBe("Tasting");
    expect(chipLabel(nonOp("SAMPLE"))).toBe("Sample");
    expect(chipLabel(nonOp("VESSEL_ACTIVITY"))).toBe("Maintenance");
    expect(chipLabel(nonOp("WORK_ORDER"))).toBe("Work order");
  });
  it("sentence-cases an unknown op type", () => {
    expect(opChipLabel("WEIRD_STATE", null)).toBe("Weird state");
  });
});

describe("groupByDay", () => {
  it("groups consecutive same-day items and preserves order", () => {
    const items: TimelineItem[] = [
      op("RACK", undefined, "2026-07-05"),
      nonOp("MEASUREMENT", "2026-07-05"),
      op("ADDITION", undefined, "2026-07-04"),
    ];
    const groups = groupByDay(items);
    expect(groups.map((g) => g.dateLabel)).toEqual(["2026-07-05", "2026-07-04"]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });
  it("returns [] for no items", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
