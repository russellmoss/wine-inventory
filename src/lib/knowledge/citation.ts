// Plan 079 Unit 8 — citation resolution for /kb/source/<id>. The corpus is GLOBAL (no RLS), so this
// app-code check IS the entitlement gate (council C2): a guessable document id must NOT resolve for a
// tenant that hasn't enabled its source. Active -> redirect to the real source; withdrawn -> a tombstone
// so a 3-month-old chat citation still resolves gracefully instead of 404ing (council Gemini7).
// Crawled text is untrusted -> escaped before render.
//
// The tombstone shows a short EXCERPT, never the reconstructed document. Two reasons, and they point the
// same way:
//   1. Copyright. Storing full text to power a search index is the defensible Google-Books/HathiTrust
//      shape precisely BECAUSE what we surface is a snippet — the assistant paraphrases with a link back
//      and quotes only numbers (facts aren't copyrightable). Re-serving the whole work inverts that, and
//      it did so exactly when the publisher had taken the page down, i.e. when they'd most clearly
//      signalled they didn't want it redistributed. Citation is not a licence.
//   2. Safety. "Withdrawn" can mean RETRACTED. Serving a retracted paper in full from cache invites
//      someone to act on conclusions the publisher pulled.

import { prisma } from "@/lib/prisma";
import { resolveEnabledSourceIds } from "./subscriptions";
import { TRUSTED_DOMAIN_SET } from "./config";

// Defense-in-depth against a stored open redirect: the crawler only persists docs from allowlisted hosts,
// but re-validate the target is an http(s) URL on a trusted host before ever 302-ing a user out.
function isTrustedRedirectUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") && TRUSTED_DOMAIN_SET.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Hard cap on the withdrawn-source excerpt. Enough to recognise the passage a citation pointed at,
 *  far short of a substitute for the document itself. */
export const TOMBSTONE_EXCERPT_CHARS = 600;

export type CitationResolution =
  | { kind: "redirect"; url: string }
  | {
      kind: "tombstone";
      title: string;
      publisher: string;
      withdrawnAt: Date | null;
      excerpt: string;
      /** True when the document ran past the cap — the UI must then say "excerpt", not "the text". */
      truncated: boolean;
      canonicalUrl: string;
    }
  | { kind: "notfound" };

/**
 * Build the capped excerpt from a withdrawn document's leading chunks. Pure + exported because the cap
 * IS the copyright/safety control (see the file header) — a regression here is silent, and a DB-bound
 * test would never catch it. Chunks arrive ordinal-ascending; the breadcrumb prefix is stripped so the
 * excerpt reads as prose rather than "Winemaking > Brett > Sanitation Sanitize at...".
 */
export function buildTombstoneExcerpt(
  chunks: { sectionPath: string; text: string }[],
  limit: number = TOMBSTONE_EXCERPT_CHARS,
): { excerpt: string; truncated: boolean } {
  const body = chunks
    .map((c) => (c.text.startsWith(c.sectionPath) ? c.text.slice(c.sectionPath.length).trim() : c.text))
    .join("\n\n")
    .trim();
  if (body.length <= limit) return { excerpt: body, truncated: false };

  // Cut back to a word boundary so the excerpt doesn't end mid-word — but only if one is reasonably
  // close, otherwise a 600-char run without whitespace would collapse the excerpt to nothing.
  const cut = body.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return { excerpt: `${trimmed.trimEnd()}…`, truncated: true };
}

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

  if (doc.status === "active" && isTrustedRedirectUrl(doc.canonicalUrl)) {
    return { kind: "redirect", url: doc.canonicalUrl };
  }

  // withdrawn — OR an active doc whose stored URL isn't a trusted http(s) target (shouldn't happen) —
  // falls through to the tombstone with a capped EXCERPT of the active-revision chunks.
  // `take` bounds the read as well as the render: never pull the whole document into memory to throw
  // most of it away. 3 chunks comfortably overfill a 600-char cap.
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { documentId, revision: doc.activeRevision },
    orderBy: { ordinal: "asc" },
    select: { sectionPath: true, text: true },
    take: 3,
  });
  const { excerpt, truncated } = buildTombstoneExcerpt(chunks);

  return {
    kind: "tombstone",
    title: doc.canonicalTitle || doc.publisher,
    publisher: doc.publisher,
    withdrawnAt: doc.withdrawnAt,
    excerpt,
    // A doc long enough to span the 3 chunks we read is truncated even if the joined text fits the cap.
    truncated: truncated || chunks.length === 3,
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

/**
 * Render a tombstone page for a withdrawn source. All dynamic (crawled) content is escaped.
 * Shows a capped excerpt only — see the file header for why the full text must never appear here.
 */
export function renderTombstoneHtml(t: Extract<CitationResolution, { kind: "tombstone" }>): string {
  const when = t.withdrawnAt ? escapeHtml(t.withdrawnAt.toISOString().slice(0, 10)) : "an earlier date";
  const excerptBlock = t.excerpt
    ? `<h2>Excerpt</h2>
<p class="meta">A short extract from the version captured when it was cited${t.truncated ? " — the full document is not reproduced here" : ""}.</p>
<blockquote>${escapeHtml(t.excerpt)}</blockquote>`
    : `<p class="meta">No excerpt of this document is available.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, noarchive">
<title>${escapeHtml(t.title)} — withdrawn source</title>
<style>
  body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:3rem auto;padding:0 1.25rem;color:#1c1917}
  .note{background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:1rem 1.25rem;margin:1rem 0}
  h1{font-size:1.4rem} h2{font-size:1rem;margin-bottom:.25rem} .meta{color:#78716c;font-size:.9rem}
  blockquote{white-space:pre-wrap;background:#f5f5f4;border-left:3px solid #d6d3d1;border-radius:0 8px 8px 0;
    margin:.75rem 0;padding:1rem;font-size:.95rem}
</style></head><body>
<h1>${escapeHtml(t.title)}</h1>
<p class="meta">${escapeHtml(t.publisher)}</p>
<div class="note"><strong>This source has been withdrawn by the publisher</strong> (as of ${when}).
The original page at <code>${escapeHtml(t.canonicalUrl)}</code> is no longer available. If it was
<strong>retracted</strong> rather than merely moved, its conclusions may no longer stand — do not act on
anything below without confirming it against a current source.</div>
${excerptBlock}
</body></html>`;
}
