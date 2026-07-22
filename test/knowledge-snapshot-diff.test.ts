import { describe, it, expect } from "vitest";
import {
  documentProfile,
  profileKey,
  diffQuery,
  diffSnapshots,
  formatDiff,
  type SnapshotResult,
  type QuerySnapshot,
} from "../scripts/kb-snapshot-diff";

// Plan 090 Unit 1. The existing eval gate (scripts/verify-knowledge-base.ts) asserts only "the expected
// document is somewhere in top-k and the expected facts appear". On its own PASSING YAN control case,
// 4 of 8 returned passages are junk (an AWRI copyright page, an OWRI website announcement, an off-topic
// VT phenolics passage) — the suite cannot see them. This diff is the instrument that can.
//
// IDENTITY IS THE LOAD-BEARING DECISION HERE. A result cannot be keyed on chunk id
// (`sha256(documentId + revision + ordinal + text)`, schema.prisma:3340) because the re-index this plan
// performs bumps `revision` for every document, so every chunk id changes by construction. It cannot be
// keyed on `sectionPath` either — fixing the PDF breadcrumb collapse is the entire point, so sectionPath
// changing IS the change we are measuring. `canonicalUrl` is the only stable identity across a re-index.
//
// Consequence: the diff is DOCUMENT-level. A document appearing twice in top-k (which is exactly what
// the 08612p99f duplicate was) is expressed as a count, not as two independent rows.

function r(rank: number, url: string, publisher: string, over: Partial<SnapshotResult> = {}): SnapshotResult {
  return {
    rank,
    publisher,
    tier: 1,
    canonicalUrl: url,
    sectionPath: "§",
    publishedAt: null,
    dateSource: "unknown",
    textHash: `h${rank}`,
    ...over,
  };
}

const AWRI_VA = "https://www.awri.com.au/.../va/";
const OWRI_N = "https://ir.library.oregonstate.edu/downloads/08612p99f";
const VT_105 = "https://enology.fst.vt.edu/EN/105.html";

describe("documentProfile", () => {
  it("collapses repeated documents to best rank + count", () => {
    const prof = documentProfile([r(1, AWRI_VA, "AWRI"), r(2, OWRI_N, "OWRI"), r(5, OWRI_N, "OWRI")]);
    expect(prof.get(OWRI_N)).toEqual({ bestRank: 2, count: 2, publisher: "OWRI" });
    expect(prof.get(AWRI_VA)).toEqual({ bestRank: 1, count: 1, publisher: "AWRI" });
  });

  it("keeps the BEST rank when duplicates arrive out of order", () => {
    // Guards the obvious off-by-one: taking the last seen rather than the minimum would report 8.
    const prof = documentProfile([r(8, OWRI_N, "OWRI"), r(3, OWRI_N, "OWRI")]);
    expect(prof.get(OWRI_N)?.bestRank).toBe(3);
  });

  it("is empty for an empty result set", () => {
    expect(documentProfile([]).size).toBe(0);
  });
});

