import { round2 } from "@/lib/bottling/draw";
import type { OperationType } from "@/lib/ledger/vocabulary";
import { RATE_BASIS_LABELS, type RateBasis } from "@/lib/cellar/additions-math";
import { getAnalyte } from "@/lib/chemistry/analytes";
import { molecularSO2, type MolecularSO2 } from "@/lib/chemistry/so2";

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

export type OpItem = TimelineEvent & { kind: "OP" };
export type RecordItem = MeasurementItem | TastingItem | SampleItem;
export type TimelineItem = OpItem | RecordItem;

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

function baseMeta(observed: Date | string, created: Date | string, enteredBy: string, captureMethod: string, note: string | null): TimelineMeta {
  const observedISO = toISO(observed);
  return {
    observedAt: observedISO,
    dateLabel: observedISO.slice(0, 10),
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

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/** Sort records that share a slot: observedAt desc, then createdAt desc, then id desc. */
function recordOrder(a: RecordItem, b: RecordItem): number {
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
 */
export function mergeTimeline(ops: TimelineEvent[], records: RecordItem[]): TimelineItem[] {
  const opItems: OpItem[] = ops.map((ev) => ({ kind: "OP", ...ev }));
  if (records.length === 0) return opItems;

  const opMs = opItems.map((o) => ms(o.observedAt));
  // Anchor each record to the index of the first op that is older-or-equal (its insertion slot).
  const byAnchor = new Map<number, RecordItem[]>();
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
