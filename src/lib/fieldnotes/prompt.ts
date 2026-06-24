// Pure builders for the Weekly Call Briefing. No SDK import here so the prompt
// shape + input assembler are unit-testable without a live API call.

import type { ParsedFieldNote, InputApplication, BlockStatus } from "@/lib/fieldnotes/types";

/**
 * System prompt for the briefing. Framing (council Q1): Claude is a DATA
 * SUMMARIZER, not a diagnostician. It cites the logged record and surfaces
 * patterns as observations to confirm — never definitive agronomic diagnoses or
 * prescriptions — and ends with a 3-bullet agenda framed as questions.
 */
export const BRIEFING_SYSTEM_PROMPT = `You are a vineyard operations analyst preparing a weekly call briefing for an out-of-country vineyard owner. You will receive this week's field report plus up to the prior three weeks, all logged by the on-site manager.

YOUR ROLE: You are a DATA SUMMARIZER, not a diagnostician. Summarize and connect what is in the logged record. Do NOT issue definitive agronomic diagnoses or prescriptions. Never write things like "Block 4 has a magnesium deficiency, order fertilizer X." Instead surface patterns as observations tied to the data, and frame anything actionable as a question to confirm with the manager.

Ground every statement in the logged data. If something was not logged, say it was not logged rather than inferring it happened.

Produce a short, scannable briefing covering these four analyses, only where the data supports them:
1. Rain-vs-spray timing: if rain was logged after a protectant spray, note that coverage may have lapsed and should be confirmed.
2. Task slippage across weeks: what was logged versus not logged over the available weeks (this week vs prior weeks).
3. Leaf condition co-occurring with input gaps: state as a correlation to verify, e.g. "Block 4 reported yellowing; no fertilizer was logged for it in 3 weeks — worth asking about."
4. Disease/pest observations the manager flagged, with the week and block.

End with a section titled "3-bullet agenda" containing exactly three bullets, each phrased as a question or a thing to confirm with the manager on the call. Keep the whole briefing concise and plain-text (no markdown headers beyond simple labels). Respond with the briefing only — no preamble.`;

function describeInputs(apps: InputApplication[], blockLabels: Record<string, string>): string {
  if (apps.length === 0) return "none logged";
  return apps
    .map((a) => {
      if (a.scope === "WHOLE") return `${a.name} (whole vineyard)`;
      const labels = a.blockIds.map((id) => blockLabels[id] ?? id).join(", ");
      return `${a.name} (blocks: ${labels || "unspecified"})`;
    })
    .join("; ");
}

function describeBlock(label: string, s: BlockStatus): string {
  const parts = [
    `phenology ${s.phenoStage ?? "—"}`,
    `shoot tip ${s.shootTip ?? "—"}`,
    `canopy ${s.canopyDensity ?? "—"}`,
    `water stress ${s.waterStress ?? "—"}`,
    `weed pressure ${s.weedPressure ?? "—"}`,
    `leaf ${s.leafConditions.length ? s.leafConditions.join("/") : "healthy"}`,
  ];
  if (s.diseasePestSpotted) {
    parts.push(`DISEASE/PEST FLAGGED${s.diseaseDescription ? `: ${s.diseaseDescription}` : ""}`);
  }
  if (s.photoUrls.length) parts.push(`${s.photoUrls.length} photo(s)`);
  return `  - ${label}: ${parts.join(", ")}`;
}

/**
 * Assemble the field-note window into a compact, chronological (oldest-first)
 * text context for the model. `notes` may arrive newest-first; we sort here.
 */
export function buildBriefingInput(
  notes: ParsedFieldNote[],
  vineyardName: string,
  blockLabels: Record<string, string>,
): string {
  const chronological = [...notes].sort((a, b) => a.weekOf.localeCompare(b.weekOf));
  const weeks = chronological.map((note) => {
    const w = note.weatherData;
    const lines = [
      `## Week of ${note.weekOf} (logged by ${note.userEmail})`,
      `Weather: rainfall ${w.rainfallMm ?? "—"} mm, max ${w.maxTempC ?? "—"}°C, min ${w.minTempC ?? "—"}°C`,
      `Sprays: ${describeInputs(note.spraysApplied, blockLabels)}`,
      `Fertilizers: ${describeInputs(note.fertilizersApplied, blockLabels)}`,
      `General notes: ${note.generalNotes?.trim() || "none"}`,
      `Blocks:`,
      ...Object.entries(note.blockLevelStatuses).map(([blockId, status]) =>
        describeBlock(blockLabels[blockId] ?? blockId, status),
      ),
    ];
    return lines.join("\n");
  });

  return [
    `Vineyard: ${vineyardName}`,
    `Weeks in window (chronological, oldest first): ${chronological.length}`,
    "",
    weeks.join("\n\n"),
  ].join("\n");
}
