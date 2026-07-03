import { describe, it, expect, beforeAll } from "vitest";

// Phase 16 Unit 3 — the pure, security-critical connection pieces (DB-free). The full install flow
// (nonce single-use, P2002 one-install guard, confirm gating) runs against the real Demo Winery DB in
// the Unit-11 verify:commerce7 harness; here we lock down slug validation + the HMAC webhook-path
// routing that makes a session-less webhook both routable and unguessable.

beforeAll(() => {
  process.env.COMMERCE7_WEBHOOK_SECRET = "test-inbound-webhook-secret";
});

describe("assertValidSlug", () => {
  it("accepts lowercase slugs, rejects junk", async () => {
    const { assertValidSlug } = await import("@/lib/commerce/connection");
    expect(assertValidSlug("demo-winery")).toBe("demo-winery");
    expect(assertValidSlug("  Demo-Winery  ")).toBe("demo-winery"); // trims + lowercases
    expect(() => assertValidSlug("")).toThrow();
    expect(() => assertValidSlug("a")).toThrow(); // too short
    expect(() => assertValidSlug("bad slug!")).toThrow(); // space + punctuation
    expect(() => assertValidSlug("-leading")).toThrow();
    expect(() => assertValidSlug("../etc/passwd")).toThrow();
  });
});

describe("webhook path HMAC routing", () => {
  it("signs our tenant id and verifies it constant-time; rejects a tampered sig/tenant", async () => {
    const { webhookPathSig, verifyWebhookPath, fullWebhookUrl } = await import("@/lib/commerce/commerce7/config");
    const sig = webhookPathSig("org_demo_winery");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyWebhookPath("org_demo_winery", sig)).toBe(true);
    // A different tenant id → different sig → the same sig doesn't verify (can't reuse another's URL).
    expect(verifyWebhookPath("org_other", sig)).toBe(false);
    // A tampered sig fails.
    expect(verifyWebhookPath("org_demo_winery", sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0"))).toBe(false);
    // A truncated sig fails (length guard before timingSafeEqual).
    expect(verifyWebhookPath("org_demo_winery", "deadbeef")).toBe(false);
  });

  it("fullWebhookUrl embeds the tenant id + its sig under the webhook path", async () => {
    process.env.COMMERCE7_WEBHOOK_BASE_URL = "https://app.example.com";
    const { fullWebhookUrl, webhookPathSig } = await import("@/lib/commerce/commerce7/config");
    const url = fullWebhookUrl("org_demo_winery");
    expect(url).toBe(`https://app.example.com/api/commerce7/webhook/org_demo_winery/${webhookPathSig("org_demo_winery")}`);
  });
});
