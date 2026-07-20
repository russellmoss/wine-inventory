import { beforeAll, describe, it, expect } from "vitest";
import { extractHtml, loadDefuddle } from "@/lib/knowledge/extract/html";
import { extractDocument, sanitizeText } from "@/lib/knowledge/extract";
import { extractPdf } from "@/lib/knowledge/extract/pdf";
import { buildMinimalPdf } from "./helpers/minimal-pdf";
import {
  cleanPdfTitle,
  isPlausiblePublishedDate,
  parseHtmlPublishedDate,
  parsePdfDate,
} from "@/lib/knowledge/extract/published-date";

// Warm the extraction stack BEFORE any test runs.
//
// `defuddle/node` is ESM-only and pulls in linkedom to build a DOM. On an idle machine the module
// load costs ~100ms and the FIRST parse another ~175ms; every parse after that is ~7ms. This suite
// runs alongside ~260 other files in parallel workers, and under that CPU contention the cold path
// could blow past vitest's 5s per-test default — which is why the first test here failed
// intermittently with "Test timed out in 5000ms" while passing in isolation and on re-run.
//
// Doing a throwaway load + parse in a hook with its own generous budget moves BOTH one-time costs
// off the per-test clock, so every test below hits the ~7ms warm path. This is the fix for the
// flake, not a timeout bump: no test's own budget was changed.
beforeAll(async () => {
  await loadDefuddle();
  await extractHtml("<html><head><title>warmup</title></head><body><p>warmup</p></body></html>", "https://warmup.invalid/");
}, 60_000);

describe("sanitizeText (Postgres NUL/control-byte safety)", () => {
  it("strips NUL and other C0 control bytes but keeps tab/newline/CR and normal text", () => {
    const dirty = `Sanitize at 85${String.fromCharCode(0)}C\tfor 30\nmin${String.fromCharCode(7)}.`;
    const clean = sanitizeText(dirty);
    expect(clean).not.toContain(String.fromCharCode(0));
    expect(clean).not.toContain(String.fromCharCode(7));
    expect(clean).toContain("\t");
    expect(clean).toContain("\n");
    expect(clean).toBe("Sanitize at 85C\tfor 30\nmin.");
  });
});

