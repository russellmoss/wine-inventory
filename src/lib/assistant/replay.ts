// Plan 083 — rebuild a persisted conversation into the message array the model actually sees.
//
// WHY THIS EXISTS. History used to be replayed as text only (history.ts keeps `typeof content ===
// "string"`), so every prior tool call vanished. What the model saw was N of its own turns saying
// "review and confirm the card" with no tool call attached anywhere, and it completed that pattern:
// it answered a write request with prose claiming a card, and wrote nothing. Measured against the
// captured cmrsrs02 transcript on the production model: 0/8 with text-only replay, 8/8 once the
// tool_use / tool_result blocks are put back. Not stochastic, and not specific to one tool.
//
// The shape produced here is the SAME one runAssistant already builds within a single turn
// (run.ts:141 pushes the full assistant content including tool_use; run.ts:268 returns every
// tool_result in ONE user message). This just makes it survive across turns.
//
// Pure and server-free on purpose, so it is unit-testable without a DB.

/** A persisted `assistant_message` row, narrowed to what replay needs. */
export type ReplayRow = {
  role: string;
  content: string;
  metadata?: unknown;
};

export type ReplayBlock =
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string }
  | { type: "text"; text: string };

export type ReplayMessage = { role: "user" | "assistant"; content: string | ReplayBlock[] };

type TracedCall = { id?: unknown; name?: unknown; input?: unknown; resultPreview?: unknown; resultKind?: unknown };

/** Fallback tool_result text when the trace captured no preview. Never empty — the API rejects that. */
function resultTextOf(call: TracedCall): string {
  if (typeof call.resultPreview === "string" && call.resultPreview.trim()) return call.resultPreview;
  const kind = typeof call.resultKind === "string" ? call.resultKind : "text";
  return kind === "error" ? "The tool returned an error." : `The ${kind} result was returned to the user.`;
}

/**
 * Tool calls from a row that can be replayed as a well-formed pair.
 *
 * ALL-OR-NOTHING per row, deliberately. Rows written before this shipped have no `id` on their trace
 * calls, and a `tool_use` without a matching `tool_result` (or vice versa) is a hard 400 from the API
 * that would brick the whole conversation. A legacy row degrades to plain text instead — worse replay,
 * never a broken request.
 */
function replayableCalls(row: ReplayRow): Array<{ id: string; name: string; input: unknown; result: string }> {
  const trace = (row.metadata as { trace?: { toolCalls?: unknown } } | null | undefined)?.trace;
  const calls = Array.isArray(trace?.toolCalls) ? (trace.toolCalls as TracedCall[]) : [];
  if (calls.length === 0) return [];

  const usable = calls.filter(
    (c): c is TracedCall & { id: string; name: string } =>
      typeof c.id === "string" && c.id.length > 0 && typeof c.name === "string" && c.name.length > 0,
  );
  // A partially-traced row is not safe to half-replay: the trace caps at MAX_TOOL_CALLS, so a row can
  // legitimately hold fewer calls than the turn made, and pairing the wrong subset invents history.
  if (usable.length !== calls.length) return [];

  return usable.map((c) => ({ id: c.id, name: c.name, input: c.input ?? {}, result: resultTextOf(c) }));
}

/**
 * Rebuild the full messages array from persisted rows, oldest first.
 *
 * `rows` must already END with the current user turn (the route persists it before running), so no
 * tool_result is ever left dangling at the tail.
 *
 * Text-only conversations come out byte-identical to the old behavior: `{role, content: string}` per
 * row. That is asserted in the tests — this change must be invisible unless tools were actually used.
 */
export function buildReplayMessages(rows: ReplayRow[]): ReplayMessage[] {
  if (!Array.isArray(rows)) return [];
  const out: ReplayMessage[] = [];
  /** tool_result blocks owed to the next user message. */
  let pending: ReplayBlock[] = [];

  for (const row of rows) {
    if (!row || typeof row.content !== "string") continue;

    if (row.role === "user") {
      // Merge any owed tool_results into this user turn rather than emitting a bare user message and
      // then another one — two consecutive user messages is exactly the malformed shape that 400s.
      out.push(
        pending.length
          ? { role: "user", content: [...pending, { type: "text", text: row.content }] }
          : { role: "user", content: row.content },
      );
      pending = [];
      continue;
    }

    if (row.role !== "assistant") continue;

    const calls = replayableCalls(row);
    if (calls.length > 0) {
      out.push({
        role: "assistant",
        content: calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
      });
      pending = calls.map((c) => ({ type: "tool_result", tool_use_id: c.id, content: c.result }));
    }

    // A turn that emitted only a card has no text. Leave its tool_results pending so they attach to
    // the next user turn; inventing filler prose here would put words in the assistant's mouth, and
    // synthetic scaffolding is measurably echoed back to the user (plan 083 Unit 1, ablation B).
    if (row.content.trim()) {
      if (pending.length > 0) {
        out.push({ role: "user", content: pending });
        pending = [];
      }
      out.push({ role: "assistant", content: row.content });
    }
  }

  // Tail safety. Callers pass rows ending on the user turn, so this should be unreachable; if it ever
  // is reached, dropping the orphans beats sending a tool_use with no result.
  if (pending.length > 0) {
    while (out.length > 0 && out[out.length - 1].role === "assistant") out.pop();
  }

  // The API requires the conversation to open on a user turn.
  while (out.length > 0 && out[0].role !== "user") out.shift();

  return out;
}
