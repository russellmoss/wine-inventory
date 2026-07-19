// Plan 079 — HTML -> clean markdown via Defuddle (kepano; "Readability 2.0" for markdown workflows). Runs
// in Node (the /node entry accepts an HTML string and builds the DOM via linkedom). Defuddle standardizes
// tables into markdown tables, which is exactly the council's "preserve table structure" requirement for
// dose/limit tables. Only ever called from crawl/re-crawl scripts, never a request path (ESM-only is fine).

export interface ExtractedHtml {
  title: string;
  markdown: string;
  wordCount: number;
}

export async function extractHtml(html: string, url: string): Promise<ExtractedHtml> {
  // dynamic import: defuddle/node exports only an `import` condition (no `require`), so a static import
  // fails under tsx/CJS. Dynamic import() uses the ESM loader in both CJS (scripts) and ESM (vitest).
  const { Defuddle } = await import("defuddle/node");
  const res = await Defuddle(html, url, { markdown: true });
  const markdown = (res.contentMarkdown ?? res.content ?? "").trim();
  const wordCount = res.wordCount ?? markdown.split(/\s+/).filter(Boolean).length;
  return { title: (res.title ?? "").trim(), markdown, wordCount };
}
