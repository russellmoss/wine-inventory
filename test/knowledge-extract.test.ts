import { describe, it, expect } from "vitest";
import { extractHtml } from "@/lib/knowledge/extract/html";
import { extractDocument } from "@/lib/knowledge/extract";

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

describe("HTML extraction (Defuddle -> markdown)", () => {
  it("extracts the title and article body, dropping nav/footer boilerplate", async () => {
    const { title, markdown, wordCount } = await extractHtml(ARTICLE, "https://www.awri.com.au/x/");
    expect(title.toLowerCase()).toContain("barrel sanitation");
    expect(markdown.toLowerCase()).toContain("reverse osmosis");
    expect(wordCount).toBeGreaterThan(20);
  });

  it("preserves the table's numeric cell values (dose/limit safety)", async () => {
    const { markdown } = await extractHtml(ARTICLE, "https://www.awri.com.au/x/");
    // whether rendered as a markdown table or linearized, the numbers must survive
    for (const v of ["70", "85", "30", "15"]) {
      expect(markdown).toContain(v);
    }
  });
});

describe("extraction routing", () => {
  it("routes html content type through Defuddle", async () => {
    const doc = await extractDocument(Buffer.from(ARTICLE, "utf8"), "html", "https://www.awri.com.au/x/");
    expect(doc.kind).toBe("html");
    expect(doc.lowConfidence).toBe(false);
    expect(doc.markdown.toLowerCase()).toContain("brett");
  });

  it("rejects an unsupported content type", async () => {
    await expect(
      extractDocument(Buffer.from("{}"), "other", "https://x/"),
    ).rejects.toThrow(/unsupported content type/);
  });
});
