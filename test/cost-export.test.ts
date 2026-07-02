import { describe, it, expect } from "vitest";
import { buildExportLines, resolveAccounts, accountKey, type AccountMap } from "@/lib/cost/export";

// Unit 14 (D18) — accounting export seam: pure mapping. Idempotent postingKeys, reversal linkage,
// incomplete-basis + unmapped withholding.

function mapOf(entries: [string, string | null, string, string][]): AccountMap {
  const m: AccountMap = new Map();
  for (const [component, taxClass, debit, credit] of entries) m.set(accountKey(component as never, taxClass), { debit, credit });
  return m;
}

const FULL_MAP = mapOf([
  ["FRUIT", null, "5000-COGS", "1400-Inventory"],
  ["MATERIAL", null, "5000-COGS", "1400-Inventory"],
  ["PACKAGING", null, "5010-COGS-Dry", "1400-Inventory"],
]);

describe("resolveAccounts — exact tax class beats the default", () => {
  it("prefers a specific tax-class row over the * default", () => {
    const m = mapOf([["FRUIT", null, "D-default", "C-default"], ["FRUIT", "WINE_UNDER_16", "D-wine", "C-wine"]]);
    expect(resolveAccounts(m, "FRUIT" as never, "WINE_UNDER_16")?.debit).toBe("D-wine");
    expect(resolveAccounts(m, "FRUIT" as never, "SPARKLING")?.debit).toBe("D-default"); // falls back
  });
});

describe("buildExportLines", () => {
  const src = {
    postingKey: "cogs:run1:sku1:-",
    componentBreakdown: { FRUIT: 300, MATERIAL: 50, PACKAGING: 120 },
    taxClass: null,
    currency: "USD",
    basisCompleteness: "KNOWN" as const,
  };

  it("emits one postable line per non-zero component with a deterministic postingKey", () => {
    const b = buildExportLines(src, FULL_MAP);
    expect(b.postable).toBe(true);
    expect(b.lines).toHaveLength(3);
    const fruit = b.lines.find((l) => l.component === "FRUIT")!;
    expect(fruit.postingKey).toBe("cogs:run1:sku1:-:FRUIT");
    expect(fruit.amount).toBe(300);
    expect(fruit.debitAccount).toBe("5000-COGS");
  });

  it("is idempotent by postingKey (re-building yields identical keys)", () => {
    const a = buildExportLines(src, FULL_MAP).lines.map((l) => l.postingKey).sort();
    const b = buildExportLines(src, FULL_MAP).lines.map((l) => l.postingKey).sort();
    expect(a).toEqual(b);
  });

  it("a reversal negates amounts and suffixes the postingKey with :rev", () => {
    const b = buildExportLines({ ...src, isReversal: true }, FULL_MAP);
    const fruit = b.lines.find((l) => l.component === "FRUIT")!;
    expect(fruit.amount).toBe(-300);
    expect(fruit.postingKey).toBe("cogs:run1:sku1:-:FRUIT:rev");
  });

  it("withholds when the basis is not KNOWN (D14)", () => {
    const b = buildExportLines({ ...src, basisCompleteness: "PARTIAL" }, FULL_MAP);
    expect(b.postable).toBe(false);
    expect(b.reason).toMatch(/basis/);
  });

  it("withholds when a component has no account mapping", () => {
    const partialMap = mapOf([["FRUIT", null, "D", "C"]]); // MATERIAL + PACKAGING unmapped
    const b = buildExportLines(src, partialMap);
    expect(b.postable).toBe(false);
    expect(b.reason).toMatch(/mapping/);
    // still surfaces the unmapped lines (null accounts) so a UI can show what's missing
    expect(b.lines.find((l) => l.component === "MATERIAL")?.debitAccount).toBeNull();
  });

  it("skips zero-amount components", () => {
    const b = buildExportLines({ ...src, componentBreakdown: { FRUIT: 300, MATERIAL: 0 } }, FULL_MAP);
    expect(b.lines).toHaveLength(1);
  });
});
