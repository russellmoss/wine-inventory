import { describe, it, expect, vi } from "vitest";
import {
  buildReplayUrl,
  captureReplayLink,
  safeSentryReplayUrl,
  resolveReplayFidelity,
  parseReplayFidelity,
  readReplayFidelityFromCookieString,
  buildReplayOptions,
  REPLAY_FIDELITY_COOKIE,
} from "@/lib/observability/sentry-replay";

const SANDBOX = "org_demo_winery";
const REAL_TENANT = "org_bhutan_wine_co";

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

describe("safeSentryReplayUrl", () => {
  it("returns the url for a valid https *.sentry.io link in debugContext", () => {
    const url = "https://bhutan-wine.sentry.io/replays/abc123/";
    expect(safeSentryReplayUrl({ replayUrl: url })).toBe(url);
  });

  it("rejects non-sentry hosts", () => {
    expect(safeSentryReplayUrl({ replayUrl: "https://evil.example.com/replays/x/" })).toBeNull();
    expect(safeSentryReplayUrl({ replayUrl: "https://sentry.io.evil.com/x" })).toBeNull();
  });

  it("rejects non-https and credential-embedded urls", () => {
    expect(safeSentryReplayUrl({ replayUrl: "http://bhutan-wine.sentry.io/replays/x/" })).toBeNull();
    expect(safeSentryReplayUrl({ replayUrl: "https://user:pw@bhutan-wine.sentry.io/x" })).toBeNull();
  });

  it("returns null when replayUrl is absent or debugContext is not an object", () => {
    expect(safeSentryReplayUrl({ consoleLog: [] })).toBeNull();
    expect(safeSentryReplayUrl(null)).toBeNull();
    expect(safeSentryReplayUrl("nope")).toBeNull();
    expect(safeSentryReplayUrl({ replayUrl: "not a url" })).toBeNull();
  });
});

describe("resolveReplayFidelity — TENANCY GUARD (Plan 080 Unit 6/11)", () => {
  it("grants full fidelity ONLY to a developer in the sandbox tenant", () => {
    expect(
      resolveReplayFidelity({ role: "developer", effectiveTenantId: SANDBOX, sandboxTenantId: SANDBOX }),
    ).toBe("full");
  });

  it("NEVER grants full fidelity in a real customer tenant, even for a developer", () => {
    expect(
      resolveReplayFidelity({ role: "developer", effectiveTenantId: REAL_TENANT, sandboxTenantId: SANDBOX }),
    ).toBe("masked");
  });

  it("never grants full fidelity to non-developer roles, even in the sandbox", () => {
    for (const role of ["user", "admin", null, undefined, ""]) {
      expect(
        resolveReplayFidelity({ role, effectiveTenantId: SANDBOX, sandboxTenantId: SANDBOX }),
      ).toBe("masked");
    }
  });

  it("fails closed when the tenant is unknown", () => {
    expect(
      resolveReplayFidelity({ role: "developer", effectiveTenantId: null, sandboxTenantId: SANDBOX }),
    ).toBe("masked");
  });
});

describe("parseReplayFidelity / readReplayFidelityFromCookieString", () => {
  it("only the exact string 'full' yields full; everything else fails closed", () => {
    expect(parseReplayFidelity("full")).toBe("full");
    for (const raw of ["masked", "FULL", "true", "1", "", null, undefined, "full "]) {
      expect(parseReplayFidelity(raw)).toBe("masked");
    }
  });

  it("reads the fidelity cookie out of a document.cookie string", () => {
    expect(readReplayFidelityFromCookieString(`a=1; ${REPLAY_FIDELITY_COOKIE}=full; b=2`)).toBe("full");
    expect(readReplayFidelityFromCookieString(`a=1; ${REPLAY_FIDELITY_COOKIE}=masked`)).toBe("masked");
  });

  it("fails closed when the cookie is absent or the string is empty", () => {
    expect(readReplayFidelityFromCookieString("a=1; b=2")).toBe("masked");
    expect(readReplayFidelityFromCookieString("")).toBe("masked");
    expect(readReplayFidelityFromCookieString(undefined)).toBe("masked");
  });
});

describe("buildReplayOptions — masking always on, bodies NEVER captured", () => {
  it("masking and media blocking are always on", () => {
    const opts = buildReplayOptions();
    expect(opts.maskAllText).toBe(true);
    expect(opts.blockAllMedia).toBe(true);
  });

  it("never emits a network body allowlist — there is no configuration that enables bodies", () => {
    // The options are fidelity-independent by construction, so this cannot regress into a branch.
    expect(buildReplayOptions()).toEqual({ maskAllText: true, blockAllMedia: true });
    expect(Object.keys(buildReplayOptions())).not.toContain("networkDetailAllowUrls");
    expect(JSON.stringify(buildReplayOptions())).not.toMatch(/networkDetail|allowUrls/i);
  });

  it("the options are identical no matter what fidelity resolves to", () => {
    // Body capture used to be the ONLY difference between the fidelities. It is gone, so a
    // tampered fidelity value can no longer unlock anything on the Sentry side.
    const sandbox = resolveReplayFidelity({ role: "developer", effectiveTenantId: SANDBOX, sandboxTenantId: SANDBOX });
    const real = resolveReplayFidelity({ role: "developer", effectiveTenantId: REAL_TENANT, sandboxTenantId: SANDBOX });
    expect(sandbox).toBe("full");
    expect(real).toBe("masked");
    expect(buildReplayOptions()).toEqual(buildReplayOptions());
  });
});
