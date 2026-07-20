import { describe, it, expect } from "vitest";
import { classifyEffects, isBlocked, needsCascade } from "@/lib/assistant/relations";
import { resolveOneOrChoice } from "@/lib/assistant/tools/resolve";

// Ticket #188: the confirmed-cascade split. A `cascadable` restrict child (e.g. a block's Brix readings /
// harvest records) routes to `cascadableBlocked` and triggers a user-confirmed cascade; a plain restrict
// child (e.g. work-order tasks) stays a hard `blocked` wall. This is pure logic — DB-free, drift-proof.

describe("classifyEffects — confirmed-cascade split", () => {
  it("routes cascadable restrict children to cascadableBlocked, plain restrict to blocked", () => {
    const e = classifyEffects([
      { label: "Brix readings", kind: "restrict", cascadable: true, count: 3 },
      { label: "harvest records", kind: "restrict", cascadable: true, count: 1 },
      { label: "work-order tasks", kind: "restrict", count: 0 },
    ]);
    expect(e.cascadableBlocked.map((g) => g.label)).toEqual(["Brix readings", "harvest records"]);
    expect(e.blocked).toEqual([]);
    expect(isBlocked(e)).toBe(false);
    expect(needsCascade(e)).toBe(true);
  });

  it("a non-cascadable restrict child is a hard wall even when cascadable ones exist", () => {
    const e = classifyEffects([
      { label: "Brix readings", kind: "restrict", cascadable: true, count: 2 },
      { label: "work-order tasks", kind: "restrict", count: 1 },
    ]);
    expect(e.blocked.map((g) => g.label)).toEqual(["work-order tasks"]);
    expect(isBlocked(e)).toBe(true); // hard block wins — refuse regardless of the cascade offer
    expect(needsCascade(e)).toBe(true);
  });

  it("zero-count children are ignored; a clean delete needs neither refusal nor cascade", () => {
    const e = classifyEffects([
      { label: "Brix readings", kind: "restrict", cascadable: true, count: 0 },
      { label: "subblocks", kind: "cascade", count: 2 },
      { label: "blocks", kind: "setNull", count: 1 },
    ]);
    expect(isBlocked(e)).toBe(false);
    expect(needsCascade(e)).toBe(false);
    expect(e.cascade.map((g) => g.label)).toEqual(["subblocks"]);
    expect(e.setNull.map((g) => g.label)).toEqual(["blocks"]);
  });
});

// ─── Feedback cmrs4vasg / #328: ambiguous delete target ──────────────────────────────────────────
//
// Reported as "the error message happened when I asked to create a card to delete the block". Root
// cause: db_delete resolved its target with resolveExactlyOne, which THROWS on multiple matches. Demo
// Winery has seven blocks labelled "Block 1" (every vineyard has its own), so the user got a wall of
// error text and no card at all. Reproduced against the real DB before the fix; picker after.
//
// These cover the resolver contract db_delete now relies on. The delete path is the DESTRUCTIVE one:
// resolving the wrong row also takes its cascade with it, so "pinned by id" is load-bearing, not polish.
describe("resolveOneOrChoice — the contract db_delete relies on (#328)", () => {
  const rows = [
    { id: "blk_ojai", label: "Block 1 (Sauvignon Blanc) in Ojai" },
    { id: "blk_madera", label: "Block 1 (Cabernet Sauvignon) in Madera" },
    // Deliberately IDENTICAL labels — this is why a text question cannot disambiguate. The user answers
    // "the QBO one" and the same ambiguous match re-runs. Only an id resolves it.
    { id: "blk_qbo_a", label: "Block 1 — Cabernet (Cabernet Sauvignon) in QBO Demo Vineyard" },
    { id: "blk_qbo_b", label: "Block 1 — Cabernet (Cabernet Sauvignon) in QBO Demo Vineyard" },
  ];

  it("returns a picker instead of throwing when several rows match", () => {
    const res = resolveOneOrChoice(rows, {
      prompt: "Which block do you want to delete?",
      describe: (r) => r.label,
      resume: (r) => `token:${r.id}`,
      noneMsg: "no match",
    });
    expect(res.kind).toBe("choice");
    if (res.kind !== "choice") return;
    expect(res.choice.options).toHaveLength(4);
  });

  it("pins every option to a DISTINCT id, so identical labels stay tell-apart-able", () => {
    const res = resolveOneOrChoice(rows, {
      prompt: "Which block do you want to delete?",
      describe: (r) => r.label,
      resume: (r) => `token:${r.id}`,
      noneMsg: "no match",
    });
    if (res.kind !== "choice") throw new Error("expected a picker");
    const resumes = res.choice.options.map((o) => o.resume);
    expect(new Set(resumes).size).toBe(rows.length);
    // The two identical-label rows must still be separately addressable.
    expect(resumes).toContain("token:blk_qbo_a");
    expect(resumes).toContain("token:blk_qbo_b");
  });

  it("still resolves straight through when exactly one row matches (no picker churn)", () => {
    const res = resolveOneOrChoice([rows[0]], {
      prompt: "Which block?",
      describe: (r) => r.label,
      resume: (r) => `token:${r.id}`,
      noneMsg: "no match",
    });
    expect(res.kind).toBe("one");
    if (res.kind === "one") expect(res.row.id).toBe("blk_ojai");
  });

  it("still refuses when NOTHING matches — there is nothing to pick", () => {
    expect(() =>
      resolveOneOrChoice([], { prompt: "Which block?", describe: () => "", resume: () => "t", noneMsg: 'No block matches "Block 99".' }),
    ).toThrow(/No block matches/);
  });
});
