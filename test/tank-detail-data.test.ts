import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { code } from "./helpers/code";

const DATA = readFileSync(join(__dirname, "../src/lib/vessels/tank-detail-data.ts"), "utf8");
const CHEM = readFileSync(join(__dirname, "../src/lib/chemistry/data.ts"), "utf8");

describe("OD-P6-3 — one sourcing rule for the whole detail surface", () => {
  it("matches listVesselAnalyses' rule, not the worksheet's", () => {
    // Two rules on one page is exactly how AC-S27 fails: the Fermentation tab and the
    // Analyses tab would state different 'latest Brix' for the same tank.
    expect(DATA).toContain("{ vesselId },");
    expect(DATA).toContain("{ vesselId: null, lotId: { in: residentLotIds } }");
    expect(CHEM).toContain("{ vesselId: null, lotId: { in: residentLotIds } }");
  });

  it("resolves resident lots the same way its sibling does", () => {
    expect(DATA).toContain("prisma.vesselLot.findMany({ where: { vesselId }, select: { lotId: true } })");
    expect(CHEM).toContain("prisma.vesselLot.findMany({ where: { vesselId }, select: { lotId: true } })");
  });

  it("says WHY in the source, so the next person does not 'simplify' it apart", () => {
    expect(DATA).toContain("OD-P6-3");
    expect(DATA).toContain("AC-S27");
  });
});

describe("what gets excluded", () => {
  it("voided panels never reach the chart", () => {
    expect(DATA).toContain("voidedAt: null");
  });

  it("legacy fan-out panels collapse to one physical reading", () => {
    // plan 060 wrote one panel per co-resident lot for a single whole-tank reading. Without
    // this the chart plots that reading two or three times and drags the curve.
    expect(DATA).toContain("dedupeByPhysicalReading");
    expect(DATA).toContain('from "@/lib/chemistry/fanout-plan"');
  });

  it("only pulls the two analytes it plots", () => {
    expect(DATA).toContain('analyte: { in: ["BRIX", "TEMP"] }');
  });
});

describe("tenancy and bounds", () => {
  it("goes through the tenant-extended client", () => {
    expect(DATA).toContain('import { prisma } from "@/lib/prisma"');
    expect(DATA).toContain('import "server-only"');
  });

  it("uses no raw SQL, which would bypass the tenant extension", () => {
    expect(code(DATA)).not.toContain("$queryRaw");
    expect(code(DATA)).not.toContain("$executeRaw");
  });

  it("is bounded", () => {
    expect(DATA).toContain("take: MAX_PANELS");
  });

  it("takes the NEWEST panels when it caps, not the oldest", () => {
    // A cap that keeps the oldest 400 would freeze the chart at the start of the ferment.
    expect(DATA).toContain('orderBy: { observedAt: "desc" }');
  });

  it("never writes", () => {
    expect(code(DATA)).not.toContain(".update(");
    expect(code(DATA)).not.toContain(".create(");
    expect(code(DATA)).not.toContain(".delete(");
  });
});
