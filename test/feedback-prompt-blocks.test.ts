import { describe, it, expect } from "vitest";
import { formatConsoleErrorsBlock, untrustedBlock } from "@/lib/feedback/prompt-blocks";

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
