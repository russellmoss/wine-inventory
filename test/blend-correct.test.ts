import { describe, it, expect } from "vitest";
import { identifyChildLot, planBlendCorrection } from "@/lib/blend/blend-correct";
import { balanceKey, type LedgerLine, type VesselLotBalance } from "@/lib/ledger/math";

// A blend of A (600 from T1) + B (300 from T2) into a new CHILD in T4 (900 L, no loss).
const blendLines: LedgerLine[] = [
  { lotId: "A", vesselId: "T1", deltaL: -600 },
  { lotId: "B", vesselId: "T2", deltaL: -300 },
  { lotId: "CHILD", vesselId: "T4", deltaL: 900 },
];

// State right after the blend: sources drained, child sits in T4.
const afterBlend: VesselLotBalance[] = [{ vesselId: "T4", lotId: "CHILD", volumeL: 900 }];

describe("identifyChildLot", () => {
  it("finds the unique positive in-vessel line", () => {
    expect(identifyChildLot(blendLines)).toEqual({ childLotId: "CHILD", destVesselId: "T4" });
  });
  it("throws when there is no child line", () => {
    expect(() => identifyChildLot([{ lotId: "A", vesselId: "T1", deltaL: -10 }])).toThrow();
  });
});

describe("planBlendCorrection", () => {
  it("undoes a fresh blend — returns each parent's volume to its source vessel", () => {
    const plan = planBlendCorrection(blendLines, afterBlend, new Set());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.childLotId).toBe("CHILD");
    // sources get their volume back
    const backToT1 = plan.returns.find((r) => r.vesselId === "T1" && r.lotId === "A");
    const backToT2 = plan.returns.find((r) => r.vesselId === "T2" && r.lotId === "B");
    expect(backToT1?.volumeL).toBe(600);
    expect(backToT2?.volumeL).toBe(300);
    // child is removed from the destination (inverse negative line)
    const childOut = plan.lines.find((l) => l.vesselId === "T4" && l.lotId === "CHILD");
    expect(childOut?.deltaL).toBe(-900);
  });

  it("a blend with ONLY a tasting note/measurement still undoes (off-ledger → no touched keys)", () => {
    // Tasting notes / analysis panels never create ledger lines, so touchedKeys stays empty.
    const plan = planBlendCorrection(blendLines, afterBlend, new Set());
    expect(plan.ok).toBe(true);
  });

  it("refuses when the child was racked/bottled since (downstream activity touched its key)", () => {
    const touched = new Set([balanceKey("T4", "CHILD")]);
    const plan = planBlendCorrection(blendLines, afterBlend, touched);
    expect(plan).toEqual({ ok: false, reason: "downstream-activity" });
  });

  it("refuses when another lot has entered the destination (locational change)", () => {
    const withForeign: VesselLotBalance[] = [
      { vesselId: "T4", lotId: "CHILD", volumeL: 900 },
      { vesselId: "T4", lotId: "FOREIGN", volumeL: 50 },
    ];
    const plan = planBlendCorrection(blendLines, withForeign, new Set());
    expect(plan).toEqual({ ok: false, reason: "co-resident" });
  });

  it("refuses on a shortfall (the destination no longer holds enough of the child)", () => {
    const drained: VesselLotBalance[] = [{ vesselId: "T4", lotId: "CHILD", volumeL: 100 }];
    const plan = planBlendCorrection(blendLines, drained, new Set());
    expect(plan).toEqual({ ok: false, reason: "shortfall" });
  });
});
