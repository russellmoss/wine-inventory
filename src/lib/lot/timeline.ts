import { round2 } from "@/lib/bottling/draw";
import type { OperationType } from "@/lib/ledger/vocabulary";
import { RATE_BASIS_LABELS, type RateBasis } from "@/lib/cellar/additions-math";

/** Op types that are volume-neutral (a treatment, no lines) — drives the "voided" pill. */
const NEUTRAL_OPS = new Set<OperationType>(["ADDITION", "FINING", "CAP_MGMT"]);

const CAP_LABEL: Record<string, string> = { PUMPOVER: "Pump-over", PUNCHDOWN: "Punch-down" };

function basisLabel(basis: string | null): string {
  if (!basis) return "";
  return RATE_BASIS_LABELS[basis as RateBasis] ?? basis;
}

// Pure display/derivation helpers for the Lot timeline (Phase 2). No prisma, no server
// imports — turns raw ledger rows (lot_operation + lot_operation_line) into display-ready
// events and a current-state summary, so the human-summary logic is unit-tested without a DB.
// All volume figures go through round2 (centiliter granularity, matches Decimal(10,2)).

export type VesselKind = "BARREL" | "TANK";

/**
 * One ledger line for a single lot, read from `lot_operation_line` with its durable
 * snapshots. `vesselCode === null` is the external counter-account ("outside the cellar":
 * seed-in / loss-out / bottle-out). A line whose vessel was later deleted keeps its
 * `vesselCode` snapshot but loses `vesselId` (FK SetNull) — still a real vessel, just not
 * linkable. `vesselType` is resolved by the loader (absent for deleted vessels).
 */
export type RawLine = {
  vesselId: string | null;
  vesselCode: string | null;
  vesselType?: VesselKind | null;
  deltaL: number; // signed: + into the location, - out of it
  reason?: string | null;
};

/** One cellar-treatment detail row for the viewed lot (Phase 3). */
export type RawTreatment = {
  kind: string; // ADDITION | FINING | FILTRATION | PUMPOVER | PUNCHDOWN
  materialName: string | null;
  rateValue: number | null;
  rateBasis: string | null;
  computedTotal: number | null;
  computedUnit: string | null;
  durationMin: number | null;
  medium: string | null;
  micron: number | null;
};

/** One ledger operation header, read from `lot_operation`. `id` IS the fold order. */
export type RawOperation = {
  id: number;
  type: OperationType;
  observedAt: Date | string;
  enteredBy: string;
  captureMethod: string;
  note: string | null;
  correctsOperationId: number | null;
  /** Phase 3 treatment detail rows for THIS lot (neutral ops have these + no lines). */
  treatments?: RawTreatment[];
};

export type TimelineLeg = {
  label: string; // "Barrel 14" | "Tank 1" | bare code | "outside the cellar"
  vesselId: string | null; // null = not linkable (external counter-account or deleted vessel)
  vesselCode: string | null;
  isExternal: boolean; // vesselCode == null
  reason: string | null; // line reason (seed/loss/bottle/deplete/adjust) — set on external legs
  deltaL: number; // signed (this lot's leg)
  direction: "in" | "out";
};

export type TimelineEvent = {
  id: number;
  type: OperationType;
  observedAt: string; // ISO
  dateLabel: string; // YYYY-MM-DD
  enteredBy: string;
  captureMethod: string;
  note: string | null;
  summary: string;
  legs: TimelineLeg[];
  treatments: RawTreatment[]; // Phase 3 detail rows (for the rendered detail line)
  isCorrection: boolean;
  correctsId: number | null;
  corrected: boolean; // a later CORRECTION op reverted this one (D6 — shown, never hidden)
  voided: boolean; // corrected AND volume-neutral → render a "voided" pill (vs "corrected")
};

export type VesselHolding = {
  vesselId: string;
  vesselCode: string;
  vesselType?: VesselKind | null;
  volumeL: number;
};

export type CurrentLocation = {
  vesselId: string;
  vesselCode: string;
  label: string;
  volumeL: number;
};

export type CurrentState = {
  totalL: number;
  locations: CurrentLocation[];
};

const OUTSIDE = "outside the cellar";

