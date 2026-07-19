import { describe, it, expect } from "vitest";
import { buildReplayUrl } from "@/lib/observability/sentry-replay";

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
