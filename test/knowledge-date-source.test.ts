import { describe, it, expect } from "vitest";
import { dateOf } from "@/lib/knowledge/retrieve";

// Plan 084. A declared publication date and a sitemap <lastmod> are not interchangeable, and the
// difference is load-bearing: the assistant reasons about the staleness of spray and pesticide guidance
// from this value. A lastmod is when the page was last EDITED — on WordPress that is a theme migration,
// a plugin bulk-edit or a category re-tag — so an untouched 2009 guide re-tagged last month would
// otherwise read as current-season advice.
describe("dateOf (which KIND of date is this?)", () => {
  const published = new Date("2017-05-31T00:00:00Z");
  const lastmod = new Date("2026-02-11T00:00:00Z");

  it("prefers a declared publication date and labels it", () => {
    expect(dateOf({ publishedAt: published, sitemapLastmod: lastmod })).toEqual({
      publishedAt: published,
      dateSource: "published",
    });
  });

  it("falls back to the sitemap lastmod but labels it as last-modified", () => {
    expect(dateOf({ publishedAt: null, sitemapLastmod: lastmod })).toEqual({
      publishedAt: lastmod,
      dateSource: "last-modified",
    });
  });

  it("reports unknown when there is neither", () => {
    expect(dateOf({ publishedAt: null, sitemapLastmod: null })).toEqual({
      publishedAt: null,
      dateSource: "unknown",
    });
  });

  it("never labels a fallback as published, even when the lastmod is newer", () => {
    // The dangerous direction: a NEWER lastmod on OLDER content. Labelling must not follow recency.
    const { dateSource } = dateOf({ publishedAt: null, sitemapLastmod: new Date() });
    expect(dateSource).not.toBe("published");
  });
});
