import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { truncateWineName, CODE_MIN_CHARS } from "@/components/ui/VesselIdentityBlock";
import { code } from "./helpers/code";

const SRC = readFileSync(join(__dirname, "../src/components/ui/VesselIdentityBlock.tsx"), "utf8");

describe("truncateWineName", () => {
  it("leaves a name that fits alone", () => {
    expect(truncateWineName("Estate Pinot", 22)).toBe("Estate Pinot");
  });

  it("shortens with an ellipsis when it does not fit", () => {
    expect(truncateWineName("2025 Estate Reserve Pinot Noir", 12)).toBe("2025 Estate…");
  });

  it("does not leave a dangling space before the ellipsis", () => {
    expect(truncateWineName("Estate Reserve", 8)).toBe("Estate…");
  });

  it("degrades sanely at tiny budgets rather than throwing", () => {
    expect(truncateWineName("Syrah", 1)).toBe("…");
    expect(truncateWineName("Syrah", 0)).toBe("");
    expect(truncateWineName("Syrah", -3)).toBe("");
  });

  it("the budget is the hard ceiling", () => {
    for (const budget of [2, 5, 9, 17, 40]) {
      expect(truncateWineName("A very long estate wine name indeed", budget).length).toBeLessThanOrEqual(budget);
    }
  });
});

describe("AC-S22 — a tile always shows its lot code", () => {
  // Static source assertions, because vitest runs environment: "node" here and the
  // component cannot be rendered. These pin the contract that the criterion depends on.

  it("renders lotCode, not only code", () => {
    expect(SRC).toContain("{lotCode ?? \"empty\"}");
  });

  it("takes lotCode as a required prop, so a caller cannot forget it", () => {
    // `lotCode: string | null` — nullable for a genuinely empty vessel, but never optional.
    expect(SRC).toContain("lotCode: string | null;");
    expect(code(SRC)).not.toContain("lotCode?:");
  });

  it("renders the lot line for an empty vessel too", () => {
    // A missing line reads as a bug; "empty" is itself the answer.
    expect(SRC).toMatch(/lotCode \?\? "empty"/);
  });

  it("clips the codes with a tooltip rather than overflowing the tile", () => {
    // doc 04 §164: a longer lot code truncates WITH a tooltip. Letting it run unclipped
    // pushed it into the neighbouring tile on the board.
    expect(SRC).toContain("title={code}");
    expect(SRC).toContain("title={lotCode ?? undefined}");
    expect(CODE_MIN_CHARS).toBeGreaterThanOrEqual(8);
  });

  it("keeps the full wine name reachable when the visible text gives way", () => {
    expect(SRC).toContain("aria-label={truncated");
    expect(SRC).toContain("title={truncated");
  });
});

describe("OD-P6-4 — location is omitted, deliberately", () => {
  it("does not invent a location field", () => {
    // Guard the PROP SURFACE, not a bare substring — "location" also matches "allocation".
    expect(code(SRC)).not.toMatch(/location\??:/);
  });

  it("shows the group instead", () => {
    expect(SRC).toContain("groupName");
  });
});
