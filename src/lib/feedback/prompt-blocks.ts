import type { CapturedConsoleEntry } from "./debug-context";

// One shared formatter for the untrusted-data blocks fed to the feedback fix/plan
// agents (Plan 079, council C-3 DRY). Foregrounds the captured console errors as an
// explicit `<console_errors>` block instead of leaving them buried in the raw
// `<debug_context>` JSON dump, so the model reasons about the real error. Pure +
// unit-tested; used by scripts/bug-feedback-agent.ts + scripts/assistant-feedback-agent.ts
// (and, later, the clarification-history block in Unit 10).

/** Wrap content in an XML-ish tag. Callers frame these as untrusted data. */
export function untrustedBlock(tag: string, content: string): string {
  return `<${tag}>\n${content}\n</${tag}>`;
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
