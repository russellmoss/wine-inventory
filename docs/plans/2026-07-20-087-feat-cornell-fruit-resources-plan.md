---
title: Cornell Fruit Resources knowledge source + sitemap-lastmod date fallback
type: feat
status: draft
date: 2026-07-20
branch: claude/cornell-fruit-resources
depth: lightweight
units: 2
---

# Plan 087 — Cornell Fruit Resources

> **History:** written as an addendum to fold into plan 085 as Units 9-10. That premise died when
> **085 merged as #415** before it could be appended. Re-filed as a standalone plan; the two units
> are unchanged. Unit 1 below was Unit 9; Unit 2 was Unit 10.
>
> ⚠️ **Check for a parallel session first** — a `claude/cornell-grapes-knowledge-source-808b00`
> worktree already exists and may already cover some of this.

## Sequencing note

Unit 1 lands in `src/lib/knowledge/extract/published-date.ts`, which **085's Unit 5 already
modified** (the MSU metadata-date normalizer, now on main). Read that normalizer before touching
the file — this adds a *lower-precedence* fallback beneath it, it does not replace it.

## Recon (verified live, 2026-07-20)

| Check | Result |
|---|---|
| `blogs.cornell.edu/grapes/` | ✅ 200, no bot protection |
| `robots.txt` | ✅ only `Disallow: /wp-admin/` — `/grapes/` allowed, nothing bypassed |
| Path scoping | ✅ everything under one `/grapes/` prefix — **no `linkedOnlyPrefixes` needed** |
| Per-blog sitemap | ✅ `blogs.cornell.edu/grapes/wp-sitemap.xml` |
| `cropandpestguides.cce.cornell.edu` | ❌ unreachable (ECONNREFUSED 128.84.12.20:443) — **and paid. Do not crawl.** |
| `hort.cornell.edu` | ❌ unreachable |
| `grapesandwine.cals.cornell.edu`, `nysipm.cornell.edu` | 301 → `cals.cornell.edu/*`. Separate host; out of scope for these units. |

Publisher: Cornell Tree Fruit & Berry PWT + Viticulture and Enology PWT. Sections: Production,
IPM (Diseases, Insects & Mites, NYS IPM Project Reports), Post-Harvest/Enology, News. Regional
pages for Finger Lakes, Lake Erie, and **Long Island**. Content mix ≈70% durable reference / 30%
seasonal.

**The blocker, and it is the inverse of MSU's.** MSU's *articles* were undated. Cornell's
*articles* are fine — `<time class="entry-date" datetime="2020-11-18T17:31:18+00:00">`. It is the
**durable reference pages that carry no date at all**: no `<time>`, no JSON-LD, no
`article:published_time` on `/grapes/ipm/diseases/`, `/grapes/production/`, `/grapes/post-harvest/`.
Ingested as-is, the valuable 70% lands 100% `unknown` age — the exact outcome 085 Unit 5 exists to
prevent, arriving through a different door.

The dates exist in the sitemap:

```
/grapes/ipm/diseases/                     2026-05-14T12:44:20+00:00
/grapes/production/                       2026-05-14T12:43:27+00:00
/grapes/ipm/                              2023-06-13T17:49:53+00:00
/grapes/post-harvest/                     2021-02-09T18:30:12+00:00
/grapes/production/production-archives/   2019-03-15T13:38:20+00:00
```

⚠️ **Trap:** the *network* sitemap `blogs.cornell.edu/wp-sitemap.xml` contains **zero** grape URLs
(605 bytes, multisite root). The per-blog sitemap is `blogs.cornell.edu/grapes/wp-sitemap.xml`.
Point `sitemapUrls` at the sub-blog one or discovery silently finds nothing.

---

### Unit 1: Sitemap `lastmod` as a last-resort `publishedAt`

**Goal:** A page with no in-body date signal inherits its sitemap `lastmod`, with zero change to
any document that already resolves a date.
**Files:** `src/lib/knowledge/extract/published-date.ts`, `src/lib/knowledge/index-documents.ts`,
`src/lib/knowledge/crawl/crawler.ts`, `test/knowledge-published-date.test.ts`
**Approach:** `collectSitemapUrls` already returns `{ loc, lastmod }` (`sitemap.ts:9-11`,
kept deliberately per the comment at `:2-4`), so no parsing work — this is plumbing plus one
precedence rule.

Thread the discovered `lastmod` through the crawl queue into `indexDocument` as an optional
`fallbackDate`. Apply it **only** when body/metadata extraction returns `null`. Precedence, lowest
last: label-anchored body date → normalized metadata date (085 Unit 5, merged) → **sitemap `lastmod`**.

