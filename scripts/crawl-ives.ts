/**
 * Ingest IVES Technical Reviews into the global corpus.
 *
 *   npm run crawl:ives                 # enumerate via OAI-PMH and ingest every article
 *   npm run crawl:ives -- --dry-run    # list what would be ingested, write nothing
 *   KB_MAX_DOCS=5 npm run crawl:ives   # bounded smoke test
 *
 * NOT a sitemap/link crawl, and the reason is measured rather than assumed:
 *   - /sitemap.xml and /sitemap_index.xml both 404, so the auto crawler's discovery finds nothing;
 *   - /issue/archive server-renders ZERO /issue/view links (the back catalogue is client-rendered),
 *     so link-following from the seed root reaches only the current issue — ~11 of 200+ articles.
 * What IS complete and machine-readable is the journal's OAI-PMH feed. Every record carries the public
 * article URL in <dc:identifier>, so the feed enumerates the corpus exactly.
 *
 * TLS: this host serves ONLY its leaf certificate (no intermediate). fetchDocument supplies the missing
 * Sectigo intermediate via src/lib/knowledge/crawl/tls.ts — without it every fetch here dies with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE against a site that loads fine in a browser.
 *
 * Licence: CC BY. Unlike every other source in the registry this is an actual grant, so full-text
 * indexing rests on permission rather than on fair use. Attribution is the CONDITION of that grant —
 * canonicalTitle + canonicalUrl are captured here so citations can honour it.
 */
import crypto from "crypto";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { findSourceConfig, TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

const OAI = "https://ives-technicalreviews.eu/oai";
const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());

interface OaiRecord {
  url: string;
  title: string | null;
  date: Date | null;
  language: string | null;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // LAST — otherwise &amp;lt; double-decodes

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1].trim()) : null;
}

/** Walk every resumptionToken page. OJS pages at 100; the feed is the only complete index we have. */
async function listRecords(): Promise<OaiRecord[]> {
  const out: OaiRecord[] = [];
  const seen = new Set<string>();
  let url = `${OAI}?verb=ListRecords&metadataPrefix=oai_dc`;
  for (let page = 1; page <= 50; page++) {
    const res = await fetchDocument(url, { isAllowedHost });
    const xml = res.bytes.toString("utf8");
    const records = xml.split("<record>").slice(1);
    for (const r of records) {
      // A deleted record carries a status attribute and no metadata — skip rather than ingest a stub.
      if (/<header[^>]*status="deleted"/.test(r)) continue;
      const ids = [...r.matchAll(/<dc:identifier>([\s\S]*?)<\/dc:identifier>/g)].map((m) => decodeEntities(m[1].trim()));
      const link = ids.find((i) => /^https?:\/\//.test(i) && i.includes("/article/view/"));
      if (!link || seen.has(link)) continue;
      seen.add(link);
      const rawDate = tag(r, "dc:date");
      const parsed = rawDate ? new Date(rawDate) : null;
      out.push({
        url: link,
        title: tag(r, "dc:title"),
        // Only a date the record actually declared — never invent one (retrieve.ts reasons about age).
        date: parsed && !Number.isNaN(+parsed) ? parsed : null,
        language: tag(r, "dc:language"),
      });
    }
    const token = xml.match(/<resumptionToken[^>]*>([\s\S]*?)<\/resumptionToken>/)?.[1]?.trim();
    console.log(`  OAI page ${page}: ${records.length} records (running total ${out.length})`);
    if (!token) break;
    url = `${OAI}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cfg = findSourceConfig("ives-technical-reviews");
  if (!cfg) throw new Error("ives-technical-reviews source config missing");
  const sourceRow = await runAsSystem((db) =>
    db.knowledgeSource.findUnique({ where: { key: "ives-technical-reviews" } }),
  );
  if (!sourceRow) throw new Error("ives-technical-reviews not seeded — run: npm run seed:knowledge-sources");
  const sourceId = sourceRow.id;

  console.log("enumerating OAI-PMH feed...");
  const all = await listRecords();
  const max = Number(process.env.KB_MAX_DOCS) || Infinity;
  const list = Number.isFinite(max) ? all.slice(0, max) : all;
  const langs = new Map<string, number>();
  for (const r of all) langs.set(r.language ?? "(none)", (langs.get(r.language ?? "(none)") ?? 0) + 1);
  console.log(
    `\nives: ${all.length} articles (${[...langs.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(", ")}), ingesting ${list.length}`,
  );

  if (dryRun) {
    for (const r of list.slice(0, 30)) {
      console.log(`  + ${r.date ? r.date.toISOString().slice(0, 10) : "undated"}  ${(r.title ?? "(untitled)").slice(0, 78)}`);
    }
    if (list.length > 30) console.log(`  … +${list.length - 30} more`);
    console.log("\n[dry-run] no write.");
    await disconnectSystem();
    return;
  }

  const stats = { docs: 0, chunks: 0, unchanged: 0, errors: 0, challenged: 0 };
  for (const r of list) {
    try {
      const res = await fetchDocument(r.url, { isAllowedHost });
      // A bot-wall interstitial arrives as HTTP 200 and must never be persisted as the article — each
      // carries a unique incident id, so it defeats content-hash dedup and re-embeds forever.
      if (res.challenge) {
        stats.challenged++;
        console.log(`  ~ challenge page, skipped: ${r.url}`);
        continue;
      }
      const contentHash = crypto.createHash("sha256").update(res.bytes).digest("hex");
      const docId = await runAsSystem(async (db) => {
        const blob = await db.knowledgeBlob.upsert({
          where: { contentHash },
          update: {},
          create: {
            contentHash,
            contentType: res.rawContentType || "text/html",
            byteSize: res.bytes.length,
          },
        });
        const doc = await db.knowledgeDocument.upsert({
          where: { sourceId_canonicalUrl: { sourceId, canonicalUrl: r.url } },
          update: {
            blobId: blob.id,
            contentType: res.contentType,
            canonicalTitle: r.title?.slice(0, 300) ?? undefined,
            publishedAt: r.date,
            lastSeenAt: new Date(),
            lastVerifiedAt: new Date(),
            retrievedAt: new Date(),
            status: "active",
          },
          create: {
            sourceId,
            canonicalUrl: r.url,
            blobId: blob.id,
            publisher: cfg.publisher,
            tier: cfg.tier,
            license: cfg.license,
            contentType: res.contentType,
            canonicalTitle: r.title?.slice(0, 300) ?? undefined,
            publishedAt: r.date,
          },
        });
        await db.knowledgeUrlObservation.upsert({
          where: { url: r.url },
          update: { lastSeenAt: new Date() },
          create: { documentId: doc.id, url: r.url },
        });
        return doc.id;
      });

      const ir = await indexDocument({
        documentId: docId,
        bytes: res.bytes,
        contentType: res.contentType,
        url: r.url,
        contentHash,
      });
      if (ir.skipped === "unchanged") stats.unchanged++;
      else if (!ir.skipped) {
        stats.docs++;
        stats.chunks += ir.chunks;
      }
    } catch (e) {
      stats.errors++;
      console.log(`  ! ${r.url}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }

  console.log(`\ndone: ${JSON.stringify(stats)}`);
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
