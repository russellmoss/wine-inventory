# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**PLAN 082 — assistant vineyard/block coverage. Unit 1 of 7 DONE.**
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
- ⬜ U2 one field table → U3 variety-on-update + planting-fields-on-create → U4 spacing both paths
  → U5 `Vineyard.abbreviation` + collision guard → U6 `VineyardDetail` (GPS) → U7 evals + registers.
- ⚠️ **U6 is the soft spot, MEDIUM confidence.** No entity config has ever done a nested write
  (grep for `upsert`/`connect:` across `src/lib/assistant` returns zero). Spike `current`+`update`
  against a Demo vineyard with **no detail row** before writing the rest of the unit.
- ⚠️ **U1 raised a product question:** elevation inherits the form's `min: 0`, which refuses real
  sub-sea-level sites (Death Valley, Dead Sea). Preserved rather than changed. Open question on the plan.

## 🔭 Also in flight

- **Plan 080 Wave 3 — U5 mixed-invoice apply.** `claude/plan-080-wave-3`, 1 commit
  (`ee2b2972`), unpushed, no PR. Wave 1 (#351) and Wave 2 (#376) both merged. Plan says
  council-review Wave 3 before shipping — it was deliberately sequenced last and alone.
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
3. ← you are here

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

_Last updated: 2026-07-20 — compacted from 684 lines. Verified every "pending" claim against
`gh pr list`: Wave 2, Break Mode, Plan 077, the consumables fix and issue #328 had all already
landed while still listed as in-flight. Only plan 082 and plan 080 Wave 3 are genuinely open.
Beware "N commits ahead" as an in-flight signal — squash-merge leaves branches permanently ahead._
