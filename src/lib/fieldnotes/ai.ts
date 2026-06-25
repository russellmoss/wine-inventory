import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { parseFieldNoteRow } from "@/lib/fieldnotes/types";
import {
  buildBriefingInput,
  parseBriefing,
  BRIEFING_SYSTEM_PROMPT,
  BRIEFING_JSON_SCHEMA,
} from "@/lib/fieldnotes/prompt";

// Confirmed via the claude-api skill: default to claude-opus-4-8 (don't downgrade
// without an explicit instruction). Summarization output is short, so a bounded
// max_tokens + non-streaming call stays well inside the 60s route ceiling.
const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 4096;
const AI_WINDOW = 4; // this week + prior 3

const noteSelect = {
  id: true,
  vineyardId: true,
  userId: true,
  userEmail: true,
  weekOf: true,
  weatherData: true,
  spraysApplied: true,
  fertilizersApplied: true,
  blockLevelStatuses: true,
  generalNotes: true,
  aiSummary: true,
  aiSummaryStatus: true,
  aiSummaryAt: true,
  schemaVersion: true,
  createdAt: true,
} as const;

export class BriefingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefingError";
  }
}

/**
 * Generate the Weekly Call Briefing for a note: load this week + the prior three
 * for the same vineyard, assemble the context, and call Claude. Runs server-side
 * only (invoked from the summarize route's after()); does its own DB reads rather
 * than the scope-checked actions, since it has already been authorized upstream.
 * Throws BriefingError on any failure so the caller can mark the note FAILED.
 */
export async function generateBriefing(noteId: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new BriefingError("ANTHROPIC_API_KEY is not configured.");
  }

  const current = await prisma.fieldNote.findUnique({
    where: { id: noteId },
    select: { vineyardId: true, weekOf: true },
  });
  if (!current) throw new BriefingError(`Field note ${noteId} not found.`);

  const [rows, blocks, vineyard] = await Promise.all([
    prisma.fieldNote.findMany({
      where: { vineyardId: current.vineyardId, weekOf: { lte: current.weekOf } },
      orderBy: { weekOf: "desc" },
      take: AI_WINDOW,
      select: noteSelect,
    }),
    prisma.vineyardBlock.findMany({
      where: { vineyardId: current.vineyardId },
      select: { id: true, blockLabel: true },
    }),
    prisma.vineyard.findUnique({
      where: { id: current.vineyardId },
      select: { name: true },
    }),
  ]);

  const notes = rows.map(parseFieldNoteRow);
  const blockLabels: Record<string, string> = {};
  for (const b of blocks) blockLabels[b.id] = b.blockLabel ?? b.id;

  const input = buildBriefingInput(notes, vineyard?.name ?? "Unknown vineyard", blockLabels);

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: BRIEFING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: input }],
      // Structured output: the response text is JSON matching the briefing schema.
      output_config: { format: { type: "json_schema", schema: BRIEFING_JSON_SCHEMA } },
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new BriefingError("Claude returned an empty briefing.");
    // Validate the JSON before storing so the admin UI never has to handle garbage;
    // store the normalized form.
    const parsed = parseBriefing(text);
    if (!parsed) throw new BriefingError("Claude returned a malformed briefing.");
    return JSON.stringify(parsed);
  } catch (e) {
    if (e instanceof BriefingError) throw e;
    throw new BriefingError(e instanceof Error ? e.message : "Claude request failed.");
  }
}
