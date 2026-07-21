import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTargetOrChoice, resolveVesselContents } from "../scope";
import { recordMeasurementsAction, recordVesselReadingAction } from "@/lib/chemistry/actions";
import { getAnalyte, resolveAnalyteKey } from "@/lib/chemistry/analytes";
import type { RecordMeasurementsInput } from "@/lib/chemistry/measurements";

/** Human label for a reading in the confirm card — the registry label, falling back to the raw key. */
function readingLabel(analyteKey: string): string {
  return getAnalyte(analyteKey)?.label ?? analyteKey;
}

// Assistant-coverage Wave 1 #2a — record a bench/lab CHEM PANEL (pH, TA, SO₂, …) against a LOT by chat.
// Wraps recordMeasurementsAction → recordMeasurementsCore (no re-implemented chemistry, no db_*).
//
// Decisions (interview 2026-07-05): attaches to exactly ONE lot (measurements are per-lot, never
// whole-vessel — LEDGER-12 means a vessel resolves to its one lot, so there is nothing to ask.
// Values are accepted as typed (no plausibility ceiling) and shown in the confirm card so a typo is
// visible before confirming. This is NOT the block-ripeness Brix reading (that's log_brix, on a vineyard
// block with grapes still on the vine / at harvest) — this is a cellar lot's chemistry, INCLUDING a
// sugar/Brix reading on must or wine already fermenting in a vessel (mid-ferment sugar rides the `brix`
// analyte here, on the LOT — never pushed back to a vineyard block).

// Seeded analytes → their canonical (analyte, default unit). Free-form analytes ride the `other` array.
// Exported so the lab-sample results tool (record_sample_results) reuses the SAME analyte vocabulary.
// `analyte` MUST be the chemistry-registry KEY (src/lib/chemistry/analytes.ts) and `unit` MUST be
// that analyte's defaultUnit — the write path validates strictly against the registry
// (validateMeasurement → ANALYTES[key] + units.includes(unit)), so a display label like "Brix" or a
// loose unit like "g/L" is rejected ("Unknown analyte"). `label` is the human string for the confirm
// card only. Exported so record_sample_results reuses the SAME vocabulary.
export const ANALYTES: Record<string, { analyte: string; unit: string; label: string }> = {
  pH: { analyte: "PH", unit: "pH", label: "pH" },
  ta: { analyte: "TA", unit: "g/L tartaric", label: "TA" },
  freeSO2: { analyte: "FREE_SO2", unit: "mg/L", label: "Free SO₂" },
  totalSO2: { analyte: "TOTAL_SO2", unit: "mg/L", label: "Total SO₂" },
  va: { analyte: "VA", unit: "g/L acetic", label: "VA" },
  rs: { analyte: "RS", unit: "g/L", label: "RS" },
  malic: { analyte: "MALIC", unit: "g/L", label: "Malic" },
  alcohol: { analyte: "ALCOHOL", unit: "% ABV", label: "Alcohol" },
  // Fermentation temperature — one of the core mid-ferment readings (Brix + pH + temp), logged
  // alongside sugar on a tank/barrel. Celsius is canonical (matches the registry TEMP defaultUnit).
  temp: { analyte: "TEMP", unit: "°C", label: "Temp" },
  // Sugar/Brix on must or wine ALREADY in a vessel (mid-ferment tracking) — the cellar-lot reading, as
  // opposed to the vineyard-block ripeness Brix at harvest (log_brix). Lets a tank sugar reading attach
  // to the LOT instead of being misrouted to a block.
  brix: { analyte: "BRIX", unit: "°Bx", label: "Brix" },
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
        // Resolve a free-form analyte name to its canonical registry KEY so a label ("Temperature")
        // or odd casing never hits the strict-key write validator. Only an analyte truly absent from
        // the registry falls through as the raw string (which then surfaces a clear "Unknown analyte").
        const key = resolveAnalyteKey(o.analyte) ?? o.analyte.trim();
        const def = getAnalyte(key);
        const provided = typeof o.unit === "string" ? o.unit : "";
        const unit = def ? (def.units.includes(provided) ? provided : def.defaultUnit) : provided;
        readings.push({ analyte: key, value: o.value, unit });
      }
    }
  }
  return readings;
}

