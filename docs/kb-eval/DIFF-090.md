# Plan 090 Unit 10 — before/after verdict

Re-index scope: `osu-owri`, `wbi`, `lvwo` — **606 documents, 100% complete**.
Baseline: `docs/kb-eval/snapshot.json` captured 2026-07-22T05:13Z, `--repeat 3`.
Gate after: `verify:knowledge-base` **21 passed / 0 failed**.

## Corpus-level result (the three re-indexed sources)

| metric | before | after |
|---|---|---|
| avg distinct breadcrumbs per doc | **1.00** | 3.02 (osu-owri) · 3.62 (lvwo) · 20.14 (wbi) |
| avg max breadcrumb length | **200 chars** | 71 · 84 · 108 |
| worst breadcrumb anywhere | 200 | **140** (the cap, exactly) |
| documents with `canonicalTitle` | **0 / 606** | **606 / 606** |
| documents with `publishedAt` | ~5 / 606 | **606 / 606** |
| documents containing mojibake | 7 | **0** |

HTML documents were **not** re-indexed and **not** disturbed — verified: 0 HTML docs touched. That was
the explicit design of `deriveIndexHash(…, isPdf)` and it held.

## Per-query verdict

9 queries moved. A movement is not automatically a regression, so each is judged.

| query | verdict | why |
|---|---|---|
| **nutrients for Pinot noir** | ✅ **major improvement, goal partly unmet** | The 2015 newsletter MASTHEAD fell **rank 1 → 7**. Rank 1 is now real data ("194 samples… alpha-amino acid content"). Dates went 2/8 → **7/8**. **But AWRI is still absent** — see below. |
| **YAN (control)** | ✅ improvement | The OWRI "new website announcement" junk **left top-8** (was rank 3). VT's real YAN content moved 5→4 and 6→5. AWRI's YAN page held rank 1. |
| leafroll / mealybug | ✅ improvement | Gained a Wine Australia leafroll PDF; a duplicated OWRI doc collapsed 2 slots → 1, freeing a slot for real content. |
| Brett aroma removal | ✅ neutral-positive | Gained VT + an OWRI doc; lost a WSU newsletter duplicate. Expected sources still present, case passes. |
| Brett barrel sanitation | ⚠️ neutral | `Brett-fact-sheet.pdf` left top-8, but `barrel-cleaning-storage-and-maintenance` (also an expected path) holds rank 3. Case passes. Worth re-checking after AWRI is re-indexed. |
| IPM thresholds | ⚠️ neutral | MAPA's Spanish guide left rank 8; UC IPM (the canonical US source) still holds 3 slots. Case passes. |
| yeast strain / nutrient | ✅ trivial | Scott Labs choosing-guide 7→6, VT 6→7. Noise-level. |
| IPA rejection | ✅ still rejects | Movement is *within* already-off-topic results. Gate passes. |
| espresso rejection | ✅ still rejects | LVWO German pesticide tables entered ranks 1–2 — irrelevant, but not coffee content, and the corpus has no coffee. Gate passes. |

## ⚠️ The prediction that was wrong

The plan and the eval case both recorded the nutrient-query root cause as *"OWRI PDFs dominate via the
192-char breadcrumb prefix."*

**That explains the masthead and nothing else.** Measured after the re-index: the AWRI YAN page is **not
in the top 40** for this phrasing, and there are **zero AWRI passages anywhere in the top 40**. AWRI is
not losing the last slot to Oregon PDFs — it is nowhere near contention.

The same AWRI document ranks **#1** on *"What is the most ideal YAN concentration for a white must?"*,
so it is present, enabled and retrievable. The gap is **vocabulary**: "nutrients to add to … fermentation"
matches Oregon nitrogen field research more strongly than a page written around "Yeast Assimilable
Nitrogen (YAN)".

Nothing in plan 090 addresses that, and it should not have been filed under this plan. Candidate fixes:
synonym expansion (`synonyms.ts` already exists for acronyms and units) or query rewriting. Deliberately
not attempted here — changing scoring during an ingest change makes the diff uninterpretable.

## Residual defects, all in sources NOT yet re-indexed

Every remaining piece of junk in the top-8 of these two queries comes from a source outside the
re-index scope, which is itself evidence the fix works:

