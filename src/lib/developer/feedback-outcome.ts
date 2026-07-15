import { sanitizePlainText } from "@/lib/feedback/sanitize";

export type DeveloperCloseStatus = "RESOLVED" | "DISMISSED";
export type DeveloperOutcomeParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const OUTCOME_LIMIT = 1_200;
const NOTE_LIMIT = 5_000;
const ENTRY_SEPARATOR = "\n\n---\n";

export function parseDeveloperOutcome(value: unknown): DeveloperOutcomeParseResult {
  if (typeof value !== "string") {
    return { ok: false, error: "Describe the outcome in at least 20 characters." };
  }
  const sanitized = sanitizePlainText(value, OUTCOME_LIMIT).trim();
  if (sanitized.length < 20) {
    return { ok: false, error: "Describe the outcome in at least 20 characters." };
  }
  return { ok: true, value: sanitized };
}

export function prependDeveloperOutcomeNote(input: {
  existing: string | null;
  at: Date;
  actorEmail: string;
  status: DeveloperCloseStatus;
  outcome: string;
}): string {
  const parsed = parseDeveloperOutcome(input.outcome);
  if (!parsed.ok) throw new RangeError(parsed.error);
  const actor = sanitizePlainText(input.actorEmail, 320).replace(/[\r\n]/g, " ").trim();
  const type = input.status === "RESOLVED" ? "resolved" : "dismissed";
  const entry = `[developer ${input.at.toISOString()}] [${type}] ${parsed.value} — ${actor}`;
  return (input.existing ? `${entry}${ENTRY_SEPARATOR}${input.existing}` : entry).slice(
    0,
    NOTE_LIMIT,
  );
}