describe("diffQuery", () => {
  const before: QuerySnapshot = {
    query: "q",
    results: [r(1, AWRI_VA, "AWRI"), r(2, OWRI_N, "OWRI"), r(3, VT_105, "Virginia Tech Enology")],
  };

  it("reports nothing when the ranking is identical", () => {
    expect(diffQuery(before, before).movements).toEqual([]);
  });

  it("ignores changes to fields that are expected to churn", () => {
    // sectionPath and textHash both change when the chunker is fixed. If the diff keyed on them, the
    // Unit 9 re-index would report every single result as changed and the artifact would be useless.
    const after: QuerySnapshot = {
      query: "q",
      results: before.results.map((x) => ({ ...x, sectionPath: "totally different", textHash: "zzz" })),
    };
    expect(diffQuery(before, after).movements).toEqual([]);
  });

  it("detects a document leaving top-k", () => {
    const after: QuerySnapshot = { query: "q", results: [r(1, AWRI_VA, "AWRI"), r(2, OWRI_N, "OWRI")] };
    const m = diffQuery(before, after).movements;
    expect(m).toEqual([{ kind: "left", canonicalUrl: VT_105, publisher: "Virginia Tech Enology", from: 3 }]);
  });

  it("detects a document entering top-k", () => {
    const after: QuerySnapshot = { query: "q", results: [...before.results, r(4, "https://new/doc", "Scott Laboratories")] };
    const m = diffQuery(before, after).movements;
    expect(m).toEqual([{ kind: "entered", canonicalUrl: "https://new/doc", publisher: "Scott Laboratories", to: 4 }]);
  });

  it("distinguishes improved from worsened, and says which", () => {
    // The whole point of the artifact: AWRI dropping 1 -> 3 is the regression a pass/fail suite hides.
    const after: QuerySnapshot = {
      query: "q",
      results: [r(1, OWRI_N, "OWRI"), r(2, VT_105, "Virginia Tech Enology"), r(3, AWRI_VA, "AWRI")],
    };
    const m = diffQuery(before, after).movements;
    expect(m).toContainEqual({ kind: "worsened", canonicalUrl: AWRI_VA, publisher: "AWRI", from: 1, to: 3 });
    expect(m).toContainEqual({ kind: "improved", canonicalUrl: OWRI_N, publisher: "OWRI", from: 2, to: 1 });
    expect(m).toContainEqual({ kind: "improved", canonicalUrl: VT_105, publisher: "Virginia Tech Enology", from: 3, to: 2 });
  });

  it("reports a duplicate document collapsing to one slot", () => {
    // This is the 08612p99f case: the same OWRI report held ranks 5 AND 8. Fixing the PDF breadcrumb
    // should free one of those slots, and that is a WIN that a rank-only diff would not show.
    const dupBefore: QuerySnapshot = { query: "q", results: [r(5, OWRI_N, "OWRI"), r(8, OWRI_N, "OWRI")] };
    const dupAfter: QuerySnapshot = { query: "q", results: [r(5, OWRI_N, "OWRI")] };
    expect(diffQuery(dupBefore, dupAfter).movements).toEqual([
      { kind: "duplication", canonicalUrl: OWRI_N, publisher: "OWRI", from: 2, to: 1 },
    ]);
  });

  it("tracks publishers gained and lost", () => {
    // The nutrient case's actual defect: AWRI absent entirely. Publisher-level movement is what the
    // multi-publisher assertion in Unit 2 keys on, so the diff has to surface it directly.
    const after: QuerySnapshot = { query: "q", results: [r(1, OWRI_N, "OWRI"), r(2, "https://awri/yan", "AWRI")] };
    const d = diffQuery(before, after);
    expect(d.publishersGained).toEqual([]);
    expect(d.publishersLost).toEqual(["Virginia Tech Enology"]);
  });

  it("orders movements by URL, not by insertion, so the artifact diffs cleanly in git", () => {
    // The snapshot is committed and reviewed as a git diff. If movement order tracked rank order, an
    // unrelated reshuffle upstream would rewrite the whole file and bury the real change in noise.
    const after: QuerySnapshot = {
      query: "q",
      results: [r(1, "https://zzz/doc", "Zed"), r(2, "https://aaa/doc", "Alpha"), r(3, AWRI_VA, "AWRI")],
    };
    const urls = diffQuery(before, after).movements.map((m) => m.canonicalUrl);
    expect(urls).toEqual([...urls].sort());
    expect(urls).toContain("https://aaa/doc");
    expect(urls).toContain("https://zzz/doc");
  });
});

describe("diffSnapshots", () => {
  const mk = (query: string, results: SnapshotResult[]): QuerySnapshot => ({ query, results });

  it("returns an empty array when two snapshots are identical", () => {
    const s = { entries: [mk("a", [r(1, AWRI_VA, "AWRI")]), mk("b", [r(1, OWRI_N, "OWRI")])] };
    expect(diffSnapshots(s, s)).toEqual([]);
  });

  it("only includes queries that actually moved", () => {
    const before = { entries: [mk("a", [r(1, AWRI_VA, "AWRI")]), mk("b", [r(1, OWRI_N, "OWRI")])] };
    const after = { entries: [mk("a", [r(1, AWRI_VA, "AWRI")]), mk("b", [r(1, VT_105, "Virginia Tech Enology")])] };
    const d = diffSnapshots(before, after);
    expect(d).toHaveLength(1);
    expect(d[0].query).toBe("b");
  });

  it("flags a query that is new or removed rather than silently skipping it", () => {
    // A dropped eval case must never look like "no change" — that is how coverage quietly disappears.
    const before = { entries: [mk("a", [r(1, AWRI_VA, "AWRI")])] };
    const after = { entries: [mk("b", [r(1, AWRI_VA, "AWRI")])] };
    const d = diffSnapshots(before, after);
    expect(d.map((x) => `${x.query}:${x.status}`).sort()).toEqual(["a:removed", "b:added"]);
  });
});

