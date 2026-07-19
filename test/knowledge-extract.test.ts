import { beforeAll, describe, it, expect } from "vitest";
import { extractHtml, loadDefuddle } from "@/lib/knowledge/extract/html";
import { extractDocument, sanitizeText } from "@/lib/knowledge/extract";

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
