// Pure builders for the Weekly Call Briefing. No SDK import here so the prompt
// shape + input assembler are unit-testable without a live API call.

import type { ParsedFieldNote, InputApplication, BlockStatus } from "@/lib/fieldnotes/types";

// ───────────────────────── Structured briefing shape ─────────────────────────
// The model returns this JSON (enforced via output_config.format). The admin UI
// renders it with colored severity, section blocks, and an agenda up top — so the
// agenda is data, not the tail of a wall of prose.

export type BriefingPriority = "high" | "medium" | "low";
export type BriefingTone = "alert" | "watch" | "info";
export const BRIEFING_SECTION_KEYS = [
  "rain_vs_spray",
  "task_slippage",
  "leaf_conditions",
  "disease_pest",
] as const;
export type BriefingSectionKey = (typeof BRIEFING_SECTION_KEYS)[number];

export type BriefingAgendaItem = { priority: BriefingPriority; question: string };
export type BriefingSectionItem = { tone: BriefingTone; text: string; block: string };
export type BriefingSection = {
  key: BriefingSectionKey;
  title: string;
  items: BriefingSectionItem[];
};
export type Briefing = {
  headline: string;
  agenda: BriefingAgendaItem[];
  sections: BriefingSection[];
};

/** JSON Schema for output_config.format — every object closed, every field required. */
export const BRIEFING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "agenda", "sections"],
  properties: {
    headline: { type: "string" },
    agenda: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "question"],
        properties: {
          priority: { type: "string", enum: ["high", "medium", "low"] },
          question: { type: "string" },
        },
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "title", "items"],
        properties: {
          key: { type: "string", enum: [...BRIEFING_SECTION_KEYS] },
          title: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["tone", "text", "block"],
              properties: {
                tone: { type: "string", enum: ["alert", "watch", "info"] },
                text: { type: "string" },
                block: { type: "string" }, // "" when not block-specific
              },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * System prompt for the structured briefing. Framing (council Q1): Claude is a
 * DATA SUMMARIZER, not a diagnostician — it cites the logged record and frames
 * anything actionable as a question to confirm, never a definitive diagnosis or
 * prescription. Output is JSON matching the schema above.
 */
export const BRIEFING_SYSTEM_PROMPT = `You are a vineyard operations analyst preparing a call briefing for an out-of-country vineyard owner. You receive the most recent field report plus up to the prior three, all logged by the on-site manager. Reports are filed per day, so the cadence between them may vary.

YOUR ROLE: You are a DATA SUMMARIZER, not a diagnostician. Summarize and connect what is in the logged record. Do NOT issue definitive agronomic diagnoses or prescriptions. Never write things like "Block 4 has a magnesium deficiency, order fertilizer X." Surface patterns as observations tied to the data, and frame anything actionable as a question to confirm with the manager.

Ground every statement in the logged data. If something was not logged, say it was not logged rather than inferring it happened.

Return ONLY a JSON object matching the provided schema. No prose outside the JSON.

Fields:
- "headline": one plain sentence summarizing the latest report (e.g. "Heavy rain after the prior protectant spray; rising water and weed pressure across three blocks").
- "agenda": EXACTLY 3 items, each a QUESTION or thing to confirm with the manager on the call. Each has a "priority" of "high", "medium", or "low" — order the most decision-critical first. This is the most important output.
- "sections": one entry per analysis that the data supports (omit a section entirely if there's nothing to say). Use these "key" values and short human "title"s:
  • "rain_vs_spray" — rain logged after a protectant spray => coverage may have lapsed; confirm.
  • "task_slippage" — what was logged vs not logged, in the latest report vs prior ones.
  • "leaf_conditions" — leaf symptoms co-occurring with input gaps, stated as a correlation to verify.
  • "disease_pest" — disease/pest items the manager flagged, with the week.
  Each section "items" entry has: "tone" = "alert" (needs action/confirmation, e.g. coverage lapse or a healthy→symptom flip), "watch" (worth monitoring), or "info" (neutral context); "text" = one concise observation tied to the data; "block" = the block label it concerns (e.g. "Block 4") or "" when it's vineyard-wide.

Keep every "text" and "question" to one tight sentence.`;

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
    `phenology ${s.phenoStage ?? "—"}${s.phenoStagePct != null ? ` (${s.phenoStagePct}%)` : ""}`,
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
  const reports = chronological.map((note) => {
    const w = note.weatherData;
    const lines = [
      `## Report dated ${note.weekOf} (logged by ${note.userEmail})`,
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
    `Reports in window (chronological, oldest first): ${chronological.length}`,
    "",
    reports.join("\n\n"),
  ].join("\n");
}

// ───────────────────────── Parse a stored briefing ─────────────────────────
// Tolerant: returns a Briefing for valid structured JSON, or null for legacy
// plain-text briefings (the UI falls back to rendering those as text).

const PRIORITIES: readonly string[] = ["high", "medium", "low"];
const TONES: readonly string[] = ["alert", "watch", "info"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseBriefing(raw: string | null | undefined): Briefing | null {
  if (!raw || !raw.trim().startsWith("{")) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || !Array.isArray(data.agenda) || !Array.isArray(data.sections)) {
    return null;
  }

  const agenda: BriefingAgendaItem[] = [];
  for (const a of data.agenda) {
    if (!isRecord(a) || typeof a.question !== "string") continue;
    const priority = (PRIORITIES.includes(a.priority as string) ? a.priority : "medium") as BriefingPriority;
    agenda.push({ priority, question: a.question });
  }

  const sections: BriefingSection[] = [];
  for (const s of data.sections) {
    if (!isRecord(s) || typeof s.title !== "string" || !Array.isArray(s.items)) continue;
    const key = (BRIEFING_SECTION_KEYS as readonly string[]).includes(s.key as string)
      ? (s.key as BriefingSectionKey)
      : "task_slippage";
    const items: BriefingSectionItem[] = [];
    for (const it of s.items) {
      if (!isRecord(it) || typeof it.text !== "string") continue;
      const tone = (TONES.includes(it.tone as string) ? it.tone : "info") as BriefingTone;
      items.push({ tone, text: it.text, block: typeof it.block === "string" ? it.block : "" });
    }
    if (items.length > 0) sections.push({ key, title: s.title, items });
  }

  const headline = typeof data.headline === "string" ? data.headline : "";
  if (agenda.length === 0 && sections.length === 0) return null;
  return { headline, agenda, sections };
}
