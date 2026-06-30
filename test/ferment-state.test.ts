import { describe, it, expect } from "vitest";
import { isLegalState, planStateTransition, isDry, mlfComplete, type LotState } from "@/lib/ferment/state";

const S = (form: LotState["form"], af: LotState["afState"], mlf: LotState["mlfState"]): LotState => ({
  form,
  afState: af,
  mlfState: mlf,
});

describe("isLegalState — the orthogonal matrix", () => {
  it("accepts the canonical real-ferment states", () => {
    expect(isLegalState(S("JUICE", "ACTIVE", "NONE"))).toBe(true); // a white in primary
    expect(isLegalState(S("MUST", "ACTIVE", "ACTIVE"))).toBe(true); // co-inoculated red
    expect(isLegalState(S("MUST", "DRY", "NONE"))).toBe(true); // extended maceration (dry on skins)
    expect(isLegalState(S("MUST", "NONE", "NONE"))).toBe(true); // cold soak
    expect(isLegalState(S("WINE", "DRY", "COMPLETE"))).toBe(true); // finished
    expect(isLegalState(S("WINE", "NONE", "NONE"))).toBe(true); // legacy/seeded wine (migration default)
  });

  it("rejects incoherent combinations", () => {
    expect(isLegalState(S("FRUIT", "ACTIVE", "NONE"))).toBe(false); // uncrushed fruit can't ferment
    expect(isLegalState(S("JUICE", "DRY", "NONE"))).toBe(false); // dry juice must be wine
    expect(isLegalState(S("WINE", "ACTIVE", "NONE"))).toBe(false); // actively-fermenting "wine" is still juice/must
  });
});

describe("planStateTransition", () => {
  it("AF advances one step NONE→ACTIVE→DRY", () => {
    expect(planStateTransition(S("MUST", "NONE", "NONE"), { kind: "AF", to: "ACTIVE" }).next.afState).toBe("ACTIVE");
    expect(() => planStateTransition(S("MUST", "NONE", "NONE"), { kind: "AF", to: "DRY" })).toThrow(/one step at a time/);
  });

  it("a white going dry (JUICE + AF→DRY) auto-flips form to WINE", () => {
    const r = planStateTransition(S("JUICE", "ACTIVE", "NONE"), { kind: "AF", to: "DRY" });
    expect(r.next.form).toBe("WINE");
    expect(r.next.afState).toBe("DRY");
    expect(r.formAutoFlipped).toBe(true);
  });

  it("a red going dry stays MUST (extended maceration — flips at press, not at dryness)", () => {
    const r = planStateTransition(S("MUST", "ACTIVE", "NONE"), { kind: "AF", to: "DRY" });
    expect(r.next.form).toBe("MUST");
    expect(r.formAutoFlipped).toBe(false);
  });

  it("MLF runs independently of AF (co-inoculation)", () => {
    const r = planStateTransition(S("MUST", "ACTIVE", "NONE"), { kind: "MLF", to: "ACTIVE" });
    expect(r.next.mlfState).toBe("ACTIVE");
    expect(r.next.afState).toBe("ACTIVE");
  });

  it("you cannot become WINE while AF is not dry (the form=WINE+af=NONE guard)", () => {
    expect(() => planStateTransition(S("MUST", "NONE", "NONE"), { kind: "FORM", to: "WINE" })).toThrow(
      /alcoholic ferment is dry/,
    );
    // ...but MUST→WINE is fine once dry (a pressed red).
    expect(planStateTransition(S("MUST", "DRY", "NONE"), { kind: "FORM", to: "WINE" }).next.form).toBe("WINE");
  });

  it("MUST→JUICE is allowed (saignée / white press); WINE→MUST is not", () => {
    expect(planStateTransition(S("MUST", "NONE", "NONE"), { kind: "FORM", to: "JUICE" }).next.form).toBe("JUICE");
    expect(() => planStateTransition(S("WINE", "DRY", "NONE"), { kind: "FORM", to: "MUST" })).toThrow(/Can't change form/);
  });
});

describe("threshold helpers", () => {
  it("isDry at ≤ −1.5 °Bx", () => {
    expect(isDry(-1.5)).toBe(true);
    expect(isDry(0)).toBe(false);
    expect(isDry(-2)).toBe(true);
  });
  it("mlfComplete below ~0.3 g/L malic", () => {
    expect(mlfComplete(0.1)).toBe(true);
    expect(mlfComplete(0.5)).toBe(false);
  });
});
