# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**PLAN 085 — MSU Extension Grapes/Viticulture into the assistant KB. UNITS 1-7 DONE + COMMITTED;
UNIT 8 (the live seed/crawl) DELIBERATELY NOT RUN. PR not yet opened.**
Branch `claude/msu-viticulture-source-e7e94c` (worktree).
Plan: [2026-07-20-085-…](docs/plans/2026-07-20-085-feat-kb-msu-viticulture-source-plan.md) (Standard, 8 units).
Gates: **tsc 0, eslint 0 errors, vitest 3065/0**. Every guard sabotage-verified, not assumed.

⛔ **DO NOT run `seed:knowledge-sources` until this is merged AND deployed.** Seeding writes
`msu-grapes` into the GLOBAL (= prod) `knowledge_source` table; deployed code that doesn't know the
key still ADMITS it (`findSourceConfig(s.key)?.autoCrawl !== false` → `undefined !== false` → true),
then `crawlWithFollowing` throws `unknown source` before crawling — **killing the monthly refresh for
all 21 sources.** Order is merge → deploy → seed → crawl.

⛔ **MSU's bot wall has shut this network out.** Recon started intermittent; after ~15 requests the
residential IP went to 5/5 refused and still is (`npm run verify:msu` → `BLOCKED — imperva (959B)`).
So the live half of U8 is unverified. This materially raises the plan's headline risk: a GH Actions
runner makes far more requests from a datacenter range. **"Works from a laptop" is no evidence about CI.**

Russell asked for MSU (`canr.msu.edu/grapes/`) as a monthly-CRON source like AWRI/UC IPM, toggleable
in Settings, with publication dates. Normally that is a config edit. **It is not, and the reason is
the point: 2 of the 8 units add MSU; the other 6 fix crawler bugs MSU exposed.** Three verified
blockers, all confirmed by execution not inference:

- ⚠️ **Incapsula/Imperva serves challenge pages with HTTP 200**, `text/html`, ~950 B. The fetch path
  has **zero body validation**, so a challenge indexes as a real document — and each one carries a
  unique `incident_id`, so the content-hash dedup never fires and it **re-embeds every month forever**.
  Latent bug affecting ALL 20 sources, not just MSU.
- ⚠️ **The detector must RETURN a flag, never throw.** `recrawl-knowledge.ts:93` reads any
  `fetchDocument` throw as "page removed" → `status: withdrawn`. Throwing would mass-tombstone a
  whole source's corpus slice on a transient WAF blip. All 3 crawl loops also `catch {}` and discard
  the message, so a throw could never reach the run summary anyway.
- ⚠️ **Both date paths fail on MSU.** JSON-LD is malformed (`"2024-4-11EDT12:00AM"` → Invalid Date)
  and the byline has no label anchor (`… Horticulture - April 11, 2024` → null). Fix is a
  metadata-path normalizer ONLY — deliberately NOT loosening `LABEL`, whose posture is "a wrong date
  is worse than no date."
