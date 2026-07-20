import { describe, it, expect } from "vitest";
import {
  resolveReplayFidelity,
  buildReplayOptions,
  parseReplayFidelity,
  readReplayFidelityFromCookieString,
} from "@/lib/observability/sentry-replay";
import { formatHuntTrail } from "@/lib/observability/sentry-replay";
import { describeElement, createInteractionBuffer } from "@/lib/observability/interaction-buffer";
import { deriveIndicator } from "@/lib/observability/dev-diagnostics";

// Plan 080 Unit 11 — the composed tenancy guarantee.
//
// The individual pieces are unit-tested in their own suites. THIS suite asserts the property that
// actually matters end to end: a session in a REAL customer tenant can never produce high-fidelity
// capture, no matter which developer is driving. If any of these fail, customer data is at risk.

const SANDBOX = "org_demo_winery";
const REAL_TENANTS = ["org_bhutan_wine_co", "org_some_future_customer", ""];

describe("TENANCY GUARANTEE: real customer tenants never get high-fidelity capture", () => {
  for (const tenant of REAL_TENANTS) {
    it(`"${tenant || "(empty)"}" → masked, no network bodies, no element labels`, () => {
      const fidelity = resolveReplayFidelity({
        role: "developer", // the most privileged role
        effectiveTenantId: tenant,
        sandboxTenantId: SANDBOX,
      });
      expect(fidelity).toBe("masked");

      // 1. Sentry never gets a body allowlist — not for this tenant, not for ANY tenant.
      const options = buildReplayOptions();
      expect(options).not.toHaveProperty("networkDetailAllowUrls");
      // 2. Masking is on regardless.
      expect(options.maskAllText).toBe(true);
      expect(options.blockAllMedia).toBe(true);

      // 3. The first-party trail drops element text, keeping only the role.
      const described = describeElement(
        {
          tagName: "BUTTON",
          getAttribute: () => null,
          textContent: "Delete Bhutan Wine Co. 2019 Reserve — $48,000",
        },
        fidelity,
      );
      expect(described.label).toBeUndefined();
      expect(JSON.stringify(described)).not.toContain("48,000");

      // 4. The indicator warns loudly that this is a real tenant.
      const indicator = deriveIndicator({ fidelity, tenantName: tenant || "Unknown" });
      expect(indicator.tone).toBe("danger");
      expect(indicator.label).toContain("real tenant");
      expect(indicator.label).toContain("metadata only");
    });
  }

  it("full fidelity still resolves for the sandbox, but it no longer unlocks body capture", () => {
    const fidelity = resolveReplayFidelity({
      role: "developer",
      effectiveTenantId: SANDBOX,
      sandboxTenantId: SANDBOX,
    });
    expect(fidelity).toBe("full");
    // Fidelity now only governs first-party trail LABELS. Sentry body capture is gone entirely,
    // so the highest fidelity we can reach still sends no request/response bodies.
    expect(buildReplayOptions()).not.toHaveProperty("networkDetailAllowUrls");
  });

  it("a tampered cookie cannot be anything other than full|masked", () => {
    // The cookie is client-writable by design; the point is that it can only ever select between
    // two known configs — and since body capture was removed, neither config can leak a payload.
    // (Sentry's server-side scrubbing is best-effort PII pattern matching and was never a
    // sufficient guarantee for this domain's financial data, so the hole was closed instead.)
    for (const tampered of ["full; admin=1", "FULL", "'full'", "1", "yes", "<script>"]) {
      expect(parseReplayFidelity(tampered)).toBe("masked");
    }
    expect(readReplayFidelityFromCookieString("cbh_replay_fidelity=full")).toBe("full");
  });

  it("formatHuntTrail renders actions + API calls in time order, or null when absent", () => {
    const text = formatHuntTrail({
      huntId: "hunt_abc",
      interactionTrail: [
        { type: "route", ts: 1, label: "/inventory" },
        { type: "click", ts: 3, label: "Transfer", detail: "button" },
      ],
      networkTrail: [{ method: "POST", path: "/api/stock/move", ts: 4, status: 500, durationMs: 12 }],
    });
    expect(text).toBe(
      ["hunt: hunt_abc", "route — /inventory", "click — Transfer", "POST /api/stock/move → 500 (12ms)"].join("\n"),
    );
    expect(formatHuntTrail({ consoleLog: [] })).toBeNull();
    expect(formatHuntTrail(null)).toBeNull();
  });

  it("the trail never carries a body/value field in any fidelity", () => {
    for (const fidelity of ["full", "masked"] as const) {
      const buf = createInteractionBuffer({ now: () => 1 });
      buf.recordNetwork({ method: "POST", path: "/api/stock/move", status: 500, durationMs: 10 });
      buf.recordInteraction("click", describeElement({ tagName: "BUTTON", getAttribute: () => null, textContent: "Go" }, fidelity));
      const serialized = JSON.stringify(buf.drain());
      expect(serialized).not.toMatch(/"body"|"requestBody"|"responseBody"|"value"|"password"/i);
    }
  });
});
