# InnoVint Help Center — Documentation Corpus

A local, Markdown-converted mirror of the **entire InnoVint help center**, captured for
**competitive analysis**. InnoVint is a cloud winery-production platform and a direct
competitor to Cellarhand; this corpus lets us (and our agents) read how they document their
features, workflows, terminology, compliance, and reporting — offline, greppable, diff-able,
and in the **same schema as [`vintrace-docs/`](../vintrace-docs/)** so the two corpora can be
treated uniformly.

## What's here

```
innovint-docs/
├── README.md            ← this file
├── INDEX.md             ← human/agent-readable tree: category → section → page (with links)
├── _manifest.json       ← machine-readable hierarchy + per-page metadata + file paths
├── _raw/                ← raw page HTML + sitemap (gitignored — re-parse without re-fetching)
└── <category>/<section>/<page>.md   ← one Markdown file per page
```

- **432 pages** written from the sitemap (0 fetch/parse failures), across **13 categories**.
- **178 knowledge-base articles** (`/hc/en-us/articles/<id>-slug`) + **254 landing/webinar/
  academy pages** (slug-only). Each file's `page_type` frontmatter records which it is.
- Categories include: MAKE, MAKE Advanced Features, GROW, HARVEST, FINANCE, SUPPLY, InnoApp,
  Guidance & FAQs, InnoVint Academy, New to InnoVint, Product Updates, and Support Hours FAQs.

Each page file has YAML frontmatter:

```yaml
---
title: "<page H1>"
url: "<original url on support.innovint.us>"
category: "<breadcrumb category, or 'uncategorized'>"
section: "<breadcrumb section, or 'general'>"
page_type: "article" | "page"     # article = /articles/<id>-slug; page = landing/webinar/academy
lastmod: "<sitemap lastmod date, or empty>"
---
```

...followed by the page title as an `#` heading and the body converted from HTML to Markdown.
Tables, headings, links, and images are preserved. **Images are left as remote links**
(pointing at HubSpot / InnoVint CDN URLs) — they are not downloaded.

## How it was generated

InnoVint's help center uses Zendesk-style `/hc/en-us/` URLs but is **HubSpot-hosted** — there
is **no Zendesk API** (`/api/v2/help_center/*` returns 404). Every page is server-rendered
HTML, so we discover URLs from the sitemap and fetch each page directly. No browser
automation, no JS rendering.

- **Sitemap:** `https://support.innovint.us/sitemap.xml` lists every page URL with a `lastmod`
  date. We take all URLs under `https://support.innovint.us/hc/en-us/`.
- **Pages:** fetched with plain `requests` using a **real-browser User-Agent + standard
  headers** (the site sits behind Cloudflare; standard headers were sufficient — no heavier
  tooling needed).
- **Parsing (BeautifulSoup):** H1 → title; `ol.hs-kb-breadcrumbs` → category/section
  (dropping the "Support Center" root and any trailing crumb that repeats the title); the
  article body from `article.knowledgebase-post` (a.k.a. `.article-wrapper .hs-kb-content`).
  Nav, sidebar, breadcrumb, related-articles, feedback, and social chrome are stripped before
  Markdown conversion (via `markdownify`).

The generator is [`scripts/scrape_innovint_docs.py`](../scripts/scrape_innovint_docs.py). It:

1. Fetches the sitemap and extracts all `/hc/en-us/` URLs, tagging each `article` vs `page`.
2. Fetches each page with a 0.5s delay and retry-with-exponential-backoff on non-200s.
3. Parses title, breadcrumb hierarchy, `lastmod`, and body; strips chrome; converts to Markdown.
4. Writes each page to `<category-slug>/<section-slug>/<page-slug>.md` with frontmatter.
   Slugs are Windows-safe; collisions are de-duped with a numeric suffix; missing breadcrumbs
   fall back to `uncategorized`/`general`.
5. Writes `_manifest.json` and `INDEX.md` in the **same shape as `vintrace-docs/`**, and saves
   raw HTML to `_raw/` for re-parsing without re-fetching.
6. Prints a summary: pages fetched vs. sitemap count, parse/fetch failures, and empty-body
   pages (listed for spot-checking).

### Known empty / near-empty bodies

- **"Submit a help ticket"** (`/hc/en-us/kb-tickets/new`) is a support-ticket form, not an
  article — no body. Listed under `empty_bodies` in `_manifest.json`.
- **2 non-content system pages are skipped** (not written): the 404 placeholder (`kb-404`) and
  the search-results template (`kb-search-results`). See `skipped_system_pages` in the manifest.
- ~19 InnoVint Academy "quick video tutorials" and the **Harvest Operations Flowchart** have
  very short bodies by nature — they are an embedded video or a single flowchart image with a
  one-line caption (images are kept as remote links). These are legitimate, not parse failures.

## Enrichment (cleanup + annotation)

This corpus has been enriched for agent navigation (see [`analysis/CORPUS-GUIDE.md`](../analysis/CORPUS-GUIDE.md)):

- **Cleanup.** Conversion junk (empty headings — HubSpot leaves many bare `##` placeholders —
  plus footers/boilerplate) is stripped by `clean_markdown()` in
  [`scripts/corpus_common.py`](../scripts/corpus_common.py). The fix lives in the parser; the
  corpus was regenerated offline from `_raw/` via
  `python scripts/scrape_innovint_docs.py --from-raw` (no re-fetch).
- **Annotation.** Every page's frontmatter (and its `_manifest.json` entry) carries two extra
  fields, added by [`scripts/annotate_docs.py`](../scripts/annotate_docs.py):
  - `gist` — a one-sentence, **strictly descriptive** summary, *extracted verbatim* from the
    body (first substantive sentence), never generated.
  - `tags` — 3–6 topics from a **controlled vocabulary** shared with the vintrace corpus
    (`corpus_common.TAG_RULES`; full list + per-corpus counts in the corpus guide). Very narrow
    stubs may get fewer than 3. `_manifest.json` also gains an `annotation` block.

Re-run enrichment after any re-scrape: `python scripts/annotate_docs.py innovint-docs`, then
`python scripts/build_corpus_guide.py`.

### Re-running / refreshing

```bash
pip install beautifulsoup4 markdownify   # one-time (requests is already available)
python scripts/scrape_innovint_docs.py
```

The script is idempotent — it overwrites files in place. Only `innovint-docs/_raw/` is
gitignored; the Markdown corpus, `INDEX.md`, and `_manifest.json` are tracked.

## Notes & caveats

- **This is third-party content** owned by InnoVint, retained here solely for internal
  competitive analysis. Do not redistribute or republish.
- Content reflects InnoVint's help center at capture time; the `lastmod` frontmatter and
  `_manifest.json` record the source dates. Re-run to refresh.
