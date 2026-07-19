import { describe, it, expect } from "vitest";
import {
  clampDebugContext,
  DEBUG_CONTEXT_SCHEMA_VERSION,
  MAX_NARRATIVE_CHARS,
  MAX_TRAIL_ENTRIES,
  MAX_REPLAY_URL_CHARS,
} from "@/lib/feedback/debug-context";

describe("clampDebugContext — v3 Break Mode fields", () => {
  it("keeps the new replay + narrative + hunt-trail fields when valid", () => {
    const out = clampDebugContext({
      schemaVersion: 3,
      source: "help-page",
      replayId: "abc123",
      replayUrl: "https://bhutan-wine.sentry.io/replays/abc123/",
      huntId: "hunt_9",
      narrative: { doing: "moving stock", expected: "it moves", actual: "error" },
      interactionTrail: [{ type: "click", ts: 1, label: "Transfer" }],
      networkTrail: [{ method: "POST", path: "/api/stock/move", ts: 2, status: 500, durationMs: 12 }],
    }) as Record<string, unknown>;

    expect(out.replayId).toBe("abc123");
    expect(out.replayUrl).toContain("/replays/abc123/");
    expect(out.huntId).toBe("hunt_9");
    expect(out.narrative).toEqual({ doing: "moving stock", expected: "it moves", actual: "error" });
    expect(out.interactionTrail).toHaveLength(1);
    expect((out.networkTrail as unknown[])[0]).toMatchObject({ method: "POST", status: 500 });
  });

  it("strips unknown top-level fields", () => {
    const out = clampDebugContext({ schemaVersion: 3, evil: "x", cookies: "y" }) as Record<string, unknown>;
    expect(out.evil).toBeUndefined();
    expect(out.cookies).toBeUndefined();
  });

  it("bounds narrative field length", () => {
    const out = clampDebugContext({
      schemaVersion: 3,
      narrative: { doing: "z".repeat(MAX_NARRATIVE_CHARS + 500) },
    }) as Record<string, unknown>;
    expect((out.narrative as { doing: string }).doing.length).toBe(MAX_NARRATIVE_CHARS);
  });

  it("bounds the replay URL length", () => {
    const out = clampDebugContext({
      schemaVersion: 3,
      replayUrl: "https://x/" + "a".repeat(MAX_REPLAY_URL_CHARS + 100),
    }) as Record<string, unknown>;
    expect((out.replayUrl as string).length).toBe(MAX_REPLAY_URL_CHARS);
  });

  it("truncates an oversized interaction trail to the entry cap", () => {
    const trail = Array.from({ length: MAX_TRAIL_ENTRIES + 50 }, (_, i) => ({ type: "click", ts: i }));
    const out = clampDebugContext({ schemaVersion: 3, interactionTrail: trail }) as Record<string, unknown>;
    expect((out.interactionTrail as unknown[]).length).toBe(MAX_TRAIL_ENTRIES);
  });

  it("drops malformed trail entries (missing required fields)", () => {
    const out = clampDebugContext({
      schemaVersion: 3,
      networkTrail: [{ method: "GET" }, { path: "/api/x" }, { method: "GET", path: "/api/ok", ts: 1 }],
    }) as Record<string, unknown>;
    expect((out.networkTrail as unknown[]).length).toBe(1);
  });

  it("tolerates a legacy v2 blob (console arrays only, no v3 fields)", () => {
    const out = clampDebugContext({
      schemaVersion: 2,
      source: "help-page",
      consoleLog: [{ level: "log", ts: 1, message: "hi" }],
    }) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(2);
    expect(out.consoleLog).toHaveLength(1);
    expect(out.replayId).toBeUndefined();
    expect(out.narrative).toBeUndefined();
  });

  it("returns null for non-object input", () => {
    expect(clampDebugContext(null)).toBeNull();
    expect(clampDebugContext("nope")).toBeNull();
    expect(clampDebugContext([1, 2])).toBeNull();
  });

  it("current schema version is 3", () => {
    expect(DEBUG_CONTEXT_SCHEMA_VERSION).toBe(3);
  });
});
