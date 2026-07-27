/**
 * KB-1 auditor - is a product-fact table sitting in the corpus?
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { assessProductTable } from "@/lib/knowledge/boundary/product-table-core";
import { summarizeBoundaryAudit, type AuditRow } from "@/lib/knowledge/boundary/audit-core";
import { boundaryModeFor } from "@/lib/knowledge/boundary/enforcing";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { TRUSTED_DOMAIN_SET, KNOWLEDGE_SOURCES } from "@/lib/knowledge/config";

const RED = "\x1b[31m", GRN = "\x1b[32m", YEL = "\x1b[33m", DIM = "\x1b[2m", RST = "\x1b[0m";
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
  chunkCount: number;
}

async function loadDocuments(): Promise<DocRow[]> {
  const rows = await runAsSystem((db) =>
    db.knowledgeDocument.findMany({
      where: { status: "active" },
      select: { id: true, canonicalUrl: true, source: { select: { key: true } }, _count: { select: { chunks: true } } },
      orderBy: { canonicalUrl: "asc" },
    }),
  );
  return rows.map((r) => ({ id: r.id, canonicalUrl: r.canonicalUrl, sourceKey: r.source.key, chunkCount: r._count.chunks }));
}

/**
 * The correct seam: raw bytes off the wire.
 *
 * A ZERO-CHUNK document is skipped before the fetch. index-documents.ts inline gate clears a
 * documents chunks and returns skipped: "product-table" while deliberately LEAVING the document row
 * in place (so a re-crawl has something to attach a revision to) - that is the gate succeeding, not a
 * leak. A live re-fetch of the raw page will correctly detect the same table shape the ingest gate
 * already found, because it is the identical pure function on the identical bytes. Auditing that as a
 * hit would report the gate catching a table as the gate LEAKING one - the exact inversion this
 * script exists to prevent. What actually matters is retrievable content, so a document with nothing
 * stored has nothing to leak and is reported separately, never fetched.
 */
async function auditLive(doc: DocRow): Promise<AuditRow> {
  const base = { documentId: doc.id, sourceKey: doc.sourceKey, canonicalUrl: doc.canonicalUrl };
  if (doc.chunkCount === 0) return { ...base, verdict: "empty" };
  try {
    const res = await fetchDocument(doc.canonicalUrl, { isAllowedHost });
    if (res.challenge || res.contentType === "other") return { ...base, verdict: "unaudited" };
    const text = res.bytes.toString("utf8");
    const v = assessProductTable(res.contentType === "html" ? { kind: "html", html: text } : { kind: "text", text });
    return { ...base, verdict: v.verdict };
  } catch {
    return { ...base, verdict: "unaudited" };
  }
}

/** The approximate seam: post-extraction chunk text. Under-reports, worst on PDFs. */
async function auditFromChunks(doc: DocRow): Promise<AuditRow> {
  const base = { documentId: doc.id, sourceKey: doc.sourceKey, canonicalUrl: doc.canonicalUrl };
  if (doc.chunkCount === 0) return { ...base, verdict: "empty" };
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

  const configKeys = new Set(KNOWLEDGE_SOURCES.map((s) => s.key));
  const orphaned = [...new Set(all.map((d) => d.sourceKey))].filter((k) => !configKeys.has(k));
  if (orphaned.length > 0) {
    console.log(`\n${YEL}found ${orphaned.length} source(s) in the DB with NO config entry:${RST}`);
    for (const k of orphaned) {
      const n = all.filter((d) => d.sourceKey === k).length;
      const mode = boundaryModeFor(k);
      console.log(
        `    ${k.padEnd(26)} ${String(n).padStart(4)} docs  -> ${mode}` +
          (mode === "enforce"
            ? `  ${RED}(enforcing an undeclared source - add it to the census or to config)${RST}`
            : `  ${DIM}(named in BOUNDARY_LEGACY_DB_ONLY_KEYS)${RST}`),
      );
    }
  }

  console.log(`\n${DIM}KB-1 boundary audit - ${scoped.length} active documents${RST}`);
  console.log(`${DIM}  enforcing: ${enforcing.length} (live re-fetch)  report-only: ${reportOnly.length}${includeReportOnly ? " (approximate, from chunk text)" : " - skipped, pass --report-only"}${RST}\n`);

  const rows: AuditRow[] = [];
  for (const doc of enforcing) {
    rows.push(await auditLive(doc));
    if (doc.chunkCount > 0) await sleep(FETCH_SPACING_MS);
  }
  if (includeReportOnly) {
    for (const doc of reportOnly) rows.push(await auditFromChunks(doc));
  }

  const summary = summarizeBoundaryAudit(rows);

  for (const t of summary.perSource) {
    const flagged = t.productTable + t.uncertain;
    const colour = t.mode === "enforce" && flagged > 0 ? RED : flagged > 0 ? YEL : GRN;
    const approx = t.mode === "report-only" ? `${DIM} (approximate - floor, not a total)${RST}` : "";
    console.log(
      `${colour}${t.mode === "enforce" ? "ENFORCE " : "report  "}${RST} ${t.sourceKey.padEnd(28)} ` +
        `${String(t.total).padStart(5)} docs  product-table ${t.productTable}  uncertain ${t.uncertain}  unaudited ${t.unaudited}  empty ${t.empty}${approx}`,
    );
  }

  if (summary.enforcingUnaudited.length > 0) {
    console.log(
      `\n${YEL}${summary.enforcingUnaudited.length} enforcing document(s) could not be re-read - the audit cannot vouch for them.${RST}`,
    );
    for (const r of summary.enforcingUnaudited.slice(0, 10)) console.log(`  ${DIM}${r.canonicalUrl}${RST}`);
  }

  if (includeReportOnly) {
    console.log(
      `\n${DIM}D3 census - flagged documents across the report-only incumbents: ${RST}${summary.reportOnlyFlagged}` +
        `\n${DIM}  Read as a FLOOR. This arm reads post-extraction chunk text (blobUrl is null corpus-wide), which${RST}` +
        `\n${DIM}     has no pipe tables and no headings, so it under-reports and does so worst on PDFs.${RST}` +
        `\n${DIM}  This is the number D3 close-out decides against: enforce, or a named per-document exclusion${RST}` +
        `\n${DIM}     with a recorded reason. Report-only is a single-PR state, not a resting one.${RST}`,
    );
  }

  if (summary.exitCode === 0) {
    console.log(`\n${GRN}PASS${RST} - no product-fact table on any enforcing source.\n`);
  } else {
    console.log(`\n${RED}FAIL${RST} - ${summary.enforcingHits.length} flagged document(s) on an ENFORCING source.`);
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
