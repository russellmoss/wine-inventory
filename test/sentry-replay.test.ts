import { describe, it, expect, vi } from "vitest";
import { buildReplayUrl, captureReplayLink } from "@/lib/observability/sentry-replay";

describe("buildReplayUrl", () => {
  it("builds the expected deep-link", () => {
    expect(buildReplayUrl("bhutan-wine", "abc123")).toBe(
      "https://bhutan-wine.sentry.io/replays/abc123/",
    );
  });

  it("returns undefined when the replayId is missing", () => {
    expect(buildReplayUrl("bhutan-wine", undefined)).toBeUndefined();
    expect(buildReplayUrl("bhutan-wine", "")).toBeUndefined();
  });

  it("returns undefined when the org slug is missing", () => {
    expect(buildReplayUrl(undefined, "abc123")).toBeUndefined();
    expect(buildReplayUrl("", "abc123")).toBeUndefined();
  });
});

describe("captureReplayLink", () => {
  it("flushes and returns the replayId + url when a replay is recording", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const replay = { getReplayId: () => "abc123", flush };
    const out = await captureReplayLink(replay, "bhutan-wine");
    expect(flush).toHaveBeenCalledOnce();
    expect(out).toEqual({ replayId: "abc123", replayUrl: "https://bhutan-wine.sentry.io/replays/abc123/" });
  });

  it("returns {} when no replay is active (no getReplay)", async () => {
    expect(await captureReplayLink(undefined, "bhutan-wine")).toEqual({});
    expect(await captureReplayLink(null, "bhutan-wine")).toEqual({});
  });

  it("returns {} when a replay exists but has no id (unsampled session)", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const out = await captureReplayLink({ getReplayId: () => undefined, flush }, "bhutan-wine");
    expect(out).toEqual({});
    expect(flush).not.toHaveBeenCalled();
  });

  it("still resolves (does NOT throw) when flush() rejects — report must not block", async () => {
    const replay = { getReplayId: () => "abc123", flush: vi.fn().mockRejectedValue(new Error("stalled")) };
    const out = await captureReplayLink(replay, "bhutan-wine");
    expect(out).toEqual({});
  });
});
