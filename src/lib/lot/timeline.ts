import { round2 } from "@/lib/bottling/draw";
import type { OperationType } from "@/lib/ledger/vocabulary";
import { RATE_BASIS_LABELS, type RateBasis } from "@/lib/cellar/additions-math";
import { getAnalyte } from "@/lib/chemistry/analytes";
import { molecularSO2, type MolecularSO2 } from "@/lib/chemistry/so2";
import { CAP_LABELS } from "@/lib/cellar/cap-vocab";
import { statusTone, statusLabel, type BadgeTone } from "@/lib/work-orders/status-badge";

/** Op types that are volume-neutral (a treatment, no lines) — drives the "voided" pill. */
const NEUTRAL_OPS = new Set<OperationType>(["ADDITION", "FINING", "CAP_MGMT"]);

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
  // Phase 7: the account discriminator + bottle-count delta on a BOTTLE_STORAGE leg.
  bucket?: string | null;
  bottleDelta?: number | null;
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

/**
 * WO provenance stamped on a WO-sourced op event by the vessel-timeline loader (plan 045): who
 * issued the WO + when, who completed the task + when, assignee, and the live task/WO status →
 * tone/label. Optional — only set for ops written by completing a work-order task. Prisma-free.
 */
export type OpWorkOrderProvenance = {
  workOrderId: string;
  number: number;
  title: string;
  taskStatus: string;
  woStatus: string;
  tone: BadgeTone;
  statusLabel: string;
  issuedByEmail: string | null;
  issuedAt: string | null; // ISO
  completedByEmail: string | null;
  completedAt: string | null; // ISO
  assigneeEmail: string | null;
};

