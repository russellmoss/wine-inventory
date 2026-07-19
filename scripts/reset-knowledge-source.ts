/**
 * Plan 079 — delete all corpus documents (+ their chunks + URL observations) for one source, so it can be
 * re-crawled from a clean slate after its allow/deny scope changes. Re-crawling alone does NOT remove
 * previously-indexed pages that are now denied (they still 200, so the re-crawl tombstone never fires).
 *
 *   npm run reset:knowledge-source -- <sourceKey>
 *
 * Global-corpus maintenance (owner via runAsSystem). Does NOT delete the KnowledgeSource row itself.
 */
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

async function main() {
  const key = process.argv[2];
  if (!key) throw new Error("usage: reset-knowledge-source.ts <sourceKey>");

  await runAsSystem(async (db) => {
    const src = await db.knowledgeSource.findUnique({ where: { key } });
    if (!src) throw new Error(`unknown source: ${key}`);
    const docs = await db.knowledgeDocument.findMany({ where: { sourceId: src.id }, select: { id: true } });
    const ids = docs.map((d) => d.id);
    console.log(`resetting source "${key}" (${src.id}) — ${ids.length} documents`);
    if (ids.length === 0) {
      console.log("nothing to delete");
      return;
    }
    const chunks = await db.knowledgeChunk.deleteMany({ where: { documentId: { in: ids } } });
    const obs = await db.knowledgeUrlObservation.deleteMany({ where: { documentId: { in: ids } } });
    const del = await db.knowledgeDocument.deleteMany({ where: { sourceId: src.id } });
    console.log(`deleted: ${del.count} documents, ${chunks.count} chunks, ${obs.count} observations`);
  });

  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
