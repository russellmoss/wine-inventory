# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.
>
> Closed-out history through 2026-08-05 lives in
> [docs/NOW-archive-2026-08.md](docs/NOW-archive-2026-08.md) — verbatim, nothing summarised.
> **When a section here closes, move it there rather than letting this file grow.**

## 🎯 Current objective  (ONE thing)

> **Nothing is in flight.** Every bug in Mike's batch is fixed, live, written back and reported to
> him (#583 assistant · #587 capacity · #589 transfer), #584's fallout is closed (#585 CI · #586
> admin UI), and main is green. One ticket is **waiting on Mike**, not on us — see below.
> The next unstarted thing is **plan 107** (assistant tool surface).

## 🟠 "CONFIRMATION CARD NOT RENDERING" (`cmsgbjgov…`) — TRIAGED/UNCLEAR, **BLOCKED ON MIKE**

⛔ **The ticket's premise is WRONG, and that matters more than the reported bug. All seven writes were
APPLIED.** `assistant_confirmation` nonce burns exist for all 7 (that row is written ONLY by
`commitProposal`, i.e. a real `POST /api/assistant/confirm`), and the artifacts exist: **WO #80** Filter
T5, **#81** Press T5, **#82** Filter T3, **#83** Bottling, **WineSku "Ojai 2026 Syrah"** (created
`16:44:48.417`), **EquipmentAsset "Main Bottling Line"**, and the ticket itself.

🔴 **CONFIRMED DEFECT, separate from the reported one:** the assistant told him *"That's a display
problem on our end … so nothing got saved."* A confident false assertion about system state it had no
way to check — the same family as the write-overclaim guard, inverted (it claimed a NON-write). This is
the harmful part: it invites duplicate work. Mike has been DMed the full list so he doesn't recreate
them (`cmsgh1xn90000d17c3i514f56`).

**Root cause of the card symptom NOT proven — 3 hypotheses tested and refuted:** (1) the client dropping
proposal events (the NDJSON path is exhaustively switched + parse- and truncation-guarded in BOTH
consumers); (2) an auto-confirm effect in `AssistantChat` (`confirmProposal` is called only from the
card's `onConfirm`); (3) detecting voice from the trace (`trace.systemPrompt` is not persisted —
`promptLen=0`).

**➡️ STRONGEST LEAD — `useVoiceSession.ts:577`.** A pending card is auto-confirmed when a SPOKEN
transcript matches `CONFIRM_RE = /\b(confirm|yes|yep|do it|go ahead|approve|apply)\b/i`, and that branch
deliberately does **not** persist a user message. That matches the DB signature exactly: 7 commits with
no user turns explaining them, each landing 1–2s after its tool call — and the `file_feedback` commit
landed **1.77s BEFORE** the assistant message asking him to confirm it. If a voice session was live,
ordinary winery-floor speech ("yes", "apply", "do it") would silently commit every pending card.
**BLOCKED ON one fact: was the Talk button on?** Asked him directly; do not guess a fix before he answers.

## 🟢 "BLENDS" (`cmsgc9bw8…`) — PR [#593](https://github.com/russellmoss/wine-inventory/pull/593) OPEN, CI GREEN

Three claims in one ticket, and they land differently:

1. **The error he hit was the #587 bug, from the other door.** His screenshot shows free-run 200 L → **B1**
   AND press 12 L → **B1**, refused with *"Two fractions are going into B1."* He never picked B1 twice —
   the form defaulted BOTH fractions to `vessels[0]`. Already fixed; **#587 deployed 18:21:54Z, 75 minutes
   after he filed at 17:06:05Z.** Same defect, second symptom.
2. **"Two presses into one vessel"** — working as designed (LEDGER-12 / plan 088 U8: each fraction mints
   its own child lot). The message already names both legal options. Not changed.
3. **"Transfer into a vessel that already has wine in it"** — **REAL GAP, and this PR.**

⛔ **The capability existed at every layer except the one a user can touch.** `press-core.ts:187` has
always allowed a fraction to MERGE into the lot already in a vessel (`mergeIntoLotId`), and
`execute.ts:222` always passed it through — but **no screen ever set the field**. It sat in
`PressClient`'s state and payload with NO control behind it (always `""` → null), and `PressTaskForm`
didn't have it at all. **CRUSH has had this control for ages ("Add into &lt;lot&gt;"); press was the odd
one out.** Now on BOTH press surfaces, shown only when the vessel holds exactly one lot, never assumed.
Proven against production: 16 occupied vessels now report residents; B1 → `merge`; merged into 2024-CS →
allowed. Suite 5,818 green.

**Mike's last NEW report (Aug 5, untriaged):** `cmsgbp71b0000l2049stzp37z` "eqipment" (feature request).

