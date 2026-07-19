// Plan 079 — PDF -> text via unpdf (serverless-safe PDF.js, no native deps). unpdf linearizes text; PDF
// table column structure is best-effort. Council C-Gemini3: DON'T inject a mangled table as if it were
// clean data. We can't fully reconstruct arbitrary PDF tables here, so we FLAG low-confidence extractions
// (near-empty text vs page count => likely scanned/failed) as lowConfidence for review rather than trusting
// them. Only ever called from crawl/re-crawl scripts, never a request path.

export interface ExtractedPdf {
  title: string;
  markdown: string;
  pageCount: number;
  lowConfidence: boolean;
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
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const clean = text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Heuristic: a real fact sheet has well over ~40 chars/page; far less => scanned image or failed parse.
  const lowConfidence = totalPages > 0 && clean.length < 40 * totalPages;
  return { title: firstNonEmptyLine(clean), markdown: clean, pageCount: totalPages, lowConfidence };
}
