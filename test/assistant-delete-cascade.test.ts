import { describe, it, expect } from "vitest";
import { classifyEffects, isBlocked, needsCascade } from "@/lib/assistant/relations";

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
