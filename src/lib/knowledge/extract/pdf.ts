// Plan 079 — PDF -> text via unpdf (serverless-safe PDF.js, no native deps). unpdf linearizes text; PDF
// table column structure is best-effort. Council C-Gemini3: DON'T inject a mangled table as if it were
// clean data. We can't fully reconstruct arbitrary PDF tables here, so we FLAG low-confidence extractions
// (near-empty text vs page count => likely scanned/failed) as lowConfidence for review rather than trusting
// them. Only ever called from crawl/re-crawl scripts, never a request path.

import { cleanPdfTitle, parsePdfDate } from "./published-date";

export interface ExtractedPdf {
  title: string;
  markdown: string;
  pageCount: number;
  lowConfidence: boolean;
  /**
   * Plan 084 — CreationDate from the PDF's own metadata, or null. Measured on the Cornell corpus:
   * 12/12 sampled PDFs carry a usable CreationDate, which is why there is no filename-year fallback
   * here (see the plan's decision log — inferring a year from "…2018-2 May.pdf" would launder a guess
   * into a fact for a coverage gain of roughly zero).
   */
  publishedAt: Date | null;
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.length >= 3) return t.slice(0, 200);
  }
  return "";
}

export async function extractPdf(bytes: Buffer): Promise<ExtractedPdf> {
  // dynamic import: unpdf is ESM-only, so a static import fails under tsx/CJS scripts.
  const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const clean = text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Heuristic: a real fact sheet has well over ~40 chars/page; far less => scanned image or failed parse.
  const lowConfidence = totalPages > 0 && clean.length < 40 * totalPages;

  // Metadata is strictly a bonus: a PDF with a corrupt info dictionary must still yield its TEXT, which
  // is the thing retrieval actually needs. So the whole read is best-effort and degrades to nulls.
  let metaTitle: string | null = null;
  let publishedAt: Date | null = null;
  try {
    const { info } = await getMeta(pdf);
    const i = (info ?? {}) as Record<string, unknown>;
    metaTitle = cleanPdfTitle(i.Title);
    // CreationDate over ModDate deliberately: re-saving a 2004 report in 2011 (observed on the Cornell
    // corpus) must not make it look like 2011 research.
    publishedAt = parsePdfDate(i.CreationDate) ?? parsePdfDate(i.ModDate);
  } catch {
    // fall through with nulls — see above
  }

  return {
    title: metaTitle ?? firstNonEmptyLine(clean),
    markdown: clean,
    pageCount: totalPages,
    lowConfidence,
    publishedAt,
  };
}
