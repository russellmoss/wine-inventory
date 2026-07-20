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
import { findDarkSources } from "@/lib/knowledge/crawl/challenge";
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
          url: doc.canonicalUrl, contentHash: doc.contentHash, sourceKey: doc.sourceKey,
        });
        if (r.skipped === "unchanged") unchanged++;
        else if (!r.skipped) {
          reEmbedded++;
          chunks += r.chunks;
        }
      } catch (e) {
        crawlErrors++;
        // was a bare `catch {}` — the unattended monthly sweep reported a filter regression as
        // nothing but an opaque error count, indistinguishable from a network flake.
        console.log(`  ! index failed for ${doc.canonicalUrl}: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
      }
    },
  });

  // 2. Tombstone pass — existence-check the active docs the crawl didn't reach this run.
  // ONLY trustworthy after a COMPLETE crawl: if the run was doc-capped (smoke) or hit its cap, "not
  // reached" just means "we stopped early", not "removed" — skipping avoids ~1k needless fetches and,
  // worse, wrongly tombstoning live pages the capped crawl never got to.
  const capped = Boolean(process.env.KB_MAX_DOCS) || crawl.hitCap;

  // Plan 085 — a source that hit a bot wall is in EXACTLY the same position as a capped crawl: we
  // did not establish what is still live, so "not reached" is not a removal signal. Excluding it is
  // per-source rather than global so one flaky source cannot suppress legitimate tombstoning across
  // the other nineteen.
  const challengedKeys = Object.entries(crawl.summaries)
    .filter(([, s]) => s.skippedChallenge > 0)
    .map(([key]) => key);
  const challengedIds = new Set(autoSources.filter((a) => challengedKeys.includes(a.key)).map((a) => a.id));
  const tombstoneSourceIds = autoSourceIds.filter((id) => !challengedIds.has(id));
  if (challengedKeys.length) {
    console.log(
      `tombstone pass EXCLUDES [${challengedKeys.join(", ")}] — challenged by a bot wall this run ` +
        "(cannot distinguish 'removed' from 'blocked')",
    );
  }

  const stale = capped
    ? []
    : await runAsSystem((db) =>
        db.knowledgeDocument.findMany({
          // Only auto-crawl sources: a curated source's docs are never "reached" by this crawl, so
          // existence-checking them here would tombstone/refetch the whole curated set every week.
          where: { status: "active", lastVerifiedAt: { lt: runStart }, sourceId: { in: tombstoneSourceIds } },
          select: { id: true, canonicalUrl: true },
        }),
      );
  if (capped) console.log("tombstone pass SKIPPED — crawl was capped/incomplete (not a trustworthy removal signal)");
  let withdrawn = 0;
  let stillLive = 0;
  let challengedProbes = 0;
  for (const d of stale) {
    let gone = false;
    let challenged = false;
    try {
      // throws on 404 / non-2xx / bad host. A bot wall does NOT throw — it answers 200 with an
      // interstitial, which is why the result has to be inspected rather than discarded.
      const probe = await fetchDocument(d.canonicalUrl, { isAllowedHost });
      challenged = Boolean(probe.challenge);
    } catch {
      gone = true;
    }
    if (challenged) {
      // Neither liveness nor removal was established: a bot wall answered, not the origin. Leave
      // lastVerifiedAt ALONE so this doc is re-checked next run rather than looking freshly
      // verified, and obviously do not withdraw it.
      challengedProbes++;
      await sleep(1000);
      continue;
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

  // Plan 085 — per-source, not just a total: a global count cannot say WHICH source went dark, and
  // that is the only actionable part. crawl.summaries used to be computed and thrown away entirely.
  const skippedChallenge = Object.fromEntries(
    Object.entries(crawl.summaries)
      .filter(([, s]) => s.skippedChallenge > 0)
      .map(([key, s]) => [key, s.skippedChallenge]),
  );
  const darkSources = findDarkSources(crawl.summaries);

  const summary = {
    sources: keys,
    reEmbedded,
    chunks,
    unchanged,
    crawlErrors,
    tombstoneSkipped: capped,
    tombstoneExcludedSources: challengedKeys,
    checkedNotReached: stale.length,
    withdrawn,
    stillLive,
    challengedProbes,
    skippedChallenge,
    darkSources,
    newCandidateDomains: crawl.candidateDomains, // count queued to CandidateSource for human review
    finishedAt: new Date().toISOString(),
  };
  console.log("\n::KB_RECRAWL_SUMMARY::" + JSON.stringify(summary));
  await disconnectSystem();

  // Exit AFTER the marker is printed, so the workflow's grep still captures the summary and the
  // issue it files carries the full detail. `set -o pipefail` in the workflow propagates this.
  if (darkSources.length) {
    console.error(
      `\nFAIL: source(s) shut out by a bot wall with zero documents indexed: ${darkSources.join(", ")}. ` +
        "Most likely the runner's datacenter IP is being refused where a residential IP is not. " +
        "This is deliberately loud — a source silently going dark is how a corpus rots.",
    );
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
