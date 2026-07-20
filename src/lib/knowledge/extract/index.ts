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
   * The document's revision date, or null when it does not carry one we can trust. Persisted to
   * `KnowledgeDocument.publishedAt` and surfaced in the assistant's citation — null renders as
   * "unknown", which is the honest answer and deliberately preferred over a guess.
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
      // No metadata arm for PDFs — the body scan is all we have (extension PDFs typically stamp
      // "Revised: <month> <year>" on the cover page).
      publishedAt: resolvePublishedDate({ markdown }),
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