// Plan 090 Unit 1b. MEASURED, not assumed: repeated captures against an unchanged corpus disagree on
// roughly 1 query in 18. Ruled out by direct experiment — the embedding API returns bit-identical
// vectors (cosine 1.000000000000 across calls), both SQL arms return identical chunk-id lists across 4
// in-process executions, and the corpus had no write in 2 days. The residual source is UNIDENTIFIED.
//
// So the instrument does not get to assume determinism. It captures each query several times and only
// trusts a query whose DOCUMENT PROFILE (the thing the diff actually compares) is identical every time.
// An unstable query is recorded and reported, never silently dropped — a query quietly vanishing from
// the artifact is how a coverage hole hides.
describe("profileKey (stability predicate)", () => {
  it("is identical for the same profile regardless of input order", () => {
    // Stability must be judged on what the diff compares, not on raw row order. Two captures that
    // return the same documents at the same best ranks are equivalent for diff purposes even if the
    // underlying rows arrived differently.
    const a = [r(1, AWRI_VA, "AWRI"), r(2, OWRI_N, "OWRI")];
    const b = [r(2, OWRI_N, "OWRI"), r(1, AWRI_VA, "AWRI")];
    expect(profileKey(a)).toBe(profileKey(b));
  });

  it("differs when a document's best rank changes", () => {
    expect(profileKey([r(1, AWRI_VA, "AWRI")])).not.toBe(profileKey([r(2, AWRI_VA, "AWRI")]));
  });

  it("differs when a document occupies a different number of slots", () => {
    const once = [r(5, OWRI_N, "OWRI")];
    const twice = [r(5, OWRI_N, "OWRI"), r(8, OWRI_N, "OWRI")];
    expect(profileKey(once)).not.toBe(profileKey(twice));
  });

  it("differs when a document is swapped for another", () => {
    expect(profileKey([r(1, AWRI_VA, "AWRI")])).not.toBe(profileKey([r(1, VT_105, "VT")]));
  });
});

describe("diffSnapshots with unstable queries", () => {
  const stable: QuerySnapshot = { query: "q", results: [r(1, AWRI_VA, "AWRI")] };

  it("refuses to compare a query flagged unstable on EITHER side", () => {
    // A wobbling query must not be able to manufacture a movement that reads as a regression.
    const before = { entries: [stable] };
    const after = { entries: [{ query: "q", results: [r(1, OWRI_N, "OWRI")], unstable: true }] };
    const d = diffSnapshots(before, after);
    expect(d).toHaveLength(1);
    expect(d[0].status).toBe("unstable");
    expect(d[0].movements).toEqual([]);
  });

  it("flags unstable even when the baseline side is the unstable one", () => {
    const before = { entries: [{ ...stable, unstable: true }] };
    const after = { entries: [{ query: "q", results: [r(1, OWRI_N, "OWRI")] }] };
    expect(diffSnapshots(before, after)[0].status).toBe("unstable");
  });

  it("still compares stable queries normally alongside unstable ones", () => {
    const before = { entries: [stable, { query: "z", results: [r(1, VT_105, "VT")] }] };
    const after = {
      entries: [
        { query: "q", results: [r(1, OWRI_N, "OWRI")], unstable: true },
        { query: "z", results: [r(3, VT_105, "VT")] },
      ],
    };
    const d = diffSnapshots(before, after);
    expect(d.find((x) => x.query === "q")?.status).toBe("unstable");
    expect(d.find((x) => x.query === "z")?.movements).toEqual([
      { kind: "worsened", canonicalUrl: VT_105, publisher: "VT", from: 1, to: 3 },
    ]);
  });
});

describe("formatDiff", () => {
  it("reports unstable queries separately and excludes them from the moved count", () => {
    // The count is what a human reads first. Counting a query that merely wobbled as a query that
    // "moved" is precisely the misreading that cost plan 088 a wrong conclusion.
    const out = formatDiff([
      { query: "wobbler", status: "unstable", movements: [], publishersGained: [], publishersLost: [] },
      {
        query: "mover",
        status: "changed",
        movements: [{ kind: "worsened", canonicalUrl: AWRI_VA, publisher: "AWRI", from: 1, to: 4 }],
        publishersGained: [],
        publishersLost: [],
      },
    ]);
    expect(out).toMatch(/unstable/i);
    expect(out).toContain("wobbler");
    expect(out).toMatch(/1 query moved/);
  });

  it("says so explicitly when everything stable was unchanged but something wobbled", () => {
    const out = formatDiff([
      { query: "wobbler", status: "unstable", movements: [], publishersGained: [], publishersLost: [] },
    ]);
    expect(out).toMatch(/no change/i);
    expect(out).toMatch(/unstable/i);
  });
  it("renders an empty diff as an explicit no-change line, not blank output", () => {
    // A silent empty string reads as "the script broke". Say so.
    expect(formatDiff([])).toMatch(/no change/i);
  });

  it("renders each movement with its direction and ranks", () => {
    const out = formatDiff([
      {
        query: "what is the best way to measure volatile acidity",
        status: "changed",
        movements: [
          { kind: "worsened", canonicalUrl: AWRI_VA, publisher: "AWRI", from: 1, to: 4 },
          { kind: "entered", canonicalUrl: "https://new/doc", publisher: "Scott Laboratories", to: 2 },
        ],
        publishersGained: ["Scott Laboratories"],
        publishersLost: [],
      },
    ]);
    expect(out).toContain("volatile acidity");
    expect(out).toContain("AWRI");
    expect(out).toContain("1");
    expect(out).toContain("4");
    expect(out).toContain("Scott Laboratories");
  });
});
