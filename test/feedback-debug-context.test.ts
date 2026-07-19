import { describe, it, expect } from "vitest";
import {
  clampDebugContext,
  clampConsoleCapture,
  DEBUG_CONTEXT_SCHEMA_VERSION,
  MAX_CONSOLE_ENTRIES,
  MAX_CONSOLE_TOTAL_CHARS,
} from "@/lib/feedback/debug-context";

const entry = (message: string, level = "log", ts = 1) => ({ level, ts, message });

describe("clampDebugContext", () => {
  it("returns null for non-objects", () => {
    expect(clampDebugContext(null)).toBeNull();
    expect(clampDebugContext("nope")).toBeNull();
    expect(clampDebugContext(["a"])).toBeNull();
  });

  it("keeps schemaVersion + source and bounds console arrays", () => {
    const out = clampDebugContext({
      schemaVersion: DEBUG_CONTEXT_SCHEMA_VERSION,
      source: "help-page",
      consoleLog: [entry("hi")],
      clientErrors: [entry("boom", "error")],
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(DEBUG_CONTEXT_SCHEMA_VERSION);
    expect(out.source).toBe("help-page");
    expect(out.consoleLog).toEqual([entry("hi")]);
    expect(out.clientErrors).toEqual([entry("boom", "error")]);
  });

  it("tolerates a legacy v1 blob with no console", () => {
    const out = clampDebugContext({ schemaVersion: 1, source: "assistant-widget" }) as Record<
      string,
      unknown
    >;
    expect(out.schemaVersion).toBe(1);
    expect(out.consoleLog).toBeUndefined();
    expect(out.clientErrors).toBeUndefined();
  });

  it("defaults schemaVersion when missing", () => {
    const out = clampDebugContext({ source: "x" }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(1);
  });

  it("caps the number of console entries", () => {
    const many = Array.from({ length: MAX_CONSOLE_ENTRIES + 25 }, (_, i) => entry(`m${i}`));
    const out = clampDebugContext({ consoleLog: many }) as { consoleLog: unknown[] };
    expect(out.consoleLog.length).toBeLessThanOrEqual(MAX_CONSOLE_ENTRIES);
  });

  it("caps total characters across entries", () => {
    const big = Array.from({ length: 40 }, () => entry("z".repeat(1000)));
    const out = clampDebugContext({ consoleLog: big }) as { consoleLog: { message: string }[] };
    const total = out.consoleLog.reduce((n, e) => n + e.message.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_CONSOLE_TOTAL_CHARS);
  });

  it("drops malformed entries", () => {
    const out = clampDebugContext({
      consoleLog: [entry("ok"), { level: 3, message: "bad-level" }, { level: "log" }, null],
    }) as { consoleLog: { message: string }[] };
    expect(out.consoleLog).toEqual([entry("ok")]);
  });
});

describe("clampConsoleCapture (merge into a server-built context)", () => {
  it("extracts only the console arrays", () => {
    const cap = clampConsoleCapture({
      // fields a server-built debugContext would carry — must NOT be returned here
      schemaVersion: 1,
      source: "server-conversation",
      window: { start: 0, end: 1, total: 1 },
      consoleLog: [entry("a")],
      clientErrors: [entry("b", "error")],
    });
    expect(cap).toEqual({ consoleLog: [entry("a")], clientErrors: [entry("b", "error")] });
  });

  it("returns an empty object when nothing capturable", () => {
    expect(clampConsoleCapture(null)).toEqual({});
    expect(clampConsoleCapture({ source: "x" })).toEqual({});
  });
});
