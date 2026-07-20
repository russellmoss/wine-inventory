# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**PLAN 082 — assistant vineyard/block coverage. ALL 7 UNITS DONE, code-complete on branch, PR not yet opened.**
Branch `claude/assistant-vineyard-coverage` off `de889cc1`.
Plan: [2026-07-20-082-…](docs/plans/2026-07-20-082-feat-assistant-vineyard-coverage-plan.md) (Standard, 7 units).

The assistant has **zero GPS coverage** (`VineyardDetail` isn't a registered entity), block
`variety` is create-only so a mis-set variety is permanently unfixable, and row/vine spacing is
writable by neither path — so it can change `vineCount` and strand the derived planted acreage
with no way to correct it. Root framing: `entities.ts:91` labels the block config a *"Unit 1
vertical slice"* and nothing came back to finish it. **Unit 2's real job is making `creatable`
and `editable` derive from one table so they cannot drift again.**

- ✅ **U1 shared pure coercion** (`src/lib/vineyard/field-coercion.ts`). The rules were private to
  `actions.ts`, which is `"use server"` and can only export async functions — so the assistant
  path *structurally could not* import them and grew a second copy. Fixed R1 as a live bug: typing
  `0` for spacing silently CLEARED the field (`optFloat{min:0}` admitted it, then `pos()` mapped
  `<=0` to null). Now errors. Split into a verbatim move + the fix so the behavior change is
  visible in the diff. vitest 2761/0, tsc, eslint clean.
- ✅ **U2 one field table.** `creatable`/`editable` now DERIVE from one `EntityField[]` per entity via
  `withFields()`. Symmetry is the default; asymmetry needs `mode` + a mandatory `why` — enforced by the
  TYPE (a union), so a silent one-sided field does not compile. Applied to **all 8** writable entities,
  not just the block: the goal is "drift is structurally impossible", and a one-entity guard isn't that.
  A golden locks all 8 lists to their pre-refactor values and passed unmodified → provably no behavior
  change. **Guard verified by sabotage** (override `editable` → 3 fails; inject an undeclared one-sided
  field → 2 fails; green on restore) rather than assumed. tsc 0, eslint clean, **vitest 2778** on a clean
  checkout = the 2761 U1 baseline + the 17 added. 🔎 Found en route: **Vessel has the identical drift** (5 cooperage
  fields update-only for no recorded reason) — labelled `UNDECIDED_DRIFT`, left unchanged, → TODOS.
- ✅ **U3 block symmetry.** variety + numRows/clone/rootstock/irrigated now on both paths. The shape
  the plan missed: `update` runs INSIDE the tx so it cannot resolve an ambiguous name — nowhere to ask.
  Added `buildUpdate`, the pre-tx mirror of `buildCreate`, returning values OR a ChoiceRequest that
  becomes a clickable picker. U4/U5/U6 all then needed the same hook → right seam, not a one-off.
- ✅ **U4 spacing both paths.** Closes the correctness hazard (vineCount was writable, spacings were
  not → acreage strandable). Explicit `spacingUnit`; card renders in the VINEYARD's unit so it never
  compares ft to m. 🔎 Found: negatives were refused with "must be at least 0" (optFloat's min fired
  first) — a message that says 0 is OK when it isn't. Fixed at source; U1's test had a loose
  `/Row spacing/` match that passed with the wrong wording.
- ✅ **U5 abbreviation.** Both paths + closed a PRE-EXISTING hole — `findConflict` only checked `name`,
  so two vineyards could collide on the lot-code token itself.
- ✅ **U6 VineyardDetail (GPS/soil/manager).** The soft spot; nested write, no precedent. Partial
  upsert (assistant sends deltas — a full-shape write would blank soilType on every GPS edit), no
  empty row on a rename, Decimals → numbers, audit split to `VineyardDetail`. **Deliberately
  update-only:** nested-create tenantId is unverified and `tenantId` defaults to `""`, so a bad
  nested create lands RLS-invisible rather than erroring. ~15-min spike in TODOS.
- ✅ **U7 evals + registers.** 3 MUST_PROPOSE cases, structurally validated against db_update's real
  schema. Parity notes deliberately NOT written: the register is InnoVint-doc-keyed and none of its
  997 notes mentions GPS/spacing/soil — authoring incumbent-evidenced notes for them would be
  fabricating evidence. verify:parity/ai-native/invariants green; coverage doc regenerated to no
  change (082 added FIELDS to already-covered tools, not new cores).
- **Gates: tsc 0, eslint 0 errors, vitest 2825.** Every guard sabotage-checked, not assumed.
- ⚠️ **NOT done:** the `runAsTenant` DB read-back for U6, the LLM half of the evals (needs an API key;
  the 3 new cases have NO pre-change baseline and cannot — db_update rejected those field names
  outright before, so the rate was 0 by construction), `verify:naming` (needs `.env`), and browser QA.
- ⚠️ **U6 is the soft spot, MEDIUM confidence.** No entity config has ever done a nested write
  (grep for `upsert`/`connect:` across `src/lib/assistant` returns zero). Spike `current`+`update`
  against a Demo vineyard with **no detail row** before writing the rest of the unit.
- ⚠️ **U1 raised a product question:** elevation inherits the form's `min: 0`, which refuses real
  sub-sea-level sites (Death Valley, Dead Sea). Preserved rather than changed. Open question on the plan.

## 🔭 Also in flight

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
6. ← you are here

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

- **Plan 084 — Cornell grapes/IPM knowledge source + publication dates — SHIPPED to PR #411.** ⚠️ `verify:knowledge-base` + `verify:kb-subscriptions` + the first
  Cornell crawl still need a run from the MAIN checkout (worktree has no `.env`/network/DB).
  Branch `claude/cornell-grapes-knowledge-source-808b00`. 8 units + 8 review fixes. vitest 2998/0.
  Review found two holes that defeated the feature purpose: `new Date("n.d. 2019")`->2019-01-01 got past
  the year guard, and retrieval re-invented every date the strict parser refused via sitemap lastmod.
  Follow-ups: #412 backfill (Cornell is otherwise the ONLY source with a date or title -> structural
  bias), #413 soft-404 docs never retired, #414 flaky hook, #408 H8 eval drift.
  [2026-07-20-084-…](docs/plans/2026-07-20-084-feat-cornell-grapes-knowledge-source-plan.md).
  Recon found three things the request assumed otherwise: (1) **nothing to bypass in robots.txt** —
  `blogs.cornell.edu` disallows only `/wp-admin/`, and all 13 third-party hosts permit the PDFs we
  want, so no bypass is in scope; (2) **`TRUSTED_DOMAINS` is hard-enforced on the curated path too**
  (`crawler.ts:449`, `fetcher.ts:77`) — curated bypasses sitemap discovery and path prefixes, NOT the
  host allowlist, so off-site PDFs *require* widening the allowlist; (3) **36 of 98 linked PDFs
  soft-404** (HTTP 200 + `text/html`) — all 34 `grapesandwine.cals.cornell.edu` links now redirect to a
  CALS landing page, so a naive crawl indexes 34 copies of a nav page as Cornell research. Also found:
  `publishedAt` has **never** been populated by the crawl path for any of the 18 existing sources
  (only `crawl-ets.ts` sets it), so every crawled passage reaches the assistant dated `"unknown"`.
  Fixed at the shared seam, so all 19 sources benefit.
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

- Finish plan 082 (U2–U7).
- Browser-verify "delete Block 1" on Demo, then close the loop with Mike.
- Plan 080 Wave 3 → council review → PR.

_Last updated: 2026-07-20 — added the feedback-loop class sweep + regression-test gate
(branch `claude/determined-clarke-6d3e65`, PR not yet opened). Prior entry: compacted from 684
lines; verified every "pending" claim against `gh pr list` — Wave 2, Break Mode, Plan 077, the
consumables fix and issue #328 had all already landed while still listed as in-flight. Beware
"N commits ahead" as an in-flight signal — squash-merge leaves branches permanently ahead._
