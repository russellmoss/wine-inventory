/**
 * Plan 079 — ingest ETS Laboratories technical publications into the global corpus.
 *
 *   npm run crawl:ets                 # ingest all wine publications
 *   npm run crawl:ets -- --dry-run    # list what would be ingested, write nothing
 *   KB_MAX_DOCS=3 npm run crawl:ets    # bounded smoke
 *
 * NOT a crawl: etslabs.com/library is a JS-rendered React SPA (no server HTML, no PDFs). All 50 publications
 * come from ONE public JSON endpoint — webapi.etslabs.com/cms/publications.json — each carrying the full
 * article HTML in a `content` field + structured metadata. We build a small HTML doc per publication and run
 * it through the normal extract → chunk → embed pipeline; citations link to the SPA's /publications/publication/<id>
 * page. Skips the 2 Biofuel Production items + disabled records. (Issuu is not ingestable — image flipbooks.)
 */
import crypto from "crypto";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { findSourceConfig, TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

const API = "https://webapi.etslabs.com/cms/publications.json";
const SKIP_CATEGORIES = new Set(["Biofuel Production"]);
const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);

interface Pub {
  id: number; title: string; content: string; category_name: string;
  author_name?: string; version_number?: string | number; reviewed_at?: string; disabled?: boolean;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cfg = findSourceConfig("ets");
  if (!cfg) throw new Error("ets source config missing");
  const sourceRow = await runAsSystem((db) => db.knowledgeSource.findUnique({ where: { key: "ets" } }));
  if (!sourceRow) throw new Error("ets not seeded — run: npm run seed:knowledge-sources");
  const sourceId = sourceRow.id;

  const res = await fetchDocument(API, { isAllowedHost });
  const records: Pub[] = JSON.parse(res.bytes.toString("utf8"));
  const wine = records.filter((r) => r && !r.disabled && r.content && !SKIP_CATEGORIES.has(r.category_name));
  const max = Number(process.env.KB_MAX_DOCS) || Infinity;
  const list = Number.isFinite(max) ? wine.slice(0, max) : wine;
  console.log(`ets: ${records.length} records → ${wine.length} wine (skipped ${records.length - wine.length}: biofuel/disabled), ingesting ${list.length}`);
  if (dryRun) {
    for (const r of list) console.log(`  + [${r.category_name}] ${r.title} (id ${r.id})`);
    console.log("\n[dry-run] no write.");
    await disconnectSystem();
    return;
  }

  const indexed = { docs: 0, chunks: 0, unchanged: 0, errors: 0 };
  for (const r of list) {
    try {
      const canonicalUrl = `https://www.etslabs.com/publications/publication/${r.id}`;
      const meta = [r.category_name, r.author_name, r.version_number ? `v${r.version_number}` : null, r.reviewed_at]
        .filter(Boolean).join(" · ");
      const html = `<!doctype html><html><head><title>${esc(r.title)}</title></head><body><h1>${esc(r.title)}</h1>${meta ? `<p>${esc(meta)}</p>` : ""}${r.content}</body></html>`;
      const bytes = Buffer.from(html, "utf8");
      const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
      const parsed = r.reviewed_at ? new Date(r.reviewed_at) : null;
      const publishedAt = parsed && !Number.isNaN(+parsed) ? parsed : null;

      const docId = await runAsSystem(async (db) => {
        const blob = await db.knowledgeBlob.upsert({
          where: { contentHash },
          update: {},
          create: { contentHash, contentType: "text/html", byteSize: bytes.length },
        });
        const doc = await db.knowledgeDocument.upsert({
          where: { sourceId_canonicalUrl: { sourceId, canonicalUrl } },
          update: { blobId: blob.id, contentType: "html", canonicalTitle: r.title?.slice(0, 300), lastSeenAt: new Date(), lastVerifiedAt: new Date(), retrievedAt: new Date(), status: "active", publishedAt },
          create: { sourceId, canonicalUrl, blobId: blob.id, publisher: cfg.publisher, tier: cfg.tier, license: cfg.license, contentType: "html", canonicalTitle: r.title?.slice(0, 300), publishedAt },
        });
        await db.knowledgeUrlObservation.upsert({ where: { url: canonicalUrl }, update: { lastSeenAt: new Date() }, create: { documentId: doc.id, url: canonicalUrl } });
        return doc.id;
      });

      const ir = await indexDocument({ documentId: docId, bytes, contentType: "html", url: canonicalUrl, contentHash });
      if (ir.skipped === "unchanged") indexed.unchanged++;
      else if (!ir.skipped) { indexed.docs++; indexed.chunks += ir.chunks; }
    } catch (e) {
      indexed.errors++;
      console.log(`  ! ${r.id} "${r.title}": ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }

  console.log(`\ndone: ${JSON.stringify(indexed)}`);
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
