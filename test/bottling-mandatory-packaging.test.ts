import { describe, it, expect } from "vitest";
import { assertMandatoryPackaging, type PackagingMaterialRow } from "@/lib/bottling/mandatory-packaging";

// P0 — the server backstop that stops a bottling run without a bottle, a closure (cork/…) and a label.
// The guard is driven by a `loadMaterials(ids)` reader so it stays prisma/tx-agnostic and unit-testable.

const CATALOG: Record<string, PackagingMaterialRow> = {
  glass: { name: "750ml Bordeaux glass", kind: "PACKAGING" },
  cork: { name: "Natural cork 44x24", kind: "PACKAGING" },
  label: { name: "Front label", kind: "PACKAGING" },
  capsule: { name: "Tin capsule", kind: "PACKAGING" },
};
const loader = (ids: string[]) => Promise.resolve(ids.map((id) => CATALOG[id]).filter(Boolean));

describe("assertMandatoryPackaging", () => {
  it("passes when a bottle, a closure and a label are all consumed", async () => {
    await expect(
      assertMandatoryPackaging([{ materialId: "glass", qty: 100 }, { materialId: "cork", qty: 100 }, { materialId: "label", qty: 100 }], loader),
    ).resolves.toBeUndefined();
  });

  it("rejects a run with a bottle + label but no closure (the Big Mike Big Red bug)", async () => {
    await expect(
      assertMandatoryPackaging([{ materialId: "glass", qty: 100 }, { materialId: "label", qty: 100 }], loader),
    ).rejects.toThrow(/closure/i);
  });

  it("a capsule does not satisfy the closure requirement", async () => {
    await expect(
      assertMandatoryPackaging([{ materialId: "glass", qty: 100 }, { materialId: "capsule", qty: 100 }, { materialId: "label", qty: 100 }], loader),
    ).rejects.toThrow(/closure/i);
  });

  it("rejects an empty / liquid-only run (all three missing)", async () => {
    await expect(assertMandatoryPackaging(undefined, loader)).rejects.toThrow(/bottle.*closure.*label/i);
    await expect(assertMandatoryPackaging([], loader)).rejects.toThrow(/bottle/i);
  });

  it("ignores zero-quantity lines (a picked-but-empty closure line doesn't count)", async () => {
    await expect(
      assertMandatoryPackaging([{ materialId: "glass", qty: 100 }, { materialId: "cork", qty: 0 }, { materialId: "label", qty: 100 }], loader),
    ).rejects.toThrow(/closure/i);
  });

  it("does not hit the loader when there is nothing to classify", async () => {
    let called = false;
    await expect(
      assertMandatoryPackaging([], (ids) => {
        called = true;
        return Promise.resolve(ids.map((id) => CATALOG[id]));
      }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
});
