// Plan 079 — HTML -> clean markdown via Defuddle (kepano; "Readability 2.0" for markdown workflows). Runs
// in Node (the /node entry accepts an HTML string and builds the DOM via linkedom). Defuddle standardizes
// tables into markdown tables, which is exactly the council's "preserve table structure" requirement for
// dose/limit tables. Only ever called from crawl/re-crawl scripts, never a request path (ESM-only is fine).

export interface ExtractedHtml {
  title: string;
  markdown: string;
  wordCount: number;
  /**
   * Defuddle's own publication date (meta tags / JSON-LD), raw and unvalidated — "" on the many sources
   * that publish no metadata date. Parsed + range-checked downstream by `resolvePublishedDate`, which
   * falls back to a label-anchored scan of the body when this is empty (the UC IPM case).
   */
  published: string;
}

// dynamic import: defuddle/node exports only an `import` condition (no `require`), so a static import
// fails under tsx/CJS. Dynamic import() uses the ESM loader in both CJS (scripts) and ESM (vitest).
//
// Memoized because the first load is EXPENSIVE — it pulls in linkedom to build a DOM (~100ms of module
// load plus ~175ms for the first parse on an idle machine, and far more under CPU contention). A crawl
// loop over thousands of documents should re-enter the ESM resolver once, not once per document, and
// callers that care about latency can pay the cost up front via `loadDefuddle()` (see below).
let defuddleModule: Promise<typeof import("defuddle/node")> | null = null;

/**
 * Load (once) the ESM-only `defuddle/node` module. Exposed so callers can warm the loader OUTSIDE a
 * latency-sensitive window — notably the extraction tests, where charging a cold linkedom load to the
 * first test's 5s budget made the suite flaky under a loaded parallel run.
 */
export function loadDefuddle(): Promise<typeof import("defuddle/node")> {
  defuddleModule ??= import("defuddle/node");
  return defuddleModule;
}

export async function extractHtml(html: string, url: string): Promise<ExtractedHtml> {
  const { Defuddle } = await loadDefuddle();
  const res = await Defuddle(html, url, { markdown: true });
  const markdown = (res.contentMarkdown ?? res.content ?? "").trim();
  const wordCount = res.wordCount ?? markdown.split(/\s+/).filter(Boolean).length;
  return { title: (res.title ?? "").trim(), markdown, wordCount, published: (res.published ?? "").trim() };
}
