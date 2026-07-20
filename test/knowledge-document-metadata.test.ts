import { describe, it, expect } from "vitest";
import { buildDocumentMetadata } from "@/lib/knowledge/index-documents";

// Plan 084. This is the ONLY write path for publishedAt and canonicalTitle, and the DB write itself
// needs a live Postgres plus a Voyage embedding call — so without this seam the decision had no
// automated coverage at all, and its failure mode is silent (citations quietly degrade to "unknown"
// and a bare publisher name).
describe("buildDocumentMetadata", () => {
  it("carries a real date and title through", () => {
    const d = new Date("2018-05-07T14:15:03Z");
    expect(buildDocumentMetadata({ title: "Grape Disease Control 2018", publishedAt: d })).toEqual({
      publishedAt: d,
      canonicalTitle: "Grape Disease Control 2018",
    });
  });

  it("writes a NULL date rather than preserving the previous one", () => {
    // This is reached only when the CONTENT CHANGED (an unchanged hash returns early), so a retained
    // date would belong to content that no longer exists. Extension sites reuse URLs: a 2024-dated page
    // replaced by an undated reprint of a 2011 guide would otherwise keep the 2024 date, and the
    // assistant would skip the "confirm this product is still registered" warning it gives older
    // material. The key must be PRESENT and null, not absent.
    const meta = buildDocumentMetadata({ title: "Some Guide", publishedAt: null });
    expect(meta.publishedAt).toBeNull();
    expect("publishedAt" in meta).toBe(true);
  });

  it("maps an empty or whitespace title to null, not an empty string", () => {
    // citation.ts renders `canonicalTitle || publisher`; an empty string would fall through to the
    // publisher anyway, but storing "" makes "has a title" queries lie.
    expect(buildDocumentMetadata({ title: "", publishedAt: null }).canonicalTitle).toBeNull();
    expect(buildDocumentMetadata({ title: "   ", publishedAt: null }).canonicalTitle).toBeNull();
  });

  it("trims and caps an over-long title at 300 chars", () => {
    expect(buildDocumentMetadata({ title: "  Padded  ", publishedAt: null }).canonicalTitle).toBe("Padded");
    const long = "Managing downy mildew ".repeat(50);
    const title = buildDocumentMetadata({ title: long, publishedAt: null }).canonicalTitle!;
    expect(title.length).toBe(300);
  });
});
