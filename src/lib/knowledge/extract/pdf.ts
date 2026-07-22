// Plan 079 — PDF -> text via unpdf (serverless-safe PDF.js, no native deps). unpdf linearizes text; PDF
// table column structure is best-effort. Council C-Gemini3: DON'T inject a mangled table as if it were
// clean data. We can't fully reconstruct arbitrary PDF tables here, so we FLAG low-confidence extractions
// (near-empty text vs page count => likely scanned/failed) as lowConfidence for review rather than trusting
// them. Only ever called from crawl/re-crawl scripts, never a request path.

import { cleanPdfTitle, parsePdfDate } from "./published-date";
import {
  groupLines,
  linesToMarkdown,
  inferTitle,
  normalizeLigatures,
  type PdfTextItem,
} from "./pdf-structure";

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

/**
 * Last-resort title. Plan 090 Unit 4 cut the cap from 200 to 110 characters.
 *
 * The old 200 was how a whole welcome paragraph became a document's title AND — via chunk.ts:130 —
 * the prepended breadcrumb on every one of its chunks. 110 matches MAX_TITLE_CHARS in pdf-structure
 * and is comfortably above the 96-character average of a real HTML breadcrumb in this corpus.
 */
function firstNonEmptyLine(text: string): string {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.length >= 3) return t.slice(0, 110);
  }
  return "";
}

/**
 * unpdf@1.6.2 `extractTextItems(pdf) -> { totalPages, items: StructuredTextItem[][] }` — always
 * per-page, no options. Each item carries str/x/y/width/height/fontSize/fontFamily/dir/hasEOL, and
 * `fontSize` is what Unit 5's heading inference reads.
 */
async function textItemsByPage(pdf: Parameters<typeof import("unpdf").extractTextItems>[0]): Promise<PdfTextItem[][]> {
  try {
    const { extractTextItems } = await import("unpdf");
    const { items } = await extractTextItems(pdf);
    return Array.isArray(items) ? (items.filter(Array.isArray) as PdfTextItem[][]) : [];
  } catch {
    // Structure is a bonus; a PDF whose item stream cannot be read must still yield its TEXT.
    return [];
  }
}

export async function extractPdf(bytes: Buffer): Promise<ExtractedPdf> {
  // dynamic import: unpdf is ESM-only, so a static import fails under tsx/CJS scripts.
  const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const linearized = normalizeLigatures(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Plan 090 Unit 5 — recover heading structure so chunk.ts's breadcrumb machinery has something to
  // build from. Before this, `clean` had no markdown headings at all, so the heading stack never
  // pushed and every chunk of a PDF inherited a single breadcrumb: the first 200 chars of page one.
  // Measured blast radius: 893 documents / 11,051 chunks, 42% of the corpus.
  const pages = await textItemsByPage(pdf);
  const lines = groupLines(pages).map((l) => ({ ...l, text: normalizeLigatures(l.text) }));
  const structured = lines.length ? linesToMarkdown(lines) : null;

  // FAIL SOFT, and the bar is CONFIDENCE, not "found at least one heading".
  //
  // Font size tracks structure in typeset reports and newsletters, and not at all in marketing-styled
  // fact sheets where body text is set at several sizes for emphasis. Measured on the AWRI fact sheets:
  // a heading-count test passed while the "headings" were sentence fragments ("24/12, please let",
  // "T&C form. If"). Chasing those individually is whack-a-mole that overfits to whichever document is
  // in front of you, so the judgment is made on the RESULT in aggregate — see isConfident.
  //
  // A document that resists structure ends up exactly where it is today, never worse. That is the
  // safety property this whole change rests on.
  const useStructured = !!structured && structured.confident;
  const clean = useStructured ? structured.markdown : linearized;
  // Heuristic: a real fact sheet has well over ~40 chars/page; far less => scanned image or failed parse.
  // Measured against the LINEARIZED text on purpose, so the signal keeps meaning "how much text did we
  // get out of this PDF" and does not shift with the plan-090 restructuring above it.
  const lowConfidence = totalPages > 0 && linearized.length < 40 * totalPages;

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

  // Title precedence, Plan 090 Unit 4: the PDF's own metadata, then TYPOGRAPHY (largest-set line on
  // page one), then the old first-line fallback now capped at 110 rather than 200 characters.
  // inferTitle deliberately REFUSES when page one carries no size variation, so the fallback still
  // runs rather than a paragraph being laundered into a title that citation.ts renders to the user.
  const title = metaTitle ?? (lines.length ? inferTitle(lines) : null) ?? firstNonEmptyLine(clean);

  return {
    title: normalizeLigatures(title),
    markdown: clean,
    pageCount: totalPages,
    lowConfidence,
    publishedAt,
  };
}