/** "Barrel 14" / "Tank 1"; falls back to the bare code when type is unknown (deleted vessel). */
export function vesselLabel(type: VesselKind | null | undefined, code: string): string {
  if (type === "BARREL") return `Barrel ${code}`;
  if (type === "TANK") return `Tank ${code}`;
  return code;
}

/** Format a liter figure for prose: 2-dp max, trailing zeros trimmed. */
export function formatL(n: number): string {
  return String(round2(n));
}

function toISO(d: Date | string): string {
  return typeof d === "string" ? new Date(d).toISOString() : d.toISOString();
}

function isExternal(l: RawLine): boolean {
  return l.vesselCode == null;
}

function toLeg(l: RawLine): TimelineLeg {
  const external = isExternal(l);
  return {
    label: external ? OUTSIDE : vesselLabel(l.vesselType ?? null, l.vesselCode as string),
    vesselId: l.vesselId,
    vesselCode: l.vesselCode,
    isExternal: external,
    reason: l.reason ?? null,
    deltaL: round2(l.deltaL),
    direction: l.deltaL >= 0 ? "in" : "out",
  };
}

/** Unique vessel labels for a set of in-vessel lines, joined for prose. */
function labelList(lines: RawLine[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of lines) {
    const label = vesselLabel(l.vesselType ?? null, l.vesselCode as string);
    if (!seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  }
  return out.join(" + ");
}

export type DescribeOpts = { legacyCutover?: boolean };

/**
 * Turn one operation + its (lot-scoped) lines into a display-ready event. Lines MUST be
 * pre-filtered to the lot being viewed, so the summary volumes are this lot's share.
 */
export function describeOperation(opn: RawOperation, lines: RawLine[], opts: DescribeOpts = {}): TimelineEvent {
  const legs = lines.map(toLeg);
  const inVessel = lines.filter((l) => !isExternal(l));
  const sources = inVessel.filter((l) => l.deltaL < 0);
  const dests = inVessel.filter((l) => l.deltaL > 0);
  const externals = lines.filter(isExternal);

  const srcLabels = labelList(sources);
  const dstLabels = labelList(dests);
  const outTotal = round2(sources.reduce((a, l) => a + Math.abs(l.deltaL), 0));
  const inTotal = round2(dests.reduce((a, l) => a + l.deltaL, 0));
  const lossTotal = round2(
    externals.filter((l) => l.reason === "loss").reduce((a, l) => a + Math.abs(l.deltaL), 0),
  );
  const bottleTotal = round2(
    externals.filter((l) => l.reason === "bottle").reduce((a, l) => a + Math.abs(l.deltaL), 0),
  );
  const treatments = opn.treatments ?? [];
  const filtrationLoss = round2(
    externals.filter((l) => l.reason === "filtration").reduce((a, l) => a + Math.abs(l.deltaL), 0),
  );
  // A material dose's grams (sum across this lot's treatment rows), for ADDITION/FINING.
  const dose = treatments[0];
  const doseTotal = round2(treatments.reduce((a, t) => a + (t.computedTotal ?? 0), 0));
  const doseClause =
    dose?.rateValue != null && dose.rateBasis
      ? `${formatL(dose.rateValue)} ${basisLabel(dose.rateBasis)} ${dose.materialName ?? "material"}`
      : (dose?.materialName ?? "material");
  const doseTail = doseTotal > 0 ? ` → ${doseTotal} ${dose?.computedUnit ?? "g"}` : "";

  let summary: string;
  switch (opn.type) {
    case "SEED": {
      const dest = dstLabels || "the cellar";
      summary = opts.legacyCutover
        ? `Seeded ${formatL(inTotal)} L into ${dest} at cutover (Day-Zero)`
        : `Seeded ${formatL(inTotal)} L into ${dest}`;
      break;
    }
    case "RACK": {
      const lossClause = lossTotal > 0 ? ` (${formatL(lossTotal)} L lost)` : "";
      summary = `Racked ${formatL(inTotal)} L from ${srcLabels || "—"} to ${dstLabels || "—"}${lossClause}`;
      break;
    }
    case "BOTTLE":
      summary = `Bottled ${formatL(bottleTotal || outTotal)} L`;
      break;
    case "LOSS":
      summary = `Dumped ${formatL(outTotal)} L from ${srcLabels || "—"}`;
      break;
    case "DEPLETE":
      summary = `Depleted ${formatL(outTotal)} L from ${srcLabels || "—"}`;
      break;
    case "ADJUST": {
      if (inTotal > 0 && outTotal === 0) summary = `Adjusted ${dstLabels} up by ${formatL(inTotal)} L`;
      else if (outTotal > 0 && inTotal === 0) summary = `Adjusted ${srcLabels} down by ${formatL(outTotal)} L`;
      else summary = `Adjusted volume`;
      break;
    }
    case "CORRECTION":
      summary =
        opn.correctsOperationId != null ? `Reverted operation #${opn.correctsOperationId}` : `Correction`;
      break;
    case "ADDITION":
      summary = `Added ${doseClause}${doseTail}`;
      break;
    case "FINING":
      summary = `Fined: ${doseClause}${doseTail}`;
      break;
    case "CAP_MGMT": {
      const t = treatments[0];
      const lbl = t ? (CAP_LABEL[t.kind] ?? "Cap management") : "Cap management";
      summary = t?.durationMin ? `${lbl} (${t.durationMin} min)` : lbl;
      break;
    }
    case "FILTRATION": {
      const t = treatments[0];
      const detail = [t?.medium, t?.micron != null ? `${t.micron} µm` : null].filter(Boolean).join(", ");
      const lossClause = filtrationLoss > 0 ? ` (${formatL(filtrationLoss)} L loss)` : "";
      summary = `Filtered${detail ? ` (${detail})` : ""}${lossClause}`;
      break;
    }
    case "TOPPING":
      summary =
        dests.length > 0
          ? `Topped ${formatL(inTotal)} L${srcLabels ? ` from ${srcLabels}` : ""}${dstLabels ? ` into ${dstLabels}` : ""}`
          : `Topped ${formatL(outTotal)} L from ${srcLabels || "—"}`;
      break;
    default:
      summary = opn.type;
  }

  const observedISO = toISO(opn.observedAt);
  return {
    id: opn.id,
    type: opn.type,
    observedAt: observedISO,
    dateLabel: observedISO.slice(0, 10),
    enteredBy: opn.enteredBy,
    captureMethod: opn.captureMethod,
    note: opn.note,
    summary,
    legs,
    treatments,
    isCorrection: opn.type === "CORRECTION",
    correctsId: opn.correctsOperationId,
    corrected: false, // resolved across the set in buildTimeline
    voided: false, // resolved across the set in buildTimeline
  };
}

/**
 * Build the full timeline for a lot from its raw operations (any order; loader passes
 * newest-first). Sets the `corrected` flag on any op a later CORRECTION reverted (D6), and
 * marks the genesis SEED as the Day-Zero cutover for legacy lots. Order is preserved.
 */
export function buildTimeline(
  rawOps: { op: RawOperation; lines: RawLine[] }[],
  opts: { legacy?: boolean; correctedIds?: ReadonlySet<number> } = {},
): TimelineEvent[] {
  if (rawOps.length === 0) return [];
  const minId = Math.min(...rawOps.map((r) => r.op.id));
  // Corrections in this set + any passed in by the loader (a neutral void correction has no
  // lines/treatments, so it never appears in the lot's own ops — the loader supplies its id).
  const correctedIds = new Set<number>(opts.correctedIds ?? []);
  for (const { op } of rawOps) {
    if (op.type === "CORRECTION" && op.correctsOperationId != null) correctedIds.add(op.correctsOperationId);
  }
  return rawOps.map(({ op, lines }) => {
    const legacyCutover = !!opts.legacy && op.type === "SEED" && op.id === minId;
    const ev = describeOperation(op, lines, { legacyCutover });
    ev.corrected = correctedIds.has(op.id);
    ev.voided = ev.corrected && NEUTRAL_OPS.has(op.type);
    return ev;
  });
}

/** Aggregate a lot's current holdings (from the vessel_lot projection) into header state. */
export function currentState(holdings: VesselHolding[]): CurrentState {
  const locations: CurrentLocation[] = holdings
    .map((h) => ({
      vesselId: h.vesselId,
      vesselCode: h.vesselCode,
      label: vesselLabel(h.vesselType ?? null, h.vesselCode),
      volumeL: round2(h.volumeL),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const totalL = round2(holdings.reduce((a, h) => a + h.volumeL, 0));
  return { totalL, locations };
}
