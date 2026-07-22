// Plan 090 Unit 1 — pure diff logic for the ranked retrieval snapshot.
//
// WHY THIS EXISTS. scripts/verify-knowledge-base.ts asserts "the expected document is somewhere in
// top-k and the expected facts appear". That is a floor, not a measurement: on its own PASSING YAN
// control case, 4 of the 8 returned passages are junk (an AWRI copyright-notice page, an OWRI
// announcement about a website, an off-topic VT passage on phenolic spectral analysis) and the suite
// is structurally blind to all of them. Retrieval here is deterministic — pgvector cosine plus
// ts_rank, no sampling — so a full ranked capture diffs exactly, with no noise to average away.
// (Contrast the assistant LLM eval, which produced 9-12 failures across runs on IDENTICAL code.)
//
// Extracted as a pure module so it is unit-testable: scripts/kb-snapshot.ts runs main() at import,
// so the test suite cannot import from it. Same split as scripts/kb-eval-match.ts.

/** One retrieved passage, flattened to the fields worth diffing. */
export interface SnapshotResult {
  rank: number;
  publisher: string;
  tier: number;
  canonicalUrl: string;
  sectionPath: string;
  publishedAt: string | null; // ISO yyyy-mm-dd, or null
  dateSource: string;
  textHash: string; // short sha256 of the chunk body — for human reading, NOT for identity (see below)
}

export interface QuerySnapshot {
  query: string;
  results: SnapshotResult[];
}

export interface Snapshot {
  capturedAt?: string;
  entries: QuerySnapshot[];
}

export interface DocProfile {
  bestRank: number;
  count: number;
  publisher: string;
}

export type Movement =
  | { kind: "entered"; canonicalUrl: string; publisher: string; to: number }
  | { kind: "left"; canonicalUrl: string; publisher: string; from: number }
  | { kind: "improved"; canonicalUrl: string; publisher: string; from: number; to: number }
  | { kind: "worsened"; canonicalUrl: string; publisher: string; from: number; to: number }
  /** Same document occupying a different NUMBER of top-k slots. from/to are counts, not ranks. */
  | { kind: "duplication"; canonicalUrl: string; publisher: string; from: number; to: number };

export interface QueryDiff {
  query: string;
  status: "changed" | "added" | "removed";
  movements: Movement[];
  publishersGained: string[];
  publishersLost: string[];
}

/**
 * Collapse a ranked result list to one entry per DOCUMENT.
 *
 * IDENTITY IS THE LOAD-BEARING DECISION IN THIS FILE, so it is spelled out rather than assumed.
 *
 * A result cannot be keyed on chunk id: that is `sha256(documentId + revision + ordinal + text)`
 * (schema.prisma:3340), and Unit 9's re-index bumps `revision` for every document, so every chunk id
 * changes by construction. It cannot be keyed on `sectionPath` either — repairing the PDF breadcrumb
 * collapse is the entire point of this plan, so sectionPath changing IS the change being measured.
 * `textHash` has the same problem, because chunk.ts:130 prepends the breadcrumb into `text`.
 *
 * `canonicalUrl` is the only identity stable across a re-index. It is carried in the snapshot for
 * human reading; identity is the URL.
 *
 * A document may legitimately hold several top-k slots (the 08612p99f OWRI report held ranks 5 AND 8),
 * so that is recorded as a count rather than flattened away — freeing a duplicated slot is a real
 * improvement and a rank-only diff would not show it.
 */
export function documentProfile(results: SnapshotResult[]): Map<string, DocProfile> {
  const out = new Map<string, DocProfile>();
  for (const r of results) {
    const prev = out.get(r.canonicalUrl);
    if (!prev) {
      out.set(r.canonicalUrl, { bestRank: r.rank, count: 1, publisher: r.publisher });
    } else {
      // min, not last-seen: duplicates are not guaranteed to arrive in rank order.
      prev.bestRank = Math.min(prev.bestRank, r.rank);
      prev.count += 1;
    }
  }
  return out;
}

function publishersOf(results: SnapshotResult[]): Set<string> {
  return new Set(results.map((r) => r.publisher));
}

