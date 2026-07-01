import { describe, it, expect } from "vitest";
import fieldmap from "@/lib/compliance/ttb-5120-17-fieldmap.json";

const cells = fieldmap.cells as Record<string, string>;
const header = fieldmap.header as Record<string, string>;

describe("ttb-5120-17 fieldmap (Unit 9)", () => {
  it("maps all header fields", () => {
    for (const k of ["year", "month", "ein", "registry", "operatedBy", "remarks"]) {
      expect(header[k], `header.${k}`).toBeTruthy();
    }
  });

  it("maps the anchor grid cells (spot-checked vs page renders)", () => {
    expect(cells["A.1.a"]).toBe("a1.1");
    expect(cells["A.2.a"]).toBe("a1.2");
    expect(cells["A.13.a"]).toBe("a1.13");
    expect(cells["A.14.a"]).toBe("a1.14");
    expect(cells["A.31.a"]).toBe("a1.31");
    expect(cells["B.2.a"]).toBe("a2.2");
    expect(cells["B.8.a"]).toBe("a2.8");
    expect(cells["B.20.a"]).toBe("a2.20");
  });

  it("covers the still-wine v1 lines across classes a/b/c for §A and §B", () => {
    // The lines v1 actually fills for still wine. Line 2 (produced by fermentation) is greyed on the
    // form for class c (can't ferment >21% naturally), so it's only asserted for class a.
    const bLines = [1, 2, 8, 18, 19, 20];
    for (const col of ["a", "b", "c"]) {
      const aLines = col === "a" ? [1, 2, 13, 14, 29, 30, 31] : [1, 13, 14, 29, 30, 31];
      for (const l of aLines) expect(cells[`A.${l}.${col}`], `A.${l}.${col}`).toBeTruthy();
      for (const l of bLines) expect(cells[`B.${l}.${col}`], `B.${l}.${col}`).toBeTruthy();
    }
  });

  it("maps the sparkling BF/BP split on the bottled line (13/§A, 2/§B)", () => {
    expect(cells["A.13.e.BF"]).toBe("e1.13.1");
    expect(cells["A.13.e.BP"]).toBe("e1.13.2");
  });

  it("has no duplicate field names across mapped cells", () => {
    const names = Object.values(cells);
    expect(new Set(names).size).toBe(names.length);
  });
});
