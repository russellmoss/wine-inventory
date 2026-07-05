import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveOpenSample } from "../scope";
import { ANALYTES, analyteProps, collectReadings, type OtherReading, type Reading } from "./record-measurement";
import { attachSampleResultsAction } from "@/lib/chemistry/actions";

// Wave 3 (lab samples) — attach RETURNED lab results to a pending sample. Wraps attachSampleResultsCore,
// which creates an AnalysisPanel linked to the sample (inheriting the sample's CAPTURED lotId — never
// re-resolved from the current vessel) and flips the sample to ATTACHED, both in one tx. Reuses the SAME
// analyte vocabulary as record_measurement. For a direct bench reading with no sample, use record_measurement.

type RawInput = {
  sampleId?: string;
  vessel?: string;
  lot?: string;
  observedAt?: string;
  note?: string;
  other?: OtherReading[];
} & Partial<Record<keyof typeof ANALYTES, number>>;

export const recordSampleResultsTool: AssistantTool = {
  name: "record_sample_results",
  description:
    "Attach RETURNED LAB RESULTS to a pending sample — the readings the lab sent back (pH, TA, SO₂, VA, RS, malic, alcohol, or free-form). Use when results come back for a sample you pulled: 'the ETS results for tank 5 came back — free SO₂ 28, TA 6.1'. Resolves the open sample on the lot/vessel (or an explicit sample id). This attaches to a SAMPLE (inherits its captured lot); a direct bench reading with no sample is record_measurement. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Lot the sample was pulled from, e.g. '24-CS-A'." },
      vessel: { type: "string", description: "Vessel the sample was pulled from, e.g. 'tank 5' (resolves the open sample)." },
      sampleId: { type: "string", description: "Explicit sample id, if known." },
      ...analyteProps,
      other: {
        type: "array",
        description: "Any other returned analytes not in the named fields.",
        items: { type: "object", properties: { analyte: { type: "string" }, value: { type: "number" }, unit: { type: "string" } } },
      },
      observedAt: { type: "string", description: "Result date, YYYY-MM-DD (optional; defaults to the pull date)." },
      note: { type: "string", description: "Optional note." },
    },
    required: [],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const readings = collectReadings(input);
    if (readings.length === 0) throw new Error("Give at least one returned reading, e.g. free SO₂ 28 or TA 6.1.");
    const sample = await resolveOpenSample({ sampleId: input.sampleId, vessel: input.vessel, lot: input.lot });
    const readingStr = readings.map((r) => `${r.analyte} ${r.value}${r.unit ? ` ${r.unit}` : ""}`).join(", ");
    const preview = `Attach lab results (${readingStr}) to the sample on lot ${sample.lotCode}.`;
    const token = signProposal("record_sample_results", {
      sampleId: sample.sampleId,
      lotCode: sample.lotCode,
      readings,
      ...(input.observedAt ? { observedAt: input.observedAt } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRecordSampleResults: Committer = async (_user, args) => {
  const readings = Array.isArray(args.readings) ? (args.readings as Reading[]) : [];
  await attachSampleResultsAction({
    sampleId: String(args.sampleId),
    readings: readings.map((r) => ({ analyte: r.analyte, value: Number(r.value), unit: r.unit ?? "" })),
    observedAt: args.observedAt == null ? undefined : String(args.observedAt),
    note: args.note == null ? undefined : String(args.note),
  });
  return { message: `Attached ${readings.length} lab result${readings.length === 1 ? "" : "s"} to the sample on lot ${String(args.lotCode ?? "")}.` };
};
