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

import { MAX_MESSAGES, MAX_CONTENT } from "./message-window";

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

/** How many API messages a row costs once rebuilt: tool_use + tool_result (+ the text turn). */
function expandedCost(row: ReplayRow): number {
  if (row.role !== "assistant") return 1;
  const calls = replayableCalls(row);
  if (calls.length === 0) return 1;
  return row.content.trim() ? 3 : 2;
}

/**
 * Bound a conversation BEFORE it is rebuilt.
 *
 * Windowing the rebuilt messages would be the obvious move and it is the dangerous one: a
 * `tool_use` and the user message carrying its `tool_result` are adjacent entries, so any cut
 * between them, or any leading-element shift, orphans one half. That is a hard 400, and it is the
 * failure that already bricked long conversations once (see the header of
 * test/assistant-message-window.test.ts).
 *
 * Cutting at the ROW level makes that unrepresentable: pairs are created during the rebuild, from
 * whole rows, so a row that survives brings its pair with it and a row that does not never makes one.
 *
 * The budget counts EXPANDED messages, not rows, because a tool turn costs up to three. Matching
 * MAX_MESSAGES keeps the payload the same size it was before replay existed — without this, a
 * rebuilt conversation would bypass the parser's cap entirely and send far more than the text path
 * ever did.
 */
export function windowReplayRows(rows: ReplayRow[], budget: number = MAX_MESSAGES): ReplayRow[] {
  if (!Array.isArray(rows)) return [];
  const kept: ReplayRow[] = [];
  let spent = 0;
  // Walk backwards: the most recent turns are the ones worth keeping.
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row || typeof row.content !== "string") continue;
    const cost = expandedCost(row);
    if (spent + cost > budget && kept.length > 0) break;
    kept.unshift(row);
    spent += cost;
  }
  // Open on a user turn. Dropping a leading assistant row here also removes the only way a rebuilt
  // conversation could start with an orphan tool_result.
  let start = 0;
  while (start < kept.length && kept[start].role !== "user") start++;
  return kept.slice(start);
}

/** Clip an over-long stored turn, mirroring the text parser. Never applied to structured content. */
function clip(text: string): string {
  return text.length > MAX_CONTENT ? `${text.slice(0, MAX_CONTENT - 1)}…` : text;
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
          ? { role: "user", content: [...pending, { type: "text", text: clip(row.content) }] }
          : { role: "user", content: clip(row.content) },
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
      out.push({ role: "assistant", content: clip(row.content) });
    }
  }

  // Tail safety. Callers pass rows ending on the user turn, so this should be unreachable; if it ever
  // is reached, dropping the orphans beats sending a tool_use with no result.
  if (pending.length > 0) {
    while (out.length > 0 && out[out.length - 1].role === "assistant") out.pop();
  }

  // The API requires the conversation to open on a user turn.
  while (out.length > 0 && out[0].role !== "user") out.shift();

  // Belt and braces. windowReplayRows already prevents this by cutting at row boundaries, but if a
  // caller ever hands in rows starting mid-turn, the shift above could leave a user message opening
  // with tool_result blocks whose tool_use is gone. Strip them; drop the message if nothing is left.
  if (out.length > 0 && Array.isArray(out[0].content)) {
    const kept = (out[0].content as ReplayBlock[]).filter((b) => b.type !== "tool_result");
    if (kept.length === 0) out.shift();
    else out[0] = { role: "user", content: kept };
  }

  return out;
}
