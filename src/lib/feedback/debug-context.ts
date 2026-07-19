import type { Prisma } from "@prisma/client";

// Shared shape + size-clamp for the bug-report `debugContext` JSON (Plan 079, Unit 2).
//
// The client already redacts captured console text at capture time (console-buffer);
// this server-side pass is a defensive SIZE + SHAPE clamp so a crafted or oversized
// payload can't bloat the row. Two entry points:
//   - clampDebugContext  → the FeedbackTicket path, where the WHOLE blob is
//     client-supplied ({ schemaVersion, source, consoleLog, clientErrors }).
//   - clampConsoleCapture → the assistant 👎 path, where the server builds a rich
//     debugContext (trace/window) and we only MERGE in the client console arrays
//     without dropping the server fields.
//
// Type-only Prisma import → safe to reference the shape from client code too.

export const DEBUG_CONTEXT_SCHEMA_VERSION = 2;
export const MAX_CONSOLE_ENTRIES = 50;
export const MAX_CONSOLE_MESSAGE_CHARS = 2000;
export const MAX_CONSOLE_TOTAL_CHARS = 20_000;

export type CapturedConsoleEntry = { level: string; ts: number; message: string };

export type ConsoleCapture = {
  consoleLog?: CapturedConsoleEntry[];
  clientErrors?: CapturedConsoleEntry[];
};

function clampEntries(raw: unknown, budget: { remaining: number }): CapturedConsoleEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CapturedConsoleEntry[] = [];
  for (const item of raw) {
    if (out.length >= MAX_CONSOLE_ENTRIES || budget.remaining <= 0) break;
    if (!item || typeof item !== "object") continue;
    const level = (item as Record<string, unknown>).level;
    const ts = (item as Record<string, unknown>).ts;
    const message = (item as Record<string, unknown>).message;
    if (typeof level !== "string" || typeof message !== "string") continue;
    const msg = message.slice(0, MAX_CONSOLE_MESSAGE_CHARS);
    if (msg.length > budget.remaining) break;
    budget.remaining -= msg.length;
    out.push({
      level: level.slice(0, 40),
      ts: typeof ts === "number" && Number.isFinite(ts) ? ts : 0,
      message: msg,
    });
  }
  return out.length ? out : undefined;
}

/**
 * Extract + bound ONLY the console arrays from any object. Used to merge captured
 * console into a server-built debugContext without disturbing its other fields.
 */
export function clampConsoleCapture(input: unknown): ConsoleCapture {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const rec = input as Record<string, unknown>;
  const capture: ConsoleCapture = {};
  // One shared char budget across BOTH arrays (not per-array) so MAX_CONSOLE_TOTAL_CHARS is a real
  // global cap. Errors first — they're the higher-signal lines.
  const budget = { remaining: MAX_CONSOLE_TOTAL_CHARS };
  const clientErrors = clampEntries(rec.clientErrors, budget);
  const consoleLog = clampEntries(rec.consoleLog, budget);
  if (consoleLog) capture.consoleLog = consoleLog;
  if (clientErrors) capture.clientErrors = clientErrors;
  return capture;
}

/**
 * Clamp a fully client-supplied debugContext (the FeedbackTicket path) to a
 * known-safe, bounded JSON object. Keeps `schemaVersion`/`source`, bounds the
 * console arrays, drops everything else. Returns null for a non-object input.
 * Tolerates legacy v1 rows (no console arrays → just schemaVersion/source).
 */
export function clampDebugContext(input: unknown): Prisma.InputJsonValue | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const rec = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  out.schemaVersion = typeof rec.schemaVersion === "number" ? rec.schemaVersion : 1;
  if (typeof rec.source === "string") out.source = rec.source.slice(0, 120);
  const { consoleLog, clientErrors } = clampConsoleCapture(rec);
  if (consoleLog) out.consoleLog = consoleLog;
  if (clientErrors) out.clientErrors = clientErrors;
  return out as Prisma.InputJsonValue;
}
