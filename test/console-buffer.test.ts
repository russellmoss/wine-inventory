import { describe, it, expect } from "vitest";
import {
  createConsoleBuffer,
  redactString,
  clampMessage,
  formatArgs,
  drainConsoleBuffer,
  installConsoleCapture,
  MAX_ENTRIES,
  MAX_ENTRY_CHARS,
  MAX_TOTAL_CHARS,
} from "@/lib/observability/console-buffer";

describe("redactString", () => {
  it("masks emails", () => {
    expect(redactString("user demo@demowinery.test logged in")).toBe(
      "user [redacted-email] logged in",
    );
  });

  it("masks a JWT-shaped token", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcDEF-_ghiJKL";
    expect(redactString(`token=${jwt}`)).toContain("[redacted");
    expect(redactString(`Authorization: Bearer ${jwt}`)).not.toContain(jwt);
  });

  it("masks secret-ish key=value pairs but leaves plain text", () => {
    expect(redactString("password=hunter2 ok")).toBe("password=[redacted] ok");
    expect(redactString("the tank is empty")).toBe("the tank is empty");
  });

  it("masks sk-style api keys", () => {
    expect(redactString("key sk_live_abcdefghijkl123")).toBe("key [redacted-key]");
  });
});

describe("clampMessage", () => {
  it("leaves short messages untouched", () => {
    expect(clampMessage("short")).toBe("short");
  });

  it("truncates over the cap and marks the cut", () => {
    const long = "x".repeat(MAX_ENTRY_CHARS + 100);
    const out = clampMessage(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("[+100 chars]");
  });
});

describe("formatArgs", () => {
  it("joins mixed args and stringifies objects", () => {
    expect(formatArgs(["count", 3, { ok: true }])).toBe('count 3 {"ok":true}');
  });

  it("renders an Error with its stack head", () => {
    const out = formatArgs([new Error("boom")]);
    expect(out).toContain("boom");
  });

  it("survives circular objects", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => formatArgs([a])).not.toThrow();
  });

  it("redacts within captured args", () => {
    expect(formatArgs(["failed for", "admin@x.io"])).toContain("[redacted-email]");
  });
});

describe("createConsoleBuffer", () => {
  it("drops the oldest entries past the ring size", () => {
    const buf = createConsoleBuffer({ maxEntries: 3, now: () => 1 });
    for (let i = 0; i < 5; i++) buf.record("log", [`m${i}`]);
    expect(buf.size()).toBe(3);
    const { consoleLog } = buf.drain();
    expect(consoleLog.map((e) => e.message)).toEqual(["m2", "m3", "m4"]);
  });

  it("separates errors from logs on drain", () => {
    const buf = createConsoleBuffer({ now: () => 1 });
    buf.record("log", ["hello"]);
    buf.record("warn", ["careful"]);
    buf.record("error", ["broke"]);
    buf.record("window.error", ["uncaught"]);
    buf.record("unhandledrejection", ["rejected"]);
    const { consoleLog, clientErrors } = buf.drain();
    expect(consoleLog.map((e) => e.message)).toEqual(["hello", "careful"]);
    expect(clientErrors.map((e) => e.message)).toEqual(["broke", "uncaught", "rejected"]);
  });

  it("drain is non-destructive", () => {
    const buf = createConsoleBuffer({ now: () => 1 });
    buf.record("log", ["a"]);
    buf.drain();
    expect(buf.size()).toBe(1);
    expect(buf.drain().consoleLog).toHaveLength(1);
  });

  it("clear empties the ring", () => {
    const buf = createConsoleBuffer();
    buf.record("log", ["a"]);
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(buf.drain().consoleLog).toHaveLength(0);
  });

  it("enforces the total-char budget at drain, keeping the most recent", () => {
    const buf = createConsoleBuffer({ maxEntries: 100, now: () => 1 });
    // Each entry ~1000 chars; 30 of them (~30k) exceeds MAX_TOTAL_CHARS (20k).
    for (let i = 0; i < 30; i++) buf.record("log", ["y".repeat(1000)]);
    const { consoleLog } = buf.drain();
    const total = consoleLog.reduce((n, e) => n + e.message.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_CHARS);
    expect(consoleLog.length).toBeLessThan(30);
    expect(consoleLog.length).toBeGreaterThan(0);
  });

  it("ignores empty messages", () => {
    const buf = createConsoleBuffer();
    buf.record("log", []);
    expect(buf.size()).toBe(0);
  });
});

describe("installConsoleCapture (no-op outside the browser)", () => {
  it("does not throw and drains empty when window is undefined", () => {
    // Runs in the node test env (no window) — the guard should no-op.
    expect(() => installConsoleCapture()).not.toThrow();
    expect(() => installConsoleCapture()).not.toThrow(); // idempotent
    expect(drainConsoleBuffer()).toEqual({ consoleLog: [], clientErrors: [] });
  });
});

describe("bounds are sane", () => {
  it("exposes conservative caps", () => {
    expect(MAX_ENTRIES).toBeLessThanOrEqual(100);
    expect(MAX_ENTRY_CHARS).toBeLessThanOrEqual(4000);
    expect(MAX_TOTAL_CHARS).toBeLessThanOrEqual(50_000);
  });
});