- **AWRI copyright page** still at rank 2 on the YAN query ("© Copyright 2019 The Australian Wine
  Research Institute PO Box 197…"). `isBoilerplateSection` would drop it; `awri` has not been re-indexed.
- **Scott Labs handbook masthead** at rank 3–4 on both queries ("2 VINEYARDYEASTNUTRIENTSML… Welcome to
  the 2025-2026 Scott Laboratories Winemaking Handbook"). Same reason.

Two genuine residual bugs in the new code, both minor and both visible in the output above:

1. **Running headers survive in places** — `"Viticulture & Enology > Viticulture & Enology > Technical
   Newsletter > Oregon Wine Research Institute…"`. `dropRunningHeaders` requires an exact repeated line
   on ≥50% of pages; this newsletter's header varies slightly per page, so it slips through.
2. **A filename-derived title leaked** — `"VitEnoTechNwsltr-mar2016-Danielle Fianl"`. `cleanPdfTitle`
   only rejects filename stems that still carry an extension; this one has none.

Neither is a regression (both are far better than the 200-char slab they replaced), and both are cheap
to fix in a follow-up.

## Round 2 — the remaining PDF sources (2026-07-22, later)

Extended the re-index to every remaining PDF source. **1,378 of 1,386 PDF documents (99.4%)**.
Gate after: `verify:knowledge-base` **21 passed / 0 failed**. Baseline re-captured, 20/20 stable.

| metric (ALL pdf docs corpus-wide) | before | after |
|---|---|---|
| avg distinct breadcrumbs | 1.00 | **7.88** |
| avg max breadcrumb length | 200 chars | **87** |
| worst breadcrumb anywhere | 200 | **140** (the cap) |
| documents with a title | 64 / 1,386 | **1,378 / 1,378** |
| documents with a date | ~5 | **1,371 / 1,378** |
| documents with mojibake | 7 | **0** |

**Both residuals from round 1 are gone**, and the clearest single demonstration of the whole plan is
the Scott Labs handbook on the nutrient query — the SAME document, before and after:

```
before  rank 1  "2 VINEYARDYEASTNUTRIENTSML BACTERIAOAKTANNINS…
                 Welcome to the 2025-2026 Scott Laboratories Winemaking Handbook"   ← cover page
after   rank 1  §2025 WM Handbook > Nutrients > L
                "Frequently used in: Pinot noir, light…"                             ← the Nutrients section
```

The AWRI copyright page is likewise replaced on the YAN query by
`AWRI Practices Survey > Nitrogen addition rates adapted based on grape/juice YAN measurements`
(dated 2019-05-27). Dates in top-8: nutrient **7/8**, YAN **5/8**.

**The 8 documents not re-indexed are dead at source.** All 8 are Wine Australia I-GRO workbooks
returning HTTP 404 — and the server itself lowercases the path before 404ing, so the original-case and
lowercase URLs land identically. Verified with curl; not a crawler bug. They still hold stale chunks and
should tombstone on the next monthly sweep (only 404/410 counts as removed, per plan 085).

### Robots audit — all 23 sources

Only **3 of 23** sources block anything; 16 are fully open and 4 serve no robots.txt.

| source | rule | judged | outcome |
|---|---|---|---|
| wbi | `/*.pdf$ /*.doc$ /*.mp4$ /*.xls$ /*.zip$` | incidental — generic file-type CMS boilerplate | already exempt, 79/79 re-indexed |
| lvwo | identical | incidental — same CMS template | already exempt, 263/263 re-indexed |
| wine-australia | `# Block all media files` → `/getmedia/*` | deliberate but bandwidth-motivated; Googlebot explicitly allowed | **owner-approved override**, 216 re-indexed |

**The one block worth keeping**, verified directly against AWRI's robots for our UA:

```
false   /information_services/technical_review/latest_issue/    ← PAYWALLED
true    everything else AWRI
```

That is the single place in this corpus where robots carries paid-content meaning rather than bandwidth
boilerplate, and it is why a blanket bypass would be wrong. It is already double-guarded by a
`denyPrefixes` entry in `config.ts`.

⏱️ **`osu-owri` declares `Crawl-delay: 16s`** — 264 documents is 70 minutes of mandated waiting, which
is what made that source slow, not timeouts. (`scott-labs` 10s, `wbi`/`lvwo` 2s, `umc` 1s.)

⚠️ Audit method: sample paths derived from each source's `allowPrefixes`, not every real URL. A reliable
screen for whole-prefix and file-type blocks — which all three real blocks were — but a rule targeting
one specific deep path could hide from it.

## Recommendation

1. **Extend the re-index to the remaining PDF sources** — `awri`, `scott-labs`, `cornell-grapes`,
   `chambre-gironde`, `icvv`, `incavi`, `mapa`, `laffort`, `enartis`, `vt-enology-notes`,
   `wine-australia`, `wsu`. ~798 more PDF documents. This is what removes the copyright page and the
   Scott Labs masthead.
2. **File the two residual extractor bugs** rather than fixing them inline.
3. **The AWRI vocabulary gap is its own piece of work** — synonym expansion, measured on its own, so the
   effect is attributable.
4. **AJEV remains deferred** until 1 lands.