- **Scope (Russell's call):** no sitemap (both 404), and the real articles are flat `/news/<slug>`
  mixed in with all of MSU Extension (dairy, 4-H, field crops). New opt-in `linkedOnlyPrefixes`
  capability: `/news/` admitted only when linked FROM an admitted `/grapes/` page, and **terminal**
  (links not followed onward) — terminal-ness is what actually caps the blast radius.
- ⚠️ **Biggest unresolvable-before-merge risk:** the monthly CRON runs on GitHub Actions datacenter
  IPs, which Incapsula challenges far harder than the residential IP this was scouted from. May fail
  wholesale in CI. Mitigation is loudness (per-source `skippedChallenge`, went-dark job failure),
  not evasion. Contingency: `autoCrawl: false` + curated crawl. **Decide only with real CI evidence.**

## 🔭 Also in flight

**PLAN 082 — assistant vineyard/block coverage. ALL 7 UNITS DONE, code-complete on
`claude/assistant-vineyard-coverage` (off `de889cc1`), PR NOT YET OPENED.**
Plan: [2026-07-20-082-…](docs/plans/2026-07-20-082-feat-assistant-vineyard-coverage-plan.md).
Full unit-by-unit detail is in the plan file and the branch's commits; the load-bearing residue:

- **Gates: tsc 0, eslint 0, vitest 2825.** Every guard sabotage-checked, not assumed.
- ⚠️ **NOT done:** the `runAsTenant` DB read-back for U6, the LLM half of the evals (needs an API
  key; the 3 new cases have NO pre-change baseline and cannot — `db_update` rejected those field
  names outright before, so the rate was 0 by construction), `verify:naming` (needs `.env`), and
  browser QA.
- ⚠️ **U6 (VineyardDetail nested write) is the soft spot, MEDIUM confidence.** No entity config had
  ever done a nested write. Deliberately update-only: nested-create `tenantId` is unverified and
  defaults to `""`, so a bad nested create lands RLS-invisible rather than erroring.
- 🔎 **Found en route: `Vessel` has the identical create/edit drift** (5 cooperage fields
  update-only for no recorded reason) — labelled `UNDECIDED_DRIFT`, left unchanged, → TODOS.
- ⚠️ **Open product question:** elevation inherits the form's `min: 0`, refusing real sub-sea-level
  sites (Death Valley, Dead Sea). Preserved rather than changed.


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

0. ⚠️ **OPEN — UC IPM added to the KB corpus (`claude/kb-ucanr-ipm`, branched off `origin/main`).**
   Source #19 `uc-ipm` (ipm.ucanr.edu grape PMGs) is configured, seeded, crawled and embedded:
   **87 active docs / 667 chunks, voyage-4/1024, 0 errors, 0 skippedRobots, hitCap=false** (full
   frontier, not truncated). `autoCrawl: true` so the monthly sweep picks it up with no workflow edit.
   robots.txt ALLOWS `/agriculture/grape/` — no bypass was used or needed.
   (a) ✅ **DATE EXTRACTOR DONE.** Root cause was bigger than uc-ipm: `publishedAt` was READ by
   retrieval (`retrieve.ts:111`) and surfaced in the assistant citation, but **nothing ever wrote it** —
   the column was dead corpus-wide. Added `extract/published-date.ts` (pure, 18 tests): label-anchored
   only (`Updated:`/`Revised:`/…) so a bare year in prose is never mistaken for a stamp, range-checked,
   returns null rather than guessing. Wired through `ExtractedDoc.publishedAt` → `index-documents.ts`
   (write-only-when-found, so a re-index can't erase a good date). Backfill needed its own script
   (`npm run backfill:published-dates`) because `indexDocument` short-circuits on unchanged
   contentHash — a re-crawl alone would never re-extract. **uc-ipm: 83/87 dated (95.4%).** Full suite
   2871 pass. ⚠️ If tests fail to load on `@prisma/client`, run `npm run db:generate` (clobber).
   **THE FINDING THAT MATTERS: the UC IPM grape corpus is OLD** — 2015×54, 2016×10, 2014×4 (so 82% is
   2016-or-older), vs only 8 docs 2021+. Decade-old spray guidance is now at least *dated* in citations.
   **BRANCH IS NOW GREEN — one thing still running:**
   (b) ✅ **Golden widened, `verify:knowledge-base` 17/17.** Russell's call (asked, answered): added
   `ipm.ucanr.edu` to the IPM-thresholds case's `expectPaths` alongside `mapa.gob`/`pnw-644`/
   `field-monitoring`. WIDENED, not repointed — all remain valid authoritative answers, which is what
   the multi-value `expectPaths` contract was built for (see its header comment). Reading note left in
   the file: most of uc-ipm is stamped 2015-or-older, so "authoritative" = canonical, not current.
   (d) ✅ **Assistant age warning shipped.** `passage-age.ts` (pure, 12 tests): `current` <5y, `aging`
   5-10y, `stale` 10y+, and **`unknown` for an undated doc — which WARNS rather than passing as fresh**
   (silently treating undated as current is how stale guidance gets laundered into confident advice).
   Computed server-side in `search-knowledge-base.ts` as `ageWarning` per passage + a `currencyWarning`
   over the set, NOT as a prompt line — a prose rule is advisory and gets dropped under long context; a
   populated field must be actively contradicted. Prompt rule 8 tells the model WHEN it matters (the
   split: age is a fact computed here, relevance is a judgment the model makes with the question in
   hand). Live proof: AWRI's 2011-06 YAN passage flags `stale (15y)`.
   (c) ✅ **Corpus-wide backfill DONE** — `found=735, none=1327, robots=578, errors=7`.
   **869/2,781 dated (31.2%)**; `verify:knowledge-base` 17/17 and its diversity check moved `0 with a
   date` → `1`, so dates now genuinely reach retrieval. Of the DATED docs: **270 stale (10y+), 245 aging
   (5-10y), 354 current** — i.e. 59% of everything we can date is 5+ years old.
   **TWO THINGS THE BACKFILL SURFACED, both follow-ups not blockers:**
   • **`osu-owri` is the worst source in the corpus, not uc-ipm** — 266 docs, oldest **1993**. Only 5 are
   dated (2%), so the 18.2y average is a 5-doc sample and must NOT be quoted as fact; the *oldest* stamp
   is the solid part. Worth a real look. awri is 55% dated / 8.9y avg / oldest 2011.
   • **578 docs were robots-BLOCKED from re-fetch** yet are already in the corpus. Not a contradiction
   but an asymmetry worth knowing: the crawler fails OPEN on a robots fetch error, the backfill fails
   CLOSED. So those docs can never be dated by this script, and they are permanently `unknown` →
   which the assistant now warns on rather than passing off as fresh. UMC also 429-rate-limited us.
   ⚠️ Re-running the backfill will NOT improve these; it needs a decision, not a retry.
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
6. **PLAN 084 SHIPPED — PR #406.** VT *Enology Notes* into the assistant KB with section-level
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
   Gates: tsc 0, eslint 0, **vitest 2985/0**, verify:invariants 36/36, verify:vt-enology PASS live.
   ⚠️ **NOT done: the DB row-level proof.** `npm run crawl:source vt-enology-notes` needs `.env` +
   the MAIN checkout and is the first real write to the global corpus — left for a human.
   Pop when #406 merges.
7. **PLAN 085 IN PROGRESS — MSU KB source (see Current objective).** ← you are here

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

- Build plan 085 (8 units), then seed + crawl MSU from the MAIN checkout.
- Open the PR for plan 082 (`claude/assistant-vineyard-coverage`, code-complete, unopened).
- Browser-verify "delete Block 1" on Demo, then close the loop with Mike.

_Last updated: 2026-07-20 — plan 085 (MSU Extension KB source + WAF-challenge guard + link-provenance
crawl gate) BUILT: units 1-7 committed, vitest 3065/0. Unit 8 live seed/crawl NOT run — see the two
⛔ blockers under Current objective (seed-after-deploy ordering; MSU bot wall shut this network out). Plan 082 moved to "Also in flight" (code-complete,
PR unopened). Prior: plan 084 (VT Enology Notes KB + section filter) SHIPPED as PR #406. Prior: the feedback-loop class sweep + regression-test gate
(branch `claude/determined-clarke-6d3e65`, PR not yet opened). Prior entry: compacted from 684
lines; verified every "pending" claim against `gh pr list` — Wave 2, Break Mode, Plan 077, the
consumables fix and issue #328 had all already landed while still listed as in-flight. Beware
"N commits ahead" as an in-flight signal — squash-merge leaves branches permanently ahead._
