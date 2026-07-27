import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  BOUNDARY_REPORT_ONLY_SOURCE_KEYS,
  BOUNDARY_LEGACY_DB_ONLY_KEYS,
  boundaryModeFor,
  staleReportOnlyKeys,
} from "@/lib/knowledge/boundary/enforcing";
import { summarizeBoundaryAudit, type AuditRow } from "@/lib/knowledge/boundary/audit-core";
import { KNOWLEDGE_SOURCES } from "@/lib/knowledge/config";

/**
 * SKB Unit 2 — the boundary gate's scope, its audit arithmetic, and the two properties that a
 * DB-backed test could not prove any better than a structural one:
 *
 *   • enforcement is the DEFAULT (an unknown key fails closed), and
 *   • the gate signals by RETURN VALUE, never by throwing.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT COVER, so nobody reads it as more than it is: the actual
 * `indexDocument` write path needs live Postgres plus a Voyage embedding call. That end of the unit
 * is proven by `npm run verify:kb-boundary` from the main checkout (which re-reads real corpus bytes
 * and re-runs the detector), not here. What IS here is everything that can be wrong without a
 * database: the census, the fail-closed direction, and the exit-code arithmetic.
 */

describe("boundary scope — enforcement is the default", () => {
  it("a source that is not in the report-only census ENFORCES", () => {
    expect(boundaryModeFor("extension-psu")).toBe("enforce");
    expect(boundaryModeFor("vt-grape-ipm")).toBe("enforce");
  });

  it("an unknown, empty, or missing source key ENFORCES — a document we cannot attribute is the last thing to wave through", () => {
    expect(boundaryModeFor(undefined)).toBe("enforce");
    expect(boundaryModeFor(null)).toBe("enforce");
    expect(boundaryModeFor("")).toBe("enforce");
    expect(boundaryModeFor("some-source-that-never-existed")).toBe("enforce");
  });

  it("the 25 pre-SKB sources are report-only (D3, a measurement before a retroactive exclusion)", () => {
    for (const key of BOUNDARY_REPORT_ONLY_SOURCE_KEYS) {
      expect(boundaryModeFor(key), key).toBe("report-only");
    }
  });

  it("every key in the census is a real registered source — a rename must fail loudly, not silently promote a live source to enforcing", () => {
    expect(staleReportOnlyKeys()).toEqual([]);
  });

  it("the census covers every source registered today, plus the documented DB-only legacy keys", () => {
    // This is not a "keep them in sync" chore. It documents that as of SKB, report-only is a CLOSED
    // set: every future source enforces on arrival. If this fails, someone registered a source and
    // silently added it to the grandfather list, which is the thing council C3 forbade.
    const expected = [...KNOWLEDGE_SOURCES.map((s) => s.key), ...BOUNDARY_LEGACY_DB_ONLY_KEYS].sort();
    expect([...BOUNDARY_REPORT_ONLY_SOURCE_KEYS].sort()).toEqual(expected);
  });

  it("a DB-only legacy source is report-only, NOT enforcing", () => {
    // `virginia-fruit`: 69 active documents, 260 chunks, defaultEnabled=true, and NO config entry —
    // found live by the first real run of verify:kb-boundary. Before this it fell through to the
    // `enforce` default, which would arm the gate's chunk-clearing path against live content.
    for (const key of BOUNDARY_LEGACY_DB_ONLY_KEYS) {
      expect(boundaryModeFor(key), key).toBe("report-only");
    }
  });

  it("⚠️ a DB-only source is INVISIBLE to this file — the real check is verify:kb-boundary", () => {
    // Stated as a test so it is read, not buried in a comment. Every assertion above compares config
    // against config, so a source that exists only as a database row cannot be caught here by
    // construction. `virginia-fruit` was found by RUNNING the auditor, not by the suite, and the
    // auditor now reports config-orphaned sources on every run so the next one is caught by a check.
    const configKeys = new Set(KNOWLEDGE_SOURCES.map((s) => s.key));
    expect(BOUNDARY_LEGACY_DB_ONLY_KEYS.every((k) => !configKeys.has(k))).toBe(true);
  });
});

