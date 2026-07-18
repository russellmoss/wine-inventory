import { describe, it, expect } from "vitest";
import { QTY_HINT, PACK_SIZE_HINT, UNIT_HINT } from "@/lib/units/field-hints";

// The wording is the whole point of the tooltips — lock the concrete examples so a future edit can't quietly
// drop them and reintroduce the qty/pack-size confusion.
describe("field hints copy (plan 075)", () => {
  it("Qty hint explains packages received with the 5-rolls example", () => {
    expect(QTY_HINT.toLowerCase()).toContain("packages");
    expect(QTY_HINT).toContain("Qty = 5");
  });

  it("Pack size hint explains items-per-package with the 500-labels example", () => {
    expect(PACK_SIZE_HINT).toContain("Pack size = 500");
    expect(PACK_SIZE_HINT.toLowerCase()).toContain("one package");
  });

  it("Unit hint mentions creating a custom unit", () => {
    expect(UNIT_HINT.toLowerCase()).toContain("create");
  });
});