export type TimelineEvent = {
  id: number;
  type: OperationType;
  observedAt: string; // ISO
  dateLabel: string; // YYYY-MM-DD
  timeLabel: string; // HH:MM (24h) — date AND time on the feed
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
  // 024a universal undo: can this op be reversed from the timeline (by type, and not already
  // corrected), and — when it can't — the reason to show as a disabled control. Resolved in the
  // loader (it needs the dispatcher's reversibility verdict); describeOperation just defaults them.
  reversible: boolean;
  reversalReason: string | null;
  // Plan 045 vessel timeline: optional WO provenance (populated by getVesselTimeline for ops
  // written by completing a WO task) + a generic provenance slot. describeOperation defaults both.
  workOrder?: OpWorkOrderProvenance | null;
  provenance?: { issuedByEmail: string | null; issuedAt: string | null; completedByEmail: string | null; completedAt: string | null } | null;
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

/**
 * HH:MM time-of-day label for a timeline entry (locale-safe, 24-hour). Derived from the ISO
 * `observedAt`; used alongside `dateLabel` so History shows date AND time. Pure.
 */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
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
  // Phase 7: bottle-storage legs for this lot — volume + count deltas (a BOTTLE_STORAGE leg
  // carries both). The vessel projection ignores these; the timeline reads them for the arc.
  const bottleLegs = lines.filter((l) => l.bucket === "BOTTLE_STORAGE");
  const bottleVolDelta = round2(bottleLegs.reduce((a, l) => a + l.deltaL, 0));
  const bottleCountDelta = bottleLegs.reduce((a, l) => a + (l.bottleDelta ?? 0), 0);
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
      const lbl = t ? ((CAP_LABELS as Record<string, string>)[t.kind] ?? "Cap management") : "Cap management";
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
    case "CRUSH": {
      // De-stem (crusher rollers optional) → must. The −V leg is origination-from-harvest, not loss.
      summary = `De-stemmed fruit → ${formatL(inTotal)} L must${dstLabels ? ` into ${dstLabels}` : ""}`;
      break;
    }
    case "PRESS": {
      const lossClause = lossTotal > 0 ? ` (${formatL(lossTotal)} L lees)` : "";
      // Must-lot press draws the parent (outTotal); whole-cluster press originates juice from
      // fruit (no in-vessel source — outTotal 0), so fall back to the volume that landed (inTotal).
      summary = `Pressed ${formatL(outTotal || inTotal)} L${dstLabels ? ` → ${dstLabels}` : ""}${lossClause}`;
      break;
    }
    case "SAIGNEE":
      summary = `Bled ${formatL(inTotal || outTotal)} L juice${dstLabels ? ` → ${dstLabels}` : ""}`;
      break;
    case "TIRAGE": {
      const sugar = treatments.find((t) => t.kind === "TIRAGE")?.rateValue;
      const sugarClause = sugar != null ? ` (+${formatL(sugar)} g/L tirage sugar)` : "";
      summary = `Tirage: bottled ${bottleCountDelta} bottles (${formatL(bottleVolDelta)} L) en tirage${sugarClause}`;
      break;
    }
    case "RIDDLING": {
      const method = treatments.find((t) => t.kind === "RIDDLING")?.medium;
      summary = `Riddling${method ? ` (${method})` : ""}`;
      break;
    }
    case "DISGORGEMENT": {
      const perBottle = treatments.find((t) => t.kind === "DISGORGEMENT")?.rateValue;
      const perClause = perBottle != null ? ` (−${formatL(perBottle)} mL/bottle)` : "";
      const countClause =
        bottleCountDelta < 0 ? `, ${Math.abs(bottleCountDelta)} bottles peeled/removed` : bottleCountDelta > 0 ? `, ${bottleCountDelta} bottles disgorged` : "";
      summary = `Disgorged${perClause}${lossTotal > 0 ? `: −${formatL(lossTotal)} L lees/plug` : ""}${countClause}`;
      break;
    }
    case "DOSAGE": {
      const d = treatments.find((t) => t.kind === "DOSAGE");
      const sugarTail = d?.computedTotal != null && d.computedTotal > 0 ? ` → ${d.computedTotal} g sugar` : "";
      summary = `Dosage: +${formatL(bottleVolDelta)} L liqueur d'expédition${sugarTail}`;
      break;
    }
    case "FINISH":
      summary = `Finalized ${Math.abs(bottleCountDelta)} bottles → finished SKU`;
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
    timeLabel: timeLabel(observedISO),
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
    reversible: false, // resolved in the loader (getLotDetail) via the dispatcher's verdict
    reversalReason: null,
    workOrder: null, // populated by getVesselTimeline for WO-sourced ops
    provenance: null,
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

// ───────────────────────── Phase 4 standalone records on the timeline ─────────────────────────
// Chemistry/tasting/sample records are NOT ledger ops — they have no operationId and no lines.
// They slot into the op backbone by observedAt (hybrid ordering — see mergeTimeline). The feed
// is a discriminated union TimelineItem { kind } so the renderer + Edit mode branch on kind
// rather than overloading the op-shaped TimelineEvent (D14: ops keep their own id order).

const READINESS_LABELS: Record<string, string> = {
  NEEDS_MORE_TIME: "needs more time",
  READY_TO_BLEND: "ready to blend",
  READY_TO_BOTTLE: "ready to bottle",
  HOLD: "hold",
  DECLINING: "declining",
};
const SCALE_MAX: Record<string, number> = { HUNDRED_POINT: 100, TWENTY_POINT: 20 };

/** Format a reading value at its analyte's display precision (raw key falls back to as-is). */
export function formatAnalyteValue(analyte: string, value: number): string {
  const def = getAnalyte(analyte);
  if (!def) return String(value);
  return value.toFixed(def.precision);
}

/** A reading prepared for display: registry label + precision-formatted value (or raw fallback). */
export type ReadingView = { analyte: string; label: string; value: number; unit: string; valueLabel: string };

function toReadingView(r: { analyte: string; value: number; unit: string }): ReadingView {
  const def = getAnalyte(r.analyte);
  return {
    analyte: r.analyte,
    label: def?.label ?? r.analyte, // unknown stored key → show the raw key
    value: r.value,
    unit: r.unit,
    valueLabel: formatAnalyteValue(r.analyte, r.value),
  };
}

/** "pH 3.70" / "Free SO₂ 28 mg/L" — unit suffix dropped only for the dimensionless pH. */
function readingToken(v: ReadingView): string {
  const unit = v.unit && v.unit !== "pH" ? ` ${v.unit}` : "";
  return `${v.label} ${v.valueLabel}${unit}`;
}

export type TimelineMeta = {
  observedAt: string; // ISO
  dateLabel: string; // YYYY-MM-DD
  timeLabel: string; // HH:MM (24h)
  enteredBy: string;
  captureMethod: string;
  note: string | null;
  createdAt: string; // ISO — record-vs-record tiebreak
};

export type MeasurementItem = TimelineMeta & {
  kind: "MEASUREMENT";
  id: string; // panelId
  summary: string;
  readings: ReadingView[];
  molecular: MolecularSO2 | null; // derived within THIS panel only
  sampleId: string | null;
};

export type TastingItem = TimelineMeta & {
  kind: "TASTING";
  id: string;
  summary: string;
  appearance: string | null;
  aroma: string | null;
  flavor: string | null;
  structure: { tannin: number | null; acidity: number | null; body: number | null; finish: number | null };
  score: number | null;
  scoreScale: string | null;
  readiness: string | null;
};

export type SampleItem = TimelineMeta & {
  kind: "SAMPLE";
  id: string;
  summary: string;
  status: string;
  source: string | null;
  lab: string | null;
};

export type LegacyOperationItem = TimelineMeta & {
  kind: "LEGACY_OPERATION";
  id: string;
  summary: string;
  sourceSystem: string;
  sourceActionType: string;
  evidenceRef: string | null;
};

export type MigrationCutoverItem = TimelineMeta & {
  kind: "MIGRATION_CUTOVER";
  id: string;
  summary: string;
  importBatchId: string;
};

/**
 * A vessel-maintenance event (VesselActivityEvent) as a timeline item (plan 045). Not a ledger op
 * and not lot-scoped — it belongs to the vessel. `describeVesselActivity` labels every current
 * VESSEL_ACTIVITY_KINDS value.
 */
export type VesselActivityItem = TimelineMeta & {
  kind: "VESSEL_ACTIVITY";
  id: string;
  summary: string;
};

/**
 * A work order issued against the vessel as a timeline item (plan 045), slotted at `issuedAt`.
 * Carries the per-vessel task status → tone/label so History renders a colored status badge.
 */
export type WorkOrderItem = TimelineMeta & {
  kind: "WORK_ORDER";
  id: string; // stable feed key (workOrderId)
  workOrderId: string;
  number: number;
  title: string;
  summary: string;
  taskStatus: string;
  woStatus: string;
  tone: BadgeTone;
  statusLabel: string;
  issuedByEmail: string | null;
  issuedAt: string | null; // ISO
};

export type OpItem = TimelineEvent & { kind: "OP" };
export type RecordItem = MeasurementItem | TastingItem | SampleItem | LegacyOperationItem | MigrationCutoverItem;
export type TimelineItem = OpItem | RecordItem | VesselActivityItem | WorkOrderItem;

export type RawPanel = {
  id: string;
  observedAt: Date | string;
  enteredByEmail: string;
  captureMethod: string;
  note: string | null;
  sampleId: string | null;
  createdAt: Date | string;
  readings: { analyte: string; value: number; unit: string }[];
};

export type RawTastingNote = {
  id: string;
  observedAt: Date | string;
  enteredByEmail: string;
  captureMethod: string;
  note: string | null;
  createdAt: Date | string;
  appearance: string | null;
  aroma: string | null;
  flavor: string | null;
  tannin: number | null;
  acidity: number | null;
  body: number | null;
  finish: number | null;
  score: number | null;
  scoreScale: string | null;
  readiness: string | null;
};

export type RawSample = {
  id: string;
  pulledAt: Date | string; // the sample's observed time
  enteredByEmail: string;
  captureMethod: string;
  note: string | null;
  createdAt: Date | string;
  status: string;
  source: string | null;
  lab: string | null;
};

export type RawLegacyOperation = {
  id: string;
  importBatchId: string;
  sourceSystem: string;
  sourceActionType: string;
  occurredAt: Date | string | null;
  actorName: string | null;
  note: string | null;
  evidenceRef: string | null;
  canonicalVolumeL: number | null;
  sourceVesselKey: string | null;
  vesselCode: string | null;
  createdAt: Date | string;
};

export type RawMigrationCutover = {
  importBatchId: string;
  cutoverAt: Date | string;
  sourceName: string | null;
  sourceSystem: string;
  actorEmail: string | null;
  createdAt: Date | string;
};

function baseMeta(observed: Date | string, created: Date | string, enteredBy: string, captureMethod: string, note: string | null): TimelineMeta {
  const observedISO = toISO(observed);
  return {
    observedAt: observedISO,
    dateLabel: observedISO.slice(0, 10),
    timeLabel: timeLabel(observedISO),
    enteredBy,
    captureMethod,
    note,
    createdAt: toISO(created),
  };
}

/** One analysis panel → a display item. Molecular SO₂ derives from THIS panel's free SO₂ + pH. */
export function describeMeasurementPanel(panel: RawPanel): MeasurementItem {
  const readings = panel.readings.map(toReadingView);
  const free = panel.readings.find((r) => r.analyte === "FREE_SO2");
  const ph = panel.readings.find((r) => r.analyte === "PH");
  const molecular = free && ph ? molecularSO2({ freeSO2: free.value, pH: ph.value }) : null;
  const summary = readings.length ? readings.map(readingToken).join(" · ") : "Analysis (no readings)";
  return {
    kind: "MEASUREMENT",
    id: panel.id,
    summary,
    readings,
    molecular,
    sampleId: panel.sampleId,
    ...baseMeta(panel.observedAt, panel.createdAt, panel.enteredByEmail, panel.captureMethod, panel.note),
  };
}

/** One tasting note → a display item. */
export function describeTastingNote(note: RawTastingNote): TastingItem {
  const parts = ["Tasting"];
  if (note.score != null) parts.push(`${note.score}/${note.scoreScale ? SCALE_MAX[note.scoreScale] ?? 100 : 100}`);
  if (note.readiness) parts.push(READINESS_LABELS[note.readiness] ?? note.readiness.toLowerCase());
  return {
    kind: "TASTING",
    id: note.id,
    summary: parts.join(" · "),
    appearance: note.appearance,
    aroma: note.aroma,
    flavor: note.flavor,
    structure: { tannin: note.tannin, acidity: note.acidity, body: note.body, finish: note.finish },
    score: note.score,
    scoreScale: note.scoreScale,
    readiness: note.readiness,
    ...baseMeta(note.observedAt, note.createdAt, note.enteredByEmail, note.captureMethod, note.note),
  };
}

const SAMPLE_STATUS_WORD: Record<string, string> = {
  PULLED: "pulled",
  SENT: "sent to the lab",
  PENDING: "pending result",
  RESULT_RETURNED: "result returned",
  ATTACHED: "results attached",
  CANCELLED: "cancelled",
};

/** One sample → a display item (observed at its pull time). */
export function describeSample(sample: RawSample): SampleItem {
  const word = SAMPLE_STATUS_WORD[sample.status] ?? sample.status.toLowerCase();
  let summary = `Sample ${word}`;
  if (sample.source) summary += ` · ${sample.source}`;
  if (sample.lab && (sample.status === "SENT" || sample.status === "PENDING")) summary += ` (${sample.lab})`;
  return {
    kind: "SAMPLE",
    id: sample.id,
    summary,
    status: sample.status,
    source: sample.source,
    lab: sample.lab,
    ...baseMeta(sample.pulledAt, sample.createdAt, sample.enteredByEmail, sample.captureMethod, sample.note),
  };
}

export function describeLegacyOperation(op: RawLegacyOperation): LegacyOperationItem {
  const volume = op.canonicalVolumeL == null ? "" : ` ${formatL(op.canonicalVolumeL)} L`;
  const where = op.vesselCode ?? op.sourceVesselKey;
  return {
    kind: "LEGACY_OPERATION",
    id: op.id,
    summary: `Imported history: ${op.sourceActionType}${volume}${where ? ` (${where})` : ""}`,
    sourceSystem: op.sourceSystem,
    sourceActionType: op.sourceActionType,
    evidenceRef: op.evidenceRef,
    ...baseMeta(op.occurredAt ?? op.createdAt, op.createdAt, op.actorName ?? "Imported history", "IMPORT", op.note),
  };
}

export function describeMigrationCutover(raw: RawMigrationCutover): MigrationCutoverItem {
  return {
    kind: "MIGRATION_CUTOVER",
    id: `migration-cutover:${raw.importBatchId}`,
    importBatchId: raw.importBatchId,
    summary: "Cellarhand starts here",
    ...baseMeta(raw.cutoverAt, raw.createdAt, raw.actorEmail ?? raw.sourceName ?? raw.sourceSystem, "IMPORT", "Opening balance imported from source."),
  };
}

// ───────────────────────── Plan 045: vessel-maintenance + work-order items ─────────────────────────

/**
 * One VesselActivityEvent row (the maintenance lane). `targetValue`/`targetUnit` carry the subtype
 * detail: a setpoint (value + °C/°F), the gas type (GAS_TYPES on targetUnit), or the SO₂ delivery
 * method (SO2_METHODS on targetUnit). Prisma-free — the loader maps the DB row to this shape.
 */
export type RawVesselActivity = {
  id: string;
  kind: string; // VesselActivityKind — see VESSEL_ACTIVITY_KINDS
  observedAt: Date | string;
  enteredByEmail: string;
  captureMethod: string;
  note: string | null;
  createdAt: Date | string;
  targetValue: number | null;
  targetUnit: string | null;
};

/**
 * Label a vessel-maintenance event for the timeline. Covers every current VESSEL_ACTIVITY_KINDS
 * value (post-#73), reading the delivery method / gas / setpoint off targetValue/targetUnit.
 * Unknown kinds fall through to a titled version of the raw kind.
 */
export function describeVesselActivity(raw: RawVesselActivity): VesselActivityItem {
  let summary: string;
  switch (raw.kind) {
    case "TEMP_SETPOINT":
      summary =
        raw.targetValue != null
          ? `Temp setpoint → ${formatL(raw.targetValue)} ${raw.targetUnit ?? "°C"}`
          : "Temperature setpoint";
      break;
    case "CLEAN":
      summary = "Cleaned";
      break;
    case "SANITIZE":
      summary = "Sanitized";
      break;
    case "STEAM":
      summary = "Steamed";
      break;
    case "GAS":
      summary = raw.targetUnit ? `Gas: ${raw.targetUnit} blanket` : "Gas blanket";
      break;
    case "OZONE":
      summary = "Ozone treatment";
      break;
    case "SO2":
      summary = raw.targetUnit ? `SO₂ — ${raw.targetUnit.toLowerCase()}` : "SO₂ treatment";
      break;
    case "WET_STORAGE":
      summary = "Wet storage";
      break;
    case "OTHER":
      summary = raw.note ? `Maintenance: ${raw.note}` : "Maintenance";
      break;
    default: {
      const words = raw.kind.replace(/_/g, " ").toLowerCase();
      summary = words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
  return {
    kind: "VESSEL_ACTIVITY",
    id: raw.id,
    summary,
    ...baseMeta(raw.observedAt, raw.createdAt, raw.enteredByEmail, raw.captureMethod, raw.note),
  };
}

/**
 * One work order (its task for THIS vessel) as raw input. `taskStatus` is the per-vessel task's
 * status (the precise truth for a multi-vessel WO); `woStatus` is the whole-WO fallback. The item's
 * `observedAt` is `issuedAt` (when it hit the vessel's timeline); `createdAt` tiebreaks.
 */
export type RawWorkOrder = {
  workOrderId: string;
  number: number;
  title: string;
  taskStatus: string;
  woStatus: string;
  issuedByEmail: string | null;
  issuedAt: Date | string | null;
  createdAt: Date | string;
  enteredByEmail: string; // the issuer (or a system fallback), for the meta line
  captureMethod: string;
  note: string | null;
};

/**
 * Build a WORK_ORDER timeline item. Summary reads "Work order #N — {title}"; tone/label resolve from
 * the per-vessel task status via the shared status-badge helper (falling back to the WO status).
 * `observedAt` is `issuedAt` when known (else createdAt) so it slots at issuance on the feed.
 */
export function describeWorkOrder(raw: RawWorkOrder): WorkOrderItem {
  const statusForBadge = raw.taskStatus || raw.woStatus;
  const issuedISO = raw.issuedAt != null ? toISO(raw.issuedAt) : null;
  const observed = issuedISO ?? toISO(raw.createdAt);
  return {
    kind: "WORK_ORDER",
    id: raw.workOrderId,
    workOrderId: raw.workOrderId,
    number: raw.number,
    title: raw.title,
    summary: `Work order #${raw.number} — ${raw.title}`,
    taskStatus: raw.taskStatus,
    woStatus: raw.woStatus,
    tone: statusTone(statusForBadge),
    statusLabel: statusLabel(statusForBadge),
    issuedByEmail: raw.issuedByEmail,
    issuedAt: issuedISO,
    ...baseMeta(observed, raw.createdAt, raw.enteredByEmail, raw.captureMethod, raw.note),
  };
}

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * The non-op timeline items that slot into the op backbone by observedAt: standalone records
 * (MEASUREMENT/TASTING/SAMPLE) plus (plan 045) vessel-maintenance events and work orders. They all
 * share TimelineMeta (observedAt/createdAt) + a string `id`, so they interleave and sort the same way.
 */
export type NonOpItem = RecordItem | VesselActivityItem | WorkOrderItem;

/** Sort records that share a slot: observedAt desc, then createdAt desc, then id desc. */
function recordOrder(a: NonOpItem, b: NonOpItem): number {
  const byObserved = ms(b.observedAt) - ms(a.observedAt);
  if (byObserved !== 0) return byObserved;
  const byCreated = ms(b.createdAt) - ms(a.createdAt);
  if (byCreated !== 0) return byCreated;
  return b.id.localeCompare(a.id);
}

/**
 * HYBRID timeline merge (eng-review addendum). Operations form the backbone in the order the
 * loader passes them (op.id desc — D14), and never reorder relative to each other. Each
 * standalone record slots in immediately BEFORE the first op whose observedAt is older-or-equal
 * (≤) to the record's observedAt; records sharing a slot order by observedAt/createdAt/id.
 * A record newer than every op lands at the top; older than every op lands at the bottom.
 * With no records this returns the ops verbatim (the D14 ops-only regression guard).
 * Plan 045: `records` also accepts VESSEL_ACTIVITY + WORK_ORDER items (all NonOpItem).
 */
export function mergeTimeline(ops: TimelineEvent[], records: NonOpItem[]): TimelineItem[] {
  const opItems: OpItem[] = ops.map((ev) => ({ kind: "OP", ...ev }));
  if (records.length === 0) return opItems;

  const opMs = opItems.map((o) => ms(o.observedAt));
  // Anchor each record to the index of the first op that is older-or-equal (its insertion slot).
  const byAnchor = new Map<number, NonOpItem[]>();
  for (const rec of records) {
    const t = ms(rec.observedAt);
    let anchor = opItems.length;
    for (let i = 0; i < opItems.length; i++) {
      if (opMs[i] <= t) {
        anchor = i;
        break;
      }
    }
    const bucket = byAnchor.get(anchor);
    if (bucket) bucket.push(rec);
    else byAnchor.set(anchor, [rec]);
  }

  const out: TimelineItem[] = [];
  for (let i = 0; i <= opItems.length; i++) {
    const bucket = byAnchor.get(i);
    if (bucket) {
      bucket.sort(recordOrder);
      out.push(...bucket);
    }
    if (i < opItems.length) out.push(opItems[i]);
  }
  return out;
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
