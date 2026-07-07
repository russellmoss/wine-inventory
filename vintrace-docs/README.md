# vintrace Help Center — Documentation Corpus

A local, Markdown-converted mirror of the **entire vintrace help center**, captured for
**competitive analysis**. vintrace is a winery-production ERP and the closest incumbent to
Cellarhand; this corpus lets us (and our agents) read how they document their features,
workflows, terminology, compliance handling, and reporting — offline, greppable, and diff-able.

## What's here

```
vintrace-docs/
├── README.md            ← this file
├── INDEX.md             ← human/agent-readable tree: category → section → article (with links)
├── _manifest.json       ← machine-readable hierarchy + per-article metadata + file paths
├── _raw/                ← raw Zendesk API JSON responses (gitignored — re-parse without re-fetching)
├── api/                 ← Vintrace v7 REST API: OpenAPI specs + migration KB (see api/INDEX.md)
└── <category>/<section>/<article>.md   ← one Markdown file per article
```

> **Two different Vintrace references, two purposes.** This help-center corpus is for
> **competitive/parity analysis** (feeds the parity register). The [`api/`](./api/INDEX.md)
> subtree is the **v7 OpenAPI specs + a migration knowledge base** for building the
> Vintrace→Cellarhand importer (see [`api/MIGRATION-STRATEGY.md`](./api/MIGRATION-STRATEGY.md)).

- **567 articles** across **7 categories** and **56 sections** (as of the last run).
- Categories: vintrace Web, Harvest/Vintage, Setup and Admin, Reporting, Mobile App,
  Release Notes, FAQ.

Each article file has YAML frontmatter:

```yaml
---
id: "<zendesk article id>"
title: "<article title>"
url: "<original html_url on support.vintrace.com>"
category: "<category name>"
section: "<section name>"
created_at: "<ISO timestamp>"
updated_at: "<ISO timestamp>"
labels: ["<label>", ...]
---
```

...followed by the article title as an `#` heading and the body converted from HTML to
Markdown. Tables, headings, links, and images are preserved. **Images are left as remote
links** (pointing at `support.vintrace.com/hc/article_attachments/...`) — they are not
downloaded.

## How it was generated

Via the **public Zendesk Help Center REST API** — no authentication, no browser automation,
no HTML page scraping:

- Base: `https://support.vintrace.com/api/v2/help_center/en-us/`
- `categories.json`, `sections.json?per_page=100`, and the paginated
  `articles.json?per_page=100` (following `next_page` until null). Each article includes its
  full HTML `body`.

The generator is [`scripts/scrape_vintrace_docs.py`](../scripts/scrape_vintrace_docs.py). It:

1. Fetches categories, sections, and all article pages, with a 0.5s delay between requests
   and retry-with-exponential-backoff on non-200 responses.
2. Builds the article → section → category hierarchy and converts each HTML body to Markdown
   (via `markdownify`), leaving images as remote links.
3. Writes each article to `<category-slug>/<section-slug>/<article-slug>.md` with frontmatter.
   Slugs are Windows-safe (no colons/slashes/reserved names) and collisions are de-duped with
   the article id.
4. Writes `_manifest.json` (full hierarchy + metadata) and `INDEX.md` (readable tree).
5. Saves raw API responses to `_raw/` so the corpus can be re-parsed without re-fetching.
6. Prints a summary: articles written vs. the expected 567, plus any failures.

### Re-running / refreshing

```bash
pip install markdownify          # one-time (requests is already available)
python scripts/scrape_vintrace_docs.py
```

The script is idempotent — it overwrites files in place. Only `vintrace-docs/_raw/` is
gitignored; the Markdown corpus, `INDEX.md`, and `_manifest.json` are tracked so the corpus
is available without a re-fetch.

## Enrichment (cleanup + annotation)

This corpus has been enriched for agent navigation (see [`analysis/CORPUS-GUIDE.md`](../analysis/CORPUS-GUIDE.md)):

- **Cleanup.** Conversion junk (empty headings, trailing "Related Articles" footers,
  helpfulness/boilerplate lines) is stripped by `clean_markdown()` in
  [`scripts/corpus_common.py`](../scripts/corpus_common.py). The fix lives in the parser, not
  in hand-edits — the corpus was regenerated offline from `_raw/` via
  `python scripts/scrape_vintrace_docs.py --from-raw` (no re-fetch).
- **Annotation.** Every article's frontmatter (and its `_manifest.json` entry) carries two
  extra fields, added by [`scripts/annotate_docs.py`](../scripts/annotate_docs.py):
  - `gist` — a one-sentence, **strictly descriptive** summary. It is *extracted verbatim*
    from the article body (first substantive sentence), never generated.
  - `tags` — 3–6 topics from a **controlled vocabulary** (`corpus_common.TAG_RULES`; the full
    list with per-corpus counts is in the corpus guide). A minority of very narrow stubs get
    fewer than 3. `_manifest.json` also gains an `annotation` block (vocabulary + tag counts).

Re-run enrichment after any re-scrape: `python scripts/annotate_docs.py vintrace-docs`, then
`python scripts/build_corpus_guide.py`.

## Notes & caveats

- **This is third-party content** owned by vintrace, retained here solely for internal
  competitive analysis. Do not redistribute or republish.
- Content reflects vintrace's help center at capture time; the `updated_at` frontmatter and
  `_manifest.json` record the source timestamps. Re-run to refresh.
