import { describe, it, expect } from "vitest";
import { computeDrift, isTriggerPrefix, parseFrontmatter } from "../scripts/check-invariant-drift.mjs";

const note = (id: string, appliesTo: string[], verify = "npm run verify:x") => ({
  id,
  noteRel: `docs/architecture/invariants/${id}.md`,
  appliesTo,
  verify,
});

describe("isTriggerPrefix — which governed paths count as a drift trigger", () => {
  it("counts specific domain dirs and the prisma schema/migrations", () => {
    expect(isTriggerPrefix("src/lib/ledger/")).toBe(true);
    expect(isTriggerPrefix("src/lib/cost/")).toBe(true);
    expect(isTriggerPrefix("prisma/schema.prisma")).toBe(true);
    expect(isTriggerPrefix("prisma/migrations/0001_x/")).toBe(true);
  });
  it("does NOT count a broad prefix that would false-positive", () => {
    expect(isTriggerPrefix("src/lib/")).toBe(false); // e.g. the raw-sql invariant's broad scope
    expect(isTriggerPrefix("src/")).toBe(false);
    expect(isTriggerPrefix("src/components/")).toBe(false);
  });
});

describe("computeDrift — governed code moved but the note did not", () => {
  const notes = [
    note("COST-1", ["src/lib/cost/"]),
    note("LEDGER-1", ["prisma/schema.prisma", "src/lib/ledger/"]),
    note("TENANT-2", ["src/lib/"]), // deliberately broad — must never drift on unrelated edits
  ];

  it("FIRES when governed code changed and its note did not", () => {
    const changed = ["src/lib/cost/data.ts", "src/app/page.tsx"];
    const drift = computeDrift(changed, notes);
    expect(drift.map((d: { id: string }) => d.id)).toEqual(["COST-1"]);
    expect(drift[0].hits).toContain("src/lib/cost/data.ts");
  });

  it("is SUPPRESSED when the note itself changed in the same range", () => {
    const changed = ["src/lib/cost/data.ts", "docs/architecture/invariants/COST-1.md"];
    expect(computeDrift(changed, notes)).toEqual([]);
  });

  it("does NOT fire for a broad-prefix invariant on an unrelated lib edit", () => {
    const changed = ["src/lib/voice/tts.ts"]; // matches TENANT-2's broad src/lib/ but not a trigger
    expect(computeDrift(changed, notes)).toEqual([]);
  });

  it("fires for a schema change against a schema-scoped invariant", () => {
    const changed = ["prisma/schema.prisma"];
    expect(computeDrift(changed, notes).map((d: { id: string }) => d.id)).toEqual(["LEDGER-1"]);
  });

  it("no changes → no drift", () => {
    expect(computeDrift([], notes)).toEqual([]);
  });
});

describe("parseFrontmatter — reads the register note shape", () => {
  it("parses scalars and the appliesTo list", () => {
    const md = [
      "---",
      "id: COST-1",
      'verify: "npm run verify:cost"',
      "appliesTo:",
      "  - src/lib/cost/",
      "---",
      "body",
    ].join("\n");
    const fm = parseFrontmatter(md) as unknown as { id: string; verify: string; appliesTo: string[] };
    expect(fm.id).toBe("COST-1");
    expect(fm.verify).toBe("npm run verify:cost");
    expect(fm.appliesTo).toEqual(["src/lib/cost/"]);
  });
});