✅ **Red on main from `#584 fix/authorization-fences` — [#585](https://github.com/russellmoss/wine-inventory/pull/585) in flight.**
The new `vineyard-scope-db / VINEYARD-1 runtime proof (as app_rls)` job has failed on every run since
the merge (`3ca47e67` → `89cb62dc` → `e4a5893c`). **TWO independent bugs, and the first hid the second:**

1. **Teardown.** The spray chain is append-only, so `spray_reject_delete()` refuses the fixture purge
   unless `app.allow_spray_purge='on'` **and** the role isn't `app_rls` (KD-1 / council C15). The
   teardown had the owner half (`runAsSystem`) and never set the GUC. Fixed the way
   `verify-spray-record.ts` already does it: one transaction, `set_config(..., true)` first
   (transaction-LOCAL, so every delete must share it), delete `spray_application` alone — lines cascade.
2. **An assertion that could never pass**, revealed only once the script survived to print its own
   summary (`1 of 29 checks FAILED`). `resolveSpatialStyleVineyard` returns null for "no such row" AND
   `{vineyardId: null}` for a SYSTEM-scope style; the check collapsed both through
   `styleS?.vineyardId ?? "missing"` and compared to `null` — `null ?? "missing"` is `"missing"`, so it
   failed no matter what the resolver did. Split into row-FOUND + value. Resolver unchanged; it's correct.

⚠️ **Lesson: a crashing teardown is not a cosmetic failure — it swallows the verdict.** The first run
printed 28 ✓ and one ✗, then died in cleanup before the summary line, so the ✗ read as noise inside a
stack trace. "All assertions passed" was wrong for three commits.

**#585 is GREEN** — `vineyard-scope-db` passed for the first time ever:
_"✓ VINEYARD-1 holds against a real database (31 checks)."_ **Main stays red until it merges.**


**🆕 Mike's two other new reports, still untriaged:** `cmsgc9bw80000la04b42ftqvy` "blends",
`cmsgbp71b0000l2049stzp37z` "eqipment" (feature request).

## 🪝 Off-path — found, NOT fixed

1. ⚠️ **The Sentry → GitHub issue automation looks DEAD.** This production 500 (Aug 5) opened no
   issue; the newest `[sentry]`-labelled issue is **#450, Jul 21**. That absence is why nobody knew.
   Same shape as the assistant P0: *the error path that says nothing IS the defect.* Worth its own look.
2. ⚠️ **`draftWorkOrderFromTextAction` has the identical bug** — wrapped in `action(...)` not
   `safeAction(...)`, and `nl-resolve.ts` throws ~30 raw `Error`s with user-facing text ("That vessel
   no longer exists."). Every one is an opaque 500 in the "describe the job" NL box today. Deferred:
   converting it changes the action's return type and all its call sites.

3. ⚠️ **Non-admins with no `user_vineyard` row lose the weather/spray/soil/NDVI/block surfaces
   entirely** — #584's other known issue, unfixed. It is a data task (assign memberships), not code.
4. ⚠️ **Whether the feedback automation loop should ever reach `src/lib/inbox/`** is an open,
   deliberate decision. #590 declined to widen `scripts/feedback-fence-rules.ts` for it, because
   `allowedPrefixes` is the same module the autonomous agent uses to restrict itself and the
   directory holds the per-user RLS surfaces (`notifications.ts`, `direct-messages.ts`,
   `channels.ts`, `actions.ts`). Decide it on its own merits, not when a PR is blocked.

## 🧵 Tangent stack  (LIFO — push when you detour, pop when done)


0. 🔴 **PUSHED 2026-07-28 — SPRAY INTELLIGENCE Wave 1 landing, paused for Cellarhand UI/UX v2.**
   Where it stood: S0 complete (gate did NOT pass, deliverable is the narrowing — S1 is eastern-sites-
   only, California needs station blending) · S2 built, 3 PRs · S3a SHIPPED · S4 built · S2b Units
   1/2/3/5 merged as [#552](https://github.com/russellmoss/wine-inventory/pull/552) and live.
   ⛔ **Wave 2 (S7a · S8 · S6) still BLOCKED**: curated coverage is 0% and needs real content plus a
   human's review signature, and the shipped resolver does not gate on `reviewedBy` yet either.
   Two calls still Russell's: (a) accept the two-zone canopy model; (b) how long must a lot's residue
   flag stay explicable (the one inferred input to ADR 0011).
   Full state: [S2b-report.md](docs/spray_assistant/phases/S2b-report.md) and the entries below —
   the five "do NOT re-derive" findings are preserved in the archived block under "Also in flight".


_Popped entries through 2026-08-05 are in the archive._

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
- **VI Release 4 — Weather & Climate (runbook phases P8 climate spine + P9 disease; NOT "Phase 4" — that's
  soil/P4)** — design brief `docs/GIS/vineyard-weather-climate-design.md` + **4A plan written**
  `docs/GIS/phases/phase-8-weather-climate-spine-plan.md` (12 units) + woven into the brief (Release 4,
  §13.7, §14) and runbook (P8/P9, ledger). Gridded terrain-aware point value (gridMET live / Daymet history
  / POWER global) beside nearest station + elevation delta; **no worker/blob**; spread-not-blend;
  one-estimate-per-vineyard; `query_climate` timezone-correct. **Council-reviewed + owner-decided**
  (`docs/GIS/phases/phase-8-council-feedback.md`; revisions R1–R16 folded — daily-fact-table-authoritative
  schema, obs-time tz normalized at ingest, per-source-with-completeness aggregates, hemisphere/SeasonYear,
  primary-source-model, vulnerable-window frost, vineyard-root card). **Do AFTER P3 ships** (independent, can
  parallel). Next: register CDO token + run the ~45-min point-API spike (de-risks the providers), then `/work`.


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


_Last updated: 2026-08-05 — NOW.md archived. It had reached 3,132 lines against a one-screen
convention; the whole of it is preserved verbatim in `docs/NOW-archive-2026-08.md` and this is a
rebuilt spine holding only what is genuinely open. Nothing was summarised away — the archive is a
copy of the previous file, not a digest of it._
