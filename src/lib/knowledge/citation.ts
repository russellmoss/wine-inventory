// Plan 079 Unit 8 — citation resolution for /kb/source/<id>. The corpus is GLOBAL (no RLS), so this
// app-code check IS the entitlement gate (council C2): a guessable document id must NOT resolve for a
// tenant that hasn't enabled its source. Active -> redirect to the real source; withdrawn -> a tombstone
// showing the archived text (reconstructed from the chunks) so a 3-month-old chat citation still resolves
// gracefully instead of 404ing (council Gemini7). Crawled text is untrusted -> escaped before render.

import { prisma } from "@/lib/prisma";
import { resolveEnabledSourceIds } from "./subscriptions";

export type CitationResolution =
  | { kind: "redirect"; url: string }
  | {
      kind: "tombstone";
      title: string;
      publisher: string;
      withdrawnAt: Date | null;
      archivedText: string;
      canonicalUrl: string;
    }
  | { kind: "notfound" };

export async function resolveCitation(tenantId: string, documentId: string): Promise<CitationResolution> {
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id: documentId },
    select: {
      sourceId: true,
      status: true,
      canonicalUrl: true,
      canonicalTitle: true,
      publisher: true,
      withdrawnAt: true,
      activeRevision: true,
    },
  });
  if (!doc) return { kind: "notfound" };

  // ENTITLEMENT RECHECK (council C2): the source must be enabled for this tenant. Not enabled -> 404,
  // do not reveal that the document exists.
  const enabled = await resolveEnabledSourceIds(tenantId);
  if (!enabled.includes(doc.sourceId)) return { kind: "notfound" };

  if (doc.status === "active") return { kind: "redirect", url: doc.canonicalUrl };

  // withdrawn -> tombstone with the archived text from the active-revision chunks (breadcrumb stripped)
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { documentId, revision: doc.activeRevision },
    orderBy: { ordinal: "asc" },
    select: { sectionPath: true, text: true },
  });
  const archivedText = chunks
    .map((c) => (c.text.startsWith(c.sectionPath) ? c.text.slice(c.sectionPath.length).trim() : c.text))
    .join("\n\n")
    .slice(0, 20000);

  return {
    kind: "tombstone",
    title: doc.canonicalTitle || doc.publisher,
    publisher: doc.publisher,
    withdrawnAt: doc.withdrawnAt,
    archivedText,
    canonicalUrl: doc.canonicalUrl,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render a tombstone page for a withdrawn source. All dynamic (crawled) content is escaped. */
export function renderTombstoneHtml(t: Extract<CitationResolution, { kind: "tombstone" }>): string {
  const when = t.withdrawnAt ? escapeHtml(t.withdrawnAt.toISOString().slice(0, 10)) : "an earlier date";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t.title)} — withdrawn source</title>
<style>
  body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:3rem auto;padding:0 1.25rem;color:#1c1917}
  .note{background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:1rem 1.25rem;margin:1rem 0}
  h1{font-size:1.4rem} .meta{color:#78716c;font-size:.9rem}
  pre{white-space:pre-wrap;background:#f5f5f4;border-radius:8px;padding:1rem;font:14px/1.55 ui-monospace,monospace}
</style></head><body>
<h1>${escapeHtml(t.title)}</h1>
<p class="meta">${escapeHtml(t.publisher)}</p>
<div class="note"><strong>This source has been withdrawn by the publisher</strong> (as of ${when}).
The original page at <code>${escapeHtml(t.canonicalUrl)}</code> is no longer available. The text captured
when it was cited is shown below for reference. Verify any figures before acting on them.</div>
<pre>${escapeHtml(t.archivedText)}</pre>
</body></html>`;
}
