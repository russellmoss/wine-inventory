import { describe, it, expect } from "vitest";
import { applyCbmaCredit } from "@/lib/compliance/cbma";

describe("applyCbmaCredit — CBMA credit ladder (plan-026 Unit 3)", () => {
  it("start 0: all gallons below 30k get the $1.00 tier-1 rate", () => {
    const r = applyCbmaCredit({ ytdRemovedGal: 0, periodRemovedByClass: { A_LE16: 20_000 } });
    expect(r.totalCredit).toBeCloseTo(20_000, 2); // 20,000 × $1.00
    expect(r.newYtdRemovedGal).toBe(20_000);
    expect(r.over750k).toBe(false);
    expect(r.lines.every((l) => l.tier === 1)).toBe(true);
  });

  it("straddles the 30k boundary → splits $1.00 / $0.90 (S5)", () => {
    // start 20k, remove 20k → 10k in tier 1 ($1.00) + 10k in tier 2 ($0.90) = 10,000 + 9,000
    const r = applyCbmaCredit({ ytdRemovedGal: 20_000, periodRemovedByClass: { A_LE16: 20_000 } });
    expect(r.totalCredit).toBeCloseTo(19_000, 2);
    expect(r.newYtdRemovedGal).toBe(40_000);
  });

  it("straddles the 130k boundary → splits $0.90 / $0.535", () => {
    // start 120k, remove 20k → 10k tier 2 ($0.90) + 10k tier 3 ($0.535) = 9,000 + 5,350
    const r = applyCbmaCredit({ ytdRemovedGal: 120_000, periodRemovedByClass: { A_LE16: 20_000 } });
    expect(r.totalCredit).toBeCloseTo(14_350, 2);
  });

  it("at the 750k cap → no credit beyond, over750k flagged", () => {
    // start 745k, remove 10k → 5k in tier 3 ($0.535) = 2,675; the other 5k is beyond the cap (0)
    const r = applyCbmaCredit({ ytdRemovedGal: 745_000, periodRemovedByClass: { A_LE16: 10_000 } });
    expect(r.totalCredit).toBeCloseTo(2_675, 2);
    expect(r.creditableGal).toBeCloseTo(5_000, 2);
    expect(r.newYtdRemovedGal).toBe(755_000);
    expect(r.over750k).toBe(true);
  });

  it("already past 750k → zero credit", () => {
    const r = applyCbmaCredit({ ytdRemovedGal: 800_000, periodRemovedByClass: { A_LE16: 5_000 } });
    expect(r.totalCredit).toBe(0);
    expect(r.lines).toHaveLength(0);
    expect(r.over750k).toBe(true);
  });

  it("hard cider uses the cider rate ladder (6.2¢ tier 1)", () => {
    const r = applyCbmaCredit({ ytdRemovedGal: 0, periodRemovedByClass: { F_HARD_CIDER: 30_000 } });
    expect(r.totalCredit).toBeCloseTo(1_860, 2); // 30,000 × $0.062
  });

  it("UNIFIED wine+cider ladder: they share the SAME tiers, each at its own rate (S1)", () => {
    // start 0, 20k class a (wine) + 20k class f (cider), period = 40k.
    //   tier 1 overlap [0,30k) = 30k, split 50/50 → 15k wine × $1.00 + 15k cider × $0.062 = 15,000 + 930
    //   tier 2 overlap [30k,40k) = 10k, split 50/50 →  5k wine × $0.90 +  5k cider × $0.056 =  4,500 + 280
    const r = applyCbmaCredit({ ytdRemovedGal: 0, periodRemovedByClass: { A_LE16: 20_000, F_HARD_CIDER: 20_000 } });
    expect(r.totalCredit).toBeCloseTo(15_000 + 930 + 4_500 + 280, 2); // 20,710
    expect(r.newYtdRemovedGal).toBe(40_000);
  });

  it("order-independent: swapping class order yields the same total (S5)", () => {
    const a = applyCbmaCredit({ ytdRemovedGal: 25_000, periodRemovedByClass: { A_LE16: 6_000, F_HARD_CIDER: 4_000 } });
    const b = applyCbmaCredit({ ytdRemovedGal: 25_000, periodRemovedByClass: { F_HARD_CIDER: 4_000, A_LE16: 6_000 } });
    expect(a.totalCredit).toBeCloseTo(b.totalCredit, 6);
  });

  it("tier limits are PARAMETERIZED (S6 — v2 controlled-group ready)", () => {
    // tier1Limit=10k → 10k tier 1 ($1.00) + 10k tier 2 ($0.90) = 10,000 + 9,000
    const r = applyCbmaCredit({ ytdRemovedGal: 0, periodRemovedByClass: { A_LE16: 20_000 }, tier1Limit: 10_000 });
    expect(r.totalCredit).toBeCloseTo(19_000, 2);
  });

  it("creditByClass + lines foot to totalCredit", () => {
    const r = applyCbmaCredit({ ytdRemovedGal: 0, periodRemovedByClass: { A_LE16: 20_000, F_HARD_CIDER: 20_000 } });
    const sumLines = r.lines.reduce((a, l) => a + l.creditAmount, 0);
    const sumClass = Object.values(r.creditByClass).reduce((a, v) => a + (v ?? 0), 0);
    expect(sumLines).toBeCloseTo(r.totalCredit, 2);
    expect(sumClass).toBeCloseTo(r.totalCredit, 2);
  });

  it("empty period → zero credit, ladder unchanged", () => {
    const r = applyCbmaCredit({ ytdRemovedGal: 50_000, periodRemovedByClass: {} });
    expect(r.totalCredit).toBe(0);
    expect(r.newYtdRemovedGal).toBe(50_000);
    expect(r.periodRemovedGal).toBe(0);
  });

  // ── Anti-circularity ORACLE: independently hand-computed from the CBMA statutory ladder ──
  it("ORACLE — 150,000 gal from 0 (all wine) = $130,700", () => {
    // 30k×$1.00 + 100k×$0.90 + 20k×$0.535 = 30,000 + 90,000 + 10,700
    const r = applyCbmaCredit({ ytdRemovedGal: 0, periodRemovedByClass: { A_LE16: 150_000 } });
    expect(r.totalCredit).toBeCloseTo(130_700, 2);
  });

  it("ORACLE — full 750,000 gal from 0 (all wine) = $451,700; 800k caps at the same", () => {
    // 30k×$1.00 + 100k×$0.90 + 620k×$0.535 = 30,000 + 90,000 + 331,700
    const full = applyCbmaCredit({ ytdRemovedGal: 0, periodRemovedByClass: { A_LE16: 750_000 } });
    expect(full.totalCredit).toBeCloseTo(451_700, 2);
    const over = applyCbmaCredit({ ytdRemovedGal: 0, periodRemovedByClass: { A_LE16: 800_000 } });
    expect(over.totalCredit).toBeCloseTo(451_700, 2); // gallons past 750k earn nothing
    expect(over.over750k).toBe(true);
    expect(over.creditableGal).toBeCloseTo(750_000, 2);
  });
});
