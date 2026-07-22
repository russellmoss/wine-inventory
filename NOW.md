# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**PLAN 090 — UNITS 1-10 DONE (18 commits, NOT pushed). RE-INDEX COMPLETE (606 docs), DIFF JUDGED.**
Plan: [2026-07-22-090-…](docs/plans/2026-07-22-090-fix-kb-rag-retrieval-quality-plan.md).
Verdict: [docs/kb-eval/DIFF-090.md](docs/kb-eval/DIFF-090.md). `verify:knowledge-base` **21/0**.

✅ **On the three re-indexed sources (osu-owri, wbi, lvwo):** avg breadcrumbs **1.00 → 3.0/3.6/20.1**;
avg max breadcrumb **200 → 71/84/108** chars (worst anywhere = 140, the cap, exactly); titles
**0/606 → 606/606**; dates **~5/606 → 606/606**; mojibake **7 docs → 0**; **0 HTML docs disturbed**
(exactly what `deriveIndexHash(…, isPdf)` was designed to guarantee).

🎯 **The masthead is dead.** On "best nutrients to add to Pinot noir fermentation" the 2015 newsletter
masthead fell **rank 1 → 7**; rank 1 is now real data ("194 samples… alpha-amino acid content"); dates
went 2/8 → 7/8. All 9 moved queries judged individually; both rejection cases still reject.

🔻 **MY ROOT CAUSE WAS HALF WRONG, and this is the part to remember.** I recorded the nutrient gap as
"OWRI PDFs dominate via the 192-char prefix". That explains the MASTHEAD and nothing else. **AWRI is not
in the TOP 40 for that phrasing — zero AWRI passages in 40.** It was never being crowded out of the last
slot; it is nowhere near contention. The same doc ranks **#1** on "ideal YAN concentration for a white
must". The gap is **VOCABULARY** (nutrient vs "Yeast Assimilable Nitrogen"), needs synonym expansion or
query rewriting, and **does not belong to plan 090**. The eval case's `knownFailing` note now says so.

🔄 **IN FLIGHT: re-index of the remaining 790 PDF docs** (awri 424, wine-australia 228, cornell 64,
wsu 38, chambre-gironde 17, vt-enology 7, icvv 5, incavi/scott-labs 2, mapa/enartis/laffort 1).
`--pdf-only` (HTML index hashes are unchanged by plan 090, so re-fetching them can only reach
"unchanged" after a wasted round trip). Resume with the SAME command — `--stale-before` makes it cheap.

⚠️ **A PARALLEL SESSION IS WORKING THE SAME SUBSYSTEM AND THE SAME PRODUCTION CORPUS.**
Branch `claude/kb-paraphrase-citation-copyright-355aa9` shipped **IVES Technical Reviews live and
default-on** (209 docs / 3,316 chunks, 100% dated, first seen 16:27 on 2026-07-22). 8 commits, unpushed.
- ✅ My Unit 10 verdict is UNAFFECTED — IVES appears **zero** times in `snapshot.json`, so it never
  reached top-8 on any of the 20 eval queries. That was luck, not design.
- 🔻 **THE REAL COUPLING IS TWO BASELINE FILES, NOT CODE.** Source overlap is only `NOW.md` +
  `package.json`. But they maintain `docs/kb-register-baseline.json` and I maintain
  `docs/kb-eval/snapshot.json`, and BOTH are stale the moment the 790-run lands. Re-capture **both
  together, after the corpus stops moving** — re-capturing one leaves the other reporting permanent
  drift, which is exactly how a gate teaches people to ignore it.
- 🔎 **The two instruments are COMPLEMENTARY, keep both.** Theirs (`verify:kb-register`) is a CI GATE on
  publisher-slot occupancy with a hard 25% cap — deliberately coarse because "which publisher won a slot
  is an objective fact". Mine (`kb:snapshot`) is an EVIDENCE artifact at document/rank granularity,
  deliberately NOT gated because a movement is not automatically a regression. We independently found
  the SAME defect in `verify-knowledge-base.ts` (it scores recall, never inspects the other slots).
  👉 **Durable fix: ONE `npm run kb:baseline` that captures both**, or the forgotten one rots.
- 📥 **Handoff owed to me:** their filed-not-fixed "chunk breadcrumbs carry the polluted HTML title" is
  MY layer. My 140-char cap bounds it but does not fix a wrong-but-short title — the real fix is
  ordering: their metadata correction must land BEFORE chunking inside `indexDocument`.
- **Recommended order:** push/open their PR now → let the 790-run finish → re-capture BOTH baselines in
  one commit → merge both → add `kb:baseline`.

⏭️ **NEXT — and the residual junk proves the fix works:** every remaining bad passage in the top-8 (AWRI
copyright page, Scott Labs handbook masthead) is from a source **not yet re-indexed**. Extend the
re-index to the other ~798 PDF docs (awri, scott-labs, cornell-grapes, wine-australia, wsu, icvv,
incavi, mapa, chambre-gironde, laffort, enartis, vt-enology-notes). Then Unit 11 (deferred decisions),
then AJEV.

