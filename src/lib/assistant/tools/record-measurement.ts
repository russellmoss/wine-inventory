import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTargetOrChoice } from "../scope";
import { recordMeasurementsAction } from "@/lib/chemistry/actions";
import type { RecordMeasurementsInput } from "@/lib/chemistry/measurements";

// Assistant-coverage Wave 1 #2a — record a bench/lab CHEM PANEL (pH, TA, SO₂, …) against a LOT by chat.
// Wraps recordMeasurementsAction → recordMeasurementsCore (no re-implemented chemistry, no db_*).
//
// Decisions (interview 2026-07-05): attaches to exactly ONE lot (measurements are per-lot, never
// whole-vessel — the one-lot invariant); a blend vessel is ambiguous → resolveLotTarget asks which lot.
// Values are accepted as typed (no plausibility ceiling) and shown in the confirm card so a typo is
// visible before confirming. This is NOT the block-ripeness Brix reading (that's log_brix, on a vineyard
// block with grapes still on the vine / at harvest) — this is a cellar lot's chemistry, INCLUDING a
// sugar/Brix reading on must or wine already fermenting in a vessel (mid-ferment sugar rides the `brix`
// analyte here, on the LOT — never pushed back to a vineyard block).

// Seeded analytes → their canonical (analyte, default unit). Free-form analytes ride the `other` array.
// Exported so the lab-sample results tool (record_sample_results) reuses the SAME analyte vocabulary.
export const ANALYTES: Record<string, { analyte: string; unit: string }> = {
  pH: { analyte: "pH", unit: "" },
  ta: { analyte: "TA", unit: "g/L" },
  freeSO2: { analyte: "Free SO₂", unit: "mg/L" },
  totalSO2: { analyte: "Total SO₂", unit: "mg/L" },
  va: { analyte: "VA", unit: "g/L" },
  rs: { analyte: "RS", unit: "g/L" },
  malic: { analyte: "Malic", unit: "g/L" },
  alcohol: { analyte: "Alcohol", unit: "%" },
  // Sugar/Brix on must or wine ALREADY in a vessel (mid-ferment tracking) — the cellar-lot reading, as
  // opposed to the vineyard-block ripeness Brix at harvest (log_brix). Lets a tank sugar reading attach
  // to the LOT instead of being misrouted to a block.
  brix: { analyte: "Brix", unit: "°Bx" },
};

export type OtherReading = { analyte?: string; value?: number; unit?: string };
type RecordMeasurementRawInput = {
  lot?: string;
  vessel?: string;
  observedAt?: string;
  note?: string;
  other?: OtherReading[];
} & Partial<Record<keyof typeof ANALYTES, number>>;

export type Reading = { analyte: string; value: number; unit: string };

export function collectReadings(input: Partial<Record<keyof typeof ANALYTES, number>> & { other?: OtherReading[] }): Reading[] {
  const readings: Reading[] = [];
  for (const [key, def] of Object.entries(ANALYTES)) {
    const v = input[key as keyof typeof ANALYTES];
    if (typeof v === "number" && Number.isFinite(v)) readings.push({ analyte: def.analyte, value: v, unit: def.unit });
  }
  if (Array.isArray(input.other)) {
    for (const o of input.other) {
      if (o && typeof o.analyte === "string" && o.analyte.trim() && typeof o.value === "number" && Number.isFinite(o.value)) {
        readings.push({ analyte: o.analyte.trim(), value: o.value, unit: typeof o.unit === "string" ? o.unit : "" });
      }
    }
  }
  return readings;
}

export const analyteProps = Object.fromEntries(
  Object.entries(ANALYTES).map(([k, d]) => [k, { type: "number", description: `${d.analyte}${d.unit ? ` (${d.unit})` : ""}` }]),
);

export const recordMeasurementTool: AssistantTool = {
  name: "record_measurement",
  description:
    "Record a bench/lab reading (pH, TA, free/total SO₂, VA, residual sugar, malic, alcohol, and Brix/sugar) against a LOT. Use when the user reports numbers for wine or must that is ALREADY in a vessel — including a mid-ferment SUGAR/BRIX reading on a tank/barrel (pass it as `brix`). Give the lot by code (e.g. 'lot 24-CS-A') or the vessel (e.g. 'tank 5' / 'T4'); a vessel holding more than one lot will ask which lot. This is NOT the vineyard-block ripeness Brix reading on grapes still on the vine at harvest — that's log_brix. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Lot code, e.g. '24-CS-A'." },
      vessel: { type: "string", description: "Vessel holding the lot, e.g. 'tank 5' or 'barrel 12' (resolved to its lot; a blend asks which)." },
      ...analyteProps,
      other: {
        type: "array",
        description: "Any other analytes not in the named fields.",
        items: { type: "object", properties: { analyte: { type: "string" }, value: { type: "number" }, unit: { type: "string" } } },
      },
      observedAt: { type: "string", description: "Date observed, YYYY-MM-DD (optional, defaults to today)." },
      note: { type: "string", description: "Optional note." },
    },
    required: [],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RecordMeasurementRawInput;
    const readings = collectReadings(input);
    if (readings.length === 0) throw new Error("Give at least one reading, e.g. pH 3.4 or free SO₂ 28.");
    const resolved = await resolveLotTargetOrChoice({ lot: input.lot, vessel: input.vessel }, "record_measurement", input as Record<string, unknown>);
    if (resolved.kind === "choice") return resolved.choice;
    const { lotId, lotCode } = resolved.row;

    const observedAt = input.observedAt ? String(input.observedAt) : null;
    const when = observedAt ? ` on ${observedAt}` : " today";
    const readingStr = readings.map((r) => `${r.analyte} ${r.value}${r.unit ? ` ${r.unit}` : ""}`).join(", ");
    const preview = `Record ${readingStr} on lot ${lotCode}${when}.`;
    const token = signProposal("record_measurement", {
      lotId,
      lotCode,
      readings,
      ...(observedAt ? { observedAt } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRecordMeasurement: Committer = async (_user, args) => {
  const readings = Array.isArray(args.readings) ? (args.readings as Reading[]) : [];
  const input: RecordMeasurementsInput = {
    lotId: String(args.lotId),
    observedAt: args.observedAt ? new Date(String(args.observedAt)) : new Date(),
    readings: readings.map((r) => ({ analyte: r.analyte, value: Number(r.value), unit: r.unit ?? "" })),
    note: args.note == null ? undefined : String(args.note),
  };
  await recordMeasurementsAction(input);
  return { message: `Recorded ${readings.length} reading${readings.length === 1 ? "" : "s"} on lot ${String(args.lotCode ?? "")}.` };
};
