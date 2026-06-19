import { describe, it, expect } from "vitest";
import { parseInventoryCsv, MAX_IMPORT_ROWS } from "@/lib/inventory/csv";

describe("parseInventoryCsv", () => {
  it("parses a clean template row (explicit Vintage column)", () => {
    const csv = "Item,Vintage,Category,Location,Quantity\nChateau Bon Vivant,2024,Wine,Wine Bar,100";
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "BOTTLED_WINE",
      name: "Chateau Bon Vivant",
      vintage: 2024,
      category: "Wine",
      location: "Wine Bar",
      qty: 100,
    });
  });

  it("supports the user's existing file shape — no Vintage column, year in the item name", () => {
    const csv = "Item,Category,Location,Quantity\n2024 Chateau Bon Vivant,Wine,Wine Bar,100";
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "Chateau Bon Vivant", vintage: 2024, qty: 100 });
  });

  it("handles a quoted field containing a comma", () => {
    const csv = 'Item,Vintage,Category,Location,Quantity\n"Bon Vivant, Reserve",2024,Wine,Cellar,12';
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0].name).toBe("Bon Vivant, Reserve");
  });

  it("strips a leading UTF-8 BOM and tolerates CRLF line endings", () => {
    const csv = "﻿Item,Vintage,Category,Location,Quantity\r\nMerlot,2022,Wine,Cellar,5\r\n";
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Merlot", vintage: 2022, qty: 5 });
  });

  it("flags bad quantities (missing, zero, negative, non-integer) with the line number", () => {
    const csv = [
      "Item,Vintage,Category,Location,Quantity",
      "A,2024,Wine,Cellar,0",
      "B,2024,Wine,Cellar,-3",
      "C,2024,Wine,Cellar,1.5",
      "D,2024,Wine,Cellar,",
    ].join("\n");
    const { rows, errors } = parseInventoryCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors.map((e) => e.lineNo)).toEqual([2, 3, 4, 5]);
    expect(errors[0].message).toMatch(/Quantity/);
  });

  it("errors a wine row with no resolvable vintage", () => {
    const csv = "Item,Category,Location,Quantity\nMystery Red,Wine,Cellar,10";
    const { rows, errors } = parseInventoryCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/vintage/i);
  });

  it("does not parse a year when the name has two 4-digit numbers (ambiguous)", () => {
    const csv = "Item,Category,Location,Quantity\n1999 Cuvee 2010,Wine,Cellar,10";
    const { errors } = parseInventoryCsv(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/vintage/i);
  });

  it("maps a non-Wine category to FINISHED_GOOD and ignores vintage", () => {
    const csv = "Item,Vintage,Category,Location,Quantity\nLogo T-Shirt,,Apparel,Warehouse,50";
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ kind: "FINISHED_GOOD", name: "Logo T-Shirt", vintage: null, qty: 50 });
  });

  it("skips fully blank lines", () => {
    const csv = "Item,Vintage,Category,Location,Quantity\n\nMerlot,2022,Wine,Cellar,5\n\n";
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("accepts header order and casing variations", () => {
    const csv = "quantity,LOCATION,category,vintage,item\n7,Cellar,Wine,2021,Pinot";
    const { rows, errors } = parseInventoryCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "Pinot", vintage: 2021, location: "Cellar", qty: 7 });
  });

  it("reports missing required columns", () => {
    const csv = "Item,Vintage,Quantity\nMerlot,2022,5";
    const { rows, errors } = parseInventoryCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/Missing required column/);
  });

  it("reports an empty file", () => {
    const { rows, errors } = parseInventoryCsv("");
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/empty/i);
  });

  it("caps the number of rows at MAX_IMPORT_ROWS", () => {
    const header = "Item,Vintage,Category,Location,Quantity";
    const body = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => `Wine ${i},2020,Wine,Cellar,1`);
    const { rows, errors } = parseInventoryCsv([header, ...body].join("\n"));
    expect(rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(errors.some((e) => /Limit is/.test(e.message))).toBe(true);
  });
});