Two constraints:
1. **Never let `lastmod` override a resolved date.** A CMS bumps `lastmod` on any trivial edit; a
   real published/revised stamp is better evidence. Fallback only.
2. **Run it through the existing `buildDate`** so the range checks, roll-over rejection, and
   future-date rejection all still apply. A malformed `lastmod` must yield `null`, not a guess.

Semantically this is not a workaround: `published-date.ts:108` states `publishedAt` means "when was
this last revised," which is what `lastmod` *is*. Record that reasoning in a comment.

Also preserve `index-documents.ts:196` behavior — a re-index must never erase a good date.
**Tests:** undated page + `lastmod` → date resolved; dated page + `lastmod` → body date wins,
`lastmod` ignored; malformed `lastmod` → `null`, not a throw; future `lastmod` → rejected by
`buildDate`; no `lastmod` → unchanged `null`. Reuse the file's fixed
`NOW = new Date(Date.UTC(2026, 6, 20))`.
**Depends on:** none (085 Unit 5 already merged — read it first, this sits beneath it)
**Execution note:** test-first
**Patterns to follow:** `published-date.ts:44-55` (`buildDate`); `sitemap.ts:56-57` (lastmod shape)
**Verification:** `npx vitest run test/knowledge-published-date.test.ts`

### Unit 2: Cornell source entry, trusted domain, verify

**Goal:** `cornell-grapes` in the corpus, dated, scoped to `/grapes/`.
**Files:** `src/lib/knowledge/config.ts`, `scripts/verify-cornell-grapes.ts`, `package.json`
**Approach:** One `KNOWLEDGE_SOURCES` entry — `key: "cornell-grapes"`, publisher "Cornell Fruit
Resources (Cornell CALS)", `tier: 1`, `autoCrawl: true` (single clean prefix, so path filtering
suffices — the UC IPM justification at `config.ts:456-459` applies verbatim), `defaultEnabled`
matching the other Tier-1 extension sources.

- `seedRoots: ["https://blogs.cornell.edu/grapes/"]`
- `allowPrefixes: ["/grapes/"]`
- `sitemapUrls: ["https://blogs.cornell.edu/grapes/wp-sitemap.xml"]` — **the sub-blog one**
- `denyPrefixes`: `/grapes/wp-content/`, `/grapes/wp-admin/`, `/grapes/files/`,
  `/grapes/comments/`, plus the taxonomy noise (`/category/`, `/tag/`, `/author/`)

Add `blogs.cornell.edu` to `TRUSTED_DOMAINS`. It is a **shared multisite** — every Cornell blog
lives on that host — so the `/grapes/` `allowPrefixes` gate is what keeps the corpus clean. Say so
in the comment, in the house style where every source carries its reasoning.

**Explicitly out of scope, and record why:** the Cornell Pest Management Guidelines
(`cropandpestguides.cce.cornell.edu`) are a **paid publication** and the host is unreachable.
Not crawled, not linked, not a fallback. Adding this source does **not** bring Table 3.2.1 into the
corpus — the biologicals gap in plan 086's Unit 4 stays open. Different problem.

**Tests:** config test asserting `/grapes/` is the only allow prefix, and that the sitemap URL is
the sub-blog one (guards the network-root trap above).
**Depends on:** Unit 1
**Verification:** `npm run seed:knowledge-sources`, then `npm run crawl:source cornell-grapes` and
`npm run verify:cornell-grapes` **from the MAIN checkout** (needs `.env`; worktrees have none).
Assert: ≥1 retrieval case hits a `/grapes/ipm/` URL; **≥80% of indexed docs carry a non-null
`publishedAt`** (this is the Unit 1 proof — without it the number would be near zero); zero indexed
URLs outside `/grapes/`.

---

## Risks these units add

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `lastmod` fallback makes stale pages look fresh | MED | MED | Fallback-only precedence; `/grapes/production/production-archives/` legitimately reads 2019. `passage-age.ts` still ages it. |
| Multisite host lets link-following wander into other Cornell blogs | LOW | MED | `allowPrefixes: ["/grapes/"]`; the Unit 2 config test guards it. |
| Unit 1 regresses dates for the other 20 sources | LOW | **HIGH** | Fallback never overrides; regression cases in the existing `it.each` table. Sabotage-check the precedence rule, per this repo's convention. |

## Success criteria

- [ ] `/grapes/ipm/diseases/` indexes with `publishedAt` = 2026-05-14 (sitemap-derived)
- [ ] A dated article still resolves from its `<time>` element, not `lastmod`
- [ ] No indexed URL outside `/grapes/`
- [ ] No document from `cropandpestguides.cce.cornell.edu`
- [ ] Existing 20 sources show no `publishedAt` change (spot-check uc-ipm before/after)
