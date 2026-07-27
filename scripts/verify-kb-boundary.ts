/**
 * KB-1 auditor — is a product→fact table sitting in the corpus?
 *
 *   npm run verify:kb-boundary                  # enforcing sources (live re-fetch) — the gate check
 *   npm run verify:kb-boundary -- --report-only # + the incumbent census (approximate) — the D3 number
 *   npm run verify:kb-boundary -- --source uc-ipm
 *
 * WHY AN AUDITOR EXISTS WHEN THE GATE IS INLINE. `index-documents.ts` refuses a tier-C document from an
 * enforcing source before it is ever chunked, so an enforcing hit here should be structurally
 * impossible. That is the point: this is not a second copy of the gate, it is the check that the gate
 * is REAL. A non-zero enforcing count means it leaked, and the exit code says so.
 *
 * ── ⚠️ THE SEAM PROBLEM, AND WHAT THIS SCRIPT ACTUALLY MEASURES ──
 *
 * The SKB plan assumed the auditor could re-read each document's stored bytes. It cannot:
 * `knowledge_blob.blobUrl` is NULL corpus-wide (blob snapshots were never persisted — see
 * scripts/backfill-published-dates.ts, which hit the same wall). So there are only two places to read
 * from, and they are not equally good:
 *
 *   • LIVE RE-FETCH of the canonical URL — the correct seam (raw HTML / raw PDF bytes), and the only
 *     one the detector was designed against. It costs one HTTP request per document, so it is used
 *     for the ENFORCING sources, where the count must be zero and the corpus slice is small.
 *
 *   • INDEXED CHUNK TEXT — post-extraction, which is exactly the seam council C2 ruled out for the
 *     GATE. It is admissible here only because this arm gates NOTHING: it produces the report-only
 *     census D3 decides against. It is reported as `approximate` and it UNDER-REPORTS, systematically
 *     and worst on PDFs, because `extract/pdf.ts` emits no pipe tables and no headings. Read the
 *     report-only number as a FLOOR, never as a total. That caveat is printed in the output, not just
 *     written here, because a number without it would be quietly wrong in the safe-sounding direction.
 *
 * Live re-fetch means network + politeness, so `--report-only` is opt-in rather than the default.
 * Needs DATABASE_URL: run it from the MAIN checkout, not a worktree.
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { assessProductTable } from "@/lib/knowledge/boundary/product-table-core";
import { summarizeBoundaryAudit, type AuditRow } from "@/lib/knowledge/boundary/audit-core";
import { boundaryModeFor } from "@/lib/knowledge/boundary/enforcing";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";

const RED = "\x1b[31m", GRN = "\x1b[32m", YEL = "\x1b[33m", DIM = "\x1b[2m", RST = "\x1b[0m";

/** Same politeness the crawler uses. A verify script must never be the thing that gets us blocked. */
const FETCH_SPACING_MS = 2_000;

const args = process.argv.slice(2);
const includeReportOnly = args.includes("--report-only");
const onlySource = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;

const isAllowedHost = (host: string) => TRUSTED_DOMAIN_SET.has(host.toLowerCase().replace(/^www\./, ""));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DocRow {
  id: string;
  canonicalUrl: string;
  sourceKey: string;
}

async function loadDocuments(): Promise<DocRow[]> {
  const rows = await runAsSystem((db) =>
    db.knowledgeDocument.findMany({
      where: { status: "active" },
      select: { id: true, canonicalUrl: true, source: { select: { key: true } } },
      orderBy: { canonicalUrl: "asc" },
    }),
  );
  return rows.map((r) => ({ id: r.id, canonicalUrl: r.canonicalUrl, sourceKey: r.source.key }));
}

/** The correct seam: raw bytes off the wire. */
async function auditLive(doc: DocRow): Promise<AuditRow> {
  const base = { documentId: doc.id, sourceKey: doc.sourceKey, canonicalUrl: doc.canonicalUrl };
  try {
    const res = await fetchDocument(doc.canonicalUrl, { isAllowedHost });
    // A WAF interstitial is not the document. Auditing it would score the challenge page, so it is
    // `unaudited` — the honest answer is "we did not see this document", not "it looked fine".
    if (res.challenge || res.contentType === "other") return { ...base, verdict: "unaudited" };
    const text = res.bytes.toString("utf8");
    const v = assessProductTable(res.contentType === "html" ? { kind: "html", html: text } : { kind: "text", text });
    return { ...base, verdict: v.verdict };
  } catch {
    // Never rethrow: this is an audit, and one unreachable page must not abort the census.
    return { ...base, verdict: "unaudited" };
  }
}

