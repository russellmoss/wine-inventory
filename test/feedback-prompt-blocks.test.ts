import { describe, it, expect } from "vitest";
import {
  formatConsoleErrorsBlock,
  formatClarificationHistoryBlock,
  untrustedBlock,
} from "@/lib/feedback/prompt-blocks";

describe("formatClarificationHistoryBlock", () => {
  it("is empty when nothing is answered", () => {
    expect(formatClarificationHistoryBlock([])).toBe("");
    expect(formatClarificationHistoryBlock([{ round: 1, questions: "What page?", answerBody: null }])).toBe("");
    expect(formatClarificationHistoryBlock([{ round: 1, questions: "What page?", answerBody: "  " }])).toBe("");
  });

  it("renders answered turns as Q/A, ordered by round", () => {
    const out = formatClarificationHistoryBlock([
      { round: 2, questions: "Which browser?", answerBody: "Chrome" },
      { round: 1, questions: "What page?\nAny error?", answerBody: "Bottling; a 500" },
    ]);
    expect(out.startsWith("<clarification_history>")).toBe(true);
    expect(out).toContain("Q: What page?");
    expect(out).toContain("Q: Any error?");
    expect(out).toContain("A: Bottling; a 500");
    // round 1 before round 2
    expect(out.indexOf("What page?")).toBeLessThan(out.indexOf("Which browser?"));
  });
});

describe("untrustedBlock", () => {
  it("wraps content in a tag", () => {
    expect(untrustedBlock("x", "hi")).toBe("<x>\nhi\n</x>");
  });
});

describe("formatConsoleErrorsBlock", () => {
  it("returns empty string when there is no console data", () => {
    expect(formatConsoleErrorsBlock(null)).toBe("");
    expect(formatConsoleErrorsBlock({})).toBe("");
    expect(formatConsoleErrorsBlock({ schemaVersion: 2, source: "help-page" })).toBe("");
    expect(formatConsoleErrorsBlock("not-an-object")).toBe("");
  });

  it("renders a console_errors block with errors first", () => {
    const out = formatConsoleErrorsBlock({
      clientErrors: [{ level: "error", ts: 1, message: "TypeError: x is undefined" }],
      consoleLog: [{ level: "warn", ts: 1, message: "slow query" }],
    });
    expect(out.startsWith("<console_errors>")).toBe(true);
    expect(out.endsWith("</console_errors>")).toBe(true);
    expect(out.indexOf("TypeError")).toBeLessThan(out.indexOf("slow query"));
    expect(out).toContain("[error] TypeError: x is undefined");
    expect(out).toContain("[warn] slow query");
  });

  it("renders when only logs (no errors) are present", () => {
    const out = formatConsoleErrorsBlock({ consoleLog: [{ level: "log", ts: 1, message: "hello" }] });
    expect(out).toContain("[log] hello");
  });

  it("ignores malformed entries", () => {
    const out = formatConsoleErrorsBlock({
      clientErrors: [{ level: "error", ts: 1, message: "ok" }, { level: 5 }, null, { message: "no-level" }],
    });
    expect(out).toContain("[error] ok");
    expect(out).not.toContain("no-level");
  });

  it("respects the maxChars cap", () => {
    const out = formatConsoleErrorsBlock(
      { clientErrors: [{ level: "error", ts: 1, message: "z".repeat(5000) }] },
      { maxChars: 200 },
    );
    // block = <console_errors>\n + body(<=200) + \n</console_errors>
    expect(out.length).toBeLessThan(260);
  });
});
