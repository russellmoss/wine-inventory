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

// v3 (Plan 080, Break Mode) adds OPTIONAL replay + narrative + hunt-trail fields alongside the v2
// console arrays. All new fields are optional and the clamp is additive, so v1/v2 rows still clamp
// cleanly and no second bump is needed when Phase 2 starts populating the trails.
export const DEBUG_CONTEXT_SCHEMA_VERSION = 3;
export const MAX_CONSOLE_ENTRIES = 50;
export const MAX_CONSOLE_MESSAGE_CHARS = 2000;
export const MAX_CONSOLE_TOTAL_CHARS = 20_000;

// Break Mode field bounds (defensive server-side clamp; capture-side redaction lives in the buffers).
export const MAX_REPLAY_ID_CHARS = 64;
export const MAX_REPLAY_URL_CHARS = 300;
export const MAX_HUNT_ID_CHARS = 64;
export const MAX_NARRATIVE_CHARS = 1000;
export const MAX_TRAIL_ENTRIES = 100;
export const MAX_TRAIL_FIELD_CHARS = 300;

export type CapturedConsoleEntry = { level: string; ts: number; message: string };

export type ConsoleCapture = {
  consoleLog?: CapturedConsoleEntry[];
  clientErrors?: CapturedConsoleEntry[];
};

/** Reporter's own words: what they were doing / expected / actually saw (Plan 080 Unit 5). */
export type NarrativeContext = { doing?: string; expected?: string; actual?: string };

/** One recorded user interaction during a Break Mode hunt (Plan 080 Unit 8). Labels only, never values. */
export type InteractionEntry = { type: string; ts: number; label?: string; detail?: string };

/** Network-request METADATA only during a hunt (Plan 080 Unit 8). Never request/response bodies. */
export type NetworkMetaEntry = {
  method: string;
  path: string;
  ts: number;
  status?: number;
  durationMs?: number;
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

/** Bound a string field to a cap; returns undefined for non-strings or empties. */
function clampStringField(raw: unknown, cap: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.slice(0, cap);
  return trimmed.length ? trimmed : undefined;
}

/** Keep only the three narrative fields, each bounded; undefined if none present. */
function clampNarrative(raw: unknown): NarrativeContext | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const out: NarrativeContext = {};
  const doing = clampStringField(rec.doing, MAX_NARRATIVE_CHARS);
  const expected = clampStringField(rec.expected, MAX_NARRATIVE_CHARS);
  const actual = clampStringField(rec.actual, MAX_NARRATIVE_CHARS);
  if (doing) out.doing = doing;
  if (expected) out.expected = expected;
  if (actual) out.actual = actual;
  return doing || expected || actual ? out : undefined;
}

/** Bound the interaction trail: cap entry count + per-field size. Never carries input values. */
function clampInteractionTrail(raw: unknown): InteractionEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: InteractionEntry[] = [];
  for (const item of raw) {
    if (out.length >= MAX_TRAIL_ENTRIES) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const type = clampStringField(rec.type, 40);
    if (!type) continue;
    const entry: InteractionEntry = {
      type,
      ts: typeof rec.ts === "number" && Number.isFinite(rec.ts) ? rec.ts : 0,
    };
    const label = clampStringField(rec.label, MAX_TRAIL_FIELD_CHARS);
    const detail = clampStringField(rec.detail, MAX_TRAIL_FIELD_CHARS);
    if (label) entry.label = label;
    if (detail) entry.detail = detail;
    out.push(entry);
  }
  return out.length ? out : undefined;
}

/** Bound the network-metadata trail: cap entry count + field sizes. Never carries bodies. */
function clampNetworkTrail(raw: unknown): NetworkMetaEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: NetworkMetaEntry[] = [];
  for (const item of raw) {
    if (out.length >= MAX_TRAIL_ENTRIES) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const method = clampStringField(rec.method, 12);
    const path = clampStringField(rec.path, MAX_TRAIL_FIELD_CHARS);
    if (!method || !path) continue;
    const entry: NetworkMetaEntry = {
      method,
      path,
      ts: typeof rec.ts === "number" && Number.isFinite(rec.ts) ? rec.ts : 0,
    };
    if (typeof rec.status === "number" && Number.isFinite(rec.status)) entry.status = rec.status;
    if (typeof rec.durationMs === "number" && Number.isFinite(rec.durationMs)) {
      entry.durationMs = rec.durationMs;
    }
    out.push(entry);
  }
  return out.length ? out : undefined;
}

/**
 * Clamp a fully client-supplied debugContext (the FeedbackTicket path) to a
 * known-safe, bounded JSON object. Keeps `schemaVersion`/`source`, bounds the
 * console arrays plus the v3 replay/narrative/hunt-trail fields, drops everything
 * else. Returns null for a non-object input. Tolerates legacy v1/v2 rows (missing
 * fields → simply omitted).
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

  // v3 (Break Mode) — all optional, all bounded.
  const replayId = clampStringField(rec.replayId, MAX_REPLAY_ID_CHARS);
  const replayUrl = clampStringField(rec.replayUrl, MAX_REPLAY_URL_CHARS);
  const huntId = clampStringField(rec.huntId, MAX_HUNT_ID_CHARS);
  const narrative = clampNarrative(rec.narrative);
  const interactionTrail = clampInteractionTrail(rec.interactionTrail);
  const networkTrail = clampNetworkTrail(rec.networkTrail);
  if (replayId) out.replayId = replayId;
  if (replayUrl) out.replayUrl = replayUrl;
  if (huntId) out.huntId = huntId;
  if (narrative) out.narrative = narrative;
  if (interactionTrail) out.interactionTrail = interactionTrail;
  if (networkTrail) out.networkTrail = networkTrail;

  return out as Prisma.InputJsonValue;
}
