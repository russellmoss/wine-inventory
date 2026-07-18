// Plan 079 — extraction router. Turns a crawled blob into clean markdown, keyed on the content type the
// fetcher already detected (by HTTP header, not URL extension). This is the seam the Unit 5 chunker
// consumes. lowConfidence flags an extraction the pipeline should treat with suspicion (skip or review)
// rather than chunking + serving as authoritative — the council's numeric-safety posture at the source.

import { extractHtml } from "./html";
import { extractPdf } from "./pdf";
import type { DetectedType } from "../crawl/fetcher";

export interface ExtractedDoc {
  title: string;
  markdown: string;
  kind: "html" | "pdf";
  wordCount: number;
  lowConfidence: boolean;
}

export async function extractDocument(
  bytes: Buffer,
  contentType: DetectedType,
  url: string,
): Promise<ExtractedDoc> {
  if (contentType === "pdf") {
    const r = await extractPdf(bytes);
    return {
      title: r.title,
      markdown: r.markdown,
      kind: "pdf",
      wordCount: r.markdown.split(/\s+/).filter(Boolean).length,
      lowConfidence: r.lowConfidence,
    };
  }
  if (contentType === "html") {
    const r = await extractHtml(bytes.toString("utf8"), url);
    return {
      title: r.title,
      markdown: r.markdown,
      kind: "html",
      wordCount: r.wordCount,
      // an "article" with almost no extracted text is a failure (nav-only page / boilerplate)
      lowConfidence: r.markdown.length < 80,
    };
  }
  throw new Error(`extractDocument: unsupported content type "${contentType}" for ${url}`);
}

export { extractHtml } from "./html";
export { extractPdf } from "./pdf";
