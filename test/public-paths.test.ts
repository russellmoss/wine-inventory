import { describe, it, expect } from "vitest";
import { isPublicPath } from "@/lib/auth/public-paths";

// The proxy's allow-list. The regression this locks: `/monitoring` (Sentry's tunnelRoute) was NOT
// public, so every client error envelope from a session-less page was 307'd to /login and the
// re-POST died as a 405 — the app silently reported zero client-side errors from the login page.

describe("isPublicPath", () => {
  it("lets Sentry's ingest tunnel through without a session", () => {
    expect(isPublicPath("/monitoring")).toBe(true);
  });

  it("lets the auth surfaces and static/public routes through", () => {
    for (const p of [
      "/login",
      "/forgot-password",
      "/reset-password",
      "/reset-password/abc",
      "/api/auth/sign-in/social",
      "/api/auth/callback/google",
      "/styleguide",
      "/manifest.webmanifest",
      "/vendor/openwakeword/model.onnx",
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  it("still gates the app surfaces", () => {
    for (const p of ["/", "/inventory", "/lots", "/work-orders/123/execute", "/api/assistant"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("matches on path SEGMENTS, not on a bare string prefix", () => {
    // a route that merely starts with the same letters must NOT inherit public access
    for (const p of ["/monitoring-dashboard", "/logins-report", "/vendors", "/styleguides"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});
