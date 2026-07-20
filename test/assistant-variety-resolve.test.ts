import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plan 082 Unit 3 — a block's variety became editable, so a mis-set variety is fixable by chat.
 *
 * Two things are worth pinning here. The NAME→id resolver is now shared by create and update, so the
 * two cannot disagree about what "Merlot" means. And on the update path an ambiguous name returns a
 * clickable PICKER rather than a thrown paragraph: db_update resolves before the transaction
 * precisely so it still can. A prose "which one did you mean?" is a dead end when the candidates
 * have similar names — the #328 lesson.
 */

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), blockFindUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    variety: { findMany: mocks.findMany },
    vineyardBlock: { findUnique: mocks.blockFindUnique },
  },
}));
vi.mock("@/lib/assistant/scope", () => ({ findScopedBlocks: vi.fn(), resolveVineyards: vi.fn() }));
vi.mock("@/lib/vineyard/block-delete", () => ({
  assertBlockCascadeSafe: vi.fn(),
  cascadeDeleteBlockChildrenTx: vi.fn(),
}));

import { resolveVarietyId, getEntity } from "@/lib/assistant/entities";

const MERLOT = { id: "v-merlot", name: "Merlot" };
const MERLOT_BLANC = { id: "v-mb", name: "Merlot Blanc" };

describe("resolveVarietyId", () => {
  beforeEach(() => mocks.findMany.mockReset());

  it("resolves a single fuzzy match", async () => {
    mocks.findMany.mockResolvedValue([MERLOT]);
    const res = await resolveVarietyId("merl");
    expect(res.kind).toBe("one");
    expect(res.kind === "one" && res.row.id).toBe("v-merlot");
  });

  it("prefers an EXACT name over a longer superstring", async () => {
    // "Merlot" must not open a picker just because "Merlot Blanc" also exists.
    mocks.findMany.mockResolvedValue([MERLOT, MERLOT_BLANC]);
    const res = await resolveVarietyId("Merlot");
    expect(res.kind).toBe("one");
    expect(res.kind === "one" && res.row.name).toBe("Merlot");
  });

  it("matches an exact name case-insensitively", async () => {
    mocks.findMany.mockResolvedValue([MERLOT, MERLOT_BLANC]);
    const res = await resolveVarietyId("  merlot ");
    expect(res.kind === "one" && res.row.id).toBe("v-merlot");
  });

  it("returns a CHOICE on genuine ambiguity — never throws", async () => {
    mocks.findMany.mockResolvedValue([MERLOT, MERLOT_BLANC]);
    const res = await resolveVarietyId("merlo");
    expect(res.kind).toBe("choice");
    if (res.kind !== "choice") throw new Error("expected a choice");
    expect(res.choice.needsChoice).toBe(true);
    expect(res.choice.options.map((o) => o.label)).toEqual(["Merlot", "Merlot Blanc"]);
  });

  it("throws when nothing matches — there is nothing to pick", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(resolveVarietyId("Zzzz")).rejects.toThrow(/No variety matches "Zzzz"/);
  });
});

describe("VineyardBlock.buildUpdate", () => {
  const block = () => getEntity("VineyardBlock")!;
  const displaysIn = (unit: string) =>
    mocks.blockFindUnique.mockResolvedValue({ vineyard: { detail: { defaultUnit: unit } } });

  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.blockFindUnique.mockReset();
    displaysIn("imperial");
  });

  it("passes values through untouched when nothing needs resolving", async () => {
    const out = await block().buildUpdate!({} as never, { numRows: 12 }, "b1");
    expect(out).toEqual({ numRows: 12 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("adds varietyId and canonicalizes the typed name", async () => {
    mocks.findMany.mockResolvedValue([MERLOT]);
    const out = await block().buildUpdate!({} as never, { variety: "merlot" }, "b1");
    expect(out).toEqual({ variety: "Merlot", varietyId: "v-merlot" });
  });

  it("returns the picker instead of resolving when ambiguous", async () => {
    mocks.findMany.mockResolvedValue([MERLOT, MERLOT_BLANC]);
    const out = await block().buildUpdate!({} as never, { variety: "merlo" }, "b1");
    expect(out).toHaveProperty("needsChoice", true);
  });

  it("declares the plumbing keys internal so they stay off the confirm card", () => {
    expect(block().internalUpdateKeys).toEqual(
      expect.arrayContaining(["varietyId", "rowSpacingM", "vineSpacingM"]),
    );
  });

  // ── Unit 4: spacing ──
  it("converts feet to canonical meters by default", async () => {
    const out = (await block().buildUpdate!({} as never, { vineSpacing: 5 }, "b1")) as Record<string, unknown>;
    expect(out.vineSpacingM).toBeCloseTo(1.524, 4);
    expect(out.vineSpacing).toBe("5.00 ft");
    expect(out.spacingUnit).toBeUndefined();
  });

  it("passes metric input through unconverted when the unit says so", async () => {
    const out = (await block().buildUpdate!({} as never, { rowSpacing: 3, spacingUnit: "metric" }, "b1")) as Record<string, unknown>;
    expect(out.rowSpacingM).toBeCloseTo(3, 6);
  });

  it("renders the card in the VINEYARD's unit, not the unit the user typed", async () => {
    // Spoke metric, vineyard displays imperial — the before side comes from `current` in imperial,
    // so the after side must match or the card silently compares 3 m to 7 ft.
    displaysIn("imperial");
    const out = (await block().buildUpdate!({} as never, { rowSpacing: 3, spacingUnit: "metric" }, "b1")) as Record<string, unknown>;
    expect(out.rowSpacing).toBe("9.84 ft");
  });

  it("refuses zero spacing instead of silently clearing it (R1)", async () => {
    await expect(block().buildUpdate!({} as never, { rowSpacing: 0 }, "b1")).rejects.toThrow(/greater than 0/);
  });

  it("refuses negative spacing", async () => {
    await expect(block().buildUpdate!({} as never, { vineSpacing: -2 }, "b1")).rejects.toThrow(/greater than 0/);
  });
});

describe("VineyardBlock.update", () => {
  it("writes the columns and drops every display-only key", async () => {
    const update = vi.fn();
    const tx = { vineyardBlock: { update } } as never;
    await getEntity("VineyardBlock")!.update!(tx, "b1", {
      variety: "Merlot",
      varietyId: "v-merlot",
      rowSpacing: "9.84 ft",
      rowSpacingM: 3,
      vineSpacing: "5.00 ft",
      vineSpacingM: 1.524,
      spacingUnit: "metric",
      numRows: 12,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { varietyId: "v-merlot", rowSpacingM: 3, vineSpacingM: 1.524, numRows: 12 },
    });
  });
});

describe("planted acreage stays correctable", () => {
  it("the fields that derive it are now writable on BOTH paths", () => {
    // The original hazard: vineCount was writable and the spacings were not, so the assistant could
    // change one factor of rowSpacing * vineSpacing * vineCount and strand the result.
    const block = getEntity("VineyardBlock")!;
    const creatable = block.creatable!.map((f) => f.name);
    const editable = block.editable!.map((f) => f.name);
    for (const field of ["vineCount", "rowSpacing", "vineSpacing"]) {
      expect(creatable, `create: ${field}`).toContain(field);
      expect(editable, `update: ${field}`).toContain(field);
    }
  });
});
