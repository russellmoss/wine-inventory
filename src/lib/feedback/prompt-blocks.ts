import type { CapturedConsoleEntry } from "./debug-context";

// One shared formatter for the untrusted-data blocks fed to the feedback fix/plan
// agents (Plan 079, council C-3 DRY). Foregrounds the captured console errors as an
// explicit `<console_errors>` block instead of leaving them buried in the raw
// `<debug_context>` JSON dump, so the model reasons about the real error. Pure +
// unit-tested; used by scripts/bug-feedback-agent.ts + scripts/assistant-feedback-agent.ts
// (and, later, the clarification-history block in Unit 10).

// The block tag names an attacker in a reporter answer / console message could try to forge to break
// out of their block. Defanged (see below) so untrusted content can't close or open one.
const BLOCK_TAGS =
  "console_errors|clarification_history|debug_context|bug_title|bug_description|page_url|user_feedback|conversation_transcript";
const BLOCK_TAG_RE = new RegExp(`<\\s*/?\\s*(?:${BLOCK_TAGS})\\s*>`, "gi");

/**
 * Wrap content in an XML-ish tag. Callers frame these as untrusted data. Any forged block delimiter
 * INSIDE the content (e.g. a reporter answer containing `</clarification_history>`) is neutralized so
 * it can't close/inject a block in the fix-agent prompt (security review hardening).
 */
export function untrustedBlock(tag: string, content: string): string {
  const safe = content.replace(BLOCK_TAG_RE, (m) => m.replace(/</g, "‹").replace(/>/g, "›"));
  return `<${tag}>\n${safe}\n</${tag}>`;
}

function readConsoleEntries(value: unknown): CapturedConsoleEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is CapturedConsoleEntry =>
      !!e &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).message === "string" &&
      typeof (e as Record<string, unknown>).level === "string",
  );
}

/**
 * Render a bounded `<console_errors>` block from a ticket's debugContext, or ""
 * when there is no captured console. Errors (console.error + uncaught) are listed
 * first as the highest-signal lines.
 */
export function formatConsoleErrorsBlock(debugContext: unknown, opts?: { maxChars?: number }): string {
  if (!debugContext || typeof debugContext !== "object") return "";
  const rec = debugContext as Record<string, unknown>;
  const clientErrors = readConsoleEntries(rec.clientErrors);
  const consoleLog = readConsoleEntries(rec.consoleLog);
  if (!clientErrors.length && !consoleLog.length) return "";

  const maxChars = opts?.maxChars ?? 8000;
  const line = (e: CapturedConsoleEntry) => `[${e.level}] ${e.message}`;
  const parts: string[] = [];
  if (clientErrors.length) {
    parts.push("Uncaught errors / console.error (captured at report time, highest signal):\n" + clientErrors.map(line).join("\n"));
  }
  if (consoleLog.length) {
    parts.push("Other recent console output:\n" + consoleLog.map(line).join("\n"));
  }
  return untrustedBlock("console_errors", parts.join("\n\n").slice(0, maxChars));
}

export type ClarificationTurn = { round: number; questions: string | null; answerBody: string | null };

/**
 * Render a `<clarification_history>` block of prior Q&A the reporter answered (Plan 079, Unit 10),
 * so a re-dispatched run is actually more specific. Rows are the source of truth (council C-3.9);
 * this is built from them at read time. Both the questions and the answers are UNTRUSTED user text.
 */
export function formatClarificationHistoryBlock(turns: ClarificationTurn[], opts?: { maxChars?: number }): string {
  const answered = turns.filter((t) => t.answerBody && t.answerBody.trim());
  if (!answered.length) return "";
  const maxChars = opts?.maxChars ?? 6000;
  const body = answered
    .sort((a, b) => a.round - b.round)
    .map((t) => {
      const qs = (t.questions ?? "").split("\n").filter(Boolean).map((q) => `Q: ${q}`).join("\n");
      return `${qs}\nA: ${t.answerBody?.trim()}`;
    })
    .join("\n\n");
  return untrustedBlock("clarification_history", body.slice(0, maxChars));
}
