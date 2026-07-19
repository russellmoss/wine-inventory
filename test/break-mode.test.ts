import { describe, it, expect } from "vitest";
import {
  deriveIndicator,
  formatCountdown,
  huntMsRemaining,
  isHuntExpired,
  toneColorVar,
  newHuntId,
  HUNT_TIMEOUT_MS,
} from "@/lib/observability/break-mode";

describe("deriveIndicator — encodes RISK, not just state", () => {
  it("a REAL customer tenant is loud danger red and says metadata only", () => {
    const out = deriveIndicator({ fidelity: "masked", tenantName: "Bhutan Wine Co.", replayAvailable: true });
    expect(out.tone).toBe("danger");
    expect(out.pulse).toBe(true);
    expect(out.label).toBe("REC · Bhutan Wine Co. · metadata only");
  });

  it("the sandbox is calmer amber and says full capture", () => {
    const out = deriveIndicator({ fidelity: "full", tenantName: "Demo Winery", replayAvailable: true });
    expect(out.tone).toBe("warning");
    expect(out.label).toBe("REC · Demo Winery · full capture");
  });

  it("degrades honestly when the replay could not start — no false red dot", () => {
    const out = deriveIndicator({ fidelity: "full", tenantName: "Demo Winery", replayAvailable: false });
    expect(out.tone).toBe("muted");
    expect(out.pulse).toBe(false);
    expect(out.label).toContain("quota exhausted");
    expect(out.label).toContain("trail still capturing");
  });

  it("appends the countdown when provided", () => {
    const out = deriveIndicator({
      fidelity: "masked",
      tenantName: "Bhutan Wine Co.",
      replayAvailable: true,
      msRemaining: 90_000,
    });
    expect(out.label).toContain("· 1:30 left");
  });

  it("never uses the brand accent for a recording state", () => {
    for (const fidelity of ["full", "masked"] as const) {
      const tone = deriveIndicator({ fidelity, tenantName: "X", replayAvailable: true }).tone;
      expect(toneColorVar(tone)).not.toContain("wine-primary");
      expect(toneColorVar(tone)).not.toContain("--accent");
    }
  });
});

describe("toneColorVar — tokens only", () => {
  it("maps each tone to a design token", () => {
    expect(toneColorVar("danger")).toBe("var(--danger)");
    expect(toneColorVar("warning")).toBe("var(--warning)");
    expect(toneColorVar("muted")).toBe("var(--text-muted)");
  });
});

describe("formatCountdown", () => {
  it("formats m:ss and pads seconds", () => {
    expect(formatCountdown(90_000)).toBe("1:30");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(600_000)).toBe("10:00");
  });

  it("clamps at zero", () => {
    expect(formatCountdown(-5_000)).toBe("0:00");
    expect(formatCountdown(0)).toBe("0:00");
  });
});

describe("auto-off timeout — a forgotten toggle can't burn quota", () => {
  const started = 1_000_000;

  it("reports remaining time and expiry", () => {
    expect(huntMsRemaining(started, started)).toBe(HUNT_TIMEOUT_MS);
    expect(huntMsRemaining(started, started + HUNT_TIMEOUT_MS / 2)).toBe(HUNT_TIMEOUT_MS / 2);
    expect(isHuntExpired(started, started + HUNT_TIMEOUT_MS / 2)).toBe(false);
  });

  it("expires exactly at the timeout and stays expired after", () => {
    expect(isHuntExpired(started, started + HUNT_TIMEOUT_MS)).toBe(true);
    expect(isHuntExpired(started, started + HUNT_TIMEOUT_MS + 60_000)).toBe(true);
    expect(huntMsRemaining(started, started + HUNT_TIMEOUT_MS + 60_000)).toBe(0);
  });

  it("defaults to a 30 minute window", () => {
    expect(HUNT_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });
});

describe("newHuntId", () => {
  it("is deterministic given an injected rand", () => {
    expect(newHuntId(1_000_000, () => 0.5)).toBe(newHuntId(1_000_000, () => 0.5));
    expect(newHuntId(1_000_000, () => 0.5)).toMatch(/^hunt_/);
  });

  it("differs when time or randomness differs", () => {
    expect(newHuntId(1, () => 0.1)).not.toBe(newHuntId(2, () => 0.1));
    expect(newHuntId(1, () => 0.1)).not.toBe(newHuntId(1, () => 0.9));
  });
});
