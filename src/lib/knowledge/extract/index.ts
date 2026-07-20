// Plan 079 — extraction router. Turns a crawled blob into clean markdown, keyed on the content type the
// fetcher already detected (by HTTP header, not URL extension). This is the seam the Unit 5 chunker
// consumes. lowConfidence flags an extraction the pipeline should treat with suspicion (skip or review)
// rather than chunking + serving as authoritative — the council's numeric-safety posture at the source.

import { extractHtml } from "./html";
import { extractPdf } from "./pdf";
import { resolvePublishedDate } from "./published-date";
import type { DetectedType } from "../crawl/fetcher";

// Postgres TEXT columns cannot store NUL (char 0); some PDFs extract stray NUL + other C0 control bytes.
// Strip them (keep tab=9, newline=10, carriage-return=13) so a single bad document can't fail the raw
// ::vector insert with "invalid byte sequence for encoding UTF8: 0x00" (SQLSTATE 22021). Char-code filter
// (not a regex) so there are no literal control characters in the source.
export function sanitizeText(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 32 || c === 9 || c === 10 || c === 13) out += s[i];
  }
  return out;
}

export interface ExtractedDoc {
  title: string;
  markdown: string;
  kind: "html" | "pdf";
  wordCount: number;
  lowConfidence: boolean;
  /**
   * Plan 084 — the document's own publication date, or null when it does not declare a parseable one.
   * `indexDocument` persists this to `KnowledgeDocument.publishedAt`, which retrieval hands to the
   * assistant. Null is a first-class answer here: the citation renders "unknown", which is correct and
   * safe, whereas an invented date changes which of two conflicting recommendations the model calls
   * current.
   */
  publishedAt: Date | null;
}

export async function extractDocument(
  bytes: Buffer,
  contentType: DetectedType,
  url: string,
): Promise<ExtractedDoc> {
  if (contentType === "pdf") {
    const r = await extractPdf(bytes);
    const markdown = sanitizeText(r.markdown);
    return {
      title: sanitizeText(r.title),
      markdown,
      kind: "pdf",
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
      lowConfidence: r.lowConfidence,
      // Plan 084 + 085 merged: PDF metadata date first (CreationDate/ModDate), then the
      // body scan. Extension PDFs routinely stamp "Revised: <month> <year>" on the cover
      // page and carry no metadata date at all, so dropping either arm loses documents.
      publishedAt: r.publishedAt ?? resolvePublishedDate({ markdown }),
    };
  }
  if (contentType === "html") {
    const r = await extractHtml(bytes.toString("utf8"), url);
    const markdown = sanitizeText(r.markdown);
    return {
      title: sanitizeText(r.title),
      markdown,
      kind: "html",
      wordCount: r.wordCount,
      // an "article" with almost no extracted text is a failure (nav-only page / boilerplate)
      lowConfidence: markdown.length < 80,
      publishedAt: resolvePublishedDate({ metadataDate: r.published, markdown }),
    };
  }
  throw new Error(`extractDocument: unsupported content type "${contentType}" for ${url}`);
}

export { extractHtml } from "./html";
export { extractPdf } from "./pdf";
