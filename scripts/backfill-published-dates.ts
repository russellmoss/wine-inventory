/**
 * Backfill KnowledgeDocument.publishedAt for documents indexed before the date extractor existed.
 *
 *   npm run backfill:published-dates -- --source uc-ipm          # one source
 *   npm run backfill:published-dates -- --source uc-ipm --dry    # report only, write nothing
 *   npm run backfill:published-dates                             # every active document
 *
 * WHY A SCRIPT: indexDocument() short-circuits on an unchanged contentHash (index-documents.ts:46), so
 * simply re-running a crawl will NOT re-extract already-indexed documents — their dates would stay null
 * forever. Blob snapshots are not persisted (knowledge_blob.blobUrl is null corpus-wide), so this
 * re-fetches. It does NOT re-chunk or re-embed: only publishedAt is written, so the run costs network
 * time and zero Voyage credits, and retrieval is untouched while it runs.
 *
 * Polite: reuses the crawler's SSRF-safe fetcher (honest UA, redirect gating, size cap), honors
 * robots.txt per URL, and applies the same per-host throttle as a normal crawl.
 */
import { KNOWLEDGE_SOURCES, TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { isAllowedByRobots } from "@/lib/knowledge/crawl/robots";
import { extractDocument } from "@/lib/knowledge/extract";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

const DELAY_MS = 1500; // same politeness floor as the crawler's DEFAULT_DELAY_MS
const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());

function parseArgs(argv: string[]) {
  const sourceIdx = argv.indexOf("--source");
  return {
    sourceKey: sourceIdx >= 0 ? argv[sourceIdx + 1] : null,
    dry: argv.includes("--dry"),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { sourceKey, dry } = parseArgs(process.argv.slice(2));
  if (sourceKey && !KNOWLEDGE_SOURCES.some((s) => s.key === sourceKey)) {
    throw new Error(`unknown source: ${sourceKey}`);
  }
  console.log(`backfill:published-dates — source=${sourceKey ?? "ALL"} dry=${dry}`);

  const docs = await runAsSystem((db) =>
    db.knowledgeDocument.findMany({
      where: {
        status: "active",
        publishedAt: null, // only documents still missing a date
        ...(sourceKey ? { source: { key: sourceKey } } : {}),
      },
      select: { id: true, canonicalUrl: true, source: { select: { key: true } } },
      orderBy: { id: "asc" },
    }),
  );
  console.log(`${docs.length} active document(s) with no publishedAt\n`);

  const stats = { found: 0, none: 0, robots: 0, errors: 0 };
  const lastHitByHost = new Map<string, number>();
  const samples: string[] = [];

  for (const doc of docs) {
    try {
      const host = new URL(doc.canonicalUrl).host;
      const since = Date.now() - (lastHitByHost.get(host) ?? 0);
      if (since < DELAY_MS) await sleep(DELAY_MS - since);
      lastHitByHost.set(host, Date.now());

      // Honor robots on every re-fetch. Unlike the crawler this does NOT fail open: a source we cannot
      // confirm we may fetch is simply left undated, which is the safe outcome for a cosmetic backfill.
      let robotsOk = false;
      try {
        robotsOk = await isAllowedByRobots(doc.canonicalUrl, isAllowedHost);
      } catch {
        robotsOk = false;
      }
      if (!robotsOk) {
        stats.robots++;
        continue;
      }

      const res = await fetchDocument(doc.canonicalUrl, { isAllowedHost });
      if (res.status >= 400 || res.contentType === "other") {
        stats.errors++;
        continue;
      }

      const extracted = await extractDocument(res.bytes, res.contentType, res.finalUrl);
      if (!extracted.publishedAt) {
        stats.none++;
        continue;
      }

      stats.found++;
      if (samples.length < 8) {
        samples.push(
          `  ${extracted.publishedAt.toISOString().slice(0, 10)}  ${doc.canonicalUrl.replace(/^https?:\/\//, "")}`,
        );
      }
      if (!dry) {
        await runAsSystem((db) =>
          db.knowledgeDocument.update({
            where: { id: doc.id },
            data: { publishedAt: extracted.publishedAt },
          }),
        );
      }
    } catch (e) {
      stats.errors++;
      console.log(`  ! ${doc.canonicalUrl}: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
    }

    const done = stats.found + stats.none + stats.robots + stats.errors;
    if (done % 25 === 0) console.log(`  [${done}/${docs.length}] found=${stats.found}`);
  }

  console.log(`\nsample dates recovered:\n${samples.join("\n")}`);
  console.log(`\ndone${dry ? " (DRY RUN — nothing written)" : ""}:`, JSON.stringify(stats));
  await disconnectSystem();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