export const analyteProps = Object.fromEntries(
  Object.entries(ANALYTES).map(([k, d]) => [k, { type: "number", description: `${d.label}${d.unit ? ` (${d.unit})` : ""}` }]),
);

export const recordMeasurementTool: AssistantTool = {
  name: "record_measurement",
  description:
    "Record a bench/lab reading (pH, TA, free/total SO₂, VA, residual sugar, malic, alcohol, and Brix/sugar) against a LOT or a whole vessel. Use when the user reports numbers for wine or must that is ALREADY in a vessel — including a mid-ferment SUGAR/BRIX reading on a tank/barrel (pass it as `brix`). Give the lot by code (e.g. 'lot 24-CS-A') OR the vessel (e.g. 'tank 5' / 'T4'). If a tank holds MORE THAN ONE lot (a co-ferment), naming the vessel records the reading on the WHOLE TANK — one reading fanned out to every co-resident lot (the winemaker does NOT have to pick a lot). To attach to just one lot instead, name that lot. This is NOT the vineyard-block ripeness Brix reading on grapes still on the vine at harvest — that's log_brix. Does NOT save immediately — returns a preview to confirm.",
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

    const observedAt = input.observedAt ? String(input.observedAt) : null;
    const when = observedAt ? ` on ${observedAt}` : " today";
    const readingStr = readings.map((r) => `${readingLabel(r.analyte)} ${r.value}${r.unit ? ` ${r.unit}` : ""}`).join(", ");

    // Plan 060 whole-tank default: a bare VESSEL ref (no explicit lot) on a MULTI-LOT tank fans the
    // reading out to every co-resident lot — no "which lot?" dead-end. The confirm card NAMES the lots
    // so a wrong default (two different wines parked in one tank) is caught before the write. Naming a
    // lot (input.lot, incl. the picker pin "#<id>") stays the single-lot path below.
    if (input.vessel && !input.lot) {
      const contents = await resolveVesselContents(input.vessel);
      if (contents.kind === "empty") {
        throw new Error(`${contents.vesselLabel} is empty — there's no wine to record a reading against.`);
      }
      if (contents.kind === "blend") {
        const codes = contents.lots.map((l) => l.code).join(" + ");
        const preview = `Record ${readingStr} on the whole ${contents.vesselLabel}${when} — all ${contents.lots.length} co-fermenting lots (${codes}). To record on just one lot instead, name that lot.`;
        const token = signProposal("record_measurement", {
          fanout: true,
          vesselId: contents.vesselId,
          vesselLabel: contents.vesselLabel,
          lotCount: contents.lots.length,
          readings,
          ...(observedAt ? { observedAt } : {}),
          ...(input.note ? { note: input.note } : {}),
        });
        return { needsConfirmation: true, preview, token };
      }
      // single-lot vessel → falls through to the single-lot resolution below
    }

    const resolved = await resolveLotTargetOrChoice({ lot: input.lot, vessel: input.vessel }, "record_measurement", input as Record<string, unknown>);
    if (resolved.kind === "choice") return resolved.choice;
    const { lotId, lotCode } = resolved.row;
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
  const observedAt = args.observedAt ? new Date(String(args.observedAt)) : new Date();
  const note = args.note == null ? undefined : String(args.note);
  const mapped = readings.map((r) => ({ analyte: r.analyte, value: Number(r.value), unit: r.unit ?? "" }));
  const n = readings.length;
  const plural = n === 1 ? "" : "s";

  // Plan 060: whole-tank fan-out — one reading recorded against every co-resident lot.
  if (args.fanout && args.vesselId) {
    const res = await recordVesselReadingAction({ vesselId: String(args.vesselId), observedAt, readings: mapped, note });
    const lots = res.panels.length;
    return { message: `Recorded ${n} reading${plural} on the whole ${String(args.vesselLabel ?? "tank")} — ${lots} lot${lots === 1 ? "" : "s"}.` };
  }

  const input: RecordMeasurementsInput = { lotId: String(args.lotId), observedAt, readings: mapped, note };
  await recordMeasurementsAction(input);
  return { message: `Recorded ${n} reading${plural} on lot ${String(args.lotCode ?? "")}.` };
};