// Plan 084 Unit 1 — the assistant resolves conflicting recommendations BY RECENCY, so a wrong date
// silently re-orders which advice it presents as current. Every case here asserts the fail-closed
// direction: anything ambiguous must come back null so the citation renders "unknown".
describe("published-date parsing (fail-closed)", () => {
  const NOW = new Date("2026-07-20T00:00:00Z");

  describe("isPlausiblePublishedDate", () => {
    it("accepts a normal in-range date", () => {
      expect(isPlausiblePublishedDate(new Date("2023-05-01T00:00:00Z"), NOW)).toBe(true);
    });
    it("rejects an invalid Date", () => {
      expect(isPlausiblePublishedDate(new Date("nonsense"), NOW)).toBe(false);
    });
    it("rejects the Unix epoch and other pre-1980 parse noise", () => {
      expect(isPlausiblePublishedDate(new Date(0), NOW)).toBe(false);
      expect(isPlausiblePublishedDate(new Date("1900-01-01T00:00:00Z"), NOW)).toBe(false);
    });
    it("rejects a date beyond the clock-skew tolerance but accepts one inside it", () => {
      expect(isPlausiblePublishedDate(new Date("2027-01-01T00:00:00Z"), NOW)).toBe(false);
      expect(isPlausiblePublishedDate(new Date("2026-07-21T00:00:00Z"), NOW)).toBe(true);
    });
  });

  describe("parseHtmlPublishedDate", () => {
    it("parses an ISO timestamp from JSON-LD / article:published_time", () => {
      const d = parseHtmlPublishedDate("2024-10-15T13:27:36", NOW);
      expect(d?.getUTCFullYear()).toBe(2024);
      expect(d?.getUTCMonth()).toBe(9);
    });
    it("parses a bare ISO date", () => {
      expect(parseHtmlPublishedDate("2022-03-08", NOW)?.getUTCFullYear()).toBe(2022);
    });
    it("returns null for a missing, empty, or non-string value", () => {
      expect(parseHtmlPublishedDate(undefined, NOW)).toBeNull();
      expect(parseHtmlPublishedDate("", NOW)).toBeNull();
      expect(parseHtmlPublishedDate("   ", NOW)).toBeNull();
      expect(parseHtmlPublishedDate(20240101, NOW)).toBeNull();
    });
    it("returns null for unparseable prose rather than inventing a date", () => {
      expect(parseHtmlPublishedDate("n.d.", NOW)).toBeNull();
      expect(parseHtmlPublishedDate("Spring", NOW)).toBeNull();
    });
    it("refuses a string with no 4-digit year, even when Date would happily parse it", () => {
      // `new Date("05/06")` resolves to a real date in the current century. Publishing that as a
      // publication date would be a fabrication, so the year guard must reject it first.
      expect(Number.isNaN(new Date("05/06").getTime())).toBe(false);
      expect(parseHtmlPublishedDate("05/06", NOW)).toBeNull();
    });
    it("rejects a future date", () => {
      expect(parseHtmlPublishedDate("2030-01-01", NOW)).toBeNull();
    });
  });

  describe("parsePdfDate", () => {
    it("parses a Zulu timestamp", () => {
      const d = parsePdfDate("D:20040802153909Z", NOW);
      expect(d?.toISOString()).toBe("2004-08-02T15:39:09.000Z");
    });
    it("parses a negative UTC offset back to UTC", () => {
      // 10:15:03 at -04'00' is 14:15:03 UTC.
      expect(parsePdfDate("D:20180507101503-04'00'", NOW)?.toISOString()).toBe("2018-05-07T14:15:03.000Z");
    });
    it("parses a positive UTC offset back to UTC", () => {
      expect(parsePdfDate("D:20180507101503+02'00'", NOW)?.toISOString()).toBe("2018-05-07T08:15:03.000Z");
    });
    it("tolerates the malformed-but-common trailing offset after Z", () => {
      expect(parsePdfDate("D:20220509184810Z00'00'", NOW)?.toISOString()).toBe("2022-05-09T18:48:10.000Z");
    });
    it("defaults missing components to the start of the period", () => {
      expect(parsePdfDate("D:2019", NOW)?.toISOString()).toBe("2019-01-01T00:00:00.000Z");
    });
    it("returns null for a malformed string instead of throwing", () => {
      expect(parsePdfDate("not a date", NOW)).toBeNull();
      expect(parsePdfDate("D:", NOW)).toBeNull();
      expect(parsePdfDate(undefined, NOW)).toBeNull();
    });
    it("rejects an out-of-range month rather than rolling it into the next year", () => {
      // Date.UTC(2018, 12, 1) silently becomes January 2019 — a document shifted a full year.
      expect(parsePdfDate("D:20181301000000Z", NOW)).toBeNull();
    });
    it("rejects an out-of-range day", () => {
      expect(parsePdfDate("D:20180532000000Z", NOW)).toBeNull();
    });
    it("rejects a pre-1980 and a future PDF date", () => {
      expect(parsePdfDate("D:19700101000000Z", NOW)).toBeNull();
      expect(parsePdfDate("D:20300101000000Z", NOW)).toBeNull();
    });
  });

  describe("cleanPdfTitle", () => {
    it("keeps a real title", () => {
      expect(cleanPdfTitle("Grapevine Leafroll Virus - an increasing problem")).toBe(
        "Grapevine Leafroll Virus - an increasing problem",
      );
    });
    it("strips the Microsoft Word producer prefix and file extension", () => {
      expect(cleanPdfTitle("Microsoft Word - Insects & grapes review.doc")).toBe("Insects & grapes review");
    });
    it("rejects authoring-tool placeholders", () => {
      expect(cleanPdfTitle("PowerPoint Presentation")).toBeNull();
      expect(cleanPdfTitle("-")).toBeNull();
      expect(cleanPdfTitle("Untitled")).toBeNull();
    });
    it("rejects a title with no real words", () => {
      expect(cleanPdfTitle("12345")).toBeNull();
      expect(cleanPdfTitle("")).toBeNull();
      expect(cleanPdfTitle(null)).toBeNull();
    });
  });
});

const ARTICLE = `<!DOCTYPE html><html><head><title>Barrel sanitation against Brett</title></head>
<body>
<nav><a href="/">Home</a><a href="/about">About</a></nav>
<article>
  <h1>Barrel sanitation against Brett</h1>
  <p>The AWRI recommends hot water as the most effective and practical sanitation method for
     controlling Brettanomyces in oak barrels. Fill the barrel and hold at temperature.</p>
  <p>Two hot-water regimes are effective for barrel sanitation against Brett:</p>
  <table>
    <thead><tr><th>Water temperature</th><th>Minimum hold time</th></tr></thead>
    <tbody>
      <tr><td>70 degrees C</td><td>30 minutes</td></tr>
      <tr><td>85 degrees C</td><td>15 minutes</td></tr>
    </tbody>
  </table>
  <p>Reverse osmosis is by far the most effective way to remove the aromas caused by the volatile
     phenols arising from Brett once a wine is already affected.</p>
</article>
<footer>Copyright AWRI. All rights reserved.</footer>
</body></html>`;

