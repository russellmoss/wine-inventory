import { describe, it, expect } from "vitest";
import { redactSensitive, scrubSentryEvent, stripOAuthParams } from "@/lib/observability/redact";

// Phase 15 SEC-S4 — the Sentry/log scrubber. Token material must never leave the process.

describe("redactSensitive", () => {
  it("redacts token/secret keys at any depth, keeps the rest", () => {
    const obj = redactSensitive({
      access_token: "secret-a",
      refreshToken: "secret-r",
      refreshTokenCt: "ct",
      dekWrapped: "dek",
      Authorization: "Bearer xyz",
      nested: { client_secret: "s", pkceVerifier: "v", keep: "visible" },
      list: [{ token: "t" }, { fine: 1 }],
    });
    expect(obj.access_token).toBe("[redacted]");
    expect(obj.refreshToken).toBe("[redacted]");
    expect(obj.refreshTokenCt).toBe("[redacted]");
    expect(obj.dekWrapped).toBe("[redacted]");
    expect(obj.Authorization).toBe("[redacted]");
    expect(obj.nested.client_secret).toBe("[redacted]");
    expect(obj.nested.pkceVerifier).toBe("[redacted]");
    expect(obj.nested.keep).toBe("visible");
    expect(obj.list[0].token).toBe("[redacted]");
    expect(obj.list[1].fine).toBe(1);
  });

  it("survives cycles", () => {
    const a: Record<string, unknown> = { token: "x" };
    a.self = a;
    expect(() => redactSensitive(a)).not.toThrow();
    expect(a.token).toBe("[redacted]");
  });
});

describe("stripOAuthParams", () => {
  it("masks code/state/token query params", () => {
    const url = stripOAuthParams("https://app/callback?code=AUTHCODE&state=NONCE&realmId=123");
    expect(url).toContain("code=[redacted]");
    expect(url).toContain("state=[redacted]");
    expect(url).toContain("realmId=123"); // non-secret kept
  });
});

describe("scrubSentryEvent", () => {
  it("scrubs request headers, frame vars, and the URL", () => {
    const event = scrubSentryEvent({
      request: { url: "https://app/callback?code=abc", headers: { Authorization: "Bearer t" } },
      exception: { values: [{ stacktrace: { frames: [{ vars: { refresh_token: "r", ok: "keep" } }] } }] },
    });
    const req = event.request as { url: string; headers: Record<string, string> };
    expect(req.headers.Authorization).toBe("[redacted]");
    expect(req.url).toContain("code=[redacted]");
    const vars = (event.exception as { values: Array<{ stacktrace: { frames: Array<{ vars: Record<string, string> }> } }> }).values[0].stacktrace.frames[0].vars;
    expect(vars.refresh_token).toBe("[redacted]");
    expect(vars.ok).toBe("keep");
  });
});
