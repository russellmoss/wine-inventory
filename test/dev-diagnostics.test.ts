import { describe, it, expect } from "vitest";
import {
  deriveIndicator,
  toneColorVar,
  newDiagnosticsSessionId,
  getActiveHuntId,
  setActiveHuntId,
} from "@/lib/observability/dev-diagnostics";

describe("deriveIndicator — quiet in the sandbox, loud for a real tenant", () => {
  it("a REAL customer tenant is loud danger and says metadata only", () => {
    const out = deriveIndicator({ fidelity: "masked", tenantName: "Bhutan Wine Co." });
    expect(out.tone).toBe("danger");
    expect(out.label).toContain("Bhutan Wine Co.");
    expect(out.label).toContain("real tenant");
    expect(out.label).toContain("metadata only");
  });

  it("the sandbox stays quiet — a permanent alarm would become wallpaper", () => {
    const out = deriveIndicator({ fidelity: "full", tenantName: "Demo Winery" });
    expect(out.tone).toBe("muted");
    expect(out.label).toBe("Diagnostics on · Demo Winery");
    // the calm case must not imply a customer's data is being recorded
    expect(out.label).not.toContain("real tenant");
  });

  it("always names the tenant, so a developer can never be unsure whose data this is", () => {
    for (const fidelity of ["full", "masked"] as const) {
      expect(deriveIndicator({ fidelity, tenantName: "Acme Cellars" }).label).toContain("Acme Cellars");
    }
  });

  it("never uses the brand accent for a recording state", () => {
    for (const fidelity of ["full", "masked"] as const) {
      const tone = deriveIndicator({ fidelity, tenantName: "X" }).tone;
      expect(toneColorVar(tone)).not.toContain("wine-primary");
      expect(toneColorVar(tone)).not.toContain("--accent");
    }
  });
});

describe("toneColorVar — tokens only", () => {
  it("maps each tone to a design token", () => {
    expect(toneColorVar("danger")).toBe("var(--danger)");
    expect(toneColorVar("muted")).toBe("var(--text-muted)");
  });
});

describe("newDiagnosticsSessionId", () => {
  it("is deterministic given an injected rand", () => {
    expect(newDiagnosticsSessionId(1_000_000, () => 0.5)).toBe(
      newDiagnosticsSessionId(1_000_000, () => 0.5),
    );
  });

  it("differs when time or randomness differs", () => {
    expect(newDiagnosticsSessionId(1, () => 0.1)).not.toBe(newDiagnosticsSessionId(2, () => 0.1));
    expect(newDiagnosticsSessionId(1, () => 0.1)).not.toBe(newDiagnosticsSessionId(1, () => 0.9));
  });
});

describe("active session id (read by the report form at submit)", () => {
  it("round-trips and clears", () => {
    setActiveHuntId("hunt_abc");
    expect(getActiveHuntId()).toBe("hunt_abc");
    setActiveHuntId(null);
    expect(getActiveHuntId()).toBeNull();
  });
});
