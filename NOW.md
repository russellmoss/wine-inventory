# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**Plan 089 — INLINE VOICE MODE IN THE ASSISTANT DOCK. CODE COMPLETE (U1–U7). Browser QA (U8) is the
only thing left, and it needs YOU — an authed Demo Winery session with a live mic that I can't drive.**
Plan: [089](docs/plans/2026-07-21-089-feat-inline-voice-in-dock-plan.md) · commits `fae190ba` (U1/U3
foundation) + `2064aeef` (UI swap + overlay retired) on branch `claude/conversational-mode-ui-d4a6a3`.
Gates green: tsc, eslint, **3251 tests** (+ new scroll suite), `next build`. Not shipped — no PR yet.

**Run before shipping:** the 20 QA scenarios in the plan's Test Strategy — especially #14 (type "log
22.4 for Block 3", then SAY "make it 23" → must resolve, proves the P0 fix), #6 (Escape ends voice not
the dock), #9 (confirm card fully visible + confirmable at 440×620), #7 (drag the title bar from the
orb still moves the panel), #13 (orb static while thinking). Then `/ship`.

Retire the full-screen voice overlay; run voice inline in the dock so the user can **see** the page
while talking. The navigate-and-narrate behavior already works (`useVoiceSession.ts:318-325` pushes
the route and keeps the loop alive) — it is merely occluded by an opaque `inset: 0` curtain. Voice
even speaks *"I've put a draft on screen, have a look at the card"* while covering that card.

**Reviews: [council](docs/plans/2026-07-21-089-council-feedback.md) (Codex + Gemini) ·
[eng](docs/plans/2026-07-21-089-eng-review.md) · [design](docs/plans/2026-07-21-089-design-review.md).**
Four findings that changed the plan:

- 🚨 **P0, and the plan created it.** `historyRef` (`useVoiceSession.ts:132`) is snapshotted at mount
  and only ever appended by *voice* turns (`:400`/`:469`), while `:277` is what gets SENT. Today the
  overlay makes typing impossible so it cannot diverge. Let the user type — as this plan does — and
  the assistant silently forgets it: type "log 22.4 for Block 3", then say "make it 23" → *"make what
  23?"*. **Unit 3 adds `appendHistory` to `VoiceSession`, so this is NOT a pure presentation swap.**
- ⚠️ **Escape is a landmine.** `AssistantDock.tsx:132` defers to voice via a
  `[role=dialog][aria-modal=true]` DOM query. Delete `aria-modal` and Escape silently starts
  collapsing the whole dock. **Unit 5 must be ONE commit** + a temporary dual guard.
- ⚠️ **Two features were about to be deleted by omission** — `focusNotice` (voiceprint feedback,
  sole render site `VoiceOverlay.tsx:180-184`) and the first-run helper line (`:259-261`). Both now on
  an explicit keep-list.
- 🎨 **Two transcript defects the shared-caption approach exposes:** every voice turn would grow a
  👍/👎 `FeedbackBar` (`AssistantChat.tsx:807-815`), and `:447-462` force-snaps to bottom
  unconditionally, so you cannot scroll up mid-conversation. Both fixed in Unit 6.

**Decisions taken:** orb animates only while audio flows (`DESIGN.md` bans decorative animation —
exception to be logged) · voice navigation stays instant, diverging deliberately from the text chat's
3s countdown · no tablet special-casing (phone is already 94% width; only tablet is affected → TODO).

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
8. ← you are here

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

- **Cornell Fruit Resources knowledge source — CLOSED.** `cornell-grapes` live: **96 docs / 948
  chunks**, 64 PDFs, `verify:knowledge-base` **20/20 PASS**, third publisher in the diversity check
  alongside AWRI and Wine Australia. Merged #424 (source + the fabricated-date fix) · #425 (crawl
  error visibility) · #426 (shared CampusPress CDN) · #427 (title fix). Plans 085 (MSU) and the
  Cornell work are both closed; nothing outstanding. The three durable lessons (V8 inventing
  January 1st from junk metadata, a newly-allowlisted target being undiscoverable without a reset,
  and host-vs-path being separate gates on a shared CDN) are captured in memory.
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

_Last updated: 2026-07-21 — **plan 089 (inline voice in the dock) WRITTEN + triple-reviewed, not
built.** Council (Codex + Gemini) → eng → design. The reviews found a P0 the plan itself created:
letting the user type during a voice session silently breaks the assistant's memory, because
`historyRef` only ever sees voice turns. Fixing it means one additive method on `VoiceSession`, so
this is no longer a pure presentation swap. Also: deleting `aria-modal` breaks the dock's Escape
handoff (`AssistantDock.tsx:132`), and two features (`focusNotice`, the first-run helper) were about
to vanish by omission. 3 TODOs filed (touch-target minimum, tablet auto-expand, dock keyboard
shortcut). Next: `/work` plan 089 — Unit 3 first, Unit 5 as ONE commit.
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