/**
 * Vitest's 5s default is not enough for the Defuddle-backed cases when the FULL suite is running.
 *
 * Measured on an idle machine: the one-off dynamic `import("defuddle/node")` (which pulls in linkedom to
 * build a DOM) costs ~119ms, the first extraction ~200ms, and every later extraction ~9ms. That is ~320ms
 * of genuine work — but a full `vitest run` saturates the CPU across 250+ files, and under that contention
 * the first Defuddle case was observed taking ~7.9s and timing out, while passing in ~680ms in isolation.
 *
 * So this is wall-clock contention, NOT a hang and NOT a logic bug — nothing is being masked. The ceiling is
 * kept well above the observed worst case but far below "forever", so a real hang or a genuine performance
 * regression in the extractor still fails the suite. Do not "optimize" this by shrinking ARTICLE: the cost is
 * module load, not fixture size, and the nav/footer boilerplate is exactly what the first assertion checks.
 */
const DEFUDDLE_TIMEOUT_MS = 30_000;

describe("HTML extraction (Defuddle -> markdown)", () => {
  it(
    "extracts the title and article body, dropping nav/footer boilerplate",
    async () => {
      const { title, markdown, wordCount } = await extractHtml(ARTICLE, "https://www.awri.com.au/x/");
      expect(title.toLowerCase()).toContain("barrel sanitation");
      expect(markdown.toLowerCase()).toContain("reverse osmosis");
      expect(wordCount).toBeGreaterThan(20);
      // the boilerplate the extractor exists to strip must be gone (this is why ARTICLE carries nav/footer)
      expect(markdown.toLowerCase()).not.toContain("all rights reserved");
      expect(markdown.toLowerCase()).not.toContain("href=\"/about\"");
    },
    DEFUDDLE_TIMEOUT_MS,
  );

  it(
    "preserves the table's numeric cell values (dose/limit safety)",
    async () => {
      const { markdown } = await extractHtml(ARTICLE, "https://www.awri.com.au/x/");
      // whether rendered as a markdown table or linearized, the numbers must survive
      for (const v of ["70", "85", "30", "15"]) {
        expect(markdown).toContain(v);
      }
    },
    DEFUDDLE_TIMEOUT_MS,
  );
});

// Same body as ARTICLE, plus the two ways a publisher actually declares a date. Cornell IPM content is
// year-stamped and superseded annually, so this path is what stops a 2019 spray guide being presented
// with the same authority as a current one.
const DATED_META_ARTICLE = ARTICLE.replace(
  "</head>",
  `<meta property="article:published_time" content="2021-06-14T09:00:00Z" /></head>`,
);

const DATED_JSONLD_ARTICLE = ARTICLE.replace(
  "</head>",
  `<script type="application/ld+json">
   {"@context":"https://schema.org","@type":"Article","headline":"Barrel sanitation against Brett",
    "datePublished":"2019-04-02T00:00:00Z"}
   </script></head>`,
);

describe("HTML publication dates (plan 084)", () => {
  it(
    "extracts a date from article:published_time",
    async () => {
      const { publishedAt } = await extractHtml(DATED_META_ARTICLE, "https://www.awri.com.au/x/");
      expect(publishedAt).not.toBeNull();
      expect(publishedAt?.getUTCFullYear()).toBe(2021);
    },
    DEFUDDLE_TIMEOUT_MS,
  );

  it(
    "extracts a date from JSON-LD datePublished",
    async () => {
      const { publishedAt } = await extractHtml(DATED_JSONLD_ARTICLE, "https://www.awri.com.au/x/");
      expect(publishedAt).not.toBeNull();
      expect(publishedAt?.getUTCFullYear()).toBe(2019);
    },
    DEFUDDLE_TIMEOUT_MS,
  );

  it(
    "yields null for an undated page rather than substituting today",
    async () => {
      const { publishedAt } = await extractHtml(ARTICLE, "https://www.awri.com.au/x/");
      expect(publishedAt).toBeNull();
    },
    DEFUDDLE_TIMEOUT_MS,
  );

  it(
    "carries the date through the extractDocument router",
    async () => {
      const doc = await extractDocument(
        Buffer.from(DATED_META_ARTICLE, "utf8"),
        "html",
        "https://www.awri.com.au/x/",
      );
      expect(doc.publishedAt?.getUTCFullYear()).toBe(2021);
    },
    DEFUDDLE_TIMEOUT_MS,
  );
});

