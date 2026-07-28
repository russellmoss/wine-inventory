import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { code } from "./helpers/code";

const CLIENT = readFileSync(join(__dirname, "../src/app/(app)/bulk/BulkClient.tsx"), "utf8");
const PAGE = readFileSync(join(__dirname, "../src/app/(app)/bulk/page.tsx"), "utf8");
const LOADING = readFileSync(join(__dirname, "../src/app/(app)/bulk/loading.tsx"), "utf8");

describe("the flag, and the rollback story", () => {
  it("/bulk gates the board on NAV_V2_ENABLED", () => {
    expect(CLIENT).toContain('import { NAV_V2_ENABLED } from "@/lib/nav/flag"');
    expect(CLIENT).toContain("NAV_V2_ENABLED ? (");
  });

  it("keeps the legacy accordion renderer in the tree, not deleted", () => {
    // Rollback is an env change and a restart. If renderTypeCard is ever removed, the
    // flag-off path silently becomes a blank page and this fails first.
    expect(CLIENT).toContain("const renderTypeCard");
    expect(CLIENT).toContain('renderTypeCard("Tanks", tanks)');
  });

  it("renders the tanks accordion ONLY when the flag is off", () => {
    expect(CLIENT).toContain('{NAV_V2_ENABLED ? null : renderTypeCard("Tanks", tanks)}');
  });

  it("renders Barrels identically in BOTH arms — Phase 6 is tanks only", () => {
    // Doc 11 scopes Phase 6 to tanks; barrel groups are Phase 7 behind the domain gate.
    const barrels = CLIENT.match(/renderTypeCard\("Barrels", barrels\)/g) ?? [];
    expect(barrels).toHaveLength(1);
    const line = CLIENT.split("\n").find((l) => l.includes('renderTypeCard("Barrels"'));
    expect(line).not.toContain("NAV_V2_ENABLED");
  });

  it("the loading skeleton follows the same flag", () => {
    expect(LOADING).toContain("NAV_V2_ENABLED ? <TankBoardSkeleton />");
  });
});

describe("Export is demoted, and its contract is unchanged", () => {
  it("moves into PageHeader's actions slot with the flag on", () => {
    expect(CLIENT).toContain("actions={exportButton}");
  });

  it("still ships in the flag-off arm, where it was", () => {
    expect(CLIENT).toContain("<div style={{ marginBottom: 20 }}>{exportButton}</div>");
  });

  it("emits exactly one row per vessel COMPONENT, as before", () => {
    // Moving a control must never quietly change what the CSV contains. Someone reconciles
    // against this file.
    expect(CLIENT).toContain("rows={vessels.flatMap((v) => v.components.map((c) => ({");
    expect(CLIENT).toContain('{ key: "volumeL", label: "Volume (L)" }');
  });

  it("there is still exactly one ExportCsvButton on the page", () => {
    expect(CLIENT.match(/<ExportCsvButton/g) ?? []).toHaveLength(1);
  });
});

describe("PageHeader migration", () => {
  it("uses PageHeader with the flag on", () => {
    expect(CLIENT).toContain("<PageHeader");
  });

  it("keeps the hand-set 36px h1 only in the flag-off arm", () => {
    const h1s = CLIENT.match(/<h1/g) ?? [];
    expect(h1s).toHaveLength(1);
  });
});

describe("the server read", () => {
  it("sources fill from the ledger projection, never from components", () => {
    // A lot with no recorded origin has zero component rows, so summing components reports
    // a full tank as empty. This is the single most expensive mistake available here.
    expect(PAGE).toContain("computeFill(v.vesselLots.map((vl) => Number(vl.volumeL)), Number(v.capacityL))");
    expect(code(PAGE)).not.toContain("computeFill(comps");
  });

  it("selects the ferment vectors the derived state needs", () => {
    expect(PAGE).toContain("afState: true");
    expect(PAGE).toContain("mlfState: true");
  });

  it("derives state on the server and never stores it", () => {
    expect(PAGE).toContain("state: tankState({");
    expect(code(PAGE)).not.toContain("vessel.update");
  });

  it("resolves reading recency with ONE aggregate, not a query per vessel", () => {
    expect(PAGE).toContain("prisma.analysisPanel.groupBy({");
    expect(PAGE).toContain('by: ["vesselId"]');
    expect(PAGE).toContain("voidedAt: null");
  });

  it("keeps every read inside the existing Promise.all — no waterfall", () => {
    expect(PAGE.match(/await Promise\.all\(\[/g) ?? []).toHaveLength(1);
    const afterAll = PAGE.slice(PAGE.indexOf("]);"));
    expect(code(afterAll)).not.toContain("await prisma.");
  });

  it("reads the clock exactly once and injects it, so tiles cannot disagree", () => {
    expect(PAGE.match(/new Date\(\)\.toISOString\(\)/g) ?? []).toHaveLength(1);
    expect(PAGE).toContain("now,");
  });

  it("uses the tenant-extended client and no raw SQL", () => {
    expect(PAGE).toContain('import { prisma } from "@/lib/prisma"');
    expect(code(PAGE)).not.toContain("$queryRaw");
    expect(code(PAGE)).not.toContain("$executeRaw");
  });
});

describe("no schema change, no assistant change", () => {
  it("the board never writes", () => {
    const BOARD = readFileSync(join(__dirname, "../src/app/(app)/bulk/TankBoard.tsx"), "utf8");
    expect(code(BOARD)).not.toContain("prisma");
    expect(code(BOARD)).not.toContain('"use server"');
  });
});
