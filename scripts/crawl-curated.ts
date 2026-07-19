/**
 * Plan 079 (source expansion 2) — generic CURATED-source crawler, driven by src/lib/knowledge/curated-specs.ts.
 *
 *   npm run crawl:curated -- <sourceKey> --dry-run   # print the collected URL list, fetch nothing
 *   npm run crawl:curated -- <sourceKey>             # crawl + index the collected URLs
 *   KB_MAX_DOCS=5 npm run crawl:curated -- <sourceKey>
 *
 * A spec yields URLs two ways: a fixed `directUrls` list, and/or a `discover` pass that fetches hub pages,
 * follows same-host content links (bounded depth), and collects document URLs — filtered by path substring
 * and NATIVE-LANGUAGE wine keywords. Then crawlUrls fetches + indexes them (honoring robots for our UA + the
 * per-host crawl-delay, unless the spec sets ignoreRobots for robots-disallowed-but-public state PDFs).
 */
import { crawlUrls } from "@/lib/knowledge/crawl/crawler";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { extractLinks } from "@/lib/knowledge/crawl/link-gate";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import { findCuratedSpec, type CuratedDiscover } from "@/lib/knowledge/curated-specs";
import { disconnectSystem } from "@/lib/tenant/system";

const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

/** BFS from the seeds: follow matching same-host hubs to `depth`, collect passing document URLs. */
async function discover(d: CuratedDiscover, delayMs: number): Promise<string[]> {
  const depth = d.depth ?? 1;
  const collected = new Set<string>();
  const seenHubs = new Set<string>();
  let frontier = [...d.seeds];
  for (let level = 0; level <= depth && frontier.length; level++) {
    const next: string[] = [];
    for (const hubUrl of frontier) {
      if (seenHubs.has(hubUrl)) continue;
      seenHubs.add(hubUrl);
      let html: string;
      try {
        const res = await fetchDocument(hubUrl, { isAllowedHost });
        html = res.bytes.toString("utf8");
      } catch (e) {
        console.log(`  ! hub fetch failed ${hubUrl}: ${e instanceof Error ? e.message.slice(0, 70) : e}`);
        continue;
      }
      for (const link of extractLinks(html, hubUrl)) {
        let u: URL;
        try { u = new URL(link.split("#")[0]); } catch { continue; }
        if (!isAllowedHost(u.hostname.toLowerCase())) continue;
        const p = u.pathname;
        const isPdf = p.toLowerCase().endsWith(".pdf");
        // collect as a document?
        const wantDoc = d.pdfOnly ? isPdf : true;
        const keepOk = !d.keepPathContains || d.keepPathContains.some((s) => p.includes(s));
        const posOk = !d.pos || d.pos.test(dec(p));
        const negOk = !d.neg || !d.neg.test(dec(p));
        if (wantDoc && keepOk && posOk && negOk) collected.add(u.toString());
        // follow as a hub to the next level?
        if (level < depth && !isPdf && d.followPathContains?.some((s) => p.includes(s)) && negOk) {
          next.push(u.toString());
        }
      }
      await sleep(delayMs);
    }
    frontier = next;
  }
  return [...collected];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sourceKey = args.find((a) => !a.startsWith("--"));
  if (!sourceKey) throw new Error("usage: crawl-curated.ts <sourceKey> [--dry-run]");
  const spec = findCuratedSpec(sourceKey);
  if (!spec) throw new Error(`no curated spec for "${sourceKey}"`);
  const delayMs = spec.delayMs ?? 1500;

  console.log(`crawl:curated ${sourceKey} — collecting URLs...`);
  const urls = new Set<string>(spec.directUrls ?? []);
  if (spec.discover) for (const u of await discover(spec.discover, delayMs)) urls.add(u);
  let list = [...urls];
  console.log(`collected ${list.length} URLs${spec.ignoreRobots ? " (ignoreRobots)" : ""}:`);
  for (const u of list) console.log("  + " + u.replace(/^https?:\/\/[^/]+/, ""));

  const max = Number(process.env.KB_MAX_DOCS) || Infinity;
  if (Number.isFinite(max)) list = list.slice(0, max);
  if (dryRun) { console.log("\n[dry-run] no fetch/index."); await disconnectSystem(); return; }
  if (!list.length) { console.log("no URLs — aborting"); await disconnectSystem(); return; }

  const indexed = { docs: 0, chunks: 0, unchanged: 0, lowConf: 0, empty: 0, errors: 0 };
  const summary = await crawlUrls(sourceKey, list, {
    ignoreRobots: spec.ignoreRobots,
    delayMs,
    maxBytes: spec.maxBytes,
    onDocument: async (doc) => {
      try {
        const r = await indexDocument({
          documentId: doc.documentId, bytes: doc.bytes, contentType: doc.contentType,
          url: doc.canonicalUrl, contentHash: doc.contentHash,
        });
        if (r.skipped === "unchanged") indexed.unchanged++;
        else if (r.skipped === "low-confidence") indexed.lowConf++;
        else if (r.skipped === "empty") indexed.empty++;
        else { indexed.docs++; indexed.chunks += r.chunks; }
      } catch (e) {
        indexed.errors++;
        console.log(`  ! index failed for ${doc.canonicalUrl}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      }
      const done = indexed.docs + indexed.unchanged + indexed.lowConf + indexed.empty + indexed.errors;
      if (done % 20 === 0) console.log(`  progress: ${indexed.docs} indexed (${indexed.chunks} chunks), ${indexed.errors} errors`);
    },
  });

  console.log(`\ndone: ${JSON.stringify({ crawl: summary, index: indexed })}`);
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