🐛 **Two small real bugs in the new code, filed not fixed:** running headers that vary slightly per page
slip past `dropRunningHeaders`; an extensionless filename stem ("VitEnoTechNwsltr-mar2016-Danielle
Fianl") slipped past `cleanPdfTitle`.

🔎 **ROOT CAUSE: `chunkMarkdown` is heading-driven but `extractPdf` emits headingless text.** So for
**893 PDF documents / 11,051 chunks (42% of the corpus)** the section breadcrumb degenerates to the
first ~192 chars of page one — `chunk.ts:36-90` builds it from a heading stack that stays empty, and
`chunk.ts:130` prepends it into `text`, which is embedded AND backs the GENERATED `search_vector`. A
query matching that slab matches **every chunk of that document equally**, on the prefix alone.

Measured (Neon, 2026-07-22): corpus **26,253 chunks / 3,120 docs / 22 sources**. PDFs avg
`sectionPath` **192 chars** vs HTML **96**. `publishedAt` present on **14% of PDFs**;
`canonicalTitle` NULL on **95% of ALL docs** → `citation.ts` renders a bare publisher name with no
document title. Ligature mojibake (`NewsleƩer`) is real but small: **113 chunks / 7 docs**.

🔻 **Three of my own estimates were wrong, and measurement caught each.** The suspected VA coverage
hole does not exist (AWRI's VA page is excellent — enzymatic / Cash-still / HPLC as separate
passages, and it's HTML so its breadcrumbs survive). Ligature damage was ~6% of my guess. And
`mmr.ts` is NOT buggy — the "duplicate chunks" were the shared 192-char prefix. **Do not
re-investigate MMR.**

⚠️ **The eval suite is green through all of this** — `verify-knowledge-base.ts` only asserts "expected
doc in top-k + facts present", so it sees 3 of 8 slots. On the *passing* YAN control case, 4 of 8
returned passages are junk (a copyright page, a website announcement, an off-topic VT passage).
**Unit 1 is the ranked-snapshot instrument; nothing else may land before the baseline is captured.**

⛔ **AJEV import is DEFERRED, not dropped** — research is preserved in the plan's Scope Boundaries
(full OA since 2025-01-01 under CC BY 4.0, stock-Drupal robots with `Crawl-delay: 7`, ~150 OA papers
growing ~55/yr, pre-2025 paywalled). Do not re-research it. Rejected in passing: an AI relevance
gate (deletes the explanatory layer; false negatives are invisible) and AI-written summary chunks
(`topK=6` is a fixed slot budget, so "in addition to" is false in retrieval, and it breaks the
citation contract).

_(Backlog was cleared 2026-07-21 by a full `/bug-triage` run: 26 → 0 active, 18 issues → 10 kept,
one real bug found and fixed (#324) + a `beforeSend` dev-noise filter (#456). ⚠️ A **Sentry-side
inbound filter** is still Russell's to add — #456 drops events only after they're sent and counted.)_

⛔ **MSU (`msu-grapes`) stays DORMANT — do not retry.** Imperva refuses this crawler from every
network available. `npm run verify:msu` is the probe: if it ever reports **live PASS**, un-dormant
both flags + re-seed.

## 🔭 Also in flight

**PLAN 086 — US pesticide registration + resistance-group coverage. PLANNED, not started.**
Plan: [2026-07-20-086-…](docs/plans/2026-07-20-086-feat-us-pesticide-registration-plan.md) (Deep, 11 units).
Numbered 086 because this session's 085 collided with the MSU plan above — `ls docs/plans/` was
checked and came back clean, but their file was still branch-only. **The check is only sound against
`git log --all`, not the working tree.**

Answers three questions the app cannot answer today: is a product legally registered on grapes in
my state, what resistance group is it, and does my spray history actually rotate modes of action.
**No spray-application record exists** — `FieldNote.spraysApplied` is a JSON array of names with no
date, rate, or product identity. Building from zero.

- **Registration data goes in RELATIONAL TABLES, not the embedding corpus.** "Is X registered on
  grapes in CA" is a `WHERE` clause, not a similarity search. Avoids +12,500 chunks and sidesteps
  **`knowledge_chunk.embedding` having NO ANN index** (zero `hnsw`/`ivfflat` in any migration — every
  dense query is a seq scan; scale-register tripwire ~10k chunks). EPA still registers as a
  `KnowledgeSource` row purely to borrow the shipped per-tenant toggle + citation plumbing.
- ⚠️ **Do NOT ingest label PDFs via `extractPdf`.** `chunk.ts:140-145` only guarantees markdown
  pipe-tables are never split; `extract/pdf.ts` emits no pipes and no headings, so a label becomes ONE
  segment. A dose row (`Grapes 14 2 56 14`) separates from its headers ~40-45% of the time, with
  **zero overlap** — `tailForOverlap` splits on `[.!?]` and numeric runs have none. Synthesize tables.
- ⚠️ **Licensing.** FRAC and HRAC both reserve commercial use ("may not be… stored in a retrieval
  system"). Codes are DERIVED from extension sources already in the corpus, each row cited.
- 🔎 **Unit 4 de-risked (measured):** UC IPM vs Cornell Table 3.2.1 = 6/14 match, **2/14 systematic
  conflict on multi-site compounds** (Cornell `N/A` vs UC IPM `M 04` — both right, different
  questions), 6/14 miss (4 biologicals). So `siteType` must be modeled separately from the code, and
  a trade-name→code join from an AI-keyed source is UNSAFE (`Switch` sits under `cyprodinil (9)` but
  is 9/12 — a naive join silently drops a mode of action).
- **Phase 2 deferred:** rate/PHI/REI label extraction. Most of the effort, nearly all the liability.
  Also blocked on a **planned** harvest date — `HarvestPick.pickDate` is actual-only.

**PLAN 087 — Cornell Fruit Resources. SUPERSEDED, do not work it.** The source shipped instead via
#411 (a parallel session had already built it) reconciled onto main as #424. The plan file describes
a Unit 1 date-normalizer that no longer applies — main's seam now does strict ISO -> non-ISO salvage
-> month-name -> label-anchored body scan, plus PDF metadata dates. Cornell's reference pages did
land undated as the plan predicted (71/95 dated), but the PDFs carry real dates (64/64) so the
sitemap-lastmod recovery it proposed was never needed.
⚠️ Cornell's Pest Management Guidelines remain **paid + unreachable**, so this does NOT close 086's
biologicals gap.

**PLAN 082 — assistant vineyard/block coverage. SHIPPED (#397, `12e330f2`), plan file `status:
completed`.** The entry above was stale — it said "PR NOT YET OPENED" when the work had merged at
11:30 UTC and the branch was deleted. (Same trap the footer warns about; caught by `gh pr list`.)
Residual follow-ups flagged AT MERGE and not obviously closed since — leave here until confirmed:

- ⚠️ **Not verified at merge:** the `runAsTenant` DB read-back for U6, the LLM half of the evals
  (needs an API key; the 3 new cases had no pre-change baseline), and browser QA on Demo.
- 🔎 **`Vessel` has the identical create/edit drift** (5 cooperage fields update-only for no recorded
  reason) — labelled `UNDECIDED_DRIFT`, left unchanged, → TODOS.
- ⚠️ **Open product question:** block/vineyard elevation inherits the form's `min: 0`, refusing real
  sub-sea-level sites (Death Valley, Dead Sea). Preserved rather than changed.


**Plan 080 is fully merged** — Waves 1-4 all landed (#351, #376, #392, #395). What it left behind
is two decisions that are Russell's, not code:

- ⛔ **Phantom-stock unwind NOT APPLIED.** `scripts/unwind-phantom-opening-stock.ts` dry-runs
  clean with **6 real candidates, one of them in `org_bhutan_wine_co` (PRODUCTION)**. The script
  was corrected to unwind the SPECIFIC phantom lot rather than take a FIFO draw (#396). Running
  `--apply` is Russell's call, not an agent's.
- 💰 **Accountant sign-off still pending** on the Wave 3 category→GL account map before go-live.
  Also flagged there: an unmapped GL account now ROLLS THE APPLY BACK (it used to book the goods
  anyway). Scoped by `reasonCode`, so A/P-less tenants are unaffected.
- ⚠️ **ONE DATABASE.** `.env` and prod are the SAME Neon instance, holding the real Bhutan
  tenant. Every migration plan 080 deployed is already live.

## 🧵 Tangent stack  (LIFO — push when you detour, pop when done)

0. ✅ **POPPED — UC IPM knowledge source + corpus dates + stale-guidance warning. MERGED (#405,
   `77edb7a8`), branch deleted.** Source #19 `uc-ipm` (ipm.ucanr.edu grape PMGs): 87 docs / 667 chunks,
   `autoCrawl: true` so the monthly sweep takes it with no workflow edit. robots.txt ALLOWS
   `/agriculture/grape/` — no bypass used or needed. What it uncovered, in order of importance:
   • **`publishedAt` was dead corpus-wide** — READ by `retrieve.ts:111` and shown as the citation date,
   but NEVER written. Fixed (`extract/published-date.ts`, label-anchored, refuses to guess) + a backfill
   script, because `indexDocument` short-circuits on unchanged contentHash so a re-crawl would never
   re-extract. **869/2,781 dated (31.2%)**; of those, 270 stale / 245 aging / 354 current.
   • **`osu-owri` is the oldest source in the corpus, not uc-ipm** — 266 docs, oldest **1993**. Only 2%
   dated, so its 18.2y average is a 5-doc sample and must NOT be quoted as fact; the oldest stamp is the
   solid part. → Worth its own pass. awri: 55% dated, oldest 2011.
   • **578 docs are robots-blocked from re-fetch though already IN the corpus** — the crawler fails OPEN
   on a robots error, the backfill fails CLOSED. Permanently `unknown`; re-running won't help, it needs a
   decision. UMC also 429-rate-limited us.
   • **Assistant now warns on age** (`passage-age.ts`): `ageWarning` per passage + `currencyWarning` per
   set, computed server-side rather than as a prompt line. ⚠️ **Read the ablation note in
   `assistant-currency-warning.golden.ts` before trusting the green eval** — with the warning fields
   STRIPPED the stale case still scores 5/5, because Opus already caveats from the bare `date`. The suite
   guards the BEHAVIOUR; it is NOT evidence the age plumbing is load-bearing (that stands as a backstop
   for weaker models, long context, and the undated case).
   🔻 **MY ERROR, worth not repeating: I wrote a PR "deploy note" saying `seed:knowledge-sources` still
   had to run against prod. Wrong — and the ⚠️ ONE DATABASE line in this very file already said so.**
   Everything (crawl, embeds, backfill, seed) hit production live as it ran. PR body corrected.
1. **OPEN — #387 is merged but NOT browser-verified.** Russell asked for "merge #387 and verify
   'delete Block 1' in the browser". The merge happened (`de889cc1`); the browser check did not.
   Needs the interactive logged-in pane. **Do not tell Mike anything until it runs** — a fix has
   now twice been reported that the eval liked and production didn't. Pop when "delete Block 1"
   is confirmed to show a picker on screen in Demo.
2. POPPED — NRCS SSURGO soil-per-block: designed via /office-hours, spike ran and cleared it to
   `/plan`, then **deliberately parked to finish 082**. Full detail in `TODOS.md`. Detour closed
   cleanly; nothing half-done, no branch touched (`claude/usgs-soil-maps-vineyard-eabe6c` is
   still empty).
3. ⚠️ **OPEN — branch collision with a parallel session (2026-07-20).** Another agent working feedback
   `cmrsrs02` (tasting-note-by-vessel) created and checked out `assistant-fix/cmrsrs02` **in the main
   checkout, mid-session**, so my two U2 commits landed on THEIR branch on top of an unrelated
   `[create-pull-request]` commit. Recovered by cherry-picking onto `claude/assistant-vineyard-coverage`
   from a throwaway worktree (never touching the shared checkout again). **`assistant-fix/cmrsrs02` still
   carries duplicates of `6be7146e` + `037aefa4`** — if that branch PRs as-is it ships the U2 refactor
   twice. Needs a `git reset` on that branch by whoever owns it. Pop when it's clean.
   Two hard lessons: the git **index is shared** across `.claude/worktrees/*` and the main checkout
   (a plain `git commit` swept their staged files into mine — `git commit --only <paths>` is the
   safe form), and a parallel `prisma generate` **poisons vitest's resolution cache** with a stale
   "Cannot find package '@prisma/client'" that survives the package being restored (`--no-cache` clears it).
4. **PLAN 083 BUILT — assistant write-narration root cause (feedback `cmrsrs02`), all 6 units, on
   `fix/assistant-history-tool-replay` (7 commits, rebased onto main, NOT pushed).** PR #391 fixed the
   wrong thing: its premise measures 10/10 cold pre-fix. Real cause is `history.ts:16` dropping
   `tool_use`/`tool_result` from replayed history, so the model saw its own turns claiming cards with no
   tool call attached and completed that pattern — 0/8 on the real transcript, 8/8 with blocks restored.
   Fix is `src/lib/assistant/replay.ts` (server rebuilds history from the DB; clients unchanged). Also:
   row-boundary windowing so a tool_use can never be orphaned, and the over-claim guard now gets ONE
   repair turn to actually perform the write before apologising. Re-measured plan 081's own repro under
   history: 4/5, below threshold — its cold 3/3 overstated that fix, correction appended to plan 081.
   ⚠️ NOT browser-verified against Demo. Pop when it is QA'd and merged.
   (Re item 3 above: `assistant-fix/cmrsrs02` on ORIGIN never carried the duplicate U2 commits — the
   golden-case fix was cherry-picked onto origin's tip from a throwaway worktree, so #391 merged clean.)
5. **PLAN 083 SHIPPING — assistant write-narration root cause (feedback `cmrsrs02`), PR #404.**
   PR #391 fixed the wrong thing: its premise measures 10/10 cold pre-fix, and re-measured AFTER #391
   merged the bug still reproduces 0/5. Real cause is `history.ts` dropping `tool_use`/`tool_result`
   from replayed history, so the model saw its own turns claiming cards with no tool call attached and
   completed that pattern — 0/8 on the real transcript, 8/8 with blocks restored. Fix is
   `src/lib/assistant/replay.ts` (server rebuilds history from the DB; clients unchanged), plus
   row-boundary windowing so a tool_use can never be orphaned, and ONE over-claim repair turn.
   Browser-QA'd on Demo with a DB read-back. Plan 081's cold 3/3 overstated its fix (4/5 under
   history); correction appended there. Pop when #404 merges.
6. ✅ **POPPED — PLAN 084 LIVE. Merged #406 + #409; corpus populated and verified.** VT *Enology Notes* into the assistant KB with section-level
   filtering. `enology.fst.vt.edu` puts rot chemistry and a $3,200 study-tour ad on the SAME url,
   which path-prefix filtering structurally cannot separate — so this adds the crawler's FIRST
   section-level content filter. robots.txt: there is none (404), nothing bypassed.
   ⚠️ Numbered 084 because a PARALLEL session took 083 (#404) — `ls docs/plans/` before picking.
   Load-bearing facts: **(a)** Defuddle destroys `<a name>` anchors (12 in EN-166 source, 0 in
   markdown) → split raw HTML pre-extraction. **(b)** one-doc-per-URL is enforced 3× → strip in
   place, NEVER per-anchor rows (now recorded in ADR 0007). **(c)** `/technical/i` is semantically
   INVERTED here; same trap for `/review/i`, `/sustainable/i`, bare `/available/i` — all four have
   anti-regression tests.
   ⚠️ **`SECTION_FILTER_VERSION`** must be bumped whenever a drop pattern changes; it folds into
   `indexedContentHash`, and without a bump the re-crawl short-circuits to `unchanged` FOREVER,
   silently. Bumped 3× during this work alone.
   **Review found 4 real bugs** (2 in the original code, 2 regressions in the fixes — re-reviewing
   the fixes paid off): silent data loss from a zero-length slice that emitted `<article></article>`
   while reporting the section KEPT; a quadratic split measuring 14s on a 1MB page (~1h at the 15MB
   cap); an over-masking regression; and a number-strip regression that broke case-insensitive
   arabic the corpus actually uses. One finding was REFUTED not applied — masking past `-- >` is
   correct, verified against linkedom.
   **LIVE, and the DB proof RAN** (the gap that had been left for a human): seeded, then crawled
   174 urls → **173 documents / 858 chunks**, 0 errors, 0 skippedRedirect. Corpus **2,850 → 3,023**.
   Acceptance query against the real corpus: **zero announcement text leaks from any
   section-filterable page.** The 3 remaining hits are the two paths that are unfiltered BY DESIGN
   and documented — 1 PDF (no anchors) and T1 #17/#21 (anchorless fail-open). 34 T1 fail-open pages
   observed vs ~40 predicted for #1-40; 119 pages filtered with correct reasons.
   🔎 **The live acceptance test earned its keep** — it caught a config inconsistency the offline
   gate could not: I denied the 14 year pages as "navigation, not content" and then seeded
   `/EN/index.html`, which is also navigation (indexed as 2 chunks of pure link dump). Worse, it
   links to five alphabetical index pages that match the `/EN/` allow-prefix — `crawl:source` does
   not follow links but the MONTHLY sweep's `crawlWithFollowing` does, so they would have arrived
   silently on the 1st. Fixed in **#409** (one `/EN/index` prefix covers all six); the stale doc was
   deleted from the corpus.
   ⚠️ Also learned: `recrawl-knowledge` reads sources from the **DB**, not config — merging a
   source does NOTHING until `seed:knowledge-sources` runs. Easy to miss.
   Gates: tsc 0, eslint 0, **vitest 2985/0**, verify:invariants 36/36, verify:vt-enology PASS.
7. ✅ **POPPED — assistant VOICE MODE is conversational and LIVE IN PROD. Merged #439
   (`9cc51cd8`) then #441 (`e516248a`); live-verified on a real device by Russell.** Two rounds:
   • **#439 — "oscillates, never speaks."** Barge-in used the SAME 0.04 RMS threshold as normal
   listening, so while the assistant spoke the mic heard its own playback past echo-cancellation
   (or a table bang) and interrupted itself → listen→transcribe→think→(cut off)→loop, no audio ever.
   Landed in the Jul-8 "voice focus" commit `75d20d5b`. Diagnosed by ELIMINATION, which is the
   reusable part: reaching "thinking" proves STT works (an empty transcript never gets that far), and
   hitting ElevenLabs directly proved TTS works — leaving barge as the only thing between "has audio"
   and "never plays it." Also hardened `transcribe/route.ts` so the per-utterance voice-settings read
   + audio-isolation can NEVER 502 a turn (that coupling was the latent "stops hearing us").
   • **#441 — the over-correction, and the real lesson.** #439 raised the bar to 0.15/600ms, which
   then ignored a real "yeah, I got it" (ticket `cmrtzeh63`). ⚠️ **A single fixed loudness threshold
   structurally cannot work**: low enough to hear the user is low enough to hear the assistant's own
   echo; high enough to reject echo is too high for real speech. Fix is a DYNAMIC bar —
   `echoAdjustedLevel()` subtracts a fraction of the assistant's own live output from the mic level,
   so the bar rises while it talks and drops in the gaps (0.09 / 400ms).
   • Also in #441: a voice-ONLY prompt seam (`VOICE_STYLE_PROMPT`, appended only when `voice: true`,
   so text chat + goldens are byte-identical); citations are **written but never spoken**
   (`/kb/source/` links dropped from speech, captions now render markdown so they stay clickable);
   units spoken as words (mg/L, g/L, ppm, SO₂ — `mg/L` must match before `g/L`, and `SO₂` needs a
   lookahead because U+2082 is not a word char so `\b` never matches); a "thinking" earcon; and
   ElevenLabs voice `UgBBYS2sOqTuMpoF3BR0` / `eleven_flash_v2_5`.
   🔎 **Two silent bugs found en route:** `style` + `use_speaker_boost` were never sent in the TTS
   request body at all (setting them did nothing), and `proxy.ts` auth-gated `.mp3` so the earcon
   would have died on a lapsed session.
   ✅ **Vercel needs NO env change** — verified all 44 prod vars: `ELEVENLABS_API_KEY` is the only
   `ELEVENLABS_*` set, so the new voice/model ship as code defaults with nothing overriding them.
   ⚠️ **Still open:** feedback tickets `cmrtzeh630001jx04e92nzf2b` (Demo) and
   `cmrm5xew80004l204ssuducfc` (Bhutan) are NOT closed — both have an `AGENTIC_FIX` run stuck in
   `RUNNING`, and `closeFeedbackItemCore` refuses to close while one is running, so the stuck run
   must be neutralized first.
8. **OPEN — multi-lot-in-one-vessel is a MODELING defect, not a UX one (assistant thumbs-down
   `cmruoc3yk0000jf0491y8hety`, 2026-07-21).** Russell: "if we say we are going to rack a tank and
   there are multiple lots in the tank, you can't choose which lot, you're doing the whole tank."
   The auto-fix agent already opened **PR #444** — but it only touches
   `src/lib/assistant/tools/record-tasting-note.ts` (whole-tank tasting notes), i.e. a sliver.
   Investigation done, blast radius mapped, competitor docs read. Findings:
   • **The rack CORE is already right** (`vessels/rack-core.ts` draws proportionally across every
   resident lot; `rack_wine` takes vessels only). The pickers live in the *other* ops.
   • **Only ONE write site creates co-residence**: `ledger/write.ts:264-266` (the projection fold).
   That is the chokepoint an invariant would sit on.
   • **Live data (read-only audit, 2026-07-21): 5 vessels currently hold >1 lot** — incl.
   `org_bhutan_wine_co` BARREL 18 (3 lots, PRODUCTION). Creating ops: RACK 8, SEED 5, CRUSH 5,
   CORRECTION 2, PRESS 1.
   • **InnoVint and Vintrace both forbid it.** InnoVint's own "How to Split a Lot" says you must
   round-trip through a *phantom vessel* — proof a vessel cannot hold two lots. Every movement
   resolves identity at the moment of the move (retain / combine-with-existing / create-new), and
   drain-and-press "assumes all weight… is homogenized (the composition is blended)". Vintrace
   attaches a **batch** per vessel and tracks blend % as a **composition** on the batch.
   • **We already own all three primitives** — CRUSH `mode:"ADD"`, `decideRackRoute` GROW_EXISTING /
   NEW_LOT, `blendLotsCore` — they are just not universal, and `decideRackRoute` bails when the
   destination already holds >1 lot.
   ✅ **PLAN 088 WRITTEN + HARDENED** —
   [2026-07-21-088-…](docs/plans/2026-07-21-088-refactor-one-lot-per-vessel-plan.md), Deep, 19 units,
   **2 branches** (1-13 = the rule + cleanup + DB constraint; 14-19 = delete the pickers + vessel UI).
   Reviewed by council (Codex + Gemini →
   [council-feedback-088-…](council-feedback-088-one-lot-per-vessel.md)), `/plan-eng-review`, and
   `/plan-design-review`. Four findings worth remembering:
   • 🔎 **`write.ts:379` drops composition for BLEND lots** — `origin*` is NULL by construction
   (`blend-core.ts:215` says so), so the fold's "can't form a tuple" `continue` silently skips them.
   Cosmetic today; this plan makes blend lots the norm, so the tank readout Unit 18 rests on would
   decay. Fix reuses `composeRollup` ancestor attribution — but `composeLeaves` must be extracted
   first, because separate marginals (byVariety/byVineyard/byVintage) cannot rebuild the JOINT tuple
   `VesselComponent` needs.
   • 🔎 **ABSORB must REFUSE across tax class / ownership** — inheriting the resident's class is a
   TTB 5120.17 lines 5/20 filing error. InnoVint documents this exact hazard in its blend FAQ.
   • ⚠️ **Unit 10 collided with UX Principle 12 ("no phantom vessels")** — requiring real destination
   vessels for split children pushes users to invent fake ones, regressing a principle this app built
   a first-class op to satisfy. Resolved with trial TAGS on the capture records instead.
   • ⚠️ **3 in-flight WO tasks** reference lots the collapse would absorb; **0 dust rows** (so a plain
   UNIQUE is safe — Gemini's partial-index objection refuted by reading `foldLines`); Bhutan B18 is
   Day-Zero data entry (3 same-day SEEDs summing to exactly 225/225 L), and **Russell accepted a
   uniform collapse** — he'll re-account it by hand.
   Pop when branch 1 merges. **PR #444 closes as superseded**; the whole-tank-tasting-note TODO is
   marked SUPERSEDED (it was the 3rd instance-level answer to this class-level defect).

   ✅ **Units 1-12 + 12b committed (16 commits, not pushed). Demo T5 COLLAPSED AND VERIFIED
   (op #4580): one lot, 6,995 L, composition Syrah 6,370 + Cabernet 625.**
   • ✅ **COMPOSITION BUG FIXED (Unit 12b)** — found by verifying the rehearsal rather than
     trusting it. THREE pre-existing defects, none previously tested:
     (1) the fold never consulted lineage for a lot that HAS an origin, so a single-origin lot
     absorbing another credited the incoming wine to its own variety (Unit 5 fixed only the
     mirror case, origin-LESS blend children);
     (2) `GROW_EXISTING` recorded the parent's share of the INCOMING wine (0.99999) not of the
     RESULT (0.08935) — now `resident + incoming`, with earlier parents re-scaled on each grow so
     a twice-absorbed lot can't drift past 1. ⚠️ the denominator MUST be read BEFORE
     `writeLotOperation` or it counts the new wine twice;
     (3) attribution has to be **DIRECTIONAL and op-type-gated**: arriving wine takes the consumed
     lots' makeup (BLEND/CRUSH/PRESS/SAIGNEE only), returning wine in a CORRECTION takes the
     receiver's, everything else its own. Without this a revert drew the resident down
     proportionally and a **revert→re-apply silently LOST the Cabernet**.
   • 🔎 **`vessel_component` folds INCREMENTALLY — self-healing for volume, self-CORRUPTING for
     attribution.** Once an op books a delta against the wrong variety no later op takes it back,
     so fixing the code did not fix the data. New **`rebuild:vessel-composition`** recomputes it
     directly from occupancy + lineage + origins (idempotent, no replay). Across all 38 occupied
     vessels only **2 had drifted**; unattributable shares are REPORTED, never folded into another
     variety.
   • ✅ **The real check: after the rebuild + re-collapse, a fresh recomputation reports ZERO
     drift against the incremental fold.** Round trip proven on live data — reverted, rebuilt,
     re-collapsed, verified.
   • ✅ **ZERO VIOLATIONS — `verify:one-lot-per-vessel` PASSES across 38 vessels / 8 tenants**, and
     `rebuild:vessel-composition` reports ZERO drift. Demo T5 #4580, B4 #4731, B5 #4732, T7 #4733;
     Bhutan Barrel 18 #4858.
   • 🔎 **BHUTAN BARREL 18 — I had it backwards, and the truth matters.** NOT a data-entry error.
     Its lots came from `system@day-zero-migration`, note *"Day-Zero legacy seed from
     **vessel_component**"*: the OLD model was a COMPOSITION table (vessel, variety, vineyard,
     vintage, volume) — Vintrace's shape — and the migration turned each component row into its
     own LOT. The barrel is ONE three-variety Bordeaux blend (100 Merlot + 75 Cab Franc, both
     Bajo, + 50 Cab Sauv, Gortshalu = 225 L in a 225 L barrel). **Barrel 18 is the fossil of the
     exact modelling error this plan fixes.** I read round numbers as suspicious when they were a
     recorded composition; the three lots existed in no other vessel and every single-component
     barrel migrated cleanly. Collapsing it RESTORED the source data rather than inventing a wine.
     Done as **`2025-BL-BJB`** via the new `--new-blend=<vesselId>=<TOKEN>` mode — a genuine blend
     must not be called "Merlot". Composition identical to the source rows; fractions
     0.44444/0.33333/0.22222; the three originals kept DEPLETED as its parents.
     ⚠️ First run passed `vintage: null` → coded **NV**-BL-BJB for an all-2025 blend; vintage is
     now derived from the parents when they agree. The reverted NV lot survives as a CORRECTED
     zero-volume row (append-only, LEDGER-10) — debris from my run, not worth row surgery.
   • ✅ **UNIT 13 DONE — LEDGER-12 IS ON, IN CODE AND IN THE DATABASE.** Migration
     `20260721160000_one_lot_per_vessel` applied to prod: `UNIQUE (tenantId, vesselId)` on
     `vessel_lot`. Proven live — a direct INSERT of a second lot is refused with **23505**, no row
     left behind. Invariant note `LEDGER-12`; `verify:invariants` 37/37, frontmatter 38/38.
   • 🔎 **The chokepoint rule is MONOTONE on purpose** (`assertNoWorsenedCoResidence`): it refuses
     an op that leaves a vessel with MORE lots than it started with, not one that merely isn't
     perfect. "Must be exactly one" would refuse every op on a mis-recorded vessel **including the
     rack that would empty it** — freezing a barrel nobody can fix through the app.
   • ⚠️ **The migration is HAND-WRITTEN.** `prisma migrate diff` against this schema emits a huge
     phantom diff (enum rebuilds, FK drops) — the known trap. Write the one statement yourself.
   • ⚠️ **CI cannot run the cross-tenant sweep** — CI has no DB by design. The CI guarantee is the
     unit tests + the DB constraint; `verify:one-lot-per-vessel` is the OPERATIONAL check around a
     migration or repair. The invariant note says so rather than claiming a gate that doesn't exist.
   • 🔎 **Turning it on immediately found two fixtures encoding the old model** — which is the point
     of a real guard: `verify-chemistry` seeded 2 lots in a tank to exercise the plan-060 fan-out
     (now unbuildable; asserts the replacement behaviour instead), and `verify-bond` shared one
     vessel across two bond-A lots.
   • 🔎 **A THIRD defect surfaced only because B4/B5/T7 absorbed the SAME parent three times**
     (once per vessel). A lineage edge is one row per (parent, child), so each absorb OVERWROTE
     the fraction with just its own draw: 0.25627 recorded vs 0.27711 true — B4+B5's 125.53 L
     vanished from the lot's makeup. **The folded composition stayed correct**, so nothing looked
     wrong; it only appeared by diffing the fold against an independent recomputation. A parent's
     share now ACCUMULATES: (prior contribution + arriving gross) / new total.
   • 🔎 **The fold is MORE precise than the recomputation.** The fold adds real line volumes; the
     rebuild multiplies a `Decimal(6,5)` fraction, so it carries ~1e-5 relative error (0.02 L on a
     5,572 L tank). The rebuild therefore compares with a TOLERANCE — rewriting the exact folded
     number with the approximation would be a downgrade and would report drift forever.
   • ✅ **Evidence, on live data:** composition **byte-identical** before/after (collapsing lot
     identity does not change what is in the tank) · **12,225.00 L conserved exactly** ·
     **B6/T2/T4 untouched** at 500/1500/4200 L, proving the vessel-scoped draw for a lot spread
     over SIX vessels · **ZERO drift across all 38 vessels in all 8 tenants** ·
     `--rewrite-tasks` exercised (the blocking approved WO re-pointed; `verify:work-orders` 43).

   _(build detail)_ **Units 1-11 of 13 committed, 13 commits, not pushed.**
   Units 6-11 (`2e92586e` rack · `365f0e5b` topping · `33052e62` seed · `f98e4ba6` crush/press ·
   `14773134` split · `5db974f4` deferred WO destination). **Full suite green: 293 files / 3264
   tests / 0 failures**; the guard still reports the 5 pre-existing violations Unit 12 will collapse.
   Worth remembering from that stretch:
   • 🔎 **The split guard had to be stricter than the plan said.** The plan (and my first cut) only
     compared children to each other. The existing verifier split 60 L off a 200 L parent and left
     the child beside the parent's own **115 L remainder** — two lots in one vessel. Real rule: a
     child may stay in the source ONLY when the parent is fully drawn out of it.
   • 🔎 **`mergeIntoLotId` already existed on press fractions** and IS the absorb. My first press
     guard was too blunt and `verify:reverse-transform` caught it.
   • 🔎 **`runtimeInputs` already modelled "let cellar staff choose"** — CRUSH used it for its
     destination, RACK just didn't. Unit 11 was 11 lines.
   • ⚠️ **Trial tags deferred.** The design review's answer to the split refusal was a *filterable*
     tag on capture records; that needs a migration, and migrations reach production here. Grouped
     with Units 12/13. The refusal points at the existing free-text note meanwhile.
   • 🔻 **Fixed two real bugs in `verify-cellar-ops` en route** — it deleted ops before their
     cost_line children (P2003) and scrubbed vessels/lots from in-process arrays, so every failed
     run left junk in the production DB and broke the NEXT run. Now child→parent and by-pattern.
     It still fails LATER on a pre-existing issue: it edits `rateValue`, which `edit-policy.ts:18`
     fences. Unrelated to 088.

   _(earlier)_ **Units 1-5, 6 commits.**
   `6a1a6bcd` LEDGER-12 pure guard · `eb41a084` verify:one-lot-per-vessel · `511e9675`
   audit:co-residence · `896cc56e` decideCombineRoute · `dd37f4e3` **the P1 composition fix** ·
   `c7a3168f` loadCombineState.
   • **The P1 is fixed and PROVEN on the live DB** — `verify:vessel-composition`, 13 assertions on
     Demo with QA- fixtures. A blend vessel now gets a component row per ancestor leaf (it produced
     **zero** rows before); racking 400 L of a 70/30 blend carries 280/120; a blend-of-a-blend
     multiplies down the chain; composition always sums to actual vessel volume.
   • 🔎 **The fix needed a second mechanism nobody predicted:** a lot being CREATED by the very op
     being folded has **no lineage rows yet** — cores write their edges AFTER `writeLotOperation`
     (blend-core: op at :255, lineage at :295). So the fold also reads the op's OWN lines: the lots
     it consumed ARE the parentage, each then expanded through its own lineage. That avoided
     reordering blend-core's reversal-sensitive sequence.
   • 🔎 **The Unit 3 audit turned council C1 from a maybe into a certainty:** **all 6** non-survivor
     lots also occupy other vessels (one of them 5 others). A lot-keyed deplete during the collapse
     would have drained wine from vessels nobody was repairing. Collapse must be **vessel-scoped**.
     Also corrected the in-flight WO count: **1** task, not 3.
   • ⚠️ **OPEN, needs a decision:** `absorbIntoResidentTx` as a *Tx-form* wrapper. `blendLotsCore`
     owns its own `runLedgerWrite` and there is no `blendLotsTx`, so a tx-composable absorb means
     refactoring a reversal-sensitive core. `rackVesselCore` already calls `blendLotsCore` non-tx,
     so **Unit 6 is unblocked without it** — only WO-completion composition needs the Tx form.
   • ⚠️ **Units 12 + 13 touch PRODUCTION** (the 5-vessel collapse, then the DB unique index) and are
     deliberately NOT started: Unit 12's dry-run needs Russell's eyes, and Unit 13 closes the
     rollback window the moment it lands.
   • 🔻 3 test files fail on this box — `assistant-commit-tenant-context` (10s `beforeAll` hook
     timeout), `compliance-fill-pdf`, `verify-ai-native` (30s). **All three verified PRE-EXISTING**
     by reverting the changes and re-running at HEAD; all pass standalone. Load flakes, not regressions.
9. ← you are here

## 🪝 Off-path — do NOT do now

All detail moved to `TODOS.md` (2026-07-20). One line each:

- **Plan 081 follow-ups (a–h)** — brix-write rate, unproven Draft rendering, the
  `wo-vague-target` eval artifact, absent-vs-wrong assignee, canonicalizer throws, must-on-skins
  rule, in-place Draft resolution, `verify:work-orders-transform` red. → TODOS.
- **NRCS SSURGO soil composition per block** — designed, **spike RAN 2026-07-20: cleared to
  plan.** It's NRCS not USGS; do NOT area-weight properties. SDA clips server-side in ONE
  ~180ms call, so no turf/PostGIS. Finger Lakes blocks return 2–3 map units (Napa floor: 1).
  ⚠️ Spike found two things the design missed: **"Water" is a map unit** (a block drawn on a
  lake reports "97.8% Water" at 100% coverage, not a gap), and mukey count overstates
  meaningfulness (Walla Walla = 99.7/0.2/0.1 — needs a share floor). → TODOS.
- **Plan 062 U2/U5 liquid SO₂-solution booking** — feature gap, not the money bug. Do NOT
  `/work` plan 062 as written; it would double-apply 0.576. → TODOS.
- **Break Mode: Sentry server-side scrubbing** — ⚠️ blocker before any real-tenant use. → TODOS.

## ✅ Done recently

- **Leaflet attribution teardown crash (Sentry #324) — MERGED (PR #455, squash `5c5b72fe`).** The one
  real production defect in an 18-issue pile. The Google copyright string refreshes on a 400ms
  debounce after `moveend`; the init effect's cleanup set `cancelled` and called `map.remove()` but
  never cleared that timer, and `refresh()` read `map.getBounds()` *before* checking cancellation — so
  a pending refresh ran against a torn-down pane. Only reachable with a Google Maps key set (the
  keyless Esri fallback never wires attribution), which is why the event count stayed low. Fixed with
  a pre-guard **plus** self-destruct on Leaflet's `unload`, because `addBasemap` is fire-and-forget and
  the caller holds no teardown handle. Logic extracted to `src/lib/map/attribution-refresh.ts` with a
  structural map type so it tests under `environment: "node"` — this repo has no jsdom. 🔎 **Lesson:
  verify a regression test actually regresses.** With the guard and `unload` removed, 3 of 7 cases
  fail with the literal production error; without checking that, a passing suite proves nothing.

- **Sentry dev-noise filter — MERGED (PR #456, squash `a764d85f`).** Drops events whose stack carries
  `.claude/worktrees/…` or `.next/dev/…` in `beforeSend`, across all three runtimes. Born from the
  triage finding that 5 of 6 open Sentry issues were one dev session. ⚠️ **Conservative by
  construction, and tested to be:** the suite pins that #324's own event shape is KEPT, that a
  production `.next/server` path is KEPT, and that `"development"` doesn't match — a filter that ate
  the real bug sitting next to the noise would be worse than the noise.

- **Inline voice mode in the assistant dock (plan 089) — SHIPPED (PR #451).** Retired the full-screen
  voice overlay; voice now runs inline in the dock so the page stays visible and clickable while the
  assistant navigates and talks. Triple-reviewed before building, which caught a P0 the plan itself
  created (a typed turn was invisible to the voice session's history → `appendHistory`) and two
  features about to be deleted by omission (`focusNotice`, the first-run hint). Details in memory.
- **One lot per vessel (LEDGER-12) — MERGED + LIVE (PR #445, squash `c9ea0ad9`).** 19 units, 29
  commits. From Russell's own P0 thumbs-down: *"you have 3 lots in one tank — which lot do you want
  to transfer?"* → **"stupid and physically impossible."** The picker was the symptom; the DATA MODEL
  permitting several `vessel_lot` rows per vessel was the bug. Reported 3x, answered 3x with
  instance-level fan-outs (#444 was the fourth — closed as superseded). Now a vessel holds ONE wine
  (a lot may still span many vessels), enforced at `writeLotOperation` + a `(tenantId, vesselId)`
  unique index, with identity decided at the moment of combination by one shared
  `decideCombineRoute`. Every "which lot?" picker deleted; plan 060's whole-tank fan-out with them.
  A tank now shows its makeup — Bhutan Barrel 18 reads `45% Merlot · 33% Cabernet Franc · 22%
  Cabernet Sauvignon`. Ticket RESOLVED via the canonical console path AFTER the prod deploy went
  green; Mike DMed. 🔎 **Lessons: the Bhutan "data entry error" was actually a Day-Zero migration
  fossil (component ROWS became LOTS) — investigate before writing something off; making composition
  load-bearing exposed a silent fold bug for blend lots; and pre-invariant verify FIXTURES
  (`chemistry`, `bond`, `naming`) each needed one vessel per lot.** ⚠️ Also: **the assistant LLM eval
  is NOISY — 9–12 failures across five runs on IDENTICAL code. Compare failure SETS, not counts.**
- **Cornell fruit resources KB source — CLOSED.** `cornell-grapes`: 96 documents / 948 chunks, 64
  PDFs, `verify:knowledge-base` 20/20 PASS. Merged #424 (source, reconciled) · #425 (crawl error
  visibility) · #426 (CDN) · #427 (title fix). Plan 085 (MSU) closed alongside it. 🔎 Lessons kept:
  main was FABRICATING publication dates (`new Date("Issue 2019")` → 2019-01-01, and sitemap
  `lastmod` made an undated 2009 page score `ageYears: 0`); a newly-allowlisted target is
  UNDISCOVERABLE by re-crawl (a 304 yields no links — after ANY scope change, reset THEN re-crawl);
  Cornell's files live on a SHARED CampusPress CDN, so host and path are separate gates and the
  `/blogs.cornell.edu/` prefix is the only thing bounding us to Cornell. ⛔ `msu-grapes` stays
  DORMANT — Imperva refuses this crawler from every available network; `npm run verify:msu` is the
  probe, un-dormant only if it ever reports a live PASS.
- **Consumable cost surfacing (#372 "pricing") — MERGED (PR #435, squash `b46cd30`).** Mike: "I don't see the
  price I entered" + "are we averaging across shipments?". The engine already captured both — each `SupplyLot`
  stores the receipt price; the material's unit cost is the weighted average across open priced lots — but the
  UI never surfaced the per-shipment price nor named the method. Now the detail view leads with a "Shipments &
  prices" panel (open by default) showing each shipment's "Paid $X/unit", plus an `InfoHint` + summary line
  explaining the Cost is the weighted average across priced shipments still in stock (unpriced excluded, never
  $0). Read-only (COST-3); a new pure `summarizeConsumableCost` **reuses** the engine's `weightedAvgUnitCost`
  (COST-1, single source of truth) + `test/cost-display.test.ts`. Browser-QA'd on Demo (100@$2 + 300@$6 →
  $5.00). Ticket RESOLVED (canonical console path) + Mike DMed. 🔎 **Lesson: resolve feedback via
  `closeFeedbackItemCore` from the start — a raw status write skips the structured outcome note + reporter
  notice and can't be re-closed cleanly (the #366 reopen/version-race trap).**
  **#374 "cost" + #373 "drop down" closed as REDUNDANT (no code):** #374 — the read-only per-unit cost on every
  consumable list row was the U16 fix already shipped in **PR #395**, completed by #372. #373 — the vendor
  free-text field is already a fuzzy `VendorPicker` over first-class vendors (persists the immutable vendorId,
  NAMING-1) in both the Add/Edit `MaterialForm` (Plan 069) and the Receive `MaterialMovePanel` (U17, **PR #395**);
  the old free-text lived in the ReceiveModal retired in **PR #433**. Both confirmed on main, DMed Mike, RESOLVED.
  That closes the ENTIRE Mike consumables-flow cluster (#377 → #366/#370 → #372 → #374 → #373).

- **Consumables receive-by-pack (#366/#370) — MERGED (PR #433, squash `3b13b6e`).** The receive machinery
  (`resolveReceiptQuantity`, location-aware `receiveConsumableCore`, the `MaterialMovePanel` unit selector +
  preview) had already shipped in **#395** (plan 080 U15); the reported bug was still reachable only because
  the legacy grams-only `ReceiveModal` was still wired to the detail modal's "Receive" button. Fix: retired
  that modal — "Receive" now opens the capable Move-stock panel (unit selector + `initialMode` prop), which
  resolves the pack size server-side and converts qty AND per-unit cost together (COST-1). Regression test in
  `test/material-stock.test.ts` (3 rolls of 500 → 1,500 @ $0.50). Browser-QA'd on Demo (1 roll @ $250 →
  500 units @ $0.50, base-unit still works). Both tickets (same reporter, Mike) DMed + RESOLVED. 🔎 **Lesson:
  when a clustered ticket's core already shipped, the remaining bug is often a leftover *reachable path* — grep
  for redundant callers before rebuilding.**

- **Plan 085 MSU Extension KB source + crawler hardening — MERGED (#415, `c49d42bc`).** 2 of 8 units
  added MSU; **the other 6 fixed crawler bugs MSU exposed that already affected all 20 sources.**
  WAF challenge pages were being indexed as real documents (HTTP **200** + `text/html`, so nothing
  refused them) and, because Imperva stamps a unique `incident_id` into each one, every fetch got a
  fresh content hash — the dedup never fired and the garbage would have **re-embedded every month
  forever**. The tombstone pass also read ANY fetch failure as "page removed"; now only 404/410
  means gone. `/review` then caught 3 more real bugs, the sharpest being that `findDarkSources`
  declared HEALTHY sources dark (`documents` counts only re-indexed pages; unchanged pages 304 into
  `notModified`, so a stable source legitimately ends a month at 0 — and the odds rose every month).
  Also: the workflow literally could not report its own failure (`bash -e` + `pipefail` aborted the
  step before the summary was written). 🔎 **Lesson worth keeping: two independent reviewers finding
  the same thing is the signal to trust** — that is how the 304 bug surfaced.

- **Feedback loop: class sweep + regression-test gate — built on `claude/determined-clarke-6d3e65`, PR not yet opened.**
  Backlog-process review, not a ticket. The data: ~40 PRs merged in 48h, PR queue near-empty — **throughput
  is not the bottleneck**. The defect is fix *altitude*: **#385** fixed one `resolveExactlyOne` ambiguity,
  **#386** swept the rest of the class by hand a day later. Ticket-driven fixing defaults to instance-level
  because the ticket *describes* an instance. Two changes to `scripts/bug-feedback-agent.ts` + CI:
  (1) **class sweep** — new `search_repo` tool (the agent had list_dir/read_file but **no grep**, so it
  structurally could not sweep) + `record_class_sweep`, enforced as a **deterministic tool-loop rejection**
  of `apply_fix` without a prior sweep, not a prompt rule. Sweep lands in the PR body as the review artifact.
  (2) **test gate** — new label-gated `feedback-test-gate` CI job; a code change with no `test/` change FAILS.
  Escape hatch is the human-applied `no-regression-test` label, deliberately not agent-settable. Composes with
  bug-triage's auto-merge for free (it already requires CI green). 🔎 **Found en route: `test` was missing from
  the fix workflow's `add-paths`** — the agent's test edits were being silently dropped from the commit, so the
  gate would have failed every PR for a test the agent actually wrote. Exactly the hand-synced-list drift the
  plan-052 comment warned about. tsc 0, eslint 0 errors, **vitest 2861/0**.
- **#387 assistant picker-vs-prose — MERGED (`de889cc1`).** "delete Block 1" answered in prose.
  The chip blamed tool descriptions; **so did I, and we were both wrong** — prepending guidance to
  six tools measured **1/6**. The cause was prompt **rule 44**, which literally instructed the
  behavior being debugged and contradicted rule 41. Rewriting it: **10/10**.
  **Second time a stale prompt rule was the root cause** (plan 081's rule-40/45 contradiction was
  the first). Rules left in place after the machinery beneath them changed. Nobody audits a
  15,000-char prompt the way we grep code — that may deserve a standing check.
  Only caught by measuring before *and* after each change.
- **Consumables "Total cost paid" denominator — MERGED (#388).** Display-only; the costing engine
  was already right. Label now names its own denominator.
- **Plan 080 Wave 2 — MERGED (#376).** Unified `/inventory`, per-location consumables UI, costed
  equipment, FG cost layer. Wave 1 #351.
- **Break Mode — MERGED (#345, #375).** Dev bug capture via Sentry Replay; never captures
  request/response bodies. ⚠️ see the Sentry scrubbing blocker above.
- **Plan 081 assistant Draft Card — MERGED (#354, #355).** A card was binary (valid or nothing),
  so a tool one field short fell back to prose. Added the missing middle. Repro **2/7 → 12/12**
  live on Demo. `asProposal` rebuilds the object so a draft can never carry a commit token.
  Residual gaps → TODOS. *(#355 merged still titled "WIP:" — cosmetic.)*
- **`/bug-triage` versioned in-repo — MERGED (#384).** Now `.claude/skills/bug-triage/`. Edit it
  in the repo, **not** in `~/.claude/`. Gotcha: git cannot re-include a file whose parent dir is
  excluded — the ignore rule had to widen to `workflows/*` before the `!` negation took effect.
- **Plan 079 winemaking KB RAG — COMPLETE** (#285 corpus, #289 re-crawl loop, #292 four sources,
  #293 subscription UI). Corpus 1,449 docs.
- **Plan 079 bug-report clarification loop — COMPLETE** (#276/#281/#277/#282, docs #283).
- **Plan 077 QBO vendor sync Slice 2 — MERGED (#252).** Completes the arc with #229, #231.
- **Add-variety duplicate guard — MERGED (#322).** `EntityConfig.findConflict`, case-insensitive
  (NAMING-1). The DB unique was case-SENSITIVE, so "syrah" beside "Syrah" silently duplicated.
- **Ticket #188 harvest-pick + block cascade — MERGED (#265).** Issue #328 (delete-block card
  error) is now CLOSED.
- **Demo Winery expendables data fill (data only).** 47 rows completed, 11 vendors. ⚠️ Gotcha:
  `deriveMaterialFields` derives name AND normalizedKey from `brandName`, so writing a supplier's
  real product name RENAMES and RE-KEYS the row. 4 junk rows refused deletion (3 hang off APPLIED
  invoices with live `ApExportEvent`; 1 is referenced by a historical `LotTreatment` whose FK is
  SetNull, so deleting would silently blank a real treatment's link). Those need a decision.

_Older shipped work lives in git history and `docs/plans/`. Roadmap phases in `ROADMAP.md`._

## ⏭️ Next up (candidates, not commitments)

- **Plan 086** (US pesticide registration) — planned, not started. The big one; read the plan file.
- Browser-verify "delete Block 1" on Demo, then close the loop with Mike (from the plan-082 residue).
- Confirm plan 082's noted-at-merge gaps (U6 read-back, eval LLM half, browser QA) or accept them.
- **Add a Sentry-side inbound filter** for `.claude/worktrees` / `.next/dev` (console, ~2 min). #456
  drops these in `beforeSend`, but only after they are sent and counted against quota.
- **The 10 kept issues are the real remaining queue** — 3 KB re-crawl reports (#420/#417/#325, two
  same-day duplicates), 4 hand-filed bugs (#414 flaky test, #413 soft-404 tombstones, #412 undated
  corpus sources, #408 the H8 eval drifting with CI never running it), 2 scale tripwires (#402, #91),
  and 1 orphaned plan issue (#365). None triaged in depth this run.

_Last updated: 2026-07-22 — **PLAN 090 UNITS 1-9 DONE (12 commits, unpushed); the PRODUCTION RE-INDEX
IS RUNNING** (osu-owri + wbi + lvwo, 616 docs, ~4h at observed rate). Unit 10 (the before/after diff)
is blocked on it finishing. **The lesson of this plan is that the code fix was the easy part** — making
it reach the data took THREE separate silent no-ops, each of which would have produced a green,
successful-looking run that changed nothing: the index-hash short-circuit (Unit 8), the conditional-GET
304 (Unit 9), and robots refusing 350 of 616 documents because the re-index did not inherit the curated
`ignoreRobots` (Unit 9). Only the third was found by WATCHING a live run. Verified on production so far:
titles and dates now populate, breadcrumbs multiply where structure exists, the 140-char cap holds, zero
mojibake, and **0 HTML documents were disturbed** (exactly the targeted blast radius Unit 8 claimed).
Prior: **PLAN 090 UNITS 1/1b/2/3/4/5/6/7/8 DONE (8 commits, unpushed). All the
code is written and green; the only thing left is the PRODUCTION RE-INDEX (Unit 9), which needs a
go-ahead.** Measured across 34 real PDFs from 13 sources: 23 restructured, 11 safely fell back, 0
failures — scott-labs went from ONE breadcrumb to 437. Two things worth remembering: a CONFIDENCE GATE
was added after per-document heuristic tuning started overfitting, so a PDF that resists structure
falls back to exactly today's output rather than gaining junk breadcrumbs; and Unit 8 caught a silent
no-op that would have made the whole fix pointless (PDF index hashes carried no version, so unchanged
bytes could never re-extract). Prior: **PLAN 090 UNITS 1/1b/2/3 DONE (4 commits, unpushed): the eval instrument is built and the baseline captured.** Next is Unit 4 (PDF titles) then Unit 5 (PDF heading inference, the MEDIUM-confidence one). Building the instrument found a REAL PRODUCTION BUG: neither retrieval arm had a total ORDER BY, so tied ts_rank rows straddling the LIMIT cut changed which candidate survived and propagated through RRF+MMR into what users see (fixed with a `, c."id"` tiebreaker). It also FALSIFIED a plan premise — retrieval is NOT fully deterministic; ~1 query in 18 wobbled from an unidentified cause, so Unit 1b makes the snapshot measure its own stability and quarantine what it cannot vouch for. Prior: **plan 090 written: fix KB RAG retrieval quality before adding sources.**
Started as "should we add AJEV to the knowledge base"; measuring the corpus to answer that found
**42% of it is chunked wrong** (headingless PDFs starve the heading-driven chunker, so the breadcrumb
becomes a 192-char slab of page one, prepended to every chunk and embedded). Also found: 95% of docs
have no `canonicalTitle`, so citations name a publisher but not a document. The eval suite is green
throughout because it only sees 3 of 8 slots — Unit 1 fixes the instrument before anything else moves.
AJEV deferred with its research preserved. Prior: **the backlog is CLEAR: 0 active feedback items, 0 open PRs.** A full
`/bug-triage` goalie run (live, all sweeps) reconciled the queue and cleared the pile: 26 backlog items
→ 0 active, 1 open PR triaged + merged (#443), 18 open issues → 10 kept. It found exactly ONE real
production bug among 6 Sentry issues — **#324**, a Leaflet debounce that outlived `map.remove()` — now
fixed and merged (**#455**); the other five were a single dev-worktree session and are closed, with a
`beforeSend` filter (**#456**) so that class never files again. ⚠️ Two things left for Russell: a
**Sentry-side inbound filter** (console; #456 drops events only after they are sent and counted), and
the standing decisions below (phantom-stock unwind, accountant GL sign-off). Prior: **plan 089 (inline voice in the dock) SHIPPED (PR #451).** Planned,
then triple-reviewed (council Codex+Gemini → eng → design) before a line was written, which paid for
itself: the reviews found a P0 the plan itself created — letting the user type during a voice session
silently breaks the assistant's memory, because `historyRef` only ever sees voice turns — so it needed
one additive method on `VoiceSession` and was never a pure presentation swap. Also caught: deleting
`aria-modal` breaks the dock's Escape handoff (`AssistantDock.tsx:132`), and two features
(`focusNotice`, the first-run helper) were about to vanish by omission. 3 TODOs filed (touch-target
minimum, tablet auto-expand, dock keyboard shortcut). tsc 0, eslint 0, **vitest 3310/0**, next build ok.
Prior: **plan 088 (one lot per vessel) is MERGED AND LIVE IN PROD** (PR #445, squash `c9ea0ad9`,
Vercel Production `success`; migration already applied, branches pruned). A vessel holds ONE lot; a
lot may occupy MANY vessels (LEDGER-12), enforced at the single `vessel_lot` write site plus a
`(tenantId, vesselId)` unique index. Every "which lot?" picker is gone and a tank shows what it is
MADE of. Ticket `cmruoc3yk…` RESOLVED, PR #444 closed as superseded, Mike DMed. Only the 375px
browser pass remains (needs a human login).
Prior: **assistant VOICE MODE is conversational and LIVE IN PROD** (#439
`9cc51cd8` + #441 `e516248a`, live-verified on a real device). Barge-in is now ADAPTIVE: a single
fixed loudness threshold structurally cannot separate the user's voice from the assistant's own
echo, so `echoAdjustedLevel()` subtracts the assistant's live output from the mic level — the bar
rises while it talks, drops in the gaps. Plus a voice-ONLY prompt seam (text chat + goldens
byte-identical), citations WRITTEN but never SPOKEN, units spoken as words, a thinking earcon, and
the new ElevenLabs voice. Vercel needed NO env change (verified: `ELEVENLABS_API_KEY` is the only
`ELEVENLABS_*` set, so code defaults apply). tsc 0, eslint 0, **vitest 3219/0**. ⚠️ Feedback tickets
`cmrtzeh63…` (Demo) + `cmrm5xew8…` (Bhutan) still OPEN — each has an `AGENTIC_FIX` run stuck
`RUNNING`, which `closeFeedbackItemCore` refuses to close over until it's neutralized.
Prior: **#373 "drop down" closed as REDUNDANT** (no code): the consumable vendor field is
already a fuzzy `VendorPicker` over first-class vendors (persists vendorId, NAMING-1) in both the Add/Edit form
(Plan 069) and the Receive panel (U17, PR #395); free-text was retired in #433. Mike DMed + RESOLVED. **This
closes the ENTIRE Mike consumables-flow cluster: #377 → #366/#370 → #372 → #374 → #373.** Prior: **#374 "cost"
closed as REDUNDANT** (U16 in PR #395, completed by #372/#435); Mike DMed + RESOLVED. Prior: **#372 consumable cost
surfacing MERGED** (PR #435, `b46cd30`): the detail view now shows each shipment's "Paid $X/unit" + explains
the weighted-average method (InfoHint + summary); read-only, reuses the engine's weightedAvgUnitCost; ticket
RESOLVED + Mike DMed. Prior: **#366/#370 receive-by-pack
MERGED** (PR #433, `3b13b6e`): retired the grams-only ReceiveModal so "Receive" opens the pack-aware Move-stock
panel; both tickets DMed + RESOLVED (reporter Mike). Prior: **Cornell Fruit Resources LIVE** (96 docs / 948 chunks, verify:knowledge-base
20/20). Landed as #424 (reconciling a parallel session's #411), then #425 crawl-error visibility, #426
the CampusPress CDN, #427 the dropped canonicalTitle. En route: main was found to be FABRICATING
publication dates from junk metadata, and a newly-allowlisted crawl target proved undiscoverable
without a reset. Prior: plan 085 CLOSED, MSU unreachable and DORMANT (#422); the sweep fail-closed
fix (#418) that un-broke the monthly refresh for all 21 sources._