// Plan 084 Unit 2 — PDF metadata. Measured on the Cornell corpus: 12/12 sampled PDFs carry a usable
// CreationDate, but only 9/12 carry a Title and several of those are producer junk ("PowerPoint
// Presentation", "18schruft"), which is why the title path has a quality gate and the date path does not.
describe("PDF publication dates and titles (plan 084)", () => {
  const PDF_TIMEOUT_MS = 30_000;

  it(
    "reads CreationDate from PDF metadata, converting the offset to UTC",
    async () => {
      const bytes = buildMinimalPdf({ creationDate: "D:20180507101503-04'00'" });
      const { publishedAt } = await extractPdf(bytes);
      expect(publishedAt?.toISOString()).toBe("2018-05-07T14:15:03.000Z");
    },
    PDF_TIMEOUT_MS,
  );

  it(
    "prefers CreationDate over ModDate so a re-saved old report is not dated to its re-save",
    async () => {
      // Observed on the Cornell corpus: a 2004 crop-loss report re-saved in 2011.
      const bytes = buildMinimalPdf({
        creationDate: "D:20040802153909Z",
        modDate: "D:20110608152253-04'00'",
      });
      const { publishedAt } = await extractPdf(bytes);
      expect(publishedAt?.getUTCFullYear()).toBe(2004);
    },
    PDF_TIMEOUT_MS,
  );

  it(
    "falls back to ModDate when CreationDate is absent",
    async () => {
      const bytes = buildMinimalPdf({ modDate: "D:20200529152336Z" });
      const { publishedAt } = await extractPdf(bytes);
      expect(publishedAt?.getUTCFullYear()).toBe(2020);
    },
    PDF_TIMEOUT_MS,
  );

  it(
    "yields a null date, not a throw, when metadata is absent or malformed",
    async () => {
      const noMeta = await extractPdf(buildMinimalPdf({}));
      expect(noMeta.publishedAt).toBeNull();

      const badDate = await extractPdf(buildMinimalPdf({ creationDate: "not-a-date" }));
      expect(badDate.publishedAt).toBeNull();
      // the TEXT is what retrieval needs, so it must survive unusable metadata
      expect(badDate.markdown.toLowerCase()).toContain("grape disease control");
    },
    PDF_TIMEOUT_MS,
  );

  it(
    "uses a real metadata Title when present",
    async () => {
      const bytes = buildMinimalPdf({ title: "Grape Disease Control 2018" });
      const { title } = await extractPdf(bytes);
      expect(title).toBe("Grape Disease Control 2018");
    },
    PDF_TIMEOUT_MS,
  );

  it(
    "falls back to the first text line when the metadata Title is producer junk",
    async () => {
      const bytes = buildMinimalPdf({
        title: "PowerPoint Presentation",
        text: "Managing sour rot in Finger Lakes vineyards",
      });
      const { title } = await extractPdf(bytes);
      expect(title).toBe("Managing sour rot in Finger Lakes vineyards");
    },
    PDF_TIMEOUT_MS,
  );

  it(
    "carries the PDF date through the extractDocument router",
    async () => {
      const bytes = buildMinimalPdf({ creationDate: "D:20220509184810Z00'00'" });
      const doc = await extractDocument(bytes, "pdf", "https://blogs.cornell.edu/grapes/x.pdf");
      expect(doc.kind).toBe("pdf");
      expect(doc.publishedAt?.getUTCFullYear()).toBe(2022);
    },
    PDF_TIMEOUT_MS,
  );
});

describe("extraction routing", () => {
  // Also Defuddle-backed, and test order is not guaranteed — whichever case runs first in the worker pays
  // the cold linkedom import, so this one needs the same ceiling.
  it(
    "routes html content type through Defuddle",
    async () => {
      const doc = await extractDocument(Buffer.from(ARTICLE, "utf8"), "html", "https://www.awri.com.au/x/");
      expect(doc.kind).toBe("html");
      expect(doc.lowConfidence).toBe(false);
      expect(doc.markdown.toLowerCase()).toContain("brett");
    },
    DEFUDDLE_TIMEOUT_MS,
  );

  it("rejects an unsupported content type", async () => {
    await expect(
      extractDocument(Buffer.from("{}"), "other", "https://x/"),
    ).rejects.toThrow(/unsupported content type/);
  });
});