/** Diff one query's ranked results. Movements are sorted by URL so the artifact diffs cleanly in git. */
export function diffQuery(before: QuerySnapshot, after: QuerySnapshot): QueryDiff {
  const b = documentProfile(before.results);
  const a = documentProfile(after.results);
  const movements: Movement[] = [];

  for (const [url, bp] of b) {
    const ap = a.get(url);
    if (!ap) {
      movements.push({ kind: "left", canonicalUrl: url, publisher: bp.publisher, from: bp.bestRank });
      continue;
    }
    if (ap.bestRank < bp.bestRank) {
      movements.push({ kind: "improved", canonicalUrl: url, publisher: ap.publisher, from: bp.bestRank, to: ap.bestRank });
    } else if (ap.bestRank > bp.bestRank) {
      movements.push({ kind: "worsened", canonicalUrl: url, publisher: ap.publisher, from: bp.bestRank, to: ap.bestRank });
    }
    // Independent of rank: the same document may keep its best rank while gaining or losing slots.
    if (ap.count !== bp.count) {
      movements.push({ kind: "duplication", canonicalUrl: url, publisher: ap.publisher, from: bp.count, to: ap.count });
    }
  }
  for (const [url, ap] of a) {
    if (!b.has(url)) {
      movements.push({ kind: "entered", canonicalUrl: url, publisher: ap.publisher, to: ap.bestRank });
    }
  }

  movements.sort((x, y) => x.canonicalUrl.localeCompare(y.canonicalUrl) || x.kind.localeCompare(y.kind));

  const bPub = publishersOf(before.results);
  const aPub = publishersOf(after.results);
  return {
    query: after.query || before.query,
    status: "changed",
    movements,
    publishersGained: [...aPub].filter((p) => !bPub.has(p)).sort(),
    publishersLost: [...bPub].filter((p) => !aPub.has(p)).sort(),
  };
}

/**
 * Diff two full snapshots. Returns ONLY the queries that moved — an unchanged corpus produces an
 * empty array, which is the signal that a change was inert.
 *
 * A query present in one snapshot and not the other is reported as added/removed rather than skipped.
 * Silently ignoring a dropped case is how eval coverage disappears without anyone noticing.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): QueryDiff[] {
  const bByQ = new Map(before.entries.map((e) => [e.query, e]));
  const aByQ = new Map(after.entries.map((e) => [e.query, e]));
  const out: QueryDiff[] = [];

  for (const [q, be] of bByQ) {
    const ae = aByQ.get(q);
    if (!ae) {
      out.push({
        query: q,
        status: "removed",
        movements: be.results.map((r) => ({
          kind: "left" as const,
          canonicalUrl: r.canonicalUrl,
          publisher: r.publisher,
          from: r.rank,
        })),
        publishersGained: [],
        publishersLost: [...publishersOf(be.results)].sort(),
      });
      continue;
    }
    const d = diffQuery(be, ae);
    if (d.movements.length || d.publishersGained.length || d.publishersLost.length) out.push(d);
  }
  for (const [q, ae] of aByQ) {
    if (bByQ.has(q)) continue;
    out.push({
      query: q,
      status: "added",
      movements: ae.results.map((r) => ({
        kind: "entered" as const,
        canonicalUrl: r.canonicalUrl,
        publisher: r.publisher,
        to: r.rank,
      })),
      publishersGained: [...publishersOf(ae.results)].sort(),
      publishersLost: [],
    });
  }

  out.sort((x, y) => x.query.localeCompare(y.query));
  return out;
}

const ARROW: Record<Movement["kind"], string> = {
  improved: "▲",
  worsened: "▼",
  entered: "+",
  left: "−",
  duplication: "×",
};

function slug(url: string): string {
  try {
    const parts = decodeURIComponent(url).split("/").filter(Boolean);
    return parts[parts.length - 1] ?? url;
  } catch {
    return url;
  }
}

function describe(m: Movement): string {
  switch (m.kind) {
    case "entered":
      return `entered at ${m.to}`;
    case "left":
      return `left (was ${m.from})`;
    case "improved":
    case "worsened":
      return `rank ${m.from} → ${m.to}`;
    case "duplication":
      return `slots ${m.from} → ${m.to}`;
  }
}

/**
 * Human-readable diff. A movement is NOT automatically a regression — the existing precedent is
 * verify-knowledge-base.ts:61-66, where UC IPM outranking MAPA/PNW was retrieval getting BETTER. The
 * format therefore states what moved and leaves the verdict to a person.
 */
export function formatDiff(diffs: QueryDiff[]): string {
  if (diffs.length === 0) return "no change — retrieval is identical to the committed snapshot";

  const lines: string[] = [];
  for (const d of diffs) {
    const tag = d.status === "changed" ? "" : `  [QUERY ${d.status.toUpperCase()}]`;
    lines.push(`\n"${d.query}"${tag}`);
    if (d.publishersLost.length) lines.push(`   publishers LOST:   ${d.publishersLost.join(", ")}`);
    if (d.publishersGained.length) lines.push(`   publishers GAINED: ${d.publishersGained.join(", ")}`);
    for (const m of d.movements) {
      lines.push(`   ${ARROW[m.kind]} ${m.publisher} — ${describe(m)}`);
      lines.push(`       ${slug(m.canonicalUrl)}`);
    }
  }
  lines.push(
    `\n${diffs.length} quer${diffs.length === 1 ? "y" : "ies"} moved. A movement is NOT automatically a regression —`,
  );
  lines.push("a better source displacing a worse one looks identical here. Judge each one.");
  return lines.join("\n");
}
