# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**Plan 080 (unified inventory) — Waves 1 (PR #351) + 2 (PR #376) MERGED. Wave 3 (U5 mixed invoice) BUILT → PR open, awaiting CI. NEXT: Wave 4 (U14-U17 field-report hardening, plan drafted in PR #389) — it shares no files with Wave 3.**
- **Wave 3 / U5** (local, 2 commits): ONE invoice can now carry parts + equipment + finished goods and still
  emit ONE aggregate bill (AP-1). Per-line `targetKind` (C2: nullable, NO default — a null target is a hard
  `needsAck`, never a silent MATERIAL guess) · per-line GL routing (C3: fixed-asset / supplies-expense /
  inventory) · qty>1 equipment creates N assets with the residual on the LAST unit so Σ ties EXACTLY (C7) ·
  FG target resolved at REVIEW, not auto-created at apply (S11) · review screen gained the target selector.
  ⚠️ **Judgement call to flag in review:** an unmapped GL account now ROLLS THE APPLY BACK (it previously
  discarded the emit result and booked the goods anyway). Scoped by `reasonCode` so A/P-less tenants are
  unaffected. The category→account map still needs **accountant sign-off** before go-live.
- **Wave 4** (new, 2026-07-20, from a `/bug-triage` dry run): five Demo reports that are ONE flow —
  Mike setting up label materials to bottle Ann's Blend 2026, blocked at every step. U14 bifurcate record
  setup from receipt (#377, phantom 50 units — unwind with a REVERSING movement, never a delete) ·
  U15 count/package UOM + pack size (#366+#370, ONE unit, same seam) · U16 surface derived cost read-only
  (#374, NO price column) · U17 vendor picker on immutable `vendorId` (#373). Critical path is U14.
- ⛔ **#365 "no finished goods in inventory" — DO NOT BUILD.** Triage ranked it P0; the live Demo read says
  otherwise: `bottledInventory` has 9 stocked rows (Ann's Blend 2026 = 1,524 bottles), `finishedGoodInventory`
  is 0 only because no merch exists, and the section defaults to the **All** sub-tab which merges both. Reporter
  was almost certainly on the **Merchandise** tab. Disposition: `unclear` → ask Mike.
- **Wave 1** (merged `e0481cc0`): per-location consumables spine, costed equipment, manual invoice, 5 assistant
  write tools, composite-tenant Location FK. `supply_lot.locationId` is now **NOT NULL** — expand/contract closed.
- **Wave 2** (local): U6 unified `/inventory` with 3 URL-addressable sections + redirects · U8 consumables
  per-location on-hand + Receive/Adjust/Transfer · U7 `FinishedGoodReceipt` weighted-avg cost layer + Wine/Merch
  sub-tabs + add modal · U9 equipment costs + parts · U11 Expendables→Consumables (copy only) · U13b brain refresh.
- **Browser-verified on Demo** (the session's most useful hour): sub-tabs, the WINE-ONLY blank-vintage
  soft-confirm, per-location on-hand, and a real shortfall block —
  *"Not enough BENTONITE at Winery: only 10000 g there, can't transfer 99999."*
- ⚠️ **ONE DATABASE.** `.env` and prod are the SAME Neon instance; it holds the real Bhutan tenant. Every
  migration this plan deployed is already live.
- 🔧 Found by driving the UI, not by CI: `Modal` had NO `role="dialog"`/`aria-modal` (app-wide a11y gap, fixed),
  and finished goods had FOUR competing add affordances (legacy inline forms removed + their dead server
  actions deleted — an exported Next action stays invocable with no caller).
- 🧠 Lesson: I mis-diagnosed "modal won't open" TWICE by detecting `[role="dialog"]` on a Modal that never set
  it, and reported a false verification gap in two commits. Verify the detector before trusting the verdict.

<details><summary>parallel workstream — Plan 081 assistant confirmation-card reliability (from main)</summary>


<details><summary>parallel workstream — Plan 081 (from main)</summary>


<details><summary>parallel workstream — Plan 081 (from main)</summary>

**Plan 081 (assistant confirmation card) — SHIPPED to main.** #354 (`fe3f483e`) + #355 (`c6f524d8`).
Unit 10 live proof on Demo: the repro prompt went from **2/7 (29%) → 12/12 (100%)** card emission
(5 trials through the UI with a rendered Confirm button, 7 direct to `/api/assistant` with valid tokens).
Two hard cases also carded: an unknown assignee, and "top up the barrels that need it".
Reporter (Mike) DM'd with the measured number and the two honest caveats below.

**Residual — NOT done, in rough priority order:**
1. **`brix-write` 5/10.** The Draft Card fixed the WORK-ORDER path; it did not generalise. Different
   write family, `no-tool` half the time. Largest remaining piece of the original complaint.
2. **Draft rendering unproven in a live browser.** All 14 trials returned `ready` (Mike resolves in
   Demo, so nothing was ever missing). The Draft path is unit-tested + DB-proven (`needs_input`,
   0 signed builds, `committable:false`) but nobody has watched Confirm greyed out on screen.
3. **`wo-vague-target` knownGap is probably an eval artifact.** Live, that utterance DOES card — it
   routes to `issue_operation_wo`, while the eval asserts `propose_work_order`. Fix the case's expected
   tool before the nightly starts mailing false failures. (Second time this eval's fixtures, not the
   product, produced a misleading signal.)
4. **Absent assignee ≠ wrong assignee.** Asking for a WO for a nonexistent person correctly avoids
   fabricating an email, but returns a READY card that is silently unassigned. The guard catches a
   wrong email, not a missing one.
5. **Ticket #328 / `cmrs4vasg`** (card appeared then errored on block delete) — still unroot-caused.
6. `verify:work-orders-transform` red on the plan-059 bottling guard (needs a label in its fixture) — chip filed.

_Cosmetic: #355 squash-merged to main still titled "WIP:" — I marked the PR ready but forgot to retitle
it before merging._



</details>
**Assistant confirmation-card RELIABILITY (Mike's recurring "it says there's a card but there isn't") — PLAN 081. Units 1+2 DONE on `claude/assistant-card-guard-fixes` (PR A pending). Units 3–9 DONE + PUSHED on `claude/assistant-draft-card` (PR #355). Only Unit 10 (live browser QA) left — it needs the interactive logged-in pane.**
**MEASURED RESULT: the seeded repro went 2/7 (29%) → 3/3 (100%)** on the new MUST_PROPOSE eval (opus-4-8, real prompt, `tool_choice` omitted, multi-turn, 3 runs/case). Zero fabricated assignee emails, zero wrong-tool, read-intent controls clean.
Landed: U4 Draft contract (`asProposal` NORMALIZES so a draft can never carry a commit token) · U5 `propose_work_order` returns a Draft instead of prose · U6 prompt rules 40/45 rewritten to compose · U7 card renders + Confirm gated · U8 exhaustive `switch` + `never` in both stream consumers (verified by temporarily adding a variant) · U9 nightly eval + workflow.
Four things the plan got wrong are recorded in it as "Build note 2": the assignee was **never** a required arg (nothing to relax); the **typed override is not implementable** and shouldn't be (a Draft has no token, and the server gate refuses blockers anyway — shipped stricter: a blocked draft is not issuable at all); **must-on-skins is detected by nothing in the codebase** (the model knew it, the engine doesn't — needs its own rule + winemaker sign-off on severity); and a **single-turn eval measures the wrong thing** (scored 0/3 because the model correctly reads cellar state first).

</details>
**Assistant confirmation-card RELIABILITY (Mike's recurring "it says there's a card but there isn't") — PLAN 081, BUILDING. Units 1+2 DONE on `claude/assistant-card-guard-fixes` (PR A pending). Units 3-10 (Draft Card) next on `claude/assistant-draft-card`.**
Plan: [2026-07-19-081-fix-assistant-draft-card-guarantee-plan.md](docs/plans/2026-07-19-081-fix-assistant-draft-card-guarantee-plan.md) (Deep, 10 units).
Council record: [council-feedback-080-assistant-card.md](council-feedback-080-assistant-card.md).
**Council KILLED the first architecture.** The original plan (forced `tool_choice` repair turn + `decline_write` escape hatch
+ a regex write-intent classifier) was rejected by BOTH Codex and Gemini, independently, on three grounds:
(1) `tool_choice:{type:"any"}` *mechanically requires* schema-valid JSON, so a missing required field (the assignee email the
model said it couldn't resolve) **must** be fabricated — not a risk, a guarantee;
(2) `decline_write` swallows the fix — a model inclined to ask a question gets a typed, legal way to ask a question, so prose
questions become JSON questions and still no card;
(3) the regex false-positives on reads — in this domain the write verbs ARE the query verbs ("when did we last **rack** T4?").
Replacement (both reviewers converged on it independently): the **Draft Card**. A card is currently binary — perfectly valid or
nonexistent; there is no state for "here's your card, it's missing two things". Add it: write tools return a Draft carrying
unresolved fields + typed objections, the card ALWAYS renders, and Confirm is *disabled* until resolved (a `blocking` objection
needs a typed override). **A Draft never mints a commit token** — that's the security-critical invariant.
Also from Gemini, the domain fact that reversed the earlier Q1 answer: must on skins is a slurry — you *cannot* rack it; it
clogs a positive-displacement pump. The model's refusal was CORRECT, so a dismissible warning banner was the wrong call.
Scope call (Q4): build the Draft contract generically, convert tools incrementally, **work-order path first** — relaxing
`required` on all 51 write tools at once would strip API-level validation across the whole assistant surface.
Live-reproduced in the in-app browser against Demo Winery: the SAME prompt ("issue a work order to Mike to rack all the
wine from T3 → T4") emitted a `proposal` event **2 times out of 7**. In the other 5 the model answered with a clarifying
question instead of calling the write tool. Root cause is architectural, not a rendering bug: the card is emitted at
[run.ts:136-140](src/lib/assistant/run.ts:136) **only if the model chooses to call a write tool**, and the model call
([run.ts:107-113](src/lib/assistant/run.ts:107)) passes **no `tool_choice`** — so card emission is a stochastic model
decision. Six prior fixes across five different layers (prompt rule #116, router.refresh #82, tool-description steering
#82b, scroll-clip #216, overclaim guard #217, P2002 commit path #322) each fixed a real but *different* layer.
Second finding: the `claimsWriteWithoutCard` backstop is disabled by any incidental "can't/didn't/unable" **anywhere** in
the reply ([overclaim-guard.ts:16](src/lib/assistant/overclaim-guard.ts:16)) — and the assistant says "I can't verify Mike
Juergens' account" in exactly this scenario, so the net is down precisely when it's needed. Verified `false` on the real transcript.
Mike's tickets: #203/#205/#206 (RESOLVED via #216) + `cmrs4vasg` / [#328](https://github.com/russellmoss/wine-inventory/issues/328) (OPEN, delete-block card error, not yet diagnosed).

<details><summary>prev objective — add-variety assistant write flow (ticket cmrs2eops / #309) — FIXED, PR pending</summary>

**FIXED in worktree `variety-add-write-flow-1fd03a`. All gates green (vitest 2452, tsc, lint, verify:naming 25/25); DB-proven on Demo. Next: commit → PR (do NOT push main; wave-1 predecessor to #308/#312).**
Approving an assistant change card to ADD a variety threw a raw error and nothing persisted. Root cause: the generic `db_create` path (`commitDbCreate`) let a duplicate name hit Postgres' `@@unique([tenantId, name])` and surfaced the raw multi-line Prisma **P2002** through the confirm route (`{ ok:false, error }` shows the message verbatim). Reporter asked for varieties (plural), so a same-batch/stale card is the trigger. Second latent bug found: the DB unique is case-SENSITIVE, so "syrah" beside "Syrah" silently created a **duplicate** — a master-data identity violation (NAMING-1).
Fix (fence: `src/lib/assistant/`, `src/lib/reference/`; no schema change):
(1) [entities.ts](src/lib/assistant/entities.ts) — new optional `EntityConfig.findConflict` + shared `nameConflict` helper (case-INSENSITIVE name match, reads only, never re-keys the existing row); wired for the name-unique globals Variety/Vineyard/Location/FinishedGoodCategory (NOT FinishedGood — it has no name unique, dups are legit);
(2) [db-create.ts](src/lib/assistant/tools/db-create.ts) — `run` refuses a conflict up front (no doomed card), `commitDbCreate` re-checks at commit (batch/stale path) **and** catches P2002 as a friendly backstop;
(3) [actions.ts](src/lib/reference/actions.ts) — the `/reference` FORM's `findByName` made case-insensitive too, so both write paths agree on "already exists".
Unit test [assistant-db-create-dedup.test.ts](test/assistant-db-create-dedup.test.ts) (5, hermetic). DB proof on Demo: "Syrah"/"syrah"→friendly refuse (no dup), stale "Merlot" card→refused at commit, a NEW name→persists.
**PENDING: commit + open PR. Browser QA of the live assistant card needs interactive login (user); the DB write is definitively proven by the tenant-script read-back.**

### 🎯 Also in flight (parallel session — plan 080 unified inventory, Wave 1)

_Kept from `main`; owned by another session. Wave 1 landed as PR #351._

**Plan 080 (unified inventory) Wave 1 — U1 + U2a + U2b consolidated + rebased onto main on `claude/plan-080-wave-1`. NEXT: U3 costed equipment → U4 manual invoice (materials-only) → U12 assistant tools → U13a, then the Wave 1 PR.**
Wave 1 = the money spine, reviewed WITHOUT UI churn (Wave 2 = surfaces U6–U11; Wave 3 = U5 mixed-invoice apply, alone, last).
- **U1** `SupplyLot.locationId` + `splitFromLotId` lineage + the `material_movement` RLS ledger + backfill
  (0 nulls across 8 tenants). Migration is ALREADY DEPLOYED to Neon; `SET NOT NULL` deferred to U13a.
- **U2a** every lot carries a location — `resolveSystemLocationId` defaults the pre-location-aware callers
  (invoice apply, restock, opening stock).
- **U2b** NEW `src/lib/cellar/material-stock-core.ts` — `receiveConsumableCore` / `adjustConsumableCore` /
  `transferConsumableCore`. Transfer is a FIFO **lot-split**: each destination lot inherits
  unitCost/receivedAt/expiresAt/vendorId/lotCode/policyVersion/FX and points back via `splitFromLotId`
  (provenance transitive — council S2, never a row-copy); both legs share one `transferGroupId`; race-safety
  via a `gte`-guarded per-lot decrement mirroring `movements.ts`; qty pinned to ONE 6dp scale. Positive adjust
  seeds a lot at the weighted-avg (never $0); negative adjust BLOCKS past on-hand (a deliberate move).
  Plus `onHandByLocation` / `onHandByLocationForMaterials` + three `safeAction` wrappers.
  `depleteSupplyLotsTx` gains optional `locationId` → location-scoped draw + **negative reconcile**; with no
  `locationId` the legacy dosing path is byte-identical (verify:cost unchanged).
  Green: tsc 0, vitest 2465, **verify:cost 55/55**, tenant-isolation, invariants 35/35, parity, ai-native.
  **Negative-reconcile reading CONFIRMED by Russell (2026-07-19):** the locked mechanism calls the reconcile lot
  "inert to FIFO/WA" yet requires cost stay KNOWN — literally that leaves the shortfall unbooked, so the
  shortfall IS booked as a `SupplyConsumption` against the negative lot (no extra decrement; the lot is born at
  −shortfall). That is the settled interpretation — build on it.
- **Wave-2 follow-up:** `listMaterials`' scalar `onHand` still sums only positive lots, so it will overstate once
  negative reconcile lots exist. Harmless in Wave 1 (nothing passes `locationId` yet); fix when dosing-by-location lands.

</details>

<details><summary>prev objective — add-variety assistant write flow (MERGED to main as PR #322)</summary>

**Add-variety assistant write flow (ticket cmrs2eops / issue #309, Demo) — MERGED as PR #322 (`71016b3e`).**
Approving an assistant change card to ADD a variety threw a raw error and nothing persisted. Root cause: the generic
`db_create` path (`commitDbCreate`) let a duplicate name hit Postgres' `@@unique([tenantId, name])` and surfaced the raw
multi-line Prisma **P2002** through the confirm route. Second latent bug: the DB unique is case-SENSITIVE, so "syrah"
beside "Syrah" silently created a **duplicate** (NAMING-1 master-data identity violation). Fix: new optional
`EntityConfig.findConflict` + shared case-insensitive `nameConflict` helper wired for the name-unique globals
(Variety/Vineyard/Location/FinishedGoodCategory — NOT FinishedGood, which has no name unique); `db_create` refuses up
front, re-checks at commit, and catches P2002 as a backstop; `/reference` form `findByName` made case-insensitive too.

</details>

<details><summary>prev objective — bug-report screenshot excludes the report dialog + optionally the assistant</summary>

The assistant's "Report a bug" screenshot captured the report dialog itself (dim backdrop + "Report a bug ×" title bar)
and the assistant, occluding the actual page. Fix, 3 files: (1) [Modal.tsx](src/components/ui/Modal.tsx) `overlayProps`
passthrough; (2) [AssistantDock.tsx](src/components/assistant/AssistantDock.tsx) `data-assistant-surface` tags;
(3) [FeedbackTicketModal.tsx](src/app/(app)/assistant/FeedbackTicketModal.tsx) "Is the bug in the assistant?" Yes/No
(default No) + Capture + two-condition `html-to-image` filter + 15s timeout race.

</details>

<details><summary>prev objective — Plan 079 winemaking KB RAG (COMPLETE)</summary>

**Plan 079 winemaking KB RAG — COMPLETE. Unit 11 subscription settings UI → PR #293; 4 sources MERGED (#292); corpus 1,449 docs.**
The whole plan is done: crawled cited corpus (AWRI+WA) + Unit 12 re-crawl freshness loop (#289) + 4 new sources
(WSU/OSU-Extension/OSU-OWRI/Scott, #292) + Unit 11 per-tenant subscription UI (#293). A Settings card
(`KnowledgeSourcesCard`) toggles which GLOBAL sources feed THIS winery's assistant — `listSourceSettings()` loader,
`setKnowledgeSourceEnabled` admin action (tenant-scoped `KnowledgeSourceSubscription`, audited).
`verify:kb-subscriptions` 7/7 incl. RLS isolation. All sources `defaultEnabled` → nothing changes until a winery opts out.

</details>

<details><summary>prev objective — Unit 12 re-crawl freshness loop (SHIPPED + MERGED PR #289)</summary>

**Plan 079 Unit 12 (re-crawl freshness loop) — MERGED (PR #289); core corpus on main (PR #285).**
Weekly GH Actions loop (`knowledge-recrawl.yml` → `scripts/recrawl-knowledge.ts`): conditional-GET re-crawl
→ re-embed only changed pages into a new revision behind the atomic flip, add new, tombstone 404s
(`status='withdrawn'`, kept for audit); reversible + self-correcting; tombstone gated to COMPLETE crawls;
single-flight; writes GLOBAL corpus only; opens a GitHub issue; never merges code. Post-merge activation
needs repo secrets `DATABASE_URL_UNPOOLED` + `VOYAGE_API_KEY`, then trigger once with `max_docs=5`.

</details>

<details><summary>prev objective — Plan 079 bug-report clarification loop (FULLY SHIPPED, different workstream)</summary>

**Plan 079 bug-report clarification loop — FULLY SHIPPED to main (all 13 units), browser-QA'd end-to-end.**
Four landing PRs: #276 (backend spine), #281 (U11-UI + U12 assistant surfacing), #277 (inventory-error sibling),
**#282 (U8 in-agent `request_clarification` tool + workflow branch, `6ac7b0b`)**; docs truth-up PR #283. What it does:
(1) a bug report auto-captures the browser console (ring buffer → clamped debug context); (2) when the automation
finds a report too thin to act on — either a cheap-LLM **sufficiency gate** pre-flight OR the fix agent
mid-investigation via the new `request_clarification` tool — it **DMs the reporter** from "Cellarhand Support" with a
`[Ref: BUG-XXXX]` token, parks the run at `AWAITING_CLARIFICATION`; (3) the reporter sees a "Needs your input" chip on
My Reports + an assistant nudge, replies in their inbox; (4) the reply hook strips the ref token, flips the
clarification to ANSWERED, feeds the answer onto the ticket, and **re-dispatches the fix workflow at attempt 2**
(`MAX_CLARIFICATION_ROUNDS=2` now live). Watchdog + TTL sweep cron recovers strands. DONE — nothing pending.

</details>

<details><summary>prev objective — P0 bottling ABV range guard (SHIPPED PR #275)</summary>

**P0 bottling ABV range guard (feedback `cmrqtzlc1000kij049zm4me25` / #263, DEFECT) — SHIPPED, PR #275 merged (`c74ec98`).**
Ticket RESOLVED + reporter (Mike, `mike@bhutanwine.com`) DM'd from Cellarhand Support. Branch pruned. Bug: the
bottling flow accepted an absurd ABV (e.g. **140%**) with no upper bound → corrupt finished-goods/tax data.
Fix: ABV is a %-by-volume, physically bounded to **(0, 100]** — new pure helper
[abv-range.ts](src/lib/bottling/abv-range.ts) (`validateBottlingAbv` + constants + friendly messages), shared by
client + server so wording matches. Server source of truth is `runBottlingTx`
([run.ts:63](src/lib/bottling/run.ts)) — the single choke point every entry point routes through (standalone
create/edit AND the WO BOTTLE task in `execute.ts`), so all paths are covered without touching the out-of-fence WO
files. `parseAbv` ([actions.ts](src/lib/bottling/actions.ts)) validates at the action boundary for a fast message;
[BottlingClient.tsx](src/app/(app)/bottling/BottlingClient.tsx) makes ABV controlled with an inline hint + `max` and
blocks submit out of range. Ceiling is the physical max, NOT 24% — compliance tax-class intentionally captures >24%
and flags it for review (`abv-over-24-review`), so rejecting at 24 would defeat that design. GREEN: unit 8/8
([test/bottling-abv-range.test.ts](test/bottling-abv-range.test.ts)), verify:cost 55/55 (happy path intact), tsc +
lint clean, verify:naming 25/25; CI check/review/tenant-isolation/GitGuardian all passed. Demo DB proof:
`executeBottling(abv=140)` rejected with ZERO writes (no SKU/run, vessel untouched), `abv=13.5` still succeeds.

</details>

<details><summary>prev objective — Ticket #188 harvest-pick + VineyardBlock cascade delete (SHIPPED PR #265)</summary>

**Ticket #188 — assistant delete for standalone harvest picks + user-confirmed VineyardBlock cascade — SHIPPED (PR #265, `3eb512e`).**
Feedback `cmrm6akt60001jp04fmxyrl0l` (Bajo test-data cleanup): couldn't delete blocks refused by dependent
Brix/harvest records, and no path to delete a standalone harvest pick.
(1) **`delete_harvest_pick`** assistant tool — inverse of `log_harvest_pick`, mirrors `delete_brix`; hardened
`deleteHarvestPick` refuses a crushed pick (`LotHarvestSource` Restrict; was a latent 500) + fixed audit action.
(2) **Confirmed cascade in `db_delete`** — `RelationSpec.cascadable` + `EntityConfig.cascadeRestrict`; `VineyardBlock`
cascades Brix + harvest records (+ discloses subblocks) but HARD-REFUSES crushed picks & keeps WO-task FK a hard wall.
No schema. `/review` CLEAR (3 specialists, 0 critical). vitest 2333/0, tsc/eslint/ai-native green.

</details>

<details><summary>prev objective — Ticket #268 self-assigned WO inbox emit + "Issue" button (SHIPPED PR #278)</summary>

**Ticket #268 — self-assigned WO emitted no inbox notification + confusing "Issue" button — SHIPPED (PR #278, `6dc2d14`).**
Feedback `cmrqtvwja000fij04rsn25z15` (Demo Winery). Two issues: (a) the WO detail "Issue" button was ambiguous
(reads like "report a problem"; it actually flips DRAFT→ISSUED and opens execution); (b) **the real defect** — a
self-assigned WO showed in the inbox WO bucket (assigneeId set) but produced NO inbox notification, because every emit
path suppressed self-notifications AND the create path never emitted an assignment notification at all.
Fix: new `allowSelfNotification` flag on `EmitNotificationInput` + pure `shouldEmitNotification` gate; emit a
`WO_ASSIGNED` notification at the create chokepoint (`createWorkOrderCore`) to the resolved assignee **allowing self**,
and mark the reassign emit self-aware too. `WO_STATUS` self-suppression unchanged. Button → "Issue & open for
execution" + a DRAFT helper line. vitest 50/50 (4 new gate tests); DB proof passed.

</details>

<details><summary>prev objective — WO builder same-vessel transfer guard (cmrqqm75b, SHIPPED PR #262)</summary>

**WO builder same-vessel transfer guard (feedback cmrqqm75b, P1 defect) — SHIPPED, PR #262 merged (`ee851b8`).**
Ticket RESOLVED/DEFECT + issuer (Mike) DM'd. Branch pruned. Bug: the WO builder let you author a transfer
(RACK) whose source and destination are the SAME vessel; execution correctly refuses it, so a user could save a WO
guaranteed to fail at execute — builder validation out of sync with the execution guard. `/investigate` confirmed
root cause: execution refuses `fromVesselId === toVesselId` at [rack-core.ts:94](src/lib/vessels/rack-core.ts:94)
(RACK) and [topping.ts:42](src/lib/cellar/topping.ts:42) (TOPPING), keyed on **vessel id**; but the shared builder
validation core `readTask` in [proposal-readiness.ts](src/lib/work-orders/proposal-readiness.ts) only checked each
vessel exists + is active, never source ≠ dest. Fix = mirror the guard: add a `blocking(ctx, "same_vessel", …)` in
the RACK and TOPPING readiness cases (same-id short-circuit). Flows to BOTH surfaces automatically — the builder UI
(`readiness.status === "blocked"` disables Create + shows the warning) AND the server write gate
`gateWorkOrderReadinessForWrite` (refuses create/edit; `safeAction`→`settleAction` returns `{ok:false,error}`, no
thrown ActionError). Execution guards kept as backstop, unchanged. GROUP_RACK deliberately untouched (execution
silently filters self-members, not a reject). 4 regression tests in
[test/work-order-readiness.test.ts](test/work-order-readiness.test.ts) (same-vessel RACK+TOPPING blocked, distinct
vessels ready). GREEN at merge: vitest 21/21 (readiness), tsc, eslint, next build, verify:work-orders 43; CI
(check + tenant-isolation + GitGuardian + Vercel) all passed. Closed the loop: ticket → RESOLVED/DEFECT with a
write-back note, and a resolution DM sent to the issuer (Mike, `mike@bhutanwine.com`).

</details>

<details><summary>prev objective — P0 bottling no-cork guard (SHIPPED, PR #259, a173e0a)</summary>

**P0 bottling no-cork guard (feedback bug) — SHIPPED, PR #259 merged (`a173e0a`).**
Superseded client-only PR #242 with a server backstop. Pure classifier in
[packaging-bom.ts](src/lib/bottling/packaging-bom.ts) — `classifyPackagingRole` (name/kind → bottle|closure|label;
a capsule is deliberately NOT a closure). Server guard
[mandatory-packaging.ts](src/lib/bottling/mandatory-packaging.ts) `assertMandatoryPackaging(packaging, loadMaterials)`
— wired into `createBottlingRun`/`editBottlingRun` ([actions.ts](src/lib/bottling/actions.ts)) AND the WO BOTTLE task
([execute.ts](src/lib/work-orders/execute.ts)) at the entry points, not `runBottlingTx`. UI mirrors in
[BottlingClient.tsx](src/app/(app)/bottling/BottlingClient.tsx) + BottlingTaskForm. Live Demo proof: corkless run
REJECTED with zero partial writes; full run wrote 100 bottles + depleted cork 500→400.

</details>

<details><summary>prev objective — #241 dashboard Recent activity filter (BUILT)</summary>

**Feedback #241 (cmrqpp88 "too much detail in dashboard") — dashboard Recent activity filtered to leadership-relevant events — BUILT, ready for /ship.**
Branch `claude/work-241-page-tsx-5fdfdb` (commit 752c212). The leadership dashboard's Recent activity feed pulled the last 6
audit rows indiscriminately, burying operational signal ("we bottled wine today") under bug-triage / dev-automation /
auth-admin churn. Added a leadership-relevance classifier to [src/lib/audit.ts](src/lib/audit.ts) — denylist of
non-operational entity types (`FEEDBACK_TICKET`, `ASSISTANT_FEEDBACK`, `AutomationRun`, `AppSettings`, `Session`, `User`,
`VendorImportCandidate`, `DirectMessage`) + actions (`LOGIN`, `PASSWORD_*`, `USER_CREATED/DELETED`, `USER_VINEYARD_ASSIGNED`,
`IMPERSONATE`) — exposed as a pure predicate `isOperationalAuditEntry` + a synced Prisma fragment `operationalAuditWhere`;
[page.tsx](src/app/(app)/page.tsx) filters the feed at the DB. Denylist (not allowlist) so new operational events show by
default. GREEN: tsc, eslint, vitest 15/15 (audit + assistant-audit). Proven on real prod data (Neon): prior 6th feed row
"Developer approved feedback automation" drops out, replaced by a real work-order event. Next: `/review` then `/ship`.

<details><summary>prev objective — Plan 076/078 invoice ingestion (SHIPPED, PR #246)</summary>

**Plan 076/078 — invoice ingestion: dupe guard + one-Bill-per-invoice QBO + Paid/Outstanding A/P — SHIPPED (PR #246 OPEN).**
Branch `claude/invoice-ingestion-features-95d4df`; merged latest main (Plan 075 vendor-pull; resolved qbo/client.ts conflict).
All gates green post-merge (vitest 2284, ingest 81, accounting-idempotency 33, invariants 35/35, next build). Live QBO
pass + Demo browser-QA both DONE + user-confirmed. Only remaining: accountant sign-off on the BillPayment GL (not a
merge blocker). Plan at
[docs/plans/2026-07-18-076-…](docs/plans/2026-07-18-076-feat-invoice-qbo-bill-payment-status-plan.md).
(1) Duplicate confirm gate — stage-time structured `duplicates` + upload modal ("continue?") + hard apply guard
(`allowDuplicate`). (2) **One aggregate Bill per invoice** — `emitApExportForInvoice` (postingKey `apinv:<id>`,
multi-line `billLinesJson`), per-lot emit suppressed via `skipApEmit`, multi-line `buildBillPayload`; new invariant
AP-1. (3) Paid/Outstanding — schema on `IngestedInvoice`+`ApExportEvent`+AppSettings pay-from accounts, required
review-screen selector, `setInvoicePaymentStatus` post-apply flip, QBO **BillPayment** poster pass (Check/CreditCard,
exactly-once), inbound Bill.Balance read-back in reconcile (two-way + discrepancy surfacing). Two RLS-neutral
migrations applied to Neon. **Live QBO-sandbox pass DONE + USER-CONFIRMED**; **Browser-QA on Demo DONE**. PENDING before
prod trust: **accountant sign-off** on the BillPayment GL direction only.

</details>

<details><summary>prev objective — QBO vendor sync Slice 2 (Plan 077, BUILT on claude/qbo-vendor-eager-push)</summary>

**QBO vendor sync Slice 2 — eager create-into-QBO (Plan 077) — BUILT (all 7 units), gates green, live-proven on Demo. Next: `/ship`.**
Branch `claude/qbo-vendor-eager-push`. Final slice of the vendor-sync arc (Slice 0 #229 near-dup guard, Slice 1
#231 pull queue). When an opted-in winery creates a vendor in Cellarhand it's pushed to QuickBooks immediately,
so an owner-operator never opens QBO. Push runs AFTER `createVendorCore` commits (never a DB tx across the QBO
HTTP call — Neon P2028), home-currency only (foreign `(CUR)` vendors stay lazy at bill-post, Plan 073),
idempotent (skip if already linked; `findOrCreateVendor` query-before-creates). Fuzzy-matches QBO first
(Slice-1 `listVendors` + Plan-074 `findVendorNearMatches`) so it never mints "Scott Labs"/"Scott Laboratories"
in QBO — the modal offers **link-to-existing** vs **create-new**. QBO offline → `syncStatus='pending'` + a retry
sweep (`runVendorSyncSweep` + `/api/cron/qbo-vendor-sync`, 14:45 UTC). Two vendors → one QBO id → `conflict`
(Slice-1 `@@unique`, not a 500). Opt-in per tenant (`AppSettings.pushVendorsToQbo`, default off; large wineries
author in QBO). Units: U1 columns+migration (applied to Neon), U2 eager-push core, U3 fuzzy pre-check action,
U4 modal link-vs-create wired through the setup page, U5 sweep+cron, U6 `/settings` toggle, U7 `verify:vendor-sync`
(5/5 deterministic + live QBO push/pre-check under `VERIFY_VENDOR_SYNC_LIVE=1`) + backfill + security note.
**Gates all green:** tsc, `verify:vendor-sync` (link/idempotent/conflict/sweep-gating/opt-in + LIVE push=synced,
pre-check clean), verify:ai-native, verify:parity, verify:naming, verify:tenant-isolation, vendor vitest 61,
lint 0 errors, `next build` clean (cron route registered). Plan: `docs/plans/2026-07-18-077-feat-qbo-vendor-eager-push-plan.md` (status: completed).

</details>

<details><summary>prev objectives (on their own branches / shipped)</summary>

- **Movable + growable assistant dock — BUILT + browser-QA'd on Demo** on `claude/assistant-widget-drag-resize-3c069b`.

- **Plan 073 multi-currency FX ingestion — BUILT (10 units), gates green, ready for `/ship`** on branch
  `claude/multi-currency-fx-ingestion`. Foreign invoice → base-currency inventory at a dated ECB rate
  (Frankfurter, keyless) + EUR A/P Bill to QBO; P0 double-conversion fixed by decoupling (lot=base,
  `ApExportEvent`=foreign+rate). Live EUR Bill + €767.16 e2e proven in Cellarhand AND QBO.
- **Plan 072 invoice/document ingestion — SHIPPED (PR #223, 24d7d35).** Vendor merge + removal — SHIPPED (#222).

</details>

<details><summary>prev objective — Plan 072 invoice ingestion (SHIPPED, PR #223, 24d7d35)</summary>

**Invoice/document ingestion → deterministic expendables & equipment intake (Plan 072) — SHIPPED to main.**
Branch `claude/invoice-ingestion-intake-385010`. All 12 units committed to the branch
(committed, all gates green): U1 schema+migration (4 RLS staging/provenance tables + composite FKs, applied to
Neon), U2 EQUIPMENT category + `isDoseableCategory` denylist→ALLOWLIST + `UNCLASSIFIED` sink (WORKORDER-7),
U3 PDF-aware private blob + upload route, U4 extraction core (de-risking spike PASSED — `claude-opus-4-8`
accepts native PDF `document` blocks; captured + verified all 8 real docs vs the plan matrix), U5 landed-cost
allocator + UOM normalize (money-critical), U6 vendor-scoped dedup matcher, U7 atomic apply core (inject ONE
tx through the cost cores; proforma/reconciliation/concurrency gates; unified new+existing→receiveSupplyCore
both emitting A/P stamped with invoice#; COA attach; tenant re-verify) — **proven by `verify:ingest` (31
assertions) + `verify:cost` 55/55**, U9 assistant `ingest_documents` tool (verify:ai-native green), U12
real-doc acceptance (STEP2 CI test 12/12 + STEP3 gated live script), U8 review screen (`+ Ingest invoice`
launcher → upload → review; per-doc panels, dedup control, proforma gate, source-doc proxy, apply w/ inline
needsAck; 17 model tests), U11 verify sweep. U10 write side + source-doc surfacing done; the per-lot
expiry/provenance HISTORY panel is a scoped follow-up chip (display-only; data captured + proven).
**GATES ALL GREEN:** tsc 0, next build clean, vitest 2179/0, verify:cost 55/55, verify:ingest 31,
verify:ai-native / invariants / naming / parity / raw-sql / tenant-isolation / work-orders-enhancements.
**PENDING before merge: human sign-off on the extraction snapshots (`qa/ingest-fixtures/SNAPSHOT-VERIFIED.md`)
+ browser-QA of the review screen in Demo Winery. Next: `/ship`.** See:
`docs/plans/2026-07-17-072-feat-invoice-ingestion-intake-plan.md` (Deep, 12 units). `+ Ingest invoice`
takes a mixed pile (PDF text/scanned + images), classifies each doc (invoice|proforma|coa|other), and routes
only receipts into ONE human-reviewed screen per invoice; every write goes through existing cores
(`createStockMaterialCore`/`receiveSupplyCore`/`findOrCreateVendorCore`). Decisions locked: Gmail = fast-follow
(out of scope); new NON-DOSEABLE `EQUIPMENT` category (the load-bearing edit is `isDoseableCategory` denylist —
protects WORKORDER-3); shipping allocated into per-unit landed cost (bakes into A/P, no separate line);
one review screen/invoice; proforma prompts "is this a landed receipt?"; fuzzy-match + dedup guard vs existing
expendables AND equipment; COA lot/expiry attach by Lot No.; private-blob provenance. Extraction = own
server endpoint (one-shot `messages.create` json_schema, `claude-opus-4-8`, native `document`/`image` blocks)
— NOT the text-only chat loop; DB staging (not the 5-min token) carries the batch. New schema: `vendorItemCode`
on CellarMaterial, `expiresAt`+`sourceDocumentId` on SupplyLot, `vendorInvoiceNumber` on ApExportEvent,
`IngestedInvoice`(+lines)/`LotDocument`/`VendorMaterialCode` staging (all RLS). **Reviewed FOUR ways (eng →
council[Codex+Gemini] → design → ChatGPT outside voice); all findings folded; BUILD-READY.** Council reversed
2 calls: inject ONE tx through cost cores (resumable-per-line was unsound); `isDoseableCategory` denylist→
ALLOWLIST. ChatGPT caught 2 money-critical bugs the others missed: (#1 UOM — invoice qty≠stock qty, Unit 5
now normalizes via convert/deriveOpeningLot; #2 A/P asymmetry — createStockMaterialCore emits no A/P, so
unified path = create@0 then receiveSupplyCore for every line) + reconciliation gate, concurrency claim,
UNCLASSIFIED non-doseable, LotDocument provenance. A/P (user, corrected QBO info): per-lot bills, invoice # as
searchable PrivateNote memo (NOT grouped — QBO DocNumber is the per-lot idempotency key).

</details>

<details><summary>original directive + diagnosis</summary>

User directive: every WO must ALWAYS have a WO-level Lead (`WorkOrder.assigneeEmail`); per-task assignees
stay optional. Diagnosed WO #27: Mike set the *task* assignee to Russell (= `russellmoss87@gmail.com`, the
only Russell) but left the WO-level "Lead" dropdown at "— unassigned —"; header + Print/PDF read only the
Lead field → show "—". Fix: default the Lead to the actor at `createWorkOrderCore`, require it in the
builder, add an admin/developer detail-page Edit, backfill existing rows, guard with WORKORDER-5.

</details>

<details><summary>prev objective (shipped)</summary>

Vendor management (Plan 070, PR #195) and inbox DM (#197) landed on main; Plan 068 inbox shipped (#191).

</details>

## 🧵 Tangent stack  (LIFO — push when you detour, pop when done)

1. Copied `.env` into this worktree so the dev server + Demo-Winery repro could run here (`preview_start` compiles the
   SESSION worktree, not the main checkout). Harmless, gitignored — but remember it exists.
2. Plan number **080 was already taken** by PR #351 ("plan 080 Wave 1 — per-location consumables"), so this work is **081**.
   The council record file keeps the `-080-` name because that's the plan it reviewed.
3. POPPED — the U9 eval was built single-turn first; measured 0/3 on the repro and had to be rebuilt multi-turn
   with declared fixtures. Cause understood and written into the plan (Build note 2 §4). Not a code defect.
4. ← you are here
3. ← you are here

## 🪝 Off-path — do NOT do now

- **Plan 081 follow-ups (task chips spawned, do NOT start inline):**
  (a) **canonicalizer throws → Drafts.** `canonicalizeRawIntents` (nl-proposal.ts) still THROWS for a task missing a
  required vessel, *before* a proposal exists — so those stay prose. Sole cause of the one eval case still at 0/3
  (`wo-vague-target`), marked `knownGap` with its reason rather than deleted or left failing.
  (b) **must-on-skins readiness rule** — not built; wants the winemaker's call on `blocking` vs `confirmable` and
  whether TOPPING/BARREL_DOWN are covered.
  (c) **in-place Draft resolution** (type the missing email on the card, re-drive id-pinned via the resume-token
  path) — deferred; today the user answers in chat. The route already carries the `draft` flag, so it's a UI
  increment, not new architecture.

- **Plan 062 Units 2/5 — liquid-solution booking (feature gap, NOT the money bug).** Booking a
  *stocked liquid KMBS-solution material* by ppm currently books an UNKNOWN-cost line with no depletion
  (no durable `so2SolutionPercentKmbs` field; `consumeMaterialCore` can't convert g→mL). Powder KMBS is
  fully correct. Needs a governed schema change + eng review — separate plan when prioritized, not now.

## ✅ Done recently

- **Backlog + worktree cleanup (2026-07-20).** `/bug-triage` dry run (mode verified `dryRun:true`,
  `argsWarning:null`). **Issues 66 → 10**: closed 53 stale `feedback: plan` boilerplate issues + 3 Sentry
  dev-worktree-noise issues (#381/#359/#358, all frames under `.claude/worktrees/custom-units-invoice-a49844`
  — a `beforeSend` rule dropping `.claude\worktrees` / `*.dev.js` would suppress ~75% of that class).
  All 7 ACTIVE plan-issue links were protected — the sweep's own recommend-close list included them, and
  bulk-closing would have cut the live backlog loose from its pointers. **Worktrees 25 → 11**, `main` freed
  (a worktree held the `main` branch, which is what kept detaching the main checkout), 12 merged branches +
  9 empty husks removed; 8 husks remain locked by live sessions. Kept everything with unmerged commits,
  open PRs (#387 merged by another session, #388), or uncommitted work.
- 🧠 **Lesson (same shape as the modal one below): I called #365 a P0 regression twice, wrongly.** First read
  `FinishedGood*` = 0 rows and concluded "empty state, close it"; then saw 10 BottlingRuns and concluded
  "bottling doesn't materialize — P0." Both were premature: `inventory/page.tsx` queries **both**
  `bottledInventory` AND `finishedGoodInventory`, and the former is fully populated. Read the whole query
  set before diagnosing a "missing data" bug — one table's emptiness proves nothing when the view unions two.

- **Consumables "Total cost paid" display fix (off-path, 2026-07-20, worktree `unit-cost-calculation-2259db`).**
  Russell read the Edit modal's `$106.91` sitting under `Package size 250 / g` and asked whether we were storing
  an invoice total instead of a unit price, and whether editing it rewrote history. **The costing engine was
  already right** — `CellarMaterial` has no cost column, cost lives per-stock-unit on `SupplyLot.unitCost`, every
  receipt creates a NEW lot (so $100/kg then $150/kg bentonite coexist and blend at consumption via
  WEIGHTED_AVG/FIFO), and the in-place edit is fenced to a single fully-unconsumed lot with `SupplyConsumption`
  snapshots frozen (D17 intact). **The bug was purely display:** the field prefills `openingLotTotalCost`
  (`unitCost × qtyReceived` — the whole LOT), but rendered under "Package size", so a 3 × 250 g lot showed
  ~$320.73 next to `250` and read as 3× the true per-gram price. Also, the derived `≈ $/unit` hint was gated to
  `mode === "create"`, so Edit never showed the number that actually drives costing. Fix: new pure
  `openingLotQty()` + `openingLotQty` on the DTO → the label now names its own denominator
  (*"Total cost paid for 750 g"*) and the hint prices against the LOT qty, never `packageAmount`. Storage and
  math untouched. 33/33 in `test/material-update.test.ts` (3 new), tsc + eslint clean.
  ⚠️ **Not browser-verified** — this worktree has no `.env`, so no dev server; confirm in the pane on Demo.
- **`/bug-triage` skill versioned in-repo → PR #384 (off-path, 2026-07-19).** It lived only in `~/.claude/`, so it
  could not be shared with a collaborator and every machine drifted. Now `.claude/skills/bug-triage/SKILL.md` +
  `.claude/workflows/bug-triage.js` are tracked — repo-scoped skills auto-discover, so a clone just gets it, no
  install. Required widening the `.claude/workflows/` ignore rule to `workflows/*` before the `!` negation, since
  **git cannot re-include a file whose parent directory is excluded**; `health-check.js`/`health-remediate.js`
  stay local as before. Two hardcoded `C:\Users\russe\...` paths in SKILL.md de-personalized; global copies deleted
  after a byte-level diff, so there is one source of truth. **Edit it in the repo now, not in `~/.claude/`.**
- **Plan 081 Units 4–9 — the Draft Card — BUILT + PUSHED (`claude/assistant-draft-card`, PR #355).** A card was
  binary: a perfectly valid signed proposal, or nothing — so a write tool one field short fell back to prose, which
  the UI cannot render as a card. That was the measured 2-in-7 bug (Mike ×4: #203/#205/#206/cmrs4vasg). Added the
  missing middle state. Repro **2/7 → 3/3**; zero fabrication; full suite 2690/0, tsc, eslint, verify:work-orders 43,
  verify:ai-native all green. The security edge is enforced at the contract, not the UI: `asProposal` rebuilds the
  object so a draft cannot carry a commit token even if a tool attaches one.
- **Demo Winery expendables data fill — DATA ONLY, no code (2026-07-19).** 47 half-filled consumables/packaging rows completed with real supplier data (brand, generic name, managed vendor + verified URL, package size) + 11 vendors created/updated (Scott Labs, Laffort USA, BSG Wine/RahrBSG, Gusmer, Enartis, Saverglass, Amorim, Ramondin, G3, WS Packaging→MCC, Crush2Cellar). Went through `updateMaterialCore`/`updateVendorCore` so the Plan-069 vendor mirror + audit apply. **Zero renames** — see the identity-rewrite gotcha below. No new SupplyLots (every zero-on-hand row is a dup of a stocked one), and no unitCost touched on a consumed lot (D17); only 1 NULL cost filled on an untouched lot. Then **deleted 9 of 13 junk rows** (6 `ZZ-P6R-*-KMBS`, `QA-INGEST EXISTING YEAST`, 2 empty `OTHER` stubs) after a full reference audit across all 8 tables that point at a material — each was re-asserted empty inside its own tx before delete, with an audit row. **4 refused, not deleted:** the 3 legal-invoice line items (`ATTEND TO …`, `REVIEW TRADEMARK …`) hang off APPLIED invoices 2824903 / 51595878 with live `ApExportEvent` + `AccountingDelivery` rows (QBO externalIds 157/159/160/161, `DELETED_IN_GL`) — and `reverseIntake` would itself refuse them because `externalId` is set; the inactive `POTASSIUM METABISULFITE` SO2 dup is referenced by a historical `LotTreatment` (FK is SetNull, so deleting would silently blank a real treatment's material link). Those 4 need a decision, not a script.
- **Add-variety assistant write flow (ticket cmrs2eops / #309, Demo) — FIXED (worktree, PR pending).** Raw P2002 on a duplicate variety name surfaced through the confirm route → generic error, nothing persisted; also a case-sensitive silent dup ("syrah" beside "Syrah"). Fix: `EntityConfig.findConflict` (case-insensitive, master-data identity/NAMING-1) guards `db_create` at run + commit + a P2002 backstop, and the `/reference` form's `findByName` is case-insensitive too. vitest 2452/0 (5 new), tsc/lint/verify:naming green; DB-proven on Demo.
- **Plan 079 KB RAG — Unit 11 subscription settings UI → PR #293** (CI green, browser-QA'd). Settings card toggles which sources feed the assistant per winery; `verify:kb-subscriptions` 7/7. LAST plan-079 unit → plan COMPLETE.
- **Plan 079 KB RAG — 4 new sources → MERGED PR #292** (WSU 95 + OSU Extension 36 + OSU-OWRI 264 + Scott Labs 28 = 426 new docs; corpus 1,449 total). Curated wine/grapes-only scoping; verify:knowledge-base 14/14.
- **Plan 079 winemaking KB RAG — core corpus SHIPPED to main (PR #285, `6d7f894`); Unit 12 re-crawl loop MERGED (PR #289).**
  Cited "assistant winemaker" over a GLOBAL crawled pgvector corpus (AWRI 745 + Wine Australia 278 docs / 6,150 chunks),
  per-tenant source subscriptions, hybrid retrieval (dense + FTS, RRF + MMR), defers math to existing calculators. Unit 12
  adds the weekly freshness loop (see current objective). Remaining: add sources (Davis/OSU/WSU/Cornell) → Unit 11 subscription UI.
- **Plan 079 bug-report clarification loop — FULLY SHIPPED (13/13 units, PRs #276/#281/#277/#282, docs #283); browser-QA'd end-to-end.**
  Vague ticket → auto-captured console + a sufficiency gate (or the fix agent's `request_clarification` tool) → DM the
  reporter from "Cellarhand Support" with `[Ref: BUG-XXXX]` → "Needs your input" chip + assistant nudge → reply strips
  the token, flips clarification ANSWERED, feeds the answer onto the ticket + re-dispatches the fix workflow at attempt 2
  (`MAX_CLARIFICATION_ROUNDS=2` live). Watchdog+TTL sweep cron. All 9 council concurrency fixes + 4 /review CRITICALs
  folded. U8 proven: a real fix-agent run on a deliberately vague ticket chose `request_clarification` over `apply_fix`.
- **Empty-source stock-transfer error clarity (feedback cmrquedll…, #270) — SHIPPED + MERGED (PR #277, addc318).**
  `moveStock` → `safeAction` + `unwrap` (Next redacted the thrown ActionError in prod); `transferStock` names the reason
  (empty "no inventory there" vs shortfall "only N there"). vitest 55, verify:naming/ai-native green; Demo DB proof.
- **P0 bottling ABV range guard (feedback cmrqtzlc…me25 / #263, DEFECT) — SHIPPED + MERGED (PR #275, c74ec98); ticket RESOLVED, reporter Mike DM'd; branch pruned.**
  Bottling accepted an absurd ABV (140%) → corrupt finished-goods/tax data. Fix: server-enforced range **(0, 100]** in
  `runBottlingTx` (the one choke point for standalone create/edit AND the WO BOTTLE task) via new shared pure helper
  `src/lib/bottling/abv-range.ts`, + inline client hint/`max` in BottlingClient. Ceiling is the physical max (NOT 24% —
  compliance intentionally captures >24 for review). unit 8/8, verify:cost 55/55, tsc/lint/naming green; Demo DB proof:
  140% rejected with zero writes, 13.5% still succeeds.
- **Ticket #268 — self-assigned WO inbox emit + "Issue" button clarity — SHIPPED + MERGED (PR #278, 6dc2d14); ticket RESOLVED.** (parallel session)
- **Ticket #188 — `delete_harvest_pick` + confirmed VineyardBlock cascade — MERGED (squash PR #265, 3eb512e); ticket RESOLVED.**
- **Inbox WO "viewer redundancy" (feedback cmrqqjk57, P2 display) — SHIPPED + MERGED (PR #274, 222fe63); ticket RESOLVED/DEFECT, reporter Mike DM'd; branch pruned.**
  Design-partner (Mike) report on `/inbox?bucket=wo`: "when I select a work order to view it, I shouldn't have to
  select it again in the viewing box to open it." `/investigate` (via the real ticket `pageUrl`, not `/work-orders`)
  found the Inbox WO list row only set local `selected` state and the reader pane rendered a stub whose "Open work
  order" link did the real nav → two selections per WO. Fix in
  [InboxClient.tsx](src/app/(app)/inbox/InboxClient.tsx): WO row is now a direct `<Link>` to `/work-orders/[id]`
  (one click, matches the DM bucket + /work-orders list cards); removed the dead reader-pane WO branch; narrowed the
  `selected` union. 7 ins / 17 del, one file. tsc + eslint + `next build` green; browser-verified in Demo (single
  `<a href="/work-orders/…">`, no "Open work order" stub, one-click opens the detail page, no console errors);
  QA fixture cleaned up.
- **QBO vendor sync Slices 0–2 — the full arc.** Slice 0 near-dup guard SHIPPED (#229), Slice 1 pull queue
  SHIPPED (#231), Slice 2 eager push BUILT (Plan 077, all 7 units, live-proven on Demo) → `/ship` next.
- **Chat "400 Invalid messages" defect (Bhutan cmrm9s97) — FIXED, PR #220 open; ticket closed-loop.**
  `/investigate` root cause: the chat client sends the FULL conversation history every turn (no cap);
  the server (`api/assistant/route.ts` `parseMessages`) hard-rejected with 400 once history passed 40
  messages OR any turn passed 8000 chars — permanently bricking the conversation (a long assistant reply
  poisoned every future send). NOT a regression (validation existed since `ffb9471`); latent scaling limit.
  Fix = **window, don't reject**: new pure `src/lib/assistant/message-window.ts` (`parseAndWindowMessages`
  keeps last 40, truncates over-long PRIOR turns, specific error only for a bad current msg, guarantees the
  Anthropic shape) + `route.ts` uses it + both clients cap history sent + text client guards over-long input.
  9-case regression test; assistant suite 158/158; tsc clean. Ticket → IN_PROGRESS/DEFECT + outcome note;
  queued AGENTIC_FIX run neutralized (AWAITING_APPROVAL → SKIPPED, ticket automationStatus synced) so it
  can't be dispatched. Related latent bug flagged (consecutive same-role after an errored turn → "Assistant
  error"), left as a follow-up.
- **`/bug-triage` live run (2026-07-17) — 1 merged, 5 plans handed off, 3 to a human; 0 errors.**
  First had to unbreak the tooling: `b0ea4f6` (feedback-workspace rebuild) added a top-level
  `requireDeveloper` import to `feedback.ts`, and `dal.ts` eagerly imports `next/navigation` →
  `React.createContext` crash under `triage:list`'s `--conditions=react-server`. Fix = lazy-import
  in the 2 functions that use it → **PR #219 MERGED** (`1e624ec`). Main tree still carries the identical
  1-liner uncommitted (harmless dup; reconciles when this branch picks up origin/main, or `git checkout` it).
  Merged **PR #215** (expendables stock category, root-fix confirmed → Bhutan 👎 RESOLVED; residual gap:
  no per-item storage-location field). Plans handed off for `/work`: WO filtering (#201, 2-report cluster —
  ⚠️ `WorkOrderFilterBar.tsx` already dirty, maybe in flight), delete harvest pick (#188), 3rd-party sales
  counterparty (#202), report builder + Excel (#199), Help/assistant consolidation (#214, P2). To human:
  chat 400 "Invalid message" (real defect, out-of-fence `api/assistant/route.ts` — `/investigate`, do NOT
  approve its queued AGENTIC_FIX), "Talk" voice (unclear, env pending — `/investigate`), bare "error
  message" #204 (too vague — bounce/close).
- **Plan 070 — vendor management — BUILT (12 units) + reviewed + browser-QA'd; SHIPPING.**
  Reused the existing (Phase 15 QBO) `Vendor` table + new `VendorContact` child (RLS + composite FK);
  `vendorId` on `CellarMaterial` + `SupplyLot`; backfill (Demo: 54 mats/106 lots, 0 nulls) with a seeded
  "Unknown" fallback; shared vendor cores (A/P find-or-create refactored to reuse); mandatory fuzzy
  `VendorPicker` with pinned "+ create new vendor" + URL autofill on Add/Edit expendable; `/setup/vendors`
  CRUD; assistant `create_vendor` + `query_vendors` (golden gate green). `/review` fixed 5 findings
  (no-vendor-reactivate wipe, restock-lot linkage, edit gate for legacy vendors, +2). Browser-QA'd on
  Demo (mandatory picker, pinned create, URL autofill, inline create-and-select, Unknown editable).
  Gates: tsc, 2034 vitest, lint, next build, verify:tenant-isolation (110/110 + vendor FK checks),
  eval:assistant, verify:naming — all green. Worktree made buildable (copied .env + npm ci).
- **Plan 068 — user inbox / Gmail-like messaging — SHIPPED, PR #191 merged (`2a139dd`).** Merged into
  this branch during the Plan 070 pre-ship merge (disjoint from vendor work).
- **SO₂ ~1.74× dosing money bug — RECONCILED CLOSED (2026-07-15, no code change).** Investigated on a
  fresh branch off `origin/main`: the money-critical fix already shipped. Plan 066 (PR #180, `370b7b6`,
  MERGED) divides the stock draw by the active fraction in `consumeMaterialCore` (÷0.576); Plan 065
  (PR #179) landed `resolveSo2Dose` — used **display-only**, so no double-application. `verify:cost`
  55/55 green (40 ppm × 450 L → 18 g SO₂ delivered, 31.25 g KMBS drawn, $1.56). Running `/work` on
  Plan 062 would have DOUBLE-APPLIED 0.576 and re-broken `verify:cost` — deliberately did not.
  Remaining Plan 062 scope (liquid-solution booking) is a feature gap → Off-path.

- **Feedback cmrm5x3lq "vineyard identification" — SHIPPED, PR #190 merged; ticket RESOLVED.**
  Assistant told admin Mike "the Bajo vineyard doesn't exist" — `resolveVineyards`
  (`src/lib/assistant/scope.ts`) used a one-directional SQL `contains`, so the stored name
  "Bajo" failed to match "Bajo Vineyard". Added pure `vineyardNameMatches` (two-directional,
  mirrors `findScopedBlocks`), match in JS after untouched access scoping. Proven on live data
  (scope preserved for non-admins) + tenant-isolation CI green; 7-case regression test;
  assistant suite 25f/145t green. Reviewed (1 LOW note: 200-vineyard fetch cap, non-issue at
  realistic counts). Also shipped the calculator display fix (PR #189, browser-QA'd).
- **bug-triage `/bug-triage` dry-run RAN LIVE this session — REMEDIATED.** `args` reached the workflow
  as a JSON *string*, so `args.dryRun` was `undefined` → `DRY_RUN=false`. It dispatched a real
  `feedback_bug_fix` run (calculator display) + `feedback_plan` run (harvest-pick deletion), dismissed
  the thumbs-down ticket, set 5 statuses. Nothing merged to `main`. All triage decisions were sound, so
  kept (not rolled back). The calculator fix run completed → **PR #189 "fix: display" open for review**
  (nothing to cancel). Vineyard ticket cmrm5x3lq updated to IN_PROGRESS/DEFECT + PR #190 note.
  Hazard memory hardened ([[bug-triage-dryrun-args-gotcha]]) — burned twice now.
- **Plan 067 PR A — agentic PLAN/FIX routing — SHIPPED, PR #181 merged** (`d2b504f`).
- **Plan 067 PR B — Linear handoff core — BUILT, PR #183 open.** Tenant-scoped/RLS-protected
  feedback-to-Linear links, sanitized handoff rules, conflict-safe link/replace actions, exact loaders,
  dual-cursor pagination, notes-version concurrency protection, and DB/isolation verification. No
  Linear API credentials are used; browser-facing workflow remains PR C.
- **Plan 066 — SO₂/KMBS ledger active-fraction fix — BUILT, eng-review PR (no auto-merge).**
  `consumeMaterialCore` gains an optional `activeFraction`; `recordNeutralDoseTx` passes it for
  ppm/mg/L SO₂ doses so the stock draw + cost = SO₂g/0.576 (KMBS), while `LotTreatment.computedTotal`
  stays delivered SO₂. Fraction from `percentActive` else 0.576. `verify:cost` flipped (31.25 g/$1.56)
  + green; cost-consume unit tests; WORKORDER-3 + invariants green; ADR 0005; read-only under-booking
  advisory. History NOT rewritten. Branch `claude/so2-kmbs-ledger-active-fraction`.
- **Plan 065 — SO₂ addition execution-view clarity — SHIPPED, PR #179 merged** (`df6c6dc`); browser-QA'd.
- **Feedback "SO2 work order unclear" — RESOLVED** (outcome note written; deeper money bug → Plan 066).
- **Plan 064 — bug-triage outcome notes — SHIPPED, PR #177 merged** (`39abefa`). Richer
  write-back (what+how / why+next) in the global workflow + SKILL.md (out-of-repo), and a
  visible outcome timeline + "Outcome" column + `resolvedAt` in `/developer`. New pure
  `parseTriageNotes` (6 tests). No schema (reuses `developerNotes`). Branch pruned; on main.
- Security #90 — cross-tenant user leak + account takeover. `src/lib/users/scope.ts` membership
  filter now scopes the `/users` page reads + all `users/actions.ts` mutators to the caller's
  effective tenant; `createUser` binds new users to the org; `resetUserPassword` gained the
  developer-target guard. Proven closed on live Bhutan/Demo data + isolation harnesses. On branch
  `claude/fix-90-cross-tenant-user-mgmt` → shipping now. Follow-up: TODOS "Per-tenant user role/state".
- Scale tripwire #166 — wrapped the 4 SERIALIZABLE work-order maintenance completion/undo
  txns in `withWriteRetry`. **SHIPPED, PR #172 merged** (`28331fd`); issue closed.
- Plan 063 developer user type (self-replicating) — **SHIPPED, PR #170 merged** (`1fda348`).
  Remaining: interactive browser QA only.

## ⏭️ Next up (candidates, not commitments)

- **"Break Mode" — dev-only high-fidelity bug capture — PHASES 1 + 2 BOTH BUILT + browser-QA'd (080). Ready for /review → /ship.**
  Phase 2 (units 6–11): replay-fidelity hint cookie (sandbox-only network bodies, masking always on,
  fails closed), interaction+network-metadata trail buffer, dev-only Break Mode toggle with a
  risk-coded recording indicator (real tenant → --danger "metadata only"; sandbox → --warning "full
  capture"; 30-min auto-off + countdown), hunt trail bundled onto reports and rendered in /developer.
  13 commits total; tsc + eslint clean, **vitest 2516 passed**, `next build` clean. QA'd on Demo:
  trail captured `click — Inventory / GET /inventory → 200 / route — /inventory / click — Submit`,
  query strings stripped, no bodies. ⚠ **BLOCKER before any real-tenant use: configure Sentry
  server-side data-scrubbing** (the cookie is a client-side default, not the guarantee) — see
  `docs/architecture/security-register.md` 🟡. NOT done (out of repo): the /bug-triage skill step that
  reads the trail.
  <details><summary>phase 1 detail</summary>
  Phase 1 (units 1–5) built on `claude/enhanced-bug-reporting-network-cc8b6f` (this worktree; main was
  occupied): debugContext v3 clamp; pure buildReplayUrl/captureReplayLink/safeSentryReplayUrl; link the
  Sentry replay at bug-report submit; "Open Sentry replay" in /developer; narrative prompt
  (doing/expected/actual). 6 commits, tsc+eslint clean, vitest 2471 passed (24 new). No DB needed. NEXT:
  `/review` → `/ship` Phase 1. Phase 2 (units 6–11: middleware fidelity cookie + Sentry server-side scrub,
  session-mode replay + auto-off, tenant-risk-colored indicator, AI trail) needs the MAIN checkout — do
  after Phase 1 ships. Plan: [docs/plans/2026-07-19-080-feat-break-mode-bug-capture-plan.md](docs/plans/2026-07-19-080-feat-break-mode-bug-capture-plan.md).
  </details>
  Eng review locked 2 decisions: (1) keep network bodies but "do it right" — Next MIDDLEWARE sets the
  `cbh_replay_fidelity` cookie (no middleware existed; layout render can't set cookies) + Sentry server-side
  data-scrubbing is the REAL enforcement belt (cookie is client-writable, only a default); (2) Break Mode uses
  session-mode replay + AUTO-OFF timeout + stop-on-hide to bound free-plan quota. Test-plan artifact written.
  Reuse the Sentry Session Replay already shipped (link `replayId` into `debugContext`, don't build a capture
  engine); dev-only toggle uses on-demand replay (`start`/`flush`) + a durable interaction+network-metadata
  trail for /bug-triage's AI; sandbox-only body/DOM detail (real tenants masked/metadata-only); free-plan
  quota-viable (flush ≈1 replay per filed report). Phase 1 (units 1–5) = link the replay + narrative prompt
  (ships alone, all users); Phase 2 (units 6–11) = full break mode. WATCH: init-time fidelity via a
  `cbh_replay_fidelity` hint cookie (instrumentation-client runs pre-auth) — the load-bearing sandbox-only guard.
  Plan: [docs/plans/2026-07-19-080-feat-break-mode-bug-capture-plan.md](docs/plans/2026-07-19-080-feat-break-mode-bug-capture-plan.md).
  Design doc: `~/.rstack/projects/wine-inventory/russe-…-design-20260719-142556.md`. ASSIGNMENT before build:
  confirm exact Sentry free-plan replay cap (Settings → Subscription). Next: eng-review → /work Phase 1.
- Browser QA pass on Plan 063 (developer user type).
- **Feedback log HTML-entity garbling** — SHIPPED #178 (`6bc2db1`).
- **Plan 065 — SO₂ addition execution-view clarity — BUILT, shipping.** Execute view is now
  summary-first + edit-gated ("Add 14 ppm SO₂ to Tank 4 → ≈ X L of 10% KMBS solution"); landed
  `resolveSo2Dose` (×0.576) on main; captured solutionPercentKmbs through NL/assistant authoring;
  new pure `buildTaskSummary`. Green locally: tsc, eslint, `next build`, vitest 1927. No schema.
  Branch `claude/addition-execution-view-clarity`. Remaining: CI + browser QA on `/work-orders/*/execute`.

---
_Last updated: 2026-07-20 — Plan 080 Wave 3 (U5 mixed invoice: parts + equipment + finished goods on ONE document, ONE aggregate bill) BUILT on `claude/plan-080-wave-3`, rebased onto main, PR opened. Green: tsc 0, vitest 2745, verify:ingest 116, verify:cost 55/55, tenant-isolation, invariants 36/36, parity, ai-native, next build. Flag in review: an unmapped GL account now ROLLS THE APPLY BACK (previously the emit result was discarded and the goods booked anyway) — scoped by reasonCode so A/P-less tenants are unaffected; the category->account map still needs ACCOUNTANT SIGN-OFF. Prior: 2026-07-20 — /bug-triage dry run + backlog/worktree cleanup: issues 66→10, worktrees 25→11 (main freed), Plan 080 Wave 4 addendum (U14-U17) → PR #389, #365 recorded DO-NOT-BUILD, Vercel prod-deploy stall diagnosed (Hobby daily build limit — #387/#388 undeployed). Prior: 2026-07-20 — OFF-PATH (display only, no cost math): Consumables Edit modal "Total cost paid" was ambiguous. Russell saw `$106.91` rendered directly under `Package size 250 / g` and asked (a) whether we store an invoice total instead of a per-unit price, (b) whether re-buying the same item at a new price is accounted for, and (c) whether editing that field rewrites historical costing. Traced it: the ENGINE IS CORRECT on all three. `CellarMaterial` has NO cost column; cost lives per-stock-unit on `SupplyLot.unitCost` (schema.prisma:2772) and totals are always derived. `receiveSupplyCore` (materials.ts:594) ALWAYS creates a NEW lot — never an upsert — so $100/kg then $150/kg bentonite coexist as two layers and blend at CONSUMPTION via WEIGHTED_AVG (default) or FIFO (deplete.ts:83), never last-price. The in-place edit is fenced by `findCorrectableOpeningLot` to a SINGLE fully-unconsumed lot (`qtyRemaining === qtyReceived`, exactly one); anything received/split/partly-used → CONFLICT, and `SupplyConsumption` cost snapshots are never touched, so D17 holds and no past addition is re-valued. The REAL bug was purely presentational and exactly the one Russell predicted: the field prefills `openingLotTotalCost` = `unitCost × qtyReceived` — the whole LOT — while sitting under "Package size", so a lot of 3 × 250 g packages displayed ~$320.73 beside `250` and read as ~3× the true per-gram price (they coincide only for a single-package lot, which is why it looked fine on Lafazym). Compounding it, the derived `≈ $/unit` hint was gated to `mode === "create"` (MaterialForm.tsx:241), so Edit never showed the number that actually drives costing. FIX: new pure `openingLotQty()` (material-fields.ts) + `openingLotQty` on `CellarMaterialDTO`, populated in `listMaterials`; the Edit label now names its own denominator ("Total cost paid for 750 g") and the hint prices against the LOT qty via `editUnitCost`, NEVER `packageAmount`. Storage, receipt, depletion and the correction guard are all untouched. Green: tsc 0, eslint clean (one pre-existing warning at ConsumablesSection.tsx:100), `test/material-update.test.ts` 33/33 with 3 new cases incl. an explicit multi-package regression. NOT browser-verified — this worktree has no `.env` so no dev server can run here; confirm in the pane against Demo before merging. Prior: PLAN 081 Units 4-9 (the Draft Card) BUILT + PUSHED on `claude/assistant-draft-card` (PR #355), commits a246e22a/601cc34c/966d9305/fae94411/153575ce/6b74f4f5. A confirmation card was BINARY — a valid signed proposal or nothing — so propose_work_order, one field short, flattened the readiness model into a prose sentence and returned a string, which the UI cannot render as a card. Added the missing middle: a DRAFT proposal carrying the ALREADY-COMPUTED unresolved[] + warnings[] (existing blocking/confirmable/completion_check severities, which the client ALREADY renders) and NO token. Security edge enforced at the contract, not the UI: asProposal NORMALIZES (rebuilds the object) so a draft cannot carry a commit token even if a tool attaches one; signProposal stays reachable only from the ready branch. U6 rewrote prompt rules 40/45 so they compose (rule 40s precondition "if you have all the details" was genuinely FALSE in the failing trials — the model was obeying correctly). U8 made both stream consumers exhaustive switches with a never default + parseEvent validates the discriminant (verified by temporarily adding a variant: all three guards fire). U9 = new MUST_PROPOSE eval, tool_choice OMITTED (the existing eval FORCES a call, so it structurally cannot see "no tool called"), multi-turn with declared fixtures, classified ready/draft/wrong-tool/no-tool, nightly workflow that opens an issue and never auto-merges. MEASURED on opus-4-8, 3 runs/case: the seeded repro 2/7 (29%) -> 3/3 (100%), zero fabricated assignee emails, zero wrong-tool, read-intent controls clean. GATES: tsc 0, vitest 2690/0, eslint clean, verify:work-orders 43, verify:ai-native green. FOUR PLAN ERRORS recorded in the plan as "Build note 2": (1) the assignee was NEVER a required arg, nothing to relax; (2) the typed override for a blocking objection is not implementable and should not be — a draft has no token and the server gate refuses blockers anyway, so shipped STRICTER (a blocked draft is not issuable at all); (3) must-on-skins is detected by NOTHING in the codebase (proposal-readiness has no lot-form rule — the model knew it, the engine does not), needs its own rule + winemaker sign-off on severity; (4) a single-turn eval measures the wrong thing (0/3, because the model correctly reads cellar state first per prompt rule 31). REMAINING: Unit 10 live browser QA (needs the interactive logged-in pane) + 3 follow-up chips (canonicalizer throws -> Drafts, must-on-skins rule, in-place draft resolution). Prior: Plan 080 Wave 1 CONSOLIDATED + rebased onto origin/main on branch `claude/plan-080-wave-1` (U1 + U2a + U2b; only conflict was NOW.md — main touched no schema/cellar/cost file). U2b = location-aware consumable stock cores: NEW src/lib/cellar/material-stock-core.ts (receiveConsumableCore / adjustConsumableCore / transferConsumableCore). Transfer is a FIFO LOT-SPLIT where each destination lot inherits unitCost/receivedAt/expiresAt/vendorId/lotCode/policyVersion/FX and points back via splitFromLotId (provenance transitive, council S2); both legs share one transferGroupId; race-safe gte-guarded per-lot decrement mirroring movements.ts; qty pinned to 6dp. Positive adjust seeds a lot at the weighted-avg (never $0); negative adjust BLOCKS past on-hand. depleteSupplyLotsTx gains optional locationId -> location-scoped draw + NEGATIVE RECONCILE (shortfall writes ONE negative lot at weighted-avg and books it KNOWN via a SupplyConsumption against that lot; never cross-pulls, never $0); no locationId -> legacy path byte-identical. Plus onHandByLocation/onHandByLocationForMaterials + three safeAction wrappers. Green: tsc 0, vitest 2465 (new test/material-stock.test.ts 13 + council-C1 negative-reconcile regression), verify:cost 55/55, tenant-isolation, invariants 35/35, parity, ai-native (coverage doc regenerated). RUSSELL CONFIRMED the negative-reconcile reading (book the shortfall against the negative lot) — settled, build on it. NEXT: U3 costed equipment -> U4 manual invoice (materials-only) -> U12 assistant tools -> U13a, then the Wave 1 PR. NOTE U1's migration is already deployed to Neon, so the DB leads every branch. Prior: NEW in-flight: add-variety assistant write flow FIXED (ticket cmrs2eops / #309, Demo). Approving a "add variety" change card threw a raw Prisma P2002 (duplicate name vs @@unique([tenantId,name])) surfaced verbatim through the confirm route → generic error, nothing persisted; plus a case-sensitive silent duplicate ("syrah" beside "Syrah"). Fix (no schema): EntityConfig.findConflict (case-insensitive name match, master-data identity/NAMING-1 — never re-keys the existing row) guards db_create at run (no doomed card) AND commit (batch/stale path) with a P2002 friendly backstop, wired for the name-unique globals Variety/Vineyard/Location/FinishedGoodCategory (not FinishedGood — dups legit); /reference form findByName made case-insensitive so both write paths agree. 5 hermetic unit tests; vitest 2452/0, tsc, lint, verify:naming 25/25; DB-proven on Demo (Syrah/syrah refused no-dup, stale Merlot card refused at commit, new name persists). PENDING commit → PR (wave-1 predecessor to #308/#312; do NOT rebase onto them). Prior in-flight: bug-report screenshot now excludes the "Report a bug" dialog (backdrop + title bar) and, unless the user answers Yes to a default-No "Is the bug in the assistant?" toggle, the assistant dock too — so the capture shows the real page, not the report popup. 3 files (Modal overlayProps passthrough, AssistantDock data-assistant-surface tags, FeedbackTicketModal Yes/No + Capture + two-condition html-to-image filter). Typecheck clean; pending browser-QA. Prior: Plan 079 KB RAG COMPLETE: Unit 11 per-tenant subscription settings UI → PR #293 (CI green + browser-QA'd on Demo; KnowledgeSourcesCard toggles which global sources feed a winery's assistant; listSourceSettings loader + setKnowledgeSourceEnabled admin action upserting tenant-scoped KnowledgeSourceSubscription; verify:kb-subscriptions 7/7 incl RLS isolation). Prior in this arc: 4 new sources MERGED #292 (WSU/OSU-Extension/OSU-OWRI/Scott, corpus 1,449 docs), Unit 12 re-crawl loop MERGED #289, core corpus #285. PENDING: merge #293 → plan 079 fully shipped. Prior: 4 new sources → PR #292 (WSU 95 + OSU Extension 36 wine/grapes-only + OSU-OWRI 264 + Scott Labs 28; corpus 1,449 docs). New config sitemapUrls?/autoCrawl?, normalizeCrawlUrl dedup, reset:knowledge-source. OSU robots reassessed (our UA permitted; blocks only named training crawlers). verify:knowledge-base 14/14, gates green. PENDING CI→merge, then Unit 11 subscription UI. Prior: Unit 12 re-crawl freshness loop MERGED PR #289 (branch claude/kb-recrawler off merged main); core corpus already on main (PR #285). Weekly GH Actions loop (knowledge-recrawl.yml → scripts/recrawl-knowledge.ts): conditional-GET re-crawl of active sources → re-embed only changed pages into a new revision behind the atomic flip, add new pages, tombstone 404s (status='withdrawn', kept for audit); reversible + self-correcting; tombstone pass gated to COMPLETE crawls; single-flight; writes GLOBAL corpus only (never tenant data); opens a GitHub issue; never merges code. Smoke-tested on live Neon (KB_MAX_DOCS=3), tsc clean; AUTOMATION.md loop 5 + security-register corrected. PENDING: CI green → merge #289; then add sources (Davis/OSU/WSU/Cornell) → Unit 11 subscription UI; post-merge add secrets DATABASE_URL_UNPOOLED + VOYAGE_API_KEY and trigger once with max_docs=5. — Prior: Plan 079 bug-report clarification loop FULLY SHIPPED to main (all 13 units): PRs #276 (backend spine) + #281 (U11-UI My-Reports chip + U12 assistant surfacing) + #277 (inventory-error sibling) + #282 (U8 in-agent request_clarification tool + workflow branch, 6ac7b0b) + docs truth-up #283. Vague ticket → auto-captured browser console + a cheap-LLM sufficiency gate (or the fix agent mid-investigation via request_clarification) → DM the reporter from "Cellarhand Support" with a [Ref: BUG-XXXX] token, park the run at AWAITING_CLARIFICATION → reporter sees a "Needs your input" chip on My Reports + an assistant nudge, replies in inbox → reply hook strips the token, flips clarification ANSWERED, feeds the answer onto the ticket, re-dispatches the fix workflow at attempt 2 (MAX_CLARIFICATION_ROUNDS=2 now live); watchdog + TTL sweep cron recovers strands. All 9 council concurrency fixes + 4 /review CRITICALs folded. Browser-QA'd the whole loop in the in-app Claude browser; QA fixtures cleaned, .env + Demo bugReportMode restored; gates green (tsc, eslint, vitest; CI check + tenant-isolation on #282). Prior: Empty-source stock-transfer error clarity (feedback cmrquedll…, plan #270) SHIPPED (PR #277): /inventory Move-stock Transfer from a location holding none of the item was blocked but showed a generic "an error occurred" — `moveStock` was a plain `action` so Next redacted the thrown ActionError in prod. Fix: `moveStock` → `safeAction` + `unwrap` at both call sites (Inventory form + assistant adjust-inventory committer); `transferStock` names the reason (empty "no inventory there" vs shortfall "only N there"). tsc/eslint/vitest-55/verify:naming/verify:ai-native green + DB proof on Demo (QA-* fixtures, cleaned). Worked in the session worktree (main checkout live-in-use by a parallel session). PENDING: CI green → squash-merge → resolve ticket + DM Mike. Prior: P0 bottling ABV range guard (feedback cmrqtzlc…me25 / #263, DEFECT) SHIPPED + MERGED (PR #275 squash-merged to main, c74ec98): bottling accepted an absurd ABV (140%) → corrupt finished-goods/tax data; fix is a server-enforced range (0, 100] in runBottlingTx (the one choke point for standalone create/edit AND the WO BOTTLE task) via new shared pure helper src/lib/bottling/abv-range.ts, + inline client hint/max in BottlingClient; ceiling is the physical max, NOT 24% (compliance intentionally captures >24 for tax review). unit 8/8, verify:cost 55/55, tsc/lint/verify:naming green; CI check/review/tenant-isolation/GitGuardian passed; Demo DB proof — 140% rejected with zero writes (no SKU/run, vessel untouched), 13.5% still succeeds; ticket → RESOLVED with write-back note; resolution DM sent to reporter Mike (mike@bhutanwine.com) from Cellarhand Support; branch pruned. Prior: Inbox WO "viewer redundancy" (feedback cmrqqjk57, P2) SHIPPED + MERGED (PR #274 squash-merged to main, 222fe63): the Inbox wo-bucket reader-pane stub ("Open work order" 2nd click) removed, WO list row is now a direct <Link> to /work-orders/[id]; tsc/eslint/next build green + browser-verified on Demo; ticket → RESOLVED/DEFECT with write-back note; resolution DM sent to reporter Mike (mike@bhutanwine.com); branch pruned. Prior in-flight: Ticket #188 delete_harvest_pick + confirmed VineyardBlock cascade SHIPPING (PR #265) on claude/harvest-vineyard-lib-295869; PENDING live DB proof + browser-QA. Also: WO builder same-vessel transfer guard (feedback cmrqqm75b, P1) SHIPPED — PR #262 squash-merged to main (ee851b8), CI all green; ticket → RESOLVED/DEFECT with write-back note; resolution DM sent to issuer Mike (mike@bhutanwine.com); branch pruned. Fix mirrors the execution guard (rack-core.ts:94 / topping.ts:42, keyed on vessel id) as a blocking readiness warning in RACK+TOPPING (proposal-readiness.ts readTask) → disables builder Create + refuses server write gate; execution kept as backstop; 4 regression tests. Also merged in parallel: Ticket #268 self-assigned WO inbox emit + "Issue" button clarity SHIPPED (PR #278, 6dc2d14). Prior: P0 bottling no-cork guard SHIPPED (PR #259, a173e0a); Plan 076 invoice ingestion SHIPPED (#246).