describe("boundary audit — the exit-code arithmetic", () => {
  const row = (sourceKey: string, verdict: AuditRow["verdict"], n = 1): AuditRow => ({
    documentId: `doc-${sourceKey}-${verdict}-${n}`,
    sourceKey,
    canonicalUrl: `https://example.test/${sourceKey}/${n}`,
    verdict,
  });

  it("a clean corpus exits 0", () => {
    const s = summarizeBoundaryAudit([row("uc-ipm", "prose"), row("extension-psu", "prose")]);
    expect(s.exitCode).toBe(0);
    expect(s.enforcingHits).toEqual([]);
  });

  it("a product table on an ENFORCING source exits 1 — after the inline gate this means the gate LEAKED", () => {
    const s = summarizeBoundaryAudit([row("extension-psu", "product-table")]);
    expect(s.exitCode).toBe(1);
    expect(s.enforcingHits).toHaveLength(1);
  });

  it("`uncertain` on an enforcing source also exits 1 — the gate should have skipped it", () => {
    const s = summarizeBoundaryAudit([row("vt-grape-ipm", "uncertain")]);
    expect(s.exitCode).toBe(1);
  });

  it("a product table on a REPORT-ONLY source is COUNTED, not failed — failing on it would make the D3 measurement impossible to take", () => {
    const s = summarizeBoundaryAudit([
      row("uc-ipm", "product-table", 1),
      row("uc-ipm", "uncertain", 2),
      row("cornell-grapes", "product-table", 3),
    ]);
    expect(s.exitCode).toBe(0);
    expect(s.reportOnlyFlagged).toBe(3);
  });

  it("an unreadable document is reported as `unaudited`, never folded into prose", () => {
    const s = summarizeBoundaryAudit([row("extension-psu", "unaudited"), row("uc-ipm", "unaudited")]);
    expect(s.exitCode).toBe(0); // a transient blob-fetch failure must not red the build …
    expect(s.enforcingUnaudited).toHaveLength(1); // … but a persistent one has to be visible
    const psu = s.perSource.find((p) => p.sourceKey === "extension-psu")!;
    expect(psu.unaudited).toBe(1);
    expect(psu.prose).toBe(0);
  });

  it("tallies per source, with the mode attached", () => {
    const s = summarizeBoundaryAudit([
      row("uc-ipm", "prose", 1),
      row("uc-ipm", "product-table", 2),
      row("extension-psu", "prose", 3),
    ]);
    const uc = s.perSource.find((p) => p.sourceKey === "uc-ipm")!;
    expect(uc).toMatchObject({ mode: "report-only", total: 2, prose: 1, productTable: 1 });
    expect(s.perSource.find((p) => p.sourceKey === "extension-psu")!.mode).toBe("enforce");
  });

  it("is sorted by source key so the report is diffable run to run", () => {
    const s = summarizeBoundaryAudit([row("wsu", "prose"), row("awri", "prose"), row("mapa", "prose")]);
    expect(s.perSource.map((p) => p.sourceKey)).toEqual(["awri", "mapa", "wsu"]);
  });
});

describe("the gate signals by RETURN VALUE, never by throwing", () => {
  /**
   * The hazard, stated precisely because it is the reason this is a test and not a comment: the
   * monthly re-crawl's tombstone pass wraps the fetch/index path and reads a throw as "the page was
   * removed", setting `status: "withdrawn"`. A gate that rejected by throwing would mass-tombstone a
   * source's whole corpus slice on a detector hiccup. Same contract `crawl/challenge.ts` already
   * follows for WAF detection.
   */
  const SRC = readFileSync("src/lib/knowledge/index-documents.ts", "utf8");

  it("`product-table` is a value of IndexResult.skipped, not an exception", () => {
    expect(SRC).toMatch(/skipped:\s*"unchanged"[\s\S]*?\|\s*"product-table"/);
    expect(SRC).toMatch(/return \{ chunks: 0, skipped: "product-table" \}/);
  });

  it("the boundary block contains no `throw`", () => {
    const start = SRC.indexOf("── KB-1: the tabular/prose boundary gate");
    expect(start, "the boundary gate block moved or was renamed").toBeGreaterThan(-1);
    const end = SRC.indexOf("// Plan 084 — section filtering applies to HTML only", start);
    expect(end).toBeGreaterThan(start);
    expect(SRC.slice(start, end)).not.toMatch(/\bthrow\b/);
  });

  it("the gate resolves the source key from the DB row, not from the optional caller argument", () => {
    // Two callers (crawl-ets, crawl-ives) legitimately omit `input.sourceKey`. A gate a caller can
    // bypass by forgetting an argument is not a gate.
    expect(SRC).toMatch(/source:\s*\{\s*select:\s*\{\s*key:\s*true\s*\}\s*\}/);
    expect(SRC).toMatch(/boundaryModeFor\(doc\.source\?\.key\)/);
  });

  it("the gate runs BEFORE the idempotency short-circuit, so promoting a source to enforcing actually purges it", () => {
    const gate = SRC.indexOf("const boundaryMode = boundaryModeFor");
    const idempotency = SRC.indexOf("if (doc.indexedContentHash === indexHash)");
    const extract = SRC.indexOf("await extractDocument(");
    expect(gate).toBeGreaterThan(-1);
    expect(idempotency).toBeGreaterThan(-1);
    // Before idempotency: otherwise an already-indexed tier-C document returns "unchanged" and its
    // chunks stay live and retrievable forever — D3's close-out would be a no-op.
    expect(gate).toBeLessThan(idempotency);
    // Before extraction: council C2's seam. Post-extraction text has no tables and no headings.
    expect(gate).toBeLessThan(extract);
  });
});
