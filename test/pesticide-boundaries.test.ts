import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TRUSTED_DOMAINS, KNOWLEDGE_SOURCES } from "@/lib/knowledge/config";

// Spray S2 Unit 11 — the source-scan guards that turn this plan's safety rules into CI failures.
// These are the difference between a rule and a comment.

const REPO = join(__dirname, "..");
const LANE_DIR = join(REPO, "src", "lib", "pesticide");
const LANE_SCRIPTS = ["ingest-appril.ts", "ingest-cdpr.ts", "derive-resistance-codes.ts", "pesticide-xlsx-stream.ts"];
const DATA_DIR = join(LANE_DIR, "data");

/** Strip comments before scanning — a guard that fires on prose about the rule is a guard people
 * learn to ignore. Only CODE is evidence. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ");
}

function laneModules(): { file: string; src: string }[] {
  return readdirSync(LANE_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ file: `src/lib/pesticide/${f}`, src: stripComments(readFileSync(join(LANE_DIR, f), "utf8")) }));
}

function laneScripts(): { file: string; src: string }[] {
  return LANE_SCRIPTS.map((f) => ({ file: `scripts/${f}`, src: stripComments(readFileSync(join(REPO, "scripts", f), "utf8")) }));
}

interface CitedRow {
  sourceUrl?: string;
  sourceAsOf?: string;
  reviewedBy?: string | null;
  confirmed?: boolean;
}

function artifact(name: string): CitedRow[] {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as CitedRow[];
}

describe("K7 — lookup.ts is the ONLY prisma importer in the lane", () => {
  it("no other module under src/lib/pesticide/ imports @/lib/prisma", () => {
    const offenders = laneModules()
      .filter((m) => !m.file.endsWith("lookup.ts"))
      .filter((m) => /@\/lib\/prisma|from ["']\.\.?\/prisma/.test(m.src))
      .map((m) => m.file);
    expect(offenders, `these bypass the entitlement choke point: ${offenders.join(", ")}`).toEqual([]);
  });

  it("lookup.ts checks the subscription before it queries (the gate is the first thing it does)", () => {
    const src = readFileSync(join(LANE_DIR, "lookup.ts"), "utf8");
    expect(src).toContain("isPesticideSourceEnabled");
    // The entitlement guard must precede the product query in the exported read.
    const gateAt = src.indexOf("if (!(await isPesticideSourceEnabled(");
    const queryAt = src.indexOf("findProductByCanonical(reg.canonical)");
    expect(gateAt).toBeGreaterThan(-1);
    expect(queryAt).toBeGreaterThan(gateAt);
  });
});

describe("K6 — no fuzzy matcher anywhere in the lane", () => {
  it("no contains / startsWith / endsWith / insensitive mode / similarity in registration resolution", () => {
    const FUZZY = /(mode:\s*["']insensitive["'])|(\bcontains\s*:)|(\bstartsWith\s*:)|(\bendsWith\s*:)|similarity\(|levenshtein/i;
    const offenders = [...laneModules(), ...laneScripts()]
      .filter((m) => FUZZY.test(m.src))
      .map((m) => m.file);
    expect(offenders, `a near-miss that resolves confidently to the wrong product is a confidently wrong legality answer: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("licensing — positive allowlist over every artifact citation (council C10)", () => {
  const allowedHosts = new Set([
    ...TRUSTED_DOMAINS.map((d) => d.domain.toLowerCase()),
    ...KNOWLEDGE_SOURCES.map((s) => s.homeDomain.toLowerCase()),
  ]);

  it("every sourceUrl host in every artifact resolves to a seeded source / trusted domain", () => {
    const offenders: string[] = [];
    for (const file of ["resistance-codes.json", "ai-normalization.json", "trade-name-map.json"]) {
      for (const row of artifact(file)) {
        if (!row.sourceUrl) continue;
        const host = new URL(row.sourceUrl).hostname.toLowerCase();
        if (!allowedHosts.has(host)) offenders.push(`${file}: ${host}`);
      }
    }
    // This is the mechanical proof of "no FRAC/HRAC/IRAC compilation anywhere in the diff": those
    // committee hosts are not in the registry, so a row sourced from one fails here.
    expect(offenders).toEqual([]);
  });

  it("the committee compilation hosts are NOT in the registry (so the allowlist above has teeth)", () => {
    for (const h of ["frac.info", "www.frac.info", "hracglobal.com", "irac-online.org"]) {
      expect(allowedHosts.has(h), `${h} must never become a trusted source`).toBe(false);
    }
  });
});

describe("artifact discipline — an uncited row is indistinguishable from a guess", () => {
  it("every resistance-codes row carries sourceUrl + sourceAsOf + reviewedBy", () => {
    const rows = artifact("resistance-codes.json");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.sourceUrl, JSON.stringify(r)).toBeTruthy();
      expect(r.sourceAsOf, JSON.stringify(r)).toBeTruthy();
      expect(r.reviewedBy, JSON.stringify(r)).toBeTruthy();
    }
  });

  it("every ai-normalization row carries a citation AND a stated reason (G5 — curated, not a regex)", () => {
    for (const r of artifact("ai-normalization.json") as (CitedRow & { reason?: string; citedParent?: string })[]) {
      expect(r.sourceUrl).toBeTruthy();
      expect(r.reviewedBy).toBeTruthy();
      expect(r.reason && r.reason.length > 20, `normalization needs a stated reason: ${JSON.stringify(r)}`).toBe(true);
      expect(r.citedParent).toBeTruthy();
    }
  });

  it("no trade-name row is confirmed without a reviewer and a reg number (G6 — never auto-applied)", () => {
    for (const r of artifact("trade-name-map.json") as (CitedRow & { epaRegNumber?: string | null })[]) {
      if (r.confirmed) {
        expect(r.reviewedBy, `a confirmed trade-name mapping needs a human: ${JSON.stringify(r)}`).toBeTruthy();
        expect(r.epaRegNumber, `a confirmed trade-name mapping needs a reg number: ${JSON.stringify(r)}`).toBeTruthy();
      }
    }
  });
});