/** The approximate seam: post-extraction chunk text. Under-reports, worst on PDFs. */
async function auditFromChunks(doc: DocRow): Promise<AuditRow> {
  const base = { documentId: doc.id, sourceKey: doc.sourceKey, canonicalUrl: doc.canonicalUrl };
  const chunks = await runAsSystem((db) =>
    db.knowledgeDocument
      .findUnique({ where: { id: doc.id }, select: { activeRevision: true } })
      .then((d) =>
        d
          ? db.knowledgeChunk.findMany({
              where: { documentId: doc.id, revision: d.activeRevision },
              select: { text: true },
              orderBy: { ordinal: "asc" },
            })
          : [],
      ),
  );
  if (chunks.length === 0) return { ...base, verdict: "unaudited" };
  return { ...base, verdict: assessProductTable({ kind: "text", text: chunks.map((c) => c.text).join("\n") }).verdict };
}

async function main() {
  const all = await loadDocuments();
  const scoped = onlySource ? all.filter((d) => d.sourceKey === onlySource) : all;
  const enforcing = scoped.filter((d) => boundaryModeFor(d.sourceKey) === "enforce");
  const reportOnly = scoped.filter((d) => boundaryModeFor(d.sourceKey) === "report-only");

  console.log(`\n${DIM}KB-1 boundary audit — ${scoped.length} active documents${RST}`);
  console.log(`${DIM}  enforcing: ${enforcing.length} (live re-fetch)  report-only: ${reportOnly.length}${includeReportOnly ? " (approximate, from chunk text)" : " — skipped, pass --report-only"}${RST}\n`);

  const rows: AuditRow[] = [];
  for (const doc of enforcing) {
    rows.push(await auditLive(doc));
    await sleep(FETCH_SPACING_MS);
  }
  if (includeReportOnly) {
    for (const doc of reportOnly) rows.push(await auditFromChunks(doc));
  }

  const summary = summarizeBoundaryAudit(rows);

  for (const t of summary.perSource) {
    const flagged = t.productTable + t.uncertain;
    const colour = t.mode === "enforce" && flagged > 0 ? RED : flagged > 0 ? YEL : GRN;
    const approx = t.mode === "report-only" ? `${DIM} (approximate — floor, not a total)${RST}` : "";
    console.log(
      `${colour}${t.mode === "enforce" ? "ENFORCE " : "report  "}${RST} ${t.sourceKey.padEnd(28)} ` +
        `${String(t.total).padStart(5)} docs  product-table ${t.productTable}  uncertain ${t.uncertain}  unaudited ${t.unaudited}${approx}`,
    );
  }

  if (summary.enforcingUnaudited.length > 0) {
    console.log(
      `\n${YEL}${summary.enforcingUnaudited.length} enforcing document(s) could not be re-read — the audit cannot vouch for them.${RST}`,
    );
    for (const r of summary.enforcingUnaudited.slice(0, 10)) console.log(`  ${DIM}${r.canonicalUrl}${RST}`);
  }

  if (includeReportOnly) {
    console.log(
      `\n${DIM}D3 census — flagged documents across the report-only incumbents: ${RST}${summary.reportOnlyFlagged}` +
        `\n${DIM}  ⚠️ Read as a FLOOR. This arm reads post-extraction chunk text (blobUrl is null corpus-wide), which${RST}` +
        `\n${DIM}     has no pipe tables and no headings, so it under-reports and does so worst on PDFs.${RST}` +
        `\n${DIM}  This is the number D3's close-out decides against: enforce, or a named per-document exclusion${RST}` +
        `\n${DIM}     with a recorded reason. Report-only is a single-PR state, not a resting one.${RST}`,
    );
  }

  if (summary.exitCode === 0) {
    console.log(`\n${GRN}PASS${RST} — no product→fact table on any enforcing source.\n`);
  } else {
    console.log(`\n${RED}FAIL${RST} — ${summary.enforcingHits.length} flagged document(s) on an ENFORCING source.`);
    console.log(`${RED}The inline gate in index-documents.ts should have made this impossible, so it LEAKED.${RST}`);
    for (const h of summary.enforcingHits) console.log(`  ${h.verdict.padEnd(14)} ${h.sourceKey}  ${h.canonicalUrl}`);
    console.log();
  }
  process.exitCode = summary.exitCode;
}

main()
  .catch((e) => {
    console.error(`${RED}verify:kb-boundary failed:${RST}`, e);
    process.exitCode = 1;
  })
  .finally(() => disconnectSystem().catch(() => {}));
