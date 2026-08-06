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

> **[#593](https://github.com/russellmoss/wine-inventory/pull/593) ("blends") landed** — merged
> `d65b8cdf`, 2026-08-05 20:00Z. Mike's whole batch is now fixed, live, written back and reported to
> him (#583 assistant · #587 capacity · #589 transfer · #593 blends), and #584's fallout is closed
> (#585 CI · #586 admin UI). **Mike's batch is now fully closed out** — the last one open,
> `cmsgbjgov` ("confirmation card"), was RESOLVED 00:58Z on the harm, with the card cause recorded as
> still unproven and a REOPEN condition written into the outcome note. **The voice mechanism behind it
> is now FIXED AND LIVE** (`b4dabffd`, #607 + #608) — reading the code showed it was a defect whoever
> was using it, so it never needed his answer. Nothing is waiting on Mike at all.
>
> ⚠️ **Other sessions have been landing work fast today** (#596–#600 all merged after the archive
> split), so treat this line as authoritative only for the lane it names. The next thing unstarted
> *here* is **plan 107** (assistant tool surface).

## ✅ "CONFIRMATION CARD NOT RENDERING" (`cmsgbjgov…`) — **RESOLVED** 2026-08-06 00:58Z (card cause still unproven)

✅ **Closed via `closeFeedbackItemCore`** (the console's own Resolve path, never a raw status write):
`TRIAGED → RESOLVED`, notes `v2 → v3`, the pending `AWAITING_APPROVAL` automation run auto-skipped to
`SKIPPED`, and Mike got the native `TICKET_REPLY` notice. `triageClass` deliberately LEFT at `UNCLEAR` —
we never proved the class, and rewriting it to look tidy would be the same over-claim this ticket is about.
**Resolved on the HARM, not on the reported symptom**, and the outcome note says so in those words: the
false "nothing got saved" is fixed and live; *why no card appeared* is still unproven and the voice
auto-confirm lead below is still the strongest. **REOPEN if it recurs with Talk off.**

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

✅ **That half is FIXED, MERGED AND LIVE** — [#596](https://github.com/russellmoss/wine-inventory/pull/596)
squash-merged as `28cbbd9b` (2026-08-05 20:12:14Z); main green (`check` · `db-proofs` ·
`tenant-isolation`) and the production deploy succeeded.
`src/lib/assistant/unverified-failure-guard.ts`, the mirror of `overclaim-guard.ts`, wired into `run.ts`
with the same repair-turn + `finally`-backstop shape as the other two guards plus a
`trace.unverifiedFailureRepair` field. **Two evidence tiers:** client-state claims ("display problem",
"the card isn't rendering") are unfounded by construction — the model runs server-side and is never in
the browser; non-persistence claims ("nothing got saved") fire ONLY when a card WAS emitted, so the
guard can never contradict `OVERCLAIM_CORRECTION`. Stands down entirely when a tool actually errored.
Prompt rule added, and `file_feedback` now stamps an UNVERIFIED caveat on an assistant-authored body
that asserts client state — this ticket's "no confirmation card rendered" is what sent triage after a
phantom. 25 tests; ablating the predicate fails 8. The **golden eval** followed in
[#599](https://github.com/russellmoss/wine-inventory/pull/599) and immediately earned its keep — run
live it found TWO false positives in shipped guards (see below). **This fixes the LIE, not the cause — the card
symptom below is still unproven and still blocked on Mike.**

🔬 **What the golden eval found once pointed at the live model** (`npm run eval:assistant-unverified-failure`,
gated on `ASSISTANT_EVAL=1` + a key; 4 cases × 5 runs, 20/20 across two runs). Every one of these was a
guard flagging an HONEST reply — the model's behaviour was right and the code was wrong:
1. **`unverified-failure-guard`**: `cardShown` does NOT mean anything persisted. A card is a proposal;
   the commit is an out-of-band `POST /api/assistant/confirm` the run loop never sees. So *"nothing was
   saved"* is TRUE of every pending card. Fixed with a whole-text `CONFIRM_CONTRACT` suppressor.
2. **`overclaim-guard`** (pre-existing, since #217): only *"no card"* was disclaimed, so an honest
   *"…so no report has been submitted"* tripped the claim pattern and earned a correction restating
   what the model had just said. Generalised the negation to `no <thing>`.

✅ **[#599](https://github.com/russellmoss/wine-inventory/pull/599) (`7484f87e`) is now LIVE.** It
merged at 22:16Z into a **Vercel rate limit** (`Deployment rate limited — retry in 24 hours`), so for
about two hours main was ahead of production. The window reopened on its own: production deployment
`700ca347` succeeded **00:08:14Z**, and `7484f87e` is an ancestor of it (checked with `merge-base
--is-ancestor`, not assumed from the merge). So the two guard false-positive fixes AND
`query_work_orders` are in the deployed build.
⚠️ **Lesson worth keeping: merged ≠ deployed.** The merge said success and the deploy silently didn't
happen; the only way to know was `deployments?environment=Production` — a green PR tells you nothing
about what production is serving. Check the deployment, not the merge.

📬 **Mike has been DMed** (thread `cmrmlwpkm0000l604gictimj9`, message `cmsgqvdw70000d1h0j62flwid`):
told plainly that all seven writes DID save, that the assistant can no longer claim otherwise, and
asked the one blocking question — **was the Talk button on?** Deliberately scoped to what was live at
the time, so it does NOT mention the work-order lookup — that was still undeployed when it went out.
✅ **That follow-up is now SENT** — message `cmsgrovdn0000d1ewy6pve9fc`, same thread, 00:18:04Z; Mike's
`inbox_notification` `cmsgrovrp0001d1ew61xdajmf` exists and is unread. Tells him he can now just ask
*"did that bottling work order save?"* / *"show me WO #83"* and it will look it up and link it, and
re-asks the Talk-button question. Deliberately does NOT claim the card bug is fixed — it isn't.
The ticket has since been **RESOLVED** (see the heading) — on the harm, not the symptom. The card
symptom is still unproven; his Talk-button answer is still the thing that would settle it.

⚠️ **Gotcha that cost time here: the DM tables carry per-user RLS on top of tenant RLS.** A plain
`runAsTenant(tenant, …)` read of `direct_message` / `direct_message_thread` returns **zero rows**, which
reads exactly like "the DM was never sent" — it briefly looked like the note above was an over-claim, and
it wasn't. Pass `{ userId }` (as the send recipe already does) or read as owner. Ground truth when the
local pooler is cold: the Neon MCP (`run_sql` against `muddy-shape-80817041`) bypasses both.

✅ **Coverage gap the eval surfaced — now FIXED in the same PR.** The assistant could CREATE work
orders and had no way to READ one back, so "did those work orders save?" had no answer it could give.
New `query_work_orders` read tool (`src/lib/assistant/tools/query-work-orders.ts`) + the
`buildAssistantWorkOrderWhere` / `listWorkOrdersForAssistant` pair behind it.
**A dedicated tool, NOT a `WorkOrder` entry in `entities.ts`** — every `EntityConfig` must supply
`del` and `isDeletable` is existence alone, so registering it there would have handed `db_delete` the
power to delete work orders past the governed lifecycle. Read access was missing; delete access was
never wanted. Two design calls worth remembering: the date filter is on **`createdAt`, not `dueAt`**
(a fresh draft usually has no due date, so a dueAt filter would hide exactly what you are checking
for), and `includeFinalized` **drops the status clause entirely** rather than widening it, because
"did it save?" is a question about existence. Proven read-only against the live Demo Winery tenant:
**WO #83 "Work order: bottling" — the very one this ticket says vanished — comes back with its link**;
83 work orders with `includeFinalized`; 0 id overlap with `org_bhutan_wine_co`. The two "did it save?"
eval cases were escalated from *verify-or-disclaim* to **must-look-up** now that looking is possible.
↳ **Addendum (`d4d97c67`):** the one thing #599 missed — `docs/architecture/assistant-coverage.md`
never got the row, so the register still read as if the WO core had writes and no read. Added the read
row + the `entities.ts` rationale, and wrote down the standing rule the section exists to enforce
(**a core the assistant can write to needs a way to read the result back**) so the next write tool gets
checked for its read side. `verify:ai-native` green; the eval's 7 deterministic cases pass.

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

✅ **NO LONGER BLOCKED — FIXED AND LIVE 2026-08-06.** The old note said "do not guess a fix before he
answers"; that was right at the time and is now overtaken. Reading the code settled the part his answer
was needed for: **the mechanism is a defect whoever was using it**, so it did not need the Talk-button
answer. Two properties combined — the loose grammar above, and the fact that a *committable* card was
admitted **silently** (`speak()` fired only for Drafts, so the one card that CANNOT write announced
itself and the one that can said nothing). Because the slot is a queue, the model narrates a turn once
while cards arm one at a time underneath it.

Three fixes, all merged and serving in production (`b4dabffd`):
- **Announce every armed card** — what it is, and the word that commits it.
  ([#607](https://github.com/russellmoss/wine-inventory/pull/607))
- **`confirm|approve` only** — `yes`/`yep`/`do it`/`go ahead`/`apply` no longer commit. Cancel stays
  deliberately loose and wins ties: a false cancel is cheap, a false confirm writes to the ledger.
- **Per-card assent** — a card promoted out of the queue cannot be voice-confirmed until it has been
  announced as armed. Fails closed: no announcement → no voice confirm, tap still works.
  ([#608](https://github.com/russellmoss/wine-inventory/pull/608))

Grammar + announcements live in `src/lib/voice/confirm-grammar.ts` (pure, 18 tests) because the voice
components are not unit-testable here. **Mike has been told, and told he no longer needs to answer.**

⚠️ **Still NOT browser-verified** — voice needs a mic and a human, and #608 adds a `speaking`
transition *outside* a turn. Hands-on pass worth doing: two writes in one turn, confirm the first by
voice, check the second is announced before it accepts "confirm".

⚠️ **A defect I shipped in #607 was live 03:40Z–11:43Z** (8 hours): a *queued* card was announced with
the armed card's wording, so "confirm" could name the wrong write. Fixed in #608. Measured before
apologising — **zero** assistant messages from Mike and **zero** nonce burns by anyone in that window,
so nobody was exposed.

## ✅ "BLENDS" (`cmsgc9bw8…`) — [#593](https://github.com/russellmoss/wine-inventory/pull/593) MERGED (`d65b8cdf`)

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


**🆕 Mike's other new report, still untriaged:** `cmsgbp71b0000l2049stzp37z` "eqipment" (feature
request). "blends" (`cmsgc9bw8…`) is triaged — see the section below.

## ✅ "PRESS" (`cmsf3vmlw…`) — FIXED, LIVE, CLOSED OUT (2026-08-05)

[#598](https://github.com/russellmoss/wine-inventory/pull/598) squash-merged as `2d5641d2`; production
deploy succeeded **20:41:35Z**. Ticket RESOLVED/PRODUCT_GAP, Mike DMed (`cmsgjzsmd0000d154g0v8ujwr`).
**Not a defect** — no errors in his trail. Design feedback, and both halves were right.

1. **Press and saignée are now two palette buttons**, each seeding `op`. Fixed at the PALETTE, not the
   model (new `src/lib/work-orders/task-palette.ts`, pure + tested): one task type, many buttons. The
   core, `opType`, ledger and every downstream reader are untouched. **The assistant already agreed** —
   `nl-resolve.ts:752` has always titled the task "Press" or "Saignee". ⚠️ **Deliberately NOT split into
   separate task types**: that is a domain-model change, `data_model_coalescence.md` records nothing on
   press vs saignée, and it would need `/plan` + council. Mike was told this explicitly and invited to
   push back if saignée must be its own ledger operation.
2. **A press task can now pin its source** — optional `sourceVesselId` / `parentLotId` /
   `plannedDestVesselId`. `pinnedPressPosition` (new) honours a PARTIAL pin, and a stale vessel-only pin
   now warns instead of quietly pressing whatever was first in the cellar.

🔁 **THE PATTERN — three tickets in a row, same shape.** `cmsf3y809` (vessel defaults), `cmsgc9bw8`
(merge-into) and `cmsf3vmlw` (press source pin) were all *a capability that exists in the contract and
on the ASSISTANT path but is unreachable from the manual UI*. Worth a deliberate sweep for the rest
rather than finding them one bug report at a time. **Mike has been told that sweep is coming.**

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


_Last updated: 2026-08-06 — the voice confirm-safety fixes are merged and LIVE (`b4dabffd`), which
retires the "do not guess a fix before Mike answers" block above; NOW.md archived 2026-08-05. It had reached 3,132 lines against a one-screen
convention; the whole of it is preserved verbatim in `docs/NOW-archive-2026-08.md` and this is a
rebuilt spine holding only what is genuinely open. Nothing was summarised away — the archive is a
copy of the previous file, not a digest of it._

_Last updated: 2026-08-05 (later still) — `cmsgbjgov`'s **confirmed** half is guarded, MERGED and LIVE
([#596](https://github.com/russellmoss/wine-inventory/pull/596) -> `28cbbd9b`): the assistant can no longer assert
that a write did NOT persist, or diagnose a rendering bug, with nothing in the run to ground it. The
reusable shape: **three guards now share one skeleton** (over-claim / KB-denial / unverified-failure) —
pure per-sentence predicate + one-shot repair turn injected as a user message + `finally` backstop +
`trace.*Repair`. A fourth belongs in that same family, not in a new one. The card SYMPTOM is untouched
and still blocked on Mike._

_Last updated: 2026-08-05 (night) — **data layer, workstreams A + B.** A landed (#588): the FK graph is
machine-readable (`prisma/fk-registry.json`, 439 constraints), guarded statically and against
`pg_constraint` in CI, with a shrink-only baseline of 79 undeclared columns. Widening three keys so a
denormalised `vineyardId` cannot drift exposed a real bug in my own generator (ADDs applied before DROPs
by pattern type, not file position) that had been hiding 4 constraints. B foundation is PR
[#600](https://github.com/russellmoss/wine-inventory/pull/600): `Amount`/`Rate` value types, because the
float money math is **measurably wrong** — `round2(1.005)` → `1`, `Math.round(n*1e8)` goes inexact above
~90M, `0.07`×1000 → `69.99999999999966`. Scope correction: `round2`'s 287 call sites are **volume** math;
`round8` is the money one. Volume rounding has the same bug — its own concern, not folded in.
⚠️ **`Lot.origin*Id` needs a decision** (dangling reference, not a snapshot — vineyards ARE deletable and
bulk intake writes no `lot_vineyard` row). ⚠️ **Attribution: #584/#588 were wrongly amended to author
`russellmoss`; awerth is a different contributor.** Left as-is rather than rewriting published history._

_Last updated: 2026-08-05 (later) — checked the "assistant can't read work orders back" gap and found it
**already shipped** in `7484f87e` (#599, HEAD of this branch): `query_work_orders` exists, is registered,
is tenant-scoped via `runAsTenant` + explicit `tenantId` (K12-safe), and BOTH "did it save?" golden cases
already carry `mustLookUp: true` — enforced, not inert (`assistant-unverified-failure.eval.test.ts:243`),
with `LOOKUP_TOOLS` derived from `kind === "read"` so it cannot drift. Only real gap was the coverage
register, now fixed (`d4d97c67`). Lesson worth keeping: **the task described work that was already done —
reconcile against git before building.**_

_Last updated: 2026-08-06 (00:58Z) — `cmsgbjgov` RESOLVED via `closeFeedbackItemCore`, not a raw status
write: v2→v3, the `AWAITING_APPROVAL` run auto-skipped, Mike notified by `TICKET_REPLY`. Resolved **on
the harm, not the symptom** — the false "nothing got saved" is fixed and live; why no card rendered is
still unproven, `triageClass` left at UNCLEAR, and the outcome note carries an explicit REOPEN condition
(recurs with Talk off). The judgement worth keeping: closing a ticket whose ROOT CAUSE is unproven is
fine as long as the record says so — what would have been wrong is tidying `triageClass` to match the
closure._

_Last updated: 2026-08-06 — **VINEYARD-1 blast radius is now measurable, and finding 3 is half closed.**
`npm run audit:vineyard-memberships` (read-only) reports who D9 actually locks out — needed because both
fences are LIVE, D9 fails closed, and the live DB reportedly held one `user_vineyard` row. **Not yet
run** (no DB locally); it may well report zero. It grants nothing on purpose — who reaches which vineyard
is a business call, and `setUserVineyards` REPLACES the whole set (the 2026-07-26 data-loss shape).
Finding 3: new `settleWithCapture` — `unstable_rethrow` → `ActionError` verbatim (not captured; a refusal
isn't a bug) → everything else captured to Sentry with a GENERIC message. Both hand-rolled `withTenant`
wrappers migrated (~13 actions). `captureException` 5→7, raw `e.message` returns 40→38, local
`ActionResult` redefinitions 2→0. Remaining 38 are route handlers returning `Response.json` — a different
shape wanting a sibling helper, plus a shrink-only guard (the FK-1 ratchet)._

_Last updated: 2026-08-06 (later) — **finding 3 is now fully closed: ERRCAP-1 is guarded and the 18 route
handlers are migrated.** `verify:error-capture` (in CI's `check` job) fails any new
`catch (e) { return { error: e.message } }`; baseline 34 sites/24 files → **16/6**, anchored on file→count
rather than file:line so ordinary edits don't churn it. New `src/lib/route-settle.ts`: `routeError`
(browser, redacts, maps `ActionError.code` → status) and `cronError` (cron, KEEPS the message — the body
lands in cron logs and is the only diagnostic an on-call human gets). **The rule is capture, not redact**,
because redaction is right on one surface and wrong on the other. `cronAuthorized` is now the ONE copy of
a bearer gate that had been inlined identically in all 13 cron routes — every copy correct, which is what
made it dangerous: nothing forced a 14th route to include one. **Knock-on worth knowing: `Error` vs
`ActionError` is now load-bearing, not stylistic** — the uploads/assistant threw both classes as plain
`Error` into one catch and answered 400 for both, so a blob outage read to the user as a validation
problem; 19 deliberate throws are now coded `ActionError`s (`BETTER_AUTH_SECRET is not set` deliberately
left plain so it gets captured). tsc · lint · 10 guards · 5,952 tests green. **Not started: workstream B's
FX/`convertToBase` stage.** Remaining ERRCAP sites: `weather/actions.ts` 9, `ingest-invoice-core.ts` 3,
one each in `action-result.ts` / `ferment/panel-core.ts` / `process-scene-core.ts` / `extract-invoice.ts`._
_Last updated: 2026-08-06 (later still) — **workstream B, FX stage: MONEY-1 is guarded.** Two defects, and
only one was arithmetic. **Measured, not assumed:** over 1,400,000 realistic pairs (cent-scale amounts ×
seven real ECB rates), the old `round2(amount * rate)` disagreed with exact decimal on **447 — 0.032%,
~1 in 3,100** — always a cent light (`11 × 1.085` is 11.935 on the nose and came out 11.93). That is the
grain reconciled against QBO's GL, so 1 line in 3,100 is an A/P reconciliation that silently fails to
balance. ⚠️ **Honest correction to my own earlier claim: the `round8` per-unit grain showed 0 of 1,400,000
disagreements** — the MAX_SAFE_INTEGER hazard needs n above ~90 MILLION, not ~90. Converted for
uniformity, not for a bug. **The structural defect is the reason the type exists:** a bare `number × rate`
cannot know its own currency, so nothing stopped a double conversion or a wrong-pair rate — and the result
of either is a *plausible number*. New `FxQuote` (base, foreign, exact Decimal rate, date, source) refuses
an Amount that isn't in `foreign` and names the double-conversion case by hand. `requireCurrency` now
throws instead of defaulting an unsupported code to USD (that gate was hand-rolled in ingest). The one
`convertToBase` call site is migrated; the allow-list is **empty**. Guard ablated 3 ways. tsc · lint · 12
guards · 5,975 tests green. **Next stage: the cost roll-up** — `src/lib/cost/` accumulates in float
(`round8(totalCost + extended)`) and `ingest/landed-cost.ts` hand-rolls a residual sweep that
`Amount.allocateByWeights` already does exactly. Rebased onto #611 (`5382a993`); the doc/config
conflicts were the predicted ones and the register recount is now 64 notes / 59 guarded._

_Last updated: 2026-08-06 (evening) — **LEDGER-9 investigated: the ledger was right, the REGISTER was
wrong.** Three ways an invariant register can lie while every gate stays green. (a) `verify:` pointed at
`verify:reverse` — a 264-line **reversal-semantics** proof with zero references to rounding, decimals,
balance or floats, whose only fractional literals in the whole file are `0.5` and `13.5`. It could not fail
this way, and `verify:invariants` only checks the named script EXISTS ("detection only"). **A guard that
cannot fail is worse than a missing one — it reads as coverage.** (b) The narrative credited **`round2`** as
a "centiliter-integer / `Prisma.Decimal` helper"; it is `Math.round(n * 100) / 100`, IEEE-754, 287 call
sites. `computeProportionalDraw` is the exact one; `round2` merely normalises to the grain. (c) `isBalanced`
was `|Σ| < 1e-6` — **four orders looser than the 0.01 storage grain it had to protect** — so it could accept
`[3.3333, 3.3333, 3.3334, -10]` (Σ=0) which stores as **−0.01 L**, breaking LEDGER-6 silently and forever,
since Postgres rounds on insert, a CHECK can't see a cross-row sum, and nothing re-reads the op.
**The substance HELD.** A probe asserting ≤2dp on every `deltaL` ran the full suite: **0 trips in 5,992
tests**. `computeProportionalDraw` really is centilitre-exact, every N-way split goes through it, and the
~50 hand-written `round2` calls really do hold. What was missing was **enforcement** — LEDGER-6 rested on
fifty call sites each remembering, with no chokepoint check. Same shape as MONEY-1's structural defect.
Fixed: `assertBalanced` now checks grain-then-conservation in integer centilitres, exactly. New
`verify:ledger-grain` (41 tests) drives the REAL planners with base-10-hostile inputs — thirds, sevenths,
primes, 13-way splits. **Ablated: reverting the fix fails 3 of its tests; `verify:reverse` scores 0
matches on the same regression.** `appliesTo` no longer claims `src/lib/cost/` (float throughout — that is
MONEY-1's remit and its open stage). Stacked on #612._
_Last updated: 2026-08-06 (late) — **cost roll-up stage: the measurements refuted my own premise, so the
work changed shape.** I had recorded (in MONEY-1 and INVARIANTS.md) that `src/lib/cost/` was "the bigger
fish" because "accumulation is where drift compounds", and that `landed-cost.ts` was "a direct swap" for
`Amount.allocateByWeights`. **Both were extrapolated from the FX defect, not measured, and both are
wrong.** `rollupCost` conserves to ~1e-13 across 3→200-way splits; `planDepletion` disagreed with exact
decimal in **0 of 800** cases; `allocateLandedCost` is **exact** at the cent grain on every adversarial
input; `bottlingCostPerBottle` recomposes exactly. Converting this path to Decimal would be churn on a
critical path. **Both claims are now retracted in place, with the numbers.**
**What the measuring DID find is worse than drift.** COST-1 is `severity: critical`, and (a) its only
PURE conservation check, `transferImbalance`, was a **tautology** — `moved` added to both sides, so it
returned 0 for any input including transfers taking **120%** of a parent, while the test asserting on it
was titled "conservation invariant (D10)"; and (b) its only guard, `verify:cost`, needs `--env-file=.env`,
so a critical invariant **never ran in CI's required job**. **Third instance of "a guard that cannot fail"**
after LEDGER-9 — that is a pattern now, not a coincidence.
Fixed: `costConservationResidual` states the real identity (Σ DIRECT == Σ totalCost + Σ expensed),
`transferImbalance` now measures the per-op rounding residual its name implies, and the new pure
`verify:cost-conservation` (19 tests, in CI) covers N-way splits, abnormal loss and a 12-generation
split/merge chain. Ablated 3 ways — breaking the parent debit fails 8 tests, deleting the write-off fails
2, restoring the tautology fails 1. tsc · lint · 14 guards · 6,012 tests green. Branch
`fix/cost-decimal-rollup` (the name is now a misnomer — it decimals nothing)._
