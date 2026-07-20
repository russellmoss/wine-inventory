/**
 * Plan 079 Unit 12 — scheduled corpus refresh (freshness engine). Run by the knowledge-recrawl GitHub
 * Actions loop (single-flight) and manually:
 *
 *   npm run recrawl:knowledge                 # full refresh of all active sources
 *   KB_MAX_DOCS=5 npm run recrawl:knowledge   # bounded (smoke)
 *
 * 1. FRESHNESS: re-crawl active sources with link-following + conditional GET, so unchanged pages 304 (no
 *    re-embed) and changed pages re-embed into a NEW revision with the atomic flip (index-documents). New
 *    pages are added; non-allowlisted discovered domains queue as CandidateSource.
 * 2. TOMBSTONE: any active doc the crawl did NOT reach this run (lastVerifiedAt older than run start) is
 *    existence-checked directly; a 404/gone doc is WITHDRAWN (status='withdrawn', kept for audit, excluded
 *    from retrieval); one that still 200s just has its lastVerifiedAt bumped. Reversible + self-correcting
 *    (a re-reached doc goes active again next run). This avoids falsely tombstoning operator-fetched PDFs
 *    (e.g. /getmedia) that the normal crawl doesn't re-reach.
 *
 * Mutates the GLOBAL corpus only (no tenant data); never merges code. Writes go through runAsSystem (owner).
 */
import { crawlWithFollowing } from "@/lib/knowledge/crawl/crawler";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { TRUSTED_DOMAIN_SET, findSourceConfig } from "@/lib/knowledge/config";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const runStart = new Date();
  const active = await runAsSystem((db) =>
    db.knowledgeSource.findMany({ where: { active: true }, select: { id: true, key: true } }),
  );
  // Curated sources (autoCrawl === false) are populated by dedicated operator scripts (a curated URL list
  // or a paginated listing walk that path-prefix filtering can't express). Exclude them from BOTH the
  // link-following crawl AND the tombstone existence-check — the weekly loop would otherwise choke on them
  // (slow crawl-delays, big PDFs) and can't re-discover their curated URLs anyway. They stay fresh by an
  // operator re-running their script.
  const autoSources = active.filter((s) => findSourceConfig(s.key)?.autoCrawl !== false);
  const keys = autoSources.map((a) => a.key);
  const autoSourceIds = autoSources.map((a) => a.id);
  const curatedKeys = active.filter((s) => findSourceConfig(s.key)?.autoCrawl === false).map((s) => s.key);
  console.log(`recrawl:knowledge — auto sources [${keys.join(", ")}]${curatedKeys.length ? `, skipping curated [${curatedKeys.join(", ")}]` : ""}, started ${runStart.toISOString()}`);

  // 1. Freshness re-crawl.
  let reEmbedded = 0;
  let chunks = 0;
  let unchanged = 0;
  let crawlErrors = 0;
  const crawl = await crawlWithFollowing(keys, {
    maxDocs: Number(process.env.KB_MAX_DOCS) || 3000,
    delayMs: 1000,
    onDocument: async (doc) => {
      try {
        const r = await indexDocument({
          documentId: doc.documentId, bytes: doc.bytes, contentType: doc.contentType,
          url: doc.canonicalUrl, contentHash: doc.contentHash,
        });
        if (r.skipped === "unchanged") unchanged++;
        else if (!r.skipped) {
          reEmbedded++;
          chunks += r.chunks;
        }
      } catch {
        crawlErrors++;
      }
    },
  });

  // 2. Tombstone pass — existence-check the active docs the crawl didn't reach this run.
  // ONLY trustworthy after a COMPLETE crawl: if the run was doc-capped (smoke) or hit its cap, "not
  // reached" just means "we stopped early", not "removed" — skipping avoids ~1k needless fetches and,
  // worse, wrongly tombstoning live pages the capped crawl never got to.
  const capped = Boolean(process.env.KB_MAX_DOCS) || crawl.hitCap;
  const stale = capped
    ? []
    : await runAsSystem((db) =>
        db.knowledgeDocument.findMany({
          // Only auto-crawl sources: a curated source's docs are never "reached" by this crawl, so
          // existence-checking them here would tombstone/refetch the whole curated set every week.
          where: { status: "active", lastVerifiedAt: { lt: runStart }, sourceId: { in: autoSourceIds } },
          select: { id: true, canonicalUrl: true },
        }),
      );
  if (capped) console.log("tombstone pass SKIPPED — crawl was capped/incomplete (not a trustworthy removal signal)");
  let withdrawn = 0;
  let stillLive = 0;
  for (const d of stale) {
    let gone = false;
    try {
      await fetchDocument(d.canonicalUrl, { isAllowedHost }); // throws on 404 / non-2xx / bad host
    } catch {
      gone = true;
    }
    if (gone) {
      await runAsSystem((db) =>
        db.knowledgeDocument.update({ where: { id: d.id }, data: { status: "withdrawn", withdrawnAt: new Date() } }),
      );
      withdrawn++;
    } else {
      await runAsSystem((db) =>
        db.knowledgeDocument.update({ where: { id: d.id }, data: { lastVerifiedAt: new Date() } }),
      );
      stillLive++;
    }
    await sleep(1000); // polite
  }

  const summary = {
    sources: keys,
    reEmbedded,
    chunks,
    unchanged,
    crawlErrors,
    tombstoneSkipped: capped,
    checkedNotReached: stale.length,
    withdrawn,
    stillLive,
    newCandidateDomains: crawl.candidateDomains, // count queued to CandidateSource for human review
    // Plan 084 — `.pdf` links that answered with HTML, i.e. dead links hiding behind a 200 redirect.
    // Reported rather than silently dropped: a rising count is how we find out a publisher reorganized
    // their site and a chunk of the corpus is quietly rotting.
    softNotFound: Object.values(crawl.summaries).reduce((n, s) => n + s.skippedSoftNotFound, 0),
    finishedAt: new Date().toISOString(),
  };
  console.log("\n::KB_RECRAWL_SUMMARY::" + JSON.stringify(summary));
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
