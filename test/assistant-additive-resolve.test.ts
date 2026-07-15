import { describe, it, expect, beforeAll } from "vitest";
import { resolveAdditiveFrom } from "@/lib/assistant/tools/additive-resolve";
import { verifyProposal } from "@/lib/assistant/confirm";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";

// Regression for the "two Bentonite entries" dead-loop (2026-07-05 live-QA): the multi-vessel WO tool
// (issue_operation_wo) used to throw a text "several match — which one?" on duplicate additive names.
// When two catalog entries share an identical display name, no clarification the user types can break the
// tie, so the flow dead-looped. resolveAdditiveFrom now returns a clickable CHOICE that pins by id — the
// same mechanism add_addition already uses. This spec is the pure-logic proof (repo is node-env vitest).

const base: CellarMaterialDTO = {
  id: "",
  name: "",
  kind: "BENTONITE",
  subcategory: null,
  category: "ADDITIVE",
  genericName: null,
  brand: null,
  brandName: null,
  preferGeneric: false,
  vendor: null,
  vendorUrl: null,
  vendorId: null,
  packageAmount: null,
  packageUnit: null,
  defaultBasis: null,
  percentActive: null,
};
const mat = (p: Partial<CellarMaterialDTO>): CellarMaterialDTO => ({ ...base, ...p });

// The real catalog situation: two "Bentonite" entries, identical display name (generic, preferGeneric).
const kwk = mat({ id: "11111111-1111-1111-1111-111111111111", name: "Bentonite KWK", genericName: "Bentonite", brand: "Scott", brandName: "KWK Granular", preferGeneric: true });
const sodium = mat({ id: "22222222-2222-2222-2222-222222222222", name: "Sodium Bentonite", genericName: "Bentonite", brandName: "NaBent", preferGeneric: true });
const kmbs = mat({ id: "33333333-3333-3333-3333-333333333333", name: "KMBS", genericName: "Potassium Metabisulfite", kind: "SO2" });
const foil = mat({ id: "44444444-4444-4444-4444-444444444444", name: "Foil Capsule", kind: "PACKAGING", category: "PACKAGING" });

const resumeBase = { operation: "FINING", vessels: ["T1", "T2", "T3"], amount: 250, unit: "g" };

describe("resolveAdditiveFrom — duplicate-named additive no longer dead-loops", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "test-secret-for-additive-resolve";
  });

  it("returns a CHOICE (not a throw) when two entries share the same display name", () => {
    const res = resolveAdditiveFrom([kwk, sodium, kmbs], "bentonite", resumeBase);
    expect(res.kind).toBe("choice");
    if (res.kind !== "choice") return;
    expect(res.choice.options).toHaveLength(2);
    // Each option pins the material by id via a signed resume token — identical names still pick cleanly.
    expect(res.choice.options.every((o) => typeof o.resume === "string" && o.resume.length > 0)).toBe(true);
    // The sublabel carries a distinguishing ref so byte-identical labels are tell-apart-able.
    expect(res.choice.options[0].sublabel).toContain("ref ");
    expect(res.choice.options[0].sublabel).not.toBe(res.choice.options[1].sublabel);
  });

  it("the resume tap re-drives issue_operation_wo with the material pinned by id + the original WO input", () => {
    const res = resolveAdditiveFrom([kwk, sodium], "bentonite", resumeBase);
    if (res.kind !== "choice") throw new Error("expected a choice");
    const payload = verifyProposal(res.choice.options[0].resume!);
    expect(payload.kind).toBe("resume");
    expect(payload.tool).toBe("issue_operation_wo");
    expect(payload.args).toMatchObject({ operation: "FINING", vessels: ["T1", "T2", "T3"], amount: 250, unit: "g", material: `#${kwk.id}` });
  });

  it("a #id ref pins directly to that material (a picker tap re-drive)", () => {
    const res = resolveAdditiveFrom([kwk, sodium], `#${sodium.id}`, resumeBase);
    expect(res.kind).toBe("one");
    if (res.kind === "one") expect(res.row.id).toBe(sodium.id);
  });

  it("resolves cleanly to one when the name is unambiguous", () => {
    const res = resolveAdditiveFrom([kwk, sodium, kmbs], "KMBS", resumeBase);
    expect(res.kind).toBe("one");
    if (res.kind === "one") expect(res.row.id).toBe(kmbs.id);
  });

  it("refuses when the only match is a non-additive (packaging can't be dosed — WORKORDER-3)", () => {
    expect(() => resolveAdditiveFrom([foil], "foil", resumeBase)).toThrow(/can't be dosed/);
  });

  it("throws a helpful message when nothing matches", () => {
    expect(() => resolveAdditiveFrom([kwk], "chitosan", resumeBase)).toThrow(/No additive matches/);
  });
});
