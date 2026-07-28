import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { devTrustedOrigins } from "@/lib/auth";
import { code } from "./helpers/code";

const AUTH = readFileSync(join(__dirname, "../src/lib/auth.ts"), "utf8");

describe("local login works on ANY port", () => {
  it("trusts localhost on any port in development", () => {
    // Better Auth trusts only baseURL by default, so a worktree dev server on :3007 was
    // refused with "Invalid origin" and the login page just sat on "Signing in…".
    expect(devTrustedOrigins("development")).toContain("http://localhost:*");
  });

  it("trusts 127.0.0.1 too — not every tool resolves localhost the same way", () => {
    expect(devTrustedOrigins("development")).toContain("http://127.0.0.1:*");
  });

  it("covers the test environment", () => {
    expect(devTrustedOrigins("test").length).toBeGreaterThan(0);
  });
});

describe("production is NOT widened", () => {
  it("adds no trusted origin in production", () => {
    // The whole point: the deployed app's origin check stays exactly as strict as before.
    expect(devTrustedOrigins("production")).toEqual([]);
  });

  it("FAILS CLOSED on any value that is not explicitly a dev environment", () => {
    // The first version excluded only "production", so NODE_ENV=staging, an empty string,
    // or a typo silently kept the localhost wildcard. Next inlines NODE_ENV into the server
    // bundle, so that could bake into a deployed artifact.
    // `undefined` is deliberately NOT in this list: passing it explicitly re-triggers the
    // default parameter, which under vitest is NODE_ENV="test". In a real deployment with
    // NODE_ENV unset the default resolves to undefined and this same branch returns [].
    for (const env of ["staging", "prod", "PRODUCTION", "development ", "Test", ""]) {
      expect(devTrustedOrigins(env as never)).toEqual([]);
    }
  });

  it("never trusts a non-loopback host, in any environment", () => {
    for (const env of ["development", "test", "production", "staging"] as unknown as (undefined)[]) {
      for (const origin of devTrustedOrigins(env)) {
        expect(origin).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\*$/);
      }
    }
  });

  it("does not reach for the blunt instrument", () => {
    // disableOriginCheck / disableCSRFCheck would turn CSRF protection off everywhere,
    // including production. Widening the trusted list in dev only is the narrow fix.
    expect(code(AUTH)).not.toContain("disableOriginCheck");
    expect(code(AUTH)).not.toContain("disableCSRFCheck");
    expect(code(AUTH)).not.toContain('"*"');
  });

  it("is wired into the auth config", () => {
    expect(AUTH).toContain("trustedOrigins: devTrustedOrigins()");
  });
});
