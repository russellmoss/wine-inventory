# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

> **Every ticket in Mike's batch is closed and main is green.** Nothing is in flight. The next
> unstarted thing is **plan 107** (assistant tool surface) — scroll to it.

## ✅ #584 FALLOUT + BRANCH HYGIENE — ALL MERGED, MAIN GREEN (2026-08-05)

Started as "what did Aaron push?" and turned into unblocking main. **Aaron has exactly ONE thing in
this repo: the merge commit for [#584](https://github.com/russellmoss/wine-inventory/pull/584).** Both
of its commits are authored by Russell + Claude on `fix/authorization-fences`; he opened and merged
someone else's branch, **as a merge commit rather than a squash** — off the normal flow for code.

**[#585](https://github.com/russellmoss/wine-inventory/pull/585) (`a695bad6`) — main had been RED for
three commits** (`3ca47e67` → `89cb62dc` → `e4a5893c`) on the `vineyard-scope-db` job #584 introduced
and never ran. **Two bugs, and the first hid the second:**
1. The teardown couldn't purge its own spray fixtures — append-only KD-1/C15 wants
   `app.allow_spray_purge='on'` **and** a non-`app_rls` role. It had the owner half via `runAsSystem`
   and never set the GUC. Fixed as `verify-spray-record.ts` already does it: one transaction (the
   `set_config(...,true)` is transaction-LOCAL), delete `spray_application` alone, lines cascade.
2. That crash killed the script before its verdict, hiding **an assertion that could never pass**:
   `styleS?.vineyardId ?? "missing"` compared to `null` — for a SYSTEM style the right answer IS
   `null`, and `null ?? "missing"` is `"missing"`. Split into row-FOUND + value. Resolver was correct.

⚠️ **Lesson: a crashing teardown is not cosmetic — it swallows the verdict.** Run 1 printed 28 ✓ and
one ✗ then died in cleanup, so the ✗ read as noise in a stack trace. The job now passes **31/31**.

**[#586](https://github.com/russellmoss/wine-inventory/pull/586) (`06dd6a52`) — #584's last known
issue.** `/vessels`, `/locations`, `/reference`, `/inventory` stopped showing Add/Edit controls the
server refuses. Hidden not disabled, each with a line naming who can. `/reference` is **per-kind**:
variety = admin, vineyard CREATE = admin, vineyard EDIT = membership in THAT vineyard
(`editableVineyardIds`, computed with the real `canAccessVineyard` so buttons and gate can't drift).

⚠️ **New guard `verify:admin-predicate` — this was a CLASS, not a slip.** A hand-rolled
`isAdmin={user.role === "admin" || user.role === "owner"}` sat in THREE pages (inventory,
work-orders/task-types, work-orders/templates), a fourth documented in `search/actions.ts`. Every copy
drops `developer`, and `"owner"` is not an assignable role at all. **Aaron is `role=developer`** — he
was living the bug. Guard bans both shapes; proven by reverting.

**[#590](https://github.com/russellmoss/wine-inventory/pull/590) (`91a86769`) — was #580, which was
HALF A FIX.** It shipped tests asserting a work-order notification links to `/work-orders/<id>` (with
a guard that it "must not dead-end on the wo bucket") but **never changed `deriveNotificationHref`** —
hence the title "view work order details" on a diff that was entirely about tickets. Rebased onto
main, three of its own tests failed. Implemented the missing case after verifying `/work-orders/[id]`
exists and that **nothing consumes the `wo=` sub-key** — the real bug: "Open" dropped you on the WO
list, and for a COMPLETED order not even in it (bucket defaults to `open`).

⛔ **It could not merge on `feedback-bug/*` and the fence was NOT widened.** `verify-feedback-fence`
failed on `src/lib/inbox/routes.ts`. `scripts/feedback-fence-rules.ts` is the **same module the
autonomous bug-fix agent uses to restrict itself**; adding `src/lib/inbox/` would also hand the
unattended loop `notifications.ts`, `direct-messages.ts`, `channels.ts`, `actions.ts` — the per-user
RLS surfaces. Moved to an ordinary branch instead. **If we ever DO want the loop reaching inbox code,
that is a deliberate decision to make on its own.**

**[#591](https://github.com/russellmoss/wine-inventory/pull/591) (`3998ba3b`) — rescued
`docs/audits/product-design-audit-2026-07-28.md`**, 717 lines that had never been committed on any
branch and were one `rm` from gone. Same class as `d8f14732` ("rescue five documents that existed only
as untracked files"). Deleted `TRIAGE-RUNBOOK.md` (self-declares regenerable; also stale — it still
listed the P0 as open). Design-system zip deleted after byte-verifying all 49 entries are in git.

**Pruned:** 14 local branches; remote is now **just `main`**. Aaron DMed
(thread `cmsgglrh40000d14stnytm0hr`).

🪝 **Off-path, not started:** non-admins with no `user_vineyard` row lose weather/spray/soil/NDVI/block
surfaces entirely (#584's other known issue) — a data task, assign memberships. And **this file is
3,000+ lines**; the convention says one screen. Closed-out sections belong in an archive.

## ✅ P0 "USE OF ASSISTANT" — FIXED, LIVE, AND CLOSED OUT (2026-08-05)

[#583](https://github.com/russellmoss/wine-inventory/pull/583) squash-merged as `89cb62dc`;
production deploy succeeded **17:01:17Z**. All four tickets written back **RESOLVED / DEFECT** by
Russell, and Mike has been DMed in plain language (thread `cmrmlwpkm0000l604gictimj9`, message
`cmsgc4is40000d1iokvcmckmw`) — **he read it 14 seconds after it landed.**

**Four of Mike's tickets are ONE defect** — `cmsdem5xo…` (Aug 3 "error message"), `cmsdy4uom…`
(Aug 4 "use of assistant"), `cmsevmt6v…` (Aug 4 "assistant doesn't work"), `cmsg2dir6…`
(Aug 5 "wineyard ops"). Three carry a screenshot; all show the same response:

> `400 invalid_request_error — "This model does not support assistant message prefill. The
> conversation must end with a user message."`

**Root cause:** `listMessagesForReplay` (and `getConversation`) bounded with `orderBy createdAt: "asc"`
+ `take: 200` — that returns the **OLDEST** 200 rows. Past 200 messages the user turn the route had just
appended fell outside the window, so `buildReplayMessages` rebuilt an array **ending on an assistant
turn**, which the model refuses as a prefill. **Permanent per conversation**, not intermittent: the same
rows rebuild the same rejected shape every send. That is literally "everything I type gives an error".

**Proven against production**, not argued: conversation `cmrqqt4fa0001ju04nhftgzpb` ("Big Mike Big Red
Inventory Check", created Jul 18, **246 messages**) replayed rows #1–200, ending on an assistant line
from `2026-07-20T00:52:04Z`. His eight user turns since Jul 30 — including "whats in tank T5" and "are
you working" at 14:09/14:10 today — have **no assistant reply row at all**. After the fix the same call
ends on `are you working`. No migration, no backfill: the next turn self-heals.
**Blast radius:** `awerth@gmail.com` is at 160 messages in one thread and was heading for the same wall.

⚠️ **The Aug-4 investigation falsified the right hypotheses and missed this one** because the repro
replayed a SHORT slice of the conversation. The 200-row cliff is invisible unless you run the real
`listMessagesForReplay` against a conversation that actually crosses it. `getConversation` had the same
bug on the UI read — a long thread reopened frozen weeks back, missing the user's own recent messages.

**➡️ NEXT ACTION: none on this ticket.**

## ✅ "CAPACITY" (`cmsf3y809…`) — FIXED, LIVE, CLOSED OUT (2026-08-05)

[#587](https://github.com/russellmoss/wine-inventory/pull/587) squash-merged as `2a4c5d16`;
production deploy succeeded **18:21:54Z**. Ticket RESOLVED/DEFECT, Mike DMed
(`cmsgezw1w0000d1qkki1eyfm7`).

🎯 **AND THE ASSISTANT P0 IS CONFIRMED FIXED IN THE WILD.** Mike asked *"where can i look at the
equipment reisgtry"* at **17:06:26Z** — five minutes after the #583 deploy — and **got a real answer
at 17:06:30Z**. First assistant reply in his conversation since 2026-07-20. He has been using the app
since and has filed three new reports (below), which is its own kind of proof.

Mike: *"I select tank five, I get an error that says that exceeds the capacity of the vessel, which
is only 225 liters. So somehow the system thinks that tank five is a barrel."* **It doesn't — it
silently picked a barrel FOR him.** `initialPressFractionDestination` fell back to `vessels[0]`, and
`loadPressFormData` orders by `code asc`, so the first ACTIVE vessel in a real cellar is **barrel B1
(225 L)**. His task pinned no destination (`{op:"PRESS",taskKey:"t5_4f5m47"}`), so the free-run cut
aimed at a 225 L barrel before he touched anything, the picker showed only `B1` (no capacity, no
placeholder), and the ONLY component that objected was the ledger guard at `ledger/write.ts:213`, a
round-trip later, naming a vessel he never chose.

**FIVE pickers had the same silent default** — press-execute, standalone press fractions, whole-cluster
juice split, crush, crush-execute. All five fixed: empty unless pinned, `— pick —` placeholder,
capacity rendered in every option, and a volume-with-no-destination is now refused instead of silently
dropped. New `oversizedFractionMessage` names the vessel before the round-trip; it checks TOTAL
capacity (not headroom) on purpose, making it a strict subset of the ledger check — it can never
produce a false rejection.

⚠️ **An existing assertion encoded the bug** — `press-guidance.test.ts` asserted the `vessels[0]`
fallback *existed* rather than asking whether guessing a destination was safe. A test can lock in a
defect just as firmly as it can catch one. The new cases fail against the old code (`expected 'b1' to
be ''`). Suite 5,802 green; browser QA NOT run (authed pane needs a human login) — **after deploy,
confirm a press/crush form opens on `— pick —` and not `B1`.** One behaviour change to expect: these
forms now open with NO vessel selected, so it is one extra click. Deliberate; flag if the crew objects.

**🆕 MIKE FILED THREE MORE TODAY (all NEW, untriaged):** `cmsgbjgov000fl704f36c47p7` "Confirmation card
not rendering in assistant panel" (assistant — possibly related to the #203 card-below-fold lineage,
worth checking first), `cmsgc9bw80000la04b42ftqvy` "blends", `cmsgbp71b0000l2049stzp37z` "eqipment"
(feature request).

## ✅ "TRANSFER ERROR" (`cmsg2aphb…`) — FIXED, LIVE, CLOSED OUT (2026-08-05)

[#589](https://github.com/russellmoss/wine-inventory/pull/589) squash-merged as `7c36ea27`; production
deploy succeeded **18:43:10Z**. Ticket RESOLVED/DEFECT, Mike DMed (`cmsgfr3s30000d1zotwz4zbcm`).
**That closes every bug he reported in this batch** (4 assistant + capacity + transfer).

**The gate was refusing the write for a GOOD reason, in plain English, and throwing the sentence away.**
`gateWorkOrderReadinessForWrite` threw a raw `Error`; `settleAction` converts **only** `ActionError`
into `{ok:false,error}` and rethrows the rest → Next.js replaces the message with an opaque digest →
HTTP 500. That digest is "the weird error at the bottom". What it wanted to say: *"Task #1: a
transfer's source and destination must be different vessels (both are Tank T5)"* — he had picked the
same tank at both ends.

⛔ **Never rack-specific.** The gate guards **five** write paths, all `safeAction` — both creates, the
edit, the composer, and the assistant's confirm (`assertFreshReadiness`). ANY blocker or stale
fingerprint on ANY of them was an unexplained 500. All three refusals are now `ActionError`.

**RULE (now in memory):** inside a `safeAction`, the error CLASS is the delivery mechanism. If a human
is meant to read it, it must be an `ActionError`; a raw `Error` is for real bugs you WANT redacted.

## 🪝 Off-path — two findings from that investigation, NOT fixed

1. ⚠️ **The Sentry → GitHub issue automation looks DEAD.** This production 500 (Aug 5) opened no
   issue; the newest `[sentry]`-labelled issue is **#450, Jul 21**. That absence is why nobody knew.
   Same shape as the assistant P0: *the error path that says nothing IS the defect.* Worth its own look.
2. ⚠️ **`draftWorkOrderFromTextAction` has the identical bug** — wrapped in `action(...)` not
   `safeAction(...)`, and `nl-resolve.ts` throws ~30 raw `Error`s with user-facing text ("That vessel
   no longer exists."). Every one is an opaque 500 in the "describe the job" NL box today. Deferred:
   converting it changes the action's return type and all its call sites.

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

## ✅ [#586](https://github.com/russellmoss/wine-inventory/pull/586) — the admin-only edit UI (#584's last known issue)

`/vessels`, `/locations`, `/reference`, `/inventory` no longer show Add/Edit controls the server
refuses. Hidden, not disabled, each with a line naming who can. `/reference` is **per-kind, not
blanket**: variety = admin, vineyard CREATE = admin, vineyard EDIT = membership in THAT vineyard
(`editableVineyardIds`, computed server-side with the real `canAccessVineyard`, so buttons and gate
can't drift). On `/inventory` only the two CATALOG writes are gated — stock movement stays open.

⚠️ **New guard `verify:admin-predicate`, because this was a CLASS not a slip.** A hand-rolled
`isAdmin={user.role === "admin" || user.role === "owner"}` sat in THREE pages (inventory,
work-orders/task-types, work-orders/templates), with a fourth instance documented in
`src/lib/search/actions.ts`. Every copy drops `developer` — so a **developer saw a read-only UI the
server would have allowed** — and `"owner"` is not an assignable role at all (`ASSIGNABLE_ROLES` is
user/admin/developer), so that arm never matched. The guard bans both shapes; proven by reverting.
⚠️ **Aaron opened AND merged #584, and the code in it is ours** (both commits authored by
russellmoss + Claude on `fix/authorization-fences`; his only authored commit in the repo is the merge
commit). It landed as a **merge commit, not a squash** — off the normal flow for code. Worth a word.

_Last updated: 2026-08-05 — Mike's whole batch closed (#583/#587/#589); #584 fallout closed (#585 CI, #586 admin UI); #590 inbox deep links; #591 audit rescued. Main green, remote pruned to `main`. The detector that found it: run the REAL
`listMessagesForReplay` against a conversation that crosses `REPLAY_LIMIT`, then assert the rebuilt
array's tail role. Everything short of that passes — a `take`-bound bug cannot reproduce on a
fixture smaller than the bound._

**Defect 1 — assistant failures recorded NOTHING server-side.** `run.ts:399` catches its own errors,
emits the message to the user and returns normally; the route's catch was bare. Neither captured to
Sentry or logged. A turn that dies before producing text or a tool call also persists no assistant
row (the route's `run.text.trim() || hasToolEvidence` gate), so its only trace was an **absence** — a
`user` row in `assistant_message` with no reply after it. That is how a P0 reached triage with no
error text for anyone to act on. Both catches now `captureException` + `console.error` with the
conversation, user, turn count and message count.

**Defect 2 — `maxDuration` was 60s and overran SILENTLY.** Measured against the live API: a knowledge
question making 3 `search_knowledge_base` calls took **79.2s**; every request carries ~97 tool schemas
so even a no-tool reply costs 9–33s. Past the ceiling Vercel kills the function mid-stream — the catch
never runs, no row is written, nothing reaches Sentry. Raised to 300 (what the cron routes already
deploy on this plan) plus a **soft deadline** (`src/lib/assistant/deadline.ts`): the loop stops itself
before the platform does and tells the user the answer was cut short. The regression guard asserts
`maxDuration` still exceeds the budget — it FAILS at 60 and passes at 300.

**Three hypotheses were tested and falsified, by evidence not argument:** orphaned `tool_use` (0
orphans across the real 242 rows), consecutive user messages 400ing (the live API accepts
`[user,user,user,user]` — the comment at `replay.ts:135` is STALE), and the timeout as *Mike's* cause
(his `debugContext.interactionTrail` shows Send → **+13.1s** → "Report bug", far too fast, and his
exact turns replay fine today).

**➡️ NEXT ACTION: watch Sentry for `area: assistant`.** Mike's next message should now land a real
tagged exception with turn count and conversation id. That is the diagnosis today could not get.

⚠️ **The DB signature is the detector until then** — `user_msgs > asst_msgs` per user/day over
`assistant_message` finds every silent failure with no logging at all. It is how this was found.

**Triage backlog (from the 2026-08-04 run) — item 1 of 3 now actioned.** Remaining: `/plan` the
vessel+location family as ONE plan (`cmsdhvzg2…` → `cmsdxp0vl…` → `cmsdxnlfq…`, NOT parallel-safe —
one `prisma/schema.prisma`), then `/plan` the depreciation engine (`cmsdk30d8…`, straight-line + ONE
book; must reconcile with the EXISTING auto barrel depreciation or double-book the expense).

---

**PLAN 107 DRAFTED + COUNCIL-REVIEWED 2026-08-04 — the assistant tool surface. Not yet built, not yet
PR'd.** Plan: `docs/plans/2026-08-04-107-refactor-assistant-tool-selection-plan.md` · council:
`docs/plans/council-feedback-107-assistant-tool-selection.md`. Also amended `docs/api-strategy.md`.

**The finding that started it:** the registry is at **96 tools in one flat list**, against the ~40-tool
selection cliff `scripts/ai-native-allowlist.mjs` names itself. Ten hand-written routing rules in
`src/lib/assistant/prompt.ts` are compensating for it. `verify:ai-native` (41/53 cores reachable,
ratcheting allow-list) is genuinely strong; what is missing is a surface an LLM can navigate without
being told in prose. There is also **no MCP server, no OpenAPI, no llms.txt** — every `src/app/api/**`
route is plumbing (cron, webhooks, OAuth, uploads), so no external agent can reach the app at all.

**Two research findings corrected the plan's own premises — do NOT re-derive:**
1. **Read-side tool calls are ALREADY persisted.** `src/app/api/assistant/route.ts:179` writes
   `metadata: { trace: run.trace }` on every assistant row, and `trace.toolCalls` already carries
   `{ id, name, input, resultPreview, resultKind }`. The usage question is a query, not a build. This
   deleted a whole unit (new table + Phase 12 nine-step checklist + migration).
2. **The tool-selection evals do NOT use the real system prompt.** `assistant-tools.eval.test.ts:159-161`
   builds a hardcoded 2-sentence string, so **the ten routing rules have zero eval coverage today**. And
   only the *structural* half of the evals is PR-gated — the live-model half is nightly,
   `continue-on-error`, opens an issue. "Golden evals are a hard CI gate" is half true: coverage is
   gated, behaviour is not.

**Council (Gemini) landed one finding that changes the design, not just the plan:** a **composition**
rule ("consult BOTH the latent-infection tracker AND the scouted field reports") **cannot** live in a
tool description — a description is read to answer "should I call this one?", never "what else do I
owe?". Split across two tools, a model answers "no disease recorded" from one source, which is wrong in
the one direction that costs a crop. **Boundary rules may move; composition rules stay in the prompt.**
That rule is now written into `docs/api-strategy.md` as a **prerequisite of Phase 10/MCP**, because an
external MCP client supplies its own system prompt and never receives ours.

✅ **CODEX RAN 2026-08-04 — the council is now complete, and it changed what Unit 1 is FOR.**
**`council-mcp` is the broken part, not Codex.** The wrapper asks for `gpt-5.4`/`gpt-5.4-mini` (absent on
this install) and spawns Codex through a sandbox that dies on `CreateProcessWithLogonW: 1907`
(`ERROR_PASSWORD_MUST_CHANGE`). `codex exec -s read-only` **from Bash works fine** — but Codex cannot
spawn a local shell here, so it cannot read repo files itself. **The workaround that worked: inline every
excerpt into the prompt and tell it to run no commands.** Use that for any future `/council` on this box.

⛔ **Codex's headline: Unit 1's artifact CANNOT be used to delete a tool** — which was its original
purpose. The trace is a survivorship-biased lower bound from THREE same-direction losses:
1. **Whole-turn loss** — the row is written only after the whole run, best-effort, in nested try/catch.
   A run killed at the serverless ceiling contributes **zero** rows despite executing N tools. (This is
   what open PR #581 is about; a KB-heavy turn measured 79s against a 60s cap.)
2. **`MAX_TOOL_CALLS = 40`** at `src/lib/assistant/trace.ts:80` — `pushToolTrace` silently returns past
   40, so even a persisted turn can be truncated. *(Found by me, not Codex — it had no shell.)*
3. **No denominator** — attempted turns are persisted nowhere, so the undercount can't be estimated.

All three bias against long multi-tool turns, which is exactly where routing confusion lives. Unit 1
survives as a **positive-usage signal only**; deletion-grade data needs forward instrumentation (an
awaited append-only event before dispatch — the tenant-scoped table this plan was glad to avoid) and
history cannot be repaired.

Also from Codex, all folded in: `COUNT` returns `bigint` and `JSON.stringify` throws on it; the
shape-safe `jsonb_typeof` expansion; PII must be guarded in the SQL projection because
`sanitizeTraceValue` redacts by key NAME only; the `vi.mock` break is *"not a function"*, not a stale
value; and `db_create`/`db_update` error text already advertises all 8 entities as creatable/editable —
a pre-existing bug now in Unit 4's scope.
✅ **`runAsSystem` verified CORRECT** (`src/lib/tenant/system.ts:23` — separate client on
`DATABASE_URL_UNPOOLED`, Neon owner, `BYPASSRLS`, un-extended). Codex flagged it; it's fine.
⚠️ **Still open (Codex C-2):** `assistant_confirmation`'s lifecycle is unverified — confirm its
executed/succeeded status and dedup key before grouping it.

**✅ UNIT 0 BUILT + COMMITTED `44af9425`** (docs in `0d164e2c`). Both LLM eval halves now call
`buildSystemPrompt()` instead of a hardcoded stub, so the ten routing rules are under test for the first
time. Structural half — the PR-gated half — green: **231 passed, 178 skipped**. tsc clean on the changed
files (the only errors repo-wide are pre-existing `@axe-core/playwright` module-resolution failures in
`test/e2e/`, untouched by this change).

⚠️ **The fleet eval deliberately LOST a hint production never had** — *"a request to RECORD/ADD a concrete
dose is a write action; a request to CALCULATE how much to add is a read calculation."* A green fleet eval
was therefore partly measuring the harness. If calculate-vs-dose now fails, fix `prompt.ts` or the
`calc_*`/`add_addition` descriptions — **do NOT re-add the hint to the test.**

⛔ **Unit 0 is NOT fully verified: the live baseline was never captured.** It costs real tokens on the
owner's key and this worktree has no `.env` (it lives in the MAIN checkout). Run from the main checkout:
`ASSISTANT_EVAL=1 npm run eval:assistant`. **Until that number exists, Unit 3 has nothing to be measured
against** — the plan's before/after gate is unenforceable.

**✅ UNITS 1a + 4 BUILT 2026-08-04** — rebased onto `origin/main` first (`69522112` #581 + `5bc68fcb`).
`69bdfbc9` Unit 4 · `0a78514d` Unit 1a. Full suite **5768 pass / 0 fail**, tsc clean.

✅ **MIGRATION PROVEN ON A NEON BRANCH 2026-08-04 — still NOT applied to prod.**
Branch `br-hidden-forest-atkzcez4` (`plan107-assistant-tool-call-test`), forked from prod's default
branch, auto-expires **2026-08-06**. Pre-state confirmed a faithful fork: 186 migrations applied,
table absent. `prisma migrate deploy` applied `20260804120000_assistant_tool_call` cleanly — so the
self-verify `DO` block passed, since it RAISEs on any drift.

**Structure verified:** 9 columns · RLS `relrowsecurity` AND `relforcerowsecurity` both true ·
`tenant_isolation` with **both** `qual` (USING) and `with_check` non-null · FK `confdeltype = 'r'`
(RESTRICT) · 3 indexes · 2 append-only triggers · and the load-bearing one —
**`app_rls` holds `INSERT,SELECT` and nothing else**, so the REVOKE actually beat the
`ALTER DEFAULT PRIVILEGES` grant.

**BEHAVIOUR verified as `app_rls` (via `SET LOCAL ROLE`, so NOBYPASSRLS really applies), 6/6:**
own-tenant insert+readback · WITH CHECK refuses writing another tenant's row · tenant B cannot see
tenant A's row · **unset GUC fails closed (0 rows)** · UPDATE refused · DELETE refused.
🦷 **Proven non-vacuous:** the same harness with a deliberately false premise RAISED
(`saw 1 rows, demanded 999`). A `DO` block that silently passes proves nothing; this one bites.

🧹 **Branch DELETED 2026-08-04 after verification** — nothing of it survives, and nothing needed to:
the migration is committed in git and the results are recorded here. It had carried a
`GRANT app_rls TO CURRENT_USER` (so the owner could assume the app role) and one test row
(`zz_atc_a`), both of which died with it. Cleanup is why the grant was safe to make at all.

✅ **MERGED AND LIVE IN PRODUCTION 2026-08-04.**
[#582](https://github.com/russellmoss/wine-inventory/pull/582) squash-merged as `ef717b68`; CI fully
green (`check` 4m13s · `review` · `tenant-isolation` · GitGuardian), Vercel Production deploy
**success**. `claude/*` branches get no preview, so CI was the only pre-merge signal — as expected.

**Verified against the PRODUCTION database, not inferred from the deploy:** `assistant_tool_call`
exists · migration `20260804120000_assistant_tool_call` recorded finished · RLS **enabled AND forced**
· `tenant_isolation` carries **both** USING and WITH CHECK · **`app_rls` holds `INSERT,SELECT` only**
(the REVOKE beat `ALTER DEFAULT PRIVILEGES` in prod too) · 2 append-only triggers.

✅ **CI re-proved the isolation independently.** The `tenant-isolation` job runs `migrate deploy` against
a CI Postgres and exercises the suite **as `app_rls` through a transaction-mode PgBouncer** — and because
that suite derives its table list from the datamodel minus `GLOBAL_MODELS`, it picked up the new table
automatically. Machine confirmation of what was hand-checked on the Neon fork.

⚠️ **`rows_logged_so_far = 0`.** Nobody has used the assistant since the deploy. The table is correct and
the code is live, but **the write path has not yet been observed end-to-end in prod** — that is still
unproven, and the next real Demo Winery turn is what proves it.

**Immediate next, in order:**
1. Run one Demo Winery assistant turn, then read rows back with `runAsTenant("org_demo_winery", …)`.
   That closes the last gap between "deployed" and "working".
2. **Measure turn latency** — the plan's own gate on whether the hot-path write earns its place. If it
   regressed, backing Unit 1a out is the designed response, not a failure.
3. Capture the `ASSISTANT_EVAL=1` baseline (`npm run eval:assistant`) — Unit 3 is blocked without it.

**Unit 1a — `assistant_tool_call`, written BEFORE dispatch, batched ONE `createMany` per MODEL TURN**
(at `run.ts` where `toolUses` is already the batch — per-call writes were the obvious version and the
wrong one on a path with a serverless ceiling). PII boundary is structural: name/kind/turn/ids only,
never args or results, with a schema test that pins the column set.
🐛 **A defect the tests caught, not review:** the logger call sits inside the loop's outer try, so a
throw from it KILLED the user's turn. `tool-log.ts` already swallows everything, but the loop must not
depend on another module keeping that promise — now wrapped at the call site, with a test that throws
from the logger and asserts the answer still arrives.

**Unit 4 — `db_*` `entity` is now a JSON-Schema enum**, per tool, derived from the same predicate each
guard applies. Predicates are TYPE GUARDS: plain booleans silently dropped TypeScript's narrowing of
the optional members and produced 6 tsc errors — Codex had recommended type guards in advance.
⚠️ **Two things I overstated when planning this, corrected:** all 8 entities currently satisfy every
capability, so the four enums are IDENTICAL today (the live win is only blocking a hallucinated entity
name), and the `db_create`/`db_update` error-message bug is therefore **LATENT, not live** —
`allowedEntityNames()` was accurate precisely because the registry is uniform. A TRIPWIRE test fails
the day that stops being true, which is the day the agreement tests start doing real work.

⚠️ `verify-ai-native.test.ts` failed once in the full suite on its TIMEOUT, passed 16/16 alone in 4.8s,
and a clean re-run went 464 files green. Contention flake, same class as `assistant-commit-tenant-context`.

**Next:** apply the migration on a Neon branch → QA a real Demo Winery turn and read rows back with
`runAsTenant("org_demo_winery", …)` → measure turn latency before/after (the plan's own gate). Then
Unit 2, then Unit 3 (needs the still-uncaptured `ASSISTANT_EVAL=1` baseline). Unit 1b is time-gated —
it needs weeks of instrumented data, so it is LAST.

---

**PRIOR OBJECTIVE — BUG-TRIAGE RUN COMPLETE 2026-08-04, still-open next-actions below.**

**BUG-TRIAGE RUN COMPLETE 2026-08-04 — AND THE ANSWER IS: THERE IS NOTHING TO BUILD.** Live run
(autoMerge + dispatch + reconcile + all three sweeps), 11 agents, 0 errors, `mode.argsWarning: null`.
Runbook at `TRIAGE-RUNBOOK.md` (untracked — regenerated every run, local edits are ephemeral).

Backlog 28 → 8 active → **7 primaries + 1 duplicate**, all Demo Winery, so no multi-tenant fire.
By disposition: **5 product-gap, 1 defect, 1 unclear** — only ONE item in the entire active backlog
is a real code defect. Actions: 2 reconciled, 1 already-shipped reconciled, 1 dispatched, 5 routed to
`/plan`, 1 queued for a human, 0 auto-merged (no open PRs remained). ERP: **0 conflicts, 5 cautions**.

⛔ **Zero build waves.** A fleet spun up right now would have nothing to pick up: nothing is
plan-ready with a real plan, and the only defect is already being built. **The bottleneck is planning
and investigation, not build capacity** — resist the urge to throw builders at this.

**Next actions — 1–3 can run concurrently (read/plan work, no file overlap):**
1. `/investigate` the P0 `cmsdy4uom0006jp04iav07edp` "use of assistant" — *"everything i type in gives
   an error"*, but zero diagnostic detail, and `src/app/api/assistant` is OUTSIDE the auto-fix fence
   (only `src/app/api/feedback` is in). Get the real error before spending a build slot.
2. `/plan` the vessel+location family as **ONE** plan: `cmsdhvzg2…` (vessel location/purchaseCost/
   label+notes) → `cmsdxp0vl…` (Location as a governed entity) → `cmsdxnlfq…` (cellar-floor filter).
   NOT parallel-safe — one `prisma/schema.prisma` across three branches is a guaranteed conflict.
3. `/plan` the depreciation engine `cmsdk30d8…`, scoped hard to straight-line + ONE book. It gates the
   equipment leg of cost allocation `cmsdk30ts…`, and must reconcile with the EXISTING auto barrel
   depreciation or the same expense gets booked twice.

✅ **The merged sweep proved itself on its first real case.** It found `cms8a9nau0005i8045l65vomp` by
scanning 50 merged PR bodies, matched `Closes feedback …` in #571, and wrote it RESOLVED — confirmed
by reading the row back, not trusted from the report. That is precisely the blind spot it exists for:
a ticket whose `prUrl` stayed null while its fix sat in production. It also *declined* to touch two
other scraped ids (#548, #541) because intake reconcile already owned them.

⚠️ **All 5 ERP cautions are one class:** each asks to MUTATE something the ERP treats as history — a
vessel's site, a location's name, a posted COGS snapshot, a posted depreciation period. Each
standard-to-uphold is written verbatim into its `/plan` action, so conformance is designed in at PLAN
time rather than caught at review.

---

**RECORDED-VOLUME CORRECTION (feedback `cms8a9nau0005i8045l65vomp`) — MERGED AND LIVE IN PRODUCTION
2026-08-04.** [#571](https://github.com/russellmoss/wine-inventory/pull/571) squash-merged as
`3de798e8`; main CI green and the Vercel production deploy completed 03:06:57Z.

**Verified on `main`, not inferred from the merge:** all six new files present, and
`allocateProportionalIncrease` is imported at `src/lib/bulk/actions.ts:13` and called at `:211` — so
the defect fix reaches the **existing** `/bulk` editor, not only the new `RecordedVolumeEditor`.

Demo Winery barrel B3: a 225 L barrique SEEDed at 100 L. The reporter typed 225 into the `/bulk`
composition row, nothing happened, and the only path left was a rack/top-up — which moves real wine
and, from a different-variety source, mints a blend to fix a typo.

**The feature request was half the story; there was also a real defect.**
`updateComponentVolume` routed BOTH directions through `computeProportionalDraw`, which throws
`"draw exceeds available volume"` once the amount exceeds the position. +125 L onto a 100 L barrel is
the ORDINARY case, not an overdraw — so it threw a raw `Error` (redacted in prod) and the input just
looked inert. **That is exactly the reported symptom.** Split the directions: draws stay capped,
increases go through a new `allocateProportionalIncrease` with the same integer-centilitre
largest-remainder exactness. `/bulk`'s editor is fixed too, not just the new path.

Shipped: `RecordedVolumeEditor` ("Recorded volume · 100 L · Edit") at the TOP of the vessel detail
panel — corrected volume + **mandatory reason**, signed-delta preview, Undo after. One `ADJUST` (never
a silent `vessel_lot` overwrite), reason in metadata + note, audit row, `adjust` counter-leg so the
TTB fold treats it as an ordinary book-vs-physical difference (§A9 gain / §A30 loss). Assistant tool
`correct_recorded_volume` + 2 golden cases (one asserts it does NOT route to `rack_wine`/`top_up`).

**Proof that is not just green CI** (the Phase 7 lesson, applied): `npm run verify:volume-correction`
rebuilds the reported fixture on Demo Winery and asserts `vessel_lot` ACTUALLY reads 225 afterwards —
19/19 against the live DB. Plus 28 unit tests, tsc clean, full suite 5690 pass (the one failure,
`assistant-commit-tenant-context`, is the documented whole-suite contention flake and passes alone).

⚠️ **B3 itself is deliberately UNTOUCHED at 100 L** — the ticket asked for the capability, not for me
to edit the reporter's data. All QA fixtures (`ZZ-VOLCORR-*`) were cleaned up; verified by query.
⚠️ **Local `node_modules/@prisma/client` was an EMPTY DIRECTORY** — repaired this session
(`npm install @prisma/client@^6.19.3` + `prisma generate`); `package-lock.json` unchanged. Note the
generated client follows whichever checkout ran `prisma generate` last, and the MAIN checkout sits on
a stale `docs/s2b-...` branch whose schema predates Phase 7.

⚠️ **It sat 3 days unmergeable on THIS file alone.** `NOW.md` was the *only* overlap between the
branch's 15 files and the 21 main touched while it waited (#572 / #573 / #574) — proven with
`git merge-tree`, which named exactly one conflicting path. Every line of feature code auto-merged
clean. The focus-spine convention blocked its own feature; a rebase is cheap, so rebase early rather
than letting a docs stamp age into a stale PR.

---

**PROD OAUTH LOGIN REPORT — THE 500 WAS NOT REPRODUCIBLE; THE REAL DEFECT WAS THAT SENTRY COULD NOT
SEE IT. MERGED AND LIVE 2026-08-02.** [#573](https://github.com/russellmoss/wine-inventory/pull/573)
squash-merged as `b46d90f5`; Vercel production deploy succeeded. Owner report, no plan file.

⛔ **The reported symptom and the shipped fix are two different bugs — say so plainly.** The reported
`500` on `POST /api/auth/sign-in/social` did **not** reproduce: 15+ probes against prod (clean browser at
the prod origin, stale session cookie, foreign `Origin`, no `Origin`, and the exact `callbackURL=/monitoring?o=…`
from the report) all returned `200` with a valid Google authorization URL — `429` past 3/10s from Better
Auth's rate limiter, never `500`. Following that URL reaches Google's sign-in page, so the prod redirect
URI is registered on the OAuth client. **The database settled it:** the `google` account row on
`russellmoss87@gmail.com` shows `updatedAt 2026-08-02T19:23:21.670Z` with a matching session row at
`19:23:21.680Z` — a completed Google round-trip, minutes *after* the report. OAuth works.

- **What WAS broken, reproduced byte-for-byte:** `POST /monitoring?o=…&p=…&r=us` → `307 /login?from=%2Fmonitoring%3Fo%3D…`
  → `405`. That is exactly the pair of 405s in the reported console. `/monitoring` is Sentry's `tunnelRoute`
  and was never on the auth proxy's public allow-list; `next.config.ts` still carried the stale note
  *"No middleware today"* from before `src/proxy.ts` existed.
- **Why it mattered more than it looked:** every client-side error envelope from a session-less page died
  at the login page. That is *the* screen where a login failure happens — so the app reported **zero**
  client errors from it, which is precisely why the reported 500 left no trace to root-cause.
- The allow-list moved out of `proxy.ts` into pure, unit-tested `src/lib/auth/public-paths.ts` so
  **segment-boundary** matching is locked (`/monitoring-dashboard` must not inherit public access).
  `safeReturnPath` now also refuses `/monitoring` — the proxy was stuffing the tunnel path into `?from=`,
  so a successful sign-in could return the user to a machine endpoint that renders nothing.
- **Proven on production after deploy, not inferred:** the tunnel POST now returns `401 "bad envelope
  authentication header"` — *from Sentry's own ingest servers*, i.e. the request is proxied end-to-end
  instead of dying at `/login`. `/inventory` still `307`s to `/login` (proxy intact) and
  `/monitoring-dashboard` still `307`s (no over-broad public access).
- ⚠️ **Known and accepted, flagged not hidden:** the tunnel is a Next.js *rewrite*, and `o`/`p`/`r` come
  from the query without being checked against our DSN — anyone can relay events through our domain into
  their own Sentry project. Upstream Sentry's design; bounded because the regexes (`\d*`, `[a-z]{2}`) lock
  the destination host to `*.ingest.*.sentry.io`. Not an open proxy.
- ❗ **Left deliberately unverified:** did NOT fire a live test envelope into prod Sentry — a fabricated
  error would trip the Sentry→GitHub-issue automation and open a spurious issue. The `401`-from-Sentry
  already proves the routing, which is the only thing this change touched.
- 🔎 **Open, not closed:** the original `500` has no root cause. `vercel` CLI here is authed into the
  savvy-wealth account, not `russell-moss-projects`, so it cannot read this project's runtime log. Next
  occurrence should now reach Sentry.
- 📌 Unrelated but worth knowing: the owner is `role: developer`, so `session.create.before` deliberately
  drops them into **Demo Winery**, not Bhutan Wine Co. Every recent session shows `org_demo_winery`. If
  "login not working" ever means "logged in but my data is gone", that is the cause — and it is by design.

---

**MAP EXPLORER — TALLER MAPS + AN ON-MAP MENU THAT ACTUALLY REORDERS THE LAYERS: MERGED AND LIVE
IN PRODUCTION 2026-07-31.** [#572](https://github.com/russellmoss/wine-inventory/pull/572) squash-merged
as `030ca289`; Vercel production deploy succeeded and `/vineyards/maps` returns 307 (auth), not 500.
Owner request, no plan file.

⛔ **The reported bug was real and structural, not cosmetic: reordering moved the WORDS and never the
pixels.** The NDVI raster is an `L.ImageOverlay` (`<img>`) and soil is `L.GeoJSON` (SVG paths), and both
landed in Leaflet's ONE shared `overlayPane`. That pane's SVG renderer container keeps its DOM position
regardless of the order vector layers are added in — so no amount of array reordering could restack a
raster against a vector. Fixed by giving **every stack slot its own Leaflet pane with an explicit
z-index** (`src/lib/map/layer-stack.ts`, pure + unit-tested); each layer is created into its slot's pane.

- **Blocks are now a LAYER**: reorderable against NDVI/soil, toggleable whole, and expandable into one
  checkbox per block. Hiding a block deliberately does **not** re-fit the view (build and visibility are
  two separate effects — fit-bounds stays a property of the vineyard, not of what's ticked).
- The layer control moved OFF the page and ONTO the canvas (`SatelliteMap` `layerControl` prop), top-left
  under the zoom control. Heights +30% (`map-height.ts`: 420→546, compare 340→442).
- **Proven in the browser, not inferred**: panes read `bw-stack-0 z=401 … bw-blocks z=406`; moving NDVI up
  moved its `<img>` from z=401 (under soil) to z=405 (over it); a block toggle drops 2 paths→1 with the
  map transform unchanged.
- ⚠️ **One defect found only by looking**: `overlays` is re-derived every render, so the stack effect keyed
  on array identity **tore down and rebuilt the NDVI ImageOverlay on every unrelated re-render** (every
  block toggle blinked the raster). Now keyed on a content signature. Re-proven: node identity survives.

---

**CELLARHAND v2 — PHASE 7 (BARREL GROUPS): MERGED AND LIVE IN PRODUCTION 2026-07-30.**
[#569](https://github.com/russellmoss/wine-inventory/pull/569) squash-merged as `1a1e2d1a`. All 12
units. Plan: `docs/plans/2026-07-30-106-feat-cellarhand-v2-phase7-barrel-groups-plan.md`.

**Verified against the live database, not inferred from the merge:** all four migrations applied
2026-07-30 19:57, 1 step each, no rollback — `_vessel_group_enums`, `_vessel_group_structure`,
`_vessel_group_od3_index`, `_work_order_task_group_snapshot`. OD-3 partial index present, all 3
triggers present, the 3 `work_order_task` columns present and **all still NULLABLE** (73 work orders
survived), 3 composite tenant FKs present, 0 `addedAt`/`removedAt`. `verify:group-membership` and
`verify:group-not-a-vessel` PASS against production. `/cellar/groups` returns 302 (auth), not 500.

**⚠️ THE LESSON WORTH KEEPING — an adversarial review found the phase's HEADLINE CLAIM was false,
and CI was green the whole time.** `grep` over `src/` found ZERO production readers of
`memberSnapshot`: the worksheet, execute form and completion path all read `plannedPayload`. So the
frozen list was never shown and never executed, and 33 tests plus a 17-assertion guard all exercised
a read path **no product surface called**. That is the F3 failure the phase was written to fix,
reproduced one level up. Fixed (`55d437fc`) by making the freeze RECONCILE the payload to the
snapshot, so the list the crew executes IS the frozen list — and the guard now reads the real path
and attacks an issued order through `updateWorkOrderCore`. 20/20, shown RED without the fix.

**Six more real defects the same review found**, all verified before fixing: an issued WO's payload
was still editable; `updateWorkOrderCore` never wrote `vesselGroupId`; **`/bulk` lost
`requireActiveTenant()`** (a regression introduced while adding `isAdmin`);
`createMany({skipDuplicates})` silently swallowed the new OD-3 index (a 22-barrel selection became
16, and merge dropped every row then archived the source); the assistant lens post-filtered a
capped query; the archive warning told the user DRAFTs were "already frozen" when archiving actually
makes them permanently un-issuable.

**Take from this: green CI is not evidence that a change does what it claims.** The tests were green
because they tested the wrong path.

**🚩 Carried forward, deliberately NOT built:**
- **`/cellar/groups` is READ-ONLY.** The admin-gated write cores exist and are tested; the editing
  UI is not. Membership editing still happens on `/bulk`.
- **`AD_HOC` is an enum VALUE only** — no creation path, no auto-archive. RFC-001 §6 decision 4 open.
- `/vessels/[id]` barrel detail (SC-08); rule-based membership (v2).
- **Behaviour change now live (D7):** creating/deactivating a barrel group on `/bulk` is admin-only.

**Known follow-ups the review raised and this PR did NOT take** (all informational, none blocking):
the `/cellar/groups` index runs ~3 queries per group (fine at today's counts, flagged in the scale
register); `reorderGroupMembersCore` does 2N round-trips inside a 5 s interactive tx, so a very large
rack would time out; `findOperationalConflictForGroup` is an N+1; positions have no unique
constraint so concurrent adds can tie; trigger functions lack `SET search_path`.

---

**✅ CELLARHAND v2 DOMAIN GATE — CLEARED. The owner answered both blocking questions 2026-07-29.**

**RFC AMENDMENT PASS — DONE 2026-07-29, docs-only, against `main` @ `91cd1dcd`.**
[#567](https://github.com/russellmoss/wine-inventory/pull/567). All four RFCs in
`docs/design/cellarhand-v2-handoff/rfc/` are implementable against the code that exists, and both
owner decisions are recorded in them. They stay **`proposed`** pending formal ratification, but
**nothing is waiting on the owner any more.** Companion:
`RFC-000-cross-cutting-implementation-notes.md` (migration order · live-tenant plan · assistant
coverage · parity). **ADR 0013** (balanced-op shape) + **ADR 0014** (work-order snapshot) + 7
`status: planned` invariant notes (GROUP-1/2/3, TOPPING-1/2, PROV-1/2). `verify:invariants` green
(58 notes, 50 guarded, 100%).

**✅ THE TWO OWNER DECISIONS — both answered, both recorded:**
1. **OD-3 second half → the WORK-ORDER SNAPSHOT** (*"do the worksheet approach"*). A work order
   freezes its barrel list at **issue**; membership is NOT effective-dated. `addedAt`/`removedAt`
   never get built, and the OD-3 partial index loses its `removedAt` clause. The
   retroactive-repaint hazard (`SPRAY-2`'s failure mode) is now **structurally impossible** rather
   than guarded by a rule. **ADR 0014 · invariant GROUP-3.**
   ⚠️ **Tripwire: if `addedAt`/`removedAt` ever appear on `vessel_group_member`, this decision has
   been reversed by drift rather than by decision.**
2. **OD-4 → NOMINAL IS ALLOWED, badged *nominal*, never *measured*.** The crew accepts the stamped
   keg size (*"it holds what it holds"*), so requiring a measured number would have fabricated one.
   **`CaptureMethod.NOMINAL` ships in M1 alongside `DERIVED`** and **provenance becomes a TRINARY**:
   measured / nominal / estimated. Ratified **as amended** — the original recommendation badged the
   nominal default as *measured*, which was the defect. **RFC-003 §3.1 + §3.6.**
   → **Follow-on for design:** `05-design-system-v2.md` §A5 was specified for a binary badge. The
   **nominal** state needs its own token and must read as *weaker* than measured.

**Also ready to ratify:** OD-5 (needed a *spec*, not a decision — now a **partial** re-fan per
`LEDGER-3`/`LEDGER-11`, with exact user copy), OD-6 (with RFC-004 §3.5.1's rate-limit answer
attached — the one remaining owner call, and it is a Phase-10 item, not a blocker), and **OD-7,
already implemented** (Phase 9 shipped it; the gate brief's claim to the contrary was struck).

**⚠️ THE TRAP FOR WHOEVER PLANS PHASE 8: `VesselType` is `BARREL | TANK` — there is no `KEG`.** No
handoff document mentioned it. It is a **second** enum-only migration and the single most likely way
Phase 8 stalls mid-flight. It goes in **M1** beside `CaptureMethod.DERIVED` + `NOMINAL`; enum values
must be merged **and deployed** before any code writes them.

**Next:** plan Phase 7 (barrel groups) against `RFC-000` §1's migration order — M1 enum-only and
alone, then M2 structure, then M3 enforce.

---

**CELLARHAND UI/UX v2 — PHASE 9: ASSISTANT BEHAVIOUR — MERGED + LIVE IN PRODUCTION 2026-07-30.**
[#566](https://github.com/russellmoss/wine-inventory/pull/566) squash-merged as `408f8aa5`.
CI green (check · review · tenant-isolation · GitGuardian), Vercel Production deploy: success.
Plan: `docs/plans/2026-07-29-105-...-phase9-assistant-behaviour-plan.md` · Council:
`docs/plans/council-feedback-105-phase9-assistant-behaviour.md`. `AssistantDock.tsx` byte-unchanged.

**THE RULE, now live: the assistant NEVER issues a work order.** It creates a `DRAFT` and takes you
to `/work-orders/<id>/edit` — the builder — where you review, edit, cancel or issue it yourself. The
card's primary action reads **Review** (contextual: a Brix-logging card still says Confirm) and it
navigates immediately. Enforced structurally, not case-by-case: `test/assistant-never-issues.test.ts`
fails if any file under `src/lib/assistant/` calls `issueWorkOrderAction`/`Core`, and
`test/assistant-proposal-action-label.test.ts` DERIVES the Review set from the tools directory so a
fifth work-order tool fails rather than shipping "Confirm".

Also shipped: page→dock object context (provider above the dock, uncached tenant-explicit resolver,
XML-escaped); the degraded-AI state from one server-owned gate shared with `/api/assistant`; the
Phase 9 acceptance criteria the handoff never wrote (AC-C18..21, W7..9, N2..3); and `DRAFT` in the
work-orders dashboard — `OPEN_STATUSES` was NOT what decided visibility, a second in-memory filter in
`getWorkOrderDashboard` was. Fixing it surfaced a real invisible draft (#34, overdue since 18 Jul).

🚩 **CARRIED FORWARD — do these before or during the next phase:**
1. **Never QA'd at a NON-ADMIN role.** Phase 9 touches navigation, which is role-scoped, and every
   browser pass ran as the Demo Winery owner. Note `/work-orders/<id>/edit` is admin-only and
   redirects a non-admin to the detail page — a clean degrade, but a cellar hand never sees the
   builder the assistant now sends everyone to.
2. **`routes.ts` `SECTION_ROUTES` has no role gating** while the v2 nav gates admin/feature/vineyard.
   The assistant will walk a cellar hand to `/settings`. Pre-existing; wants its own ticket.
3. **U3, the `AIProposalCard` extraction, was deliberately NOT done.** The chat and voice cards are
   materially divergent (the voice one is sized for a ~620px floor panel, no details table).
   Unifying blind would push that table onto the floor surface or drop the draft gate plan 081 built
   to stop Confirm becoming a reflex — and with no jsdom/RTL neither is catchable by a test.
4. **B33 `ProvenancePanel`** ships with its first real producer. The rule is "the provenance PANEL is
   not shown", NEVER "the statement is not shown".
5. **QA leftovers in Demo Winery:** work orders **#68**, **#69** (and a pump-over from verification).
6. **`Brain Refresh (docs)` scheduled loop is failing on `f7040b7e`** — pre-existing, unrelated to
   this phase, but it is red on main.

⚠️ **Two leftover worktree DIRECTORIES on disk** (`cellarhand-v2-phase-reconciliation-a926e3`,
`skb-knowledge-base-expansion-c58f7c`): git deregistered them but Windows refused to delete the files
(permission denied / file lock). Harmless, but delete them by hand when nothing is holding them.

## 🔭 Also in flight

### ⏸️ Archived 2026-07-28 — the Spray Wave 1 objective block, verbatim

**SPRAY INTELLIGENCE — Wave 1 LANDING: S0 complete · S2 built · S3a SHIPPED · S4 built ·
S2b resumption (Units 1/2/3/5) built + DB-proven 2026-07-27, on `claude/s2b-resume-units-2026-07-27`
(not yet PR'd). ⚠️ Wave 2 (S7a · S8 · S6) is still BLOCKED — coverage is 0% (needs real curated
content, a human's review signature) and a new finding says the shipped resolver doesn't gate on
`reviewedBy` yet either. See [S2b-report.md](docs/spray_assistant/phases/S2b-report.md).**

🟩 **S0 (lane A — the weather-lane spike): COMPLETE. Gate answered, and S1 is NARROWED.**
[report](docs/spray_assistant/phases/S0-report.md) · [QA](docs/spray_assistant/qa/S0-qa-report.md) ·
ADR [0011](docs/architecture/decisions/0011-hourly-weather-retention-and-replay.md) (retention/replay) +
[0012](docs/architecture/decisions/0012-leaf-wetness-estimator-bands-and-refusal.md) (LWD bands/refusal).
No production code, as scoped. 11 units, 100 committed fixtures (566,400 site-hours), 28 goldens,
800 fixture assertions, 7 defects found and fixed.

⛔ **The two-arm gate DID NOT PASS and the pre-committed no-go TRIGGERED — the deliverable is the
narrowing.** Arm B (input validation, the arm council C1 added because Arm A can pass on correlated
error) splits **by regime, cleanly and physically**: dew-point-depression MAE vs station is
**1.22 °C Stoney Hill / 1.72 °C Monticello VA** but **3.18 °C Russian River / 5.07 °C Madera**, against
a 1.85 °C tolerance = half CART's own 3.7 °C node. Both failures are regimes that are **sub-grid at
25 km** (marine-layer boundary, irrigated valley floor). **Two live Demo sites are in the failing set.**
→ **Build S1 for eastern sites on fixed-model reanalysis; California needs station-blending first.**

⚠️ **Five findings that change other lanes — do NOT re-derive:**
1. **The irreversibility is in FORECAST, not OBSERVED** — the reverse of the plan's premise. Observed
   hourly IS backfillable (NCEI ISD + keyless IEM ASOS, past 2005) and the NWS live window is **7 days**,
   not 1–2. What's unrecoverable is *what the forecast said when a grower acted on it*. Also: **REANALYSIS
   is revisable**, so a stored copy can drift from the live archive — a replay hazard nobody had named.
2. **Archive model choice moves 50.6% of infection-event classifications** (`era5` vs Open-Meteo
   `default`). "Best match" is unusable for anything replayed. **ERA5-Land carries NO wind at any site** —
   and wind is a **hard input to the S7b legality gate**, not just a CART input.
3. **Brief §7's pathogen table is materially wrong → S5b's scope GROWS.** Botrytis (Broome 1995) and
   phomopsis (Erincik 2003) ARE LWD × temperature models. ⚠️ Both papers are **paywalled**, so S0 could
   only run coarsened renderings that carried **no gate weight** — S5b must obtain them.
4. **Madera inverted its own purpose**: lowest refusal rate in the set (0.6%) and the worst inputs
   (5.07 °C). Confidence keyed on input **availability** reports its highest value exactly where the
   answer is least trustworthy → the band must carry **provider-vs-station agreement**.
5. **S4 must collect a per-block `canopyManagement` OBSERVATION with a timestamp** (not a static
   attribute — an August decision must ask what the canopy was in July). Liftable paragraph in
   [s0-lwd-estimator-decision.md](docs/spray_assistant/phases/s0-lwd-estimator-decision.md) §4.

⚠️ **Two things still Russell's**: (a) accept the two-zone canopy model (S0 recommends yes — cheap now,
expensive to retrofit, and the one-zone version is anatomically wrong); (b) **how long must a lot's
residue flag stay explicable?** — the one input to ADR 0011 that is inferred rather than stated.

🟩 **S3a (lane C — spray record + planned harvest): SHIPPED.** PR1 [#523](https://github.com/russellmoss/wine-inventory/pull/523) + PR2 [#524](https://github.com/russellmoss/wine-inventory/pull/524) merged; PR3 [#527](https://github.com/russellmoss/wine-inventory/pull/527) **browser-QA'd GREEN** same day (2 findings — area provenance + correction datetime shift — found, fixed `d11c38d8`, re-proven). QA report: `docs/spray_assistant/qa/S3a-qa-report.md`.

🟩 **S2 (registration + resistance master): ALL 12 UNITS BUILT, 3 PRs.**
[PR-1 #522 MERGED](https://github.com/russellmoss/wine-inventory/pull/522) (schema slice, 8 GLOBAL
models + the CHECKs/partial-uniques that make the safety rules uninsertable) ·
[PR-2 #525](https://github.com/russellmoss/wine-inventory/pull/525) **CI green, awaiting merge**
(reg-number gate, APPRIL parse+ingest, lookup service, CA DPR layer, restrictions, source toggle) ·
**PR-3 open** (resistance derivation + coverage report, monthly re-derivation, `verify:pesticide` +
8 boundary guards + PEST-1/PEST-2 invariants).
**Live data in prod tables:** 2,420 active grape registrations · 833 CA-registered on grapes ·
361 AIs with **zero unclassified** (35 CODED / 1 NO_CODE_EXISTS / 325 GAP; fungicide-scoped 153 →
35/1/117). Golden proofs: Switch **9+12** (never 9 alone), Pristine 7+11, captan M 04/MULTI,
Gavel + Fusilade both CA-registered on `GRAPES, WINE`.
⚠️ **Zampro resolves GAP, not 45/40** — plan 086's measured free-source miss, now VISIBLE in the
coverage report rather than silently wrong. Closing it is a Cornell purchase decision;
`biologicalsShareOfGap: 59` is the number to decide against.
⚠️ **The plan's grape regex had a hole** — `/\bGrapes?\b(?!fruit)/` matches "Grape-Ivy" (hyphen is a
word boundary). Fixed + tested. ⚠️ **`exceljs` cannot read the APPRIL dump at all** (fails on the
zip's data-descriptor entries) → unzip-entry + SAX is the primary path (366k rows, ~15 s, ~134 MB).
Cross-lane: the composite `factsAsOf` shape is FROZEN in
[S2-S3a-factsAsOf-contract.md](docs/spray_assistant/phases/S2-S3a-factsAsOf-contract.md) — **S3a
consumes it, does not re-derive it.**
QA: [S2-qa-report.md](docs/spray_assistant/qa/S2-qa-report.md) — one row deferred (the settings-card
click-through needs the main checkout + a user login).

🟩 **S4 (lane D — phenology + growth): SHIPPED. Merged, live on Vercel, browser QA GREEN.**
[plan v2](docs/spray_assistant/phases/S4-phenology-growth-model-plan.md) ·
[council](docs/spray_assistant/phases/S4-council-feedback.md) ·
[QA report](docs/spray_assistant/qa/S4-qa-report.md) ·
[phase report](docs/spray_assistant/phases/S4-report.md).
**PR 1 (schema slice) = [#521](https://github.com/russellmoss/wine-inventory/pull/521), MERGED**,
migrations live in the DB. **PR 2 (Units 3–10, the feature)** on
`claude/s4-phenology-feature-e9b928`. 135 new tests; full suite 4386 pass / 0 fail; `verify:phenology`
24/24; `verify:tenant-isolation`, `verify:naming` (before AND after), `verify:ai-native` (no new tool,
no allowlist entry) all green. Lane boundary held **mechanically** — zero files touched under
`src/lib/{weather,spray,pesticide}`, and the two weather regression tests pass byte-unmodified.
The five council findings that had to survive the build all did: the **STAGNANT leaf-expansion tail**
(a stagnant tip still dilutes at day 7 — v1 would have reported a diluted canopy as fully protected),
**biofix-anchored GDD** (two Bhutan goldens: a February bud break, and accumulation past Oct 31),
**bands never yield a point rate** (range or unknown; the ≥10 cm answer stays exact),
**`undefined` ≠ `false` ≠ `0`** through all five projections (which also fixed a *pre-existing*
`diseasePestSpotted: false` bug), and **`NOT_ASSESSED` ≠ `NONE` ≠ `null`** as a contract test.

✅ **The QA gate closed.** The blocker was not the RLS theory it was first written up as: `field-notes/page.tsx` was the only one of the four vineyard pages gating on a raw `role === "admin"` instead of `isTenantAdminLike` (which already treats a developer as admin-like), so a developer got the admin view on harvest/maps/weather but the manager empty state on field notes. One-line fix in [#529](https://github.com/russellmoss/wine-inventory/pull/529). Browser QA then ran clean: the stage gate fires in all three states (no stage / FRUIT_SET / VERAISON), `shootLengthCm: 0` + `hedgedThisWeek: false` + `clusterDamage: NOT_ASSESSED` all survived UI → action → DB, read-back renders the gap and the clean result as two different sentences in two different tones, bulk-apply refused to copy damage, and mobile 375×812 has no overflow with every control ≥36 px.

📉 **Recorded because it is unflattering, not despite it:** the rolling-4-week scouting coverage —
S5b's sour-rot gate input — is **0/0**. No live block reached `FRUIT_SET` in the window, so the
denominator is EMPTY. **That is "not yet measurable", NOT 0 % and NOT a failed gate**; runbook §9 S5b
now says so explicitly. Re-run `npm run verify:phenology` when S5b is planned.

🏛️ **COUNCIL RE-SHAPED THE PROGRAM** — [RUNBOOK-council-feedback.md](docs/spray_assistant/RUNBOOK-council-feedback.md)
(Codex structure/data-layer + Gemini domain/liability; 10 CRITICAL, 11 SHOULD-FIX, 1 pushed back).
Three genuine defects in the first draft: **(1)** no phase produced the rainfast/mobility/PHI/REI
facts that S6+S7 gates REQUIRE → **new S2b product-facts master** (curated top-60 AIs = 86.5% of
occurrences, free sources; Russell chose curated over buying CDMS/Agrian); **(2)** the dependency
graph was WRONG — S7 secretly needed hourly weather (sulfur×temp, copper×slow-dry) and phenology
(fruit-present), S5 needed S4 (3-10 rule wants shoots ≥10cm) → **split S7→S7a/S7b and S5→S5a/S5b**;
**(3)** one hourly table conflated OBSERVED/FORECAST/REANALYSIS → `seriesKind` + a contract test that
a forecast row can never satisfy a historical read. ⚡ **Russell's call: front-load the deterministic
engine** — Wave 2 now ships legality+rotation (S7a) + the lot-residue moat (S8) + daily powdery
(S5a) with **ZERO dependency on hourly weather**; speculative modeling moves to Wave 3.
⛔ **Best catch (Gemini C8), previously missed entirely: PHI is not a one-time gate.** Plan Oct-10
pick → spray 14-day-PHI Sept 20 (legal) → pull pick to Sept 30 = **retroactive violation, fruit
unsellable, system silent**. Any harvest-date mutation must re-evaluate the trailing PHI window.
⛔ **C6, promoted to CRITICAL: rule "gap→unknown→refuse" + a US-only registry BRICKS the live Bhutan
tenant.** Non-US manual product-facts path is now standing rule §3.9 (same mechanism serves the US
tenant-override case). Other folded: adjuvants invisible to interlocks (captan+organosilicone);
`driedBeforeRain` must be DERIVED not self-reported; protection output is CATEGORICAL not a % (false
precision); wind speed+**direction** distinct columns (CA PUR); facts-as-of snapshot on every spray
(else a monthly refresh silently rewrites past decisions); entitlement moves tool→service layer
(S9/S10 are server components, they'd bypass it); LWD blind to canopy architecture + needs a grower
"calibrate wetness" override; **sour rot CUT** (needs berry-wound + vinegar-fly telemetry we don't
collect → new rule §3.7 "a model may not depend on data the system does not collect"). Export MRLs →
Later, documented. QA safety cases 17→**23**.
New program folder `docs/spray_assistant/` (mirrors `docs/GIS/`):
[SPRAY_ASSISTANT_RUNBOOK.md](docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md) (phases, waves, gates,
ledger) · [discovery brief](docs/spray_assistant/spray-decision-discovery-brief.md) (domain +
honesty + math contracts) · [data-sources design](docs/spray_assistant/spray-data-sources-design.md) ·
[qa/QA-PROTOCOL.md](docs/spray_assistant/qa/QA-PROTOCOL.md) (**standing in-browser gate after EVERY
phase, 15 program-wide safety cases**) · `phases/README.md` (artifact naming + lifecycle).

Goal: a grower talks to the assistant about a spray decision and gets an **inspectable decision
record** — risk, current protection, hard stops, legal windows, application window, and what we
don't know. S0–S11 + SKB in 5 waves, **4 file-disjoint parallel lanes in Wave 1 and 4 in Wave 2**.

📋 **Spray RECORD + PLAN are in scope and are the spine — S3a/S3b, Wave 1 lane C** (Russell asked
2026-07-26). S6/S7/S8 and half of S9 all read the record, so **S3a lands as its own PR and opens
Wave 2; S3b (season program) follows and blocks nothing.** Field inventory transcribed from the real
`docs/spray orders/Spray work order template.xlsx` into brief §17.3 — it is **header + 3 line
tables** (header / materials+REI+PHI / mixing order / per-block acres+times+tanks), and the
**header-line split is load-bearing**: Phase 20 needs "enter once, attribute to N blocks", the
residual model needs per-block facts, compliance keys off the pass. ⚠️ **A plan is intent, NEVER
evidence** — a planned application must never deplete a residual, satisfy a rotation, start a PHI
clock, or enter a compliance record; enforce by TYPE separation, not a boolean (a flag gets read
wrong silently). ⚠️ **ROADMAP Phase 20's note that the template "omits REI + applicator license" is
half wrong** — REI (F7) and PHI (G7) ARE there; only applicator license (+ target pest, weather at
application) is missing. Phase 20 keeps cost/equipment (tractor, rig, gear, tanks/gal, labor, PUR)
and becomes an authoring surface over S3a's row, never a second table.

⛔ **Three findings that shape everything — do NOT re-derive:**
1. **We have NO humidity, NO dew point, NO hourly data, NO leaf wetness.** `VineyardClimateDaily`'s
   `rhMaxPct`/`rhMinPct` are plumbed end-to-end and **every provider writes null** (all 5 declare
   `capabilities:["tmax","tmin","precip"]`; gridMET-via-ACIS grid 21 has no `rmax`/`rmin`). Every
   pathogen model except temperature-only Gubler-Thomas is currently unbuildable. **S0/S1 is the unlock.**
2. **The cheap win:** `forecast-nws.ts` ALREADY calls `/gridpoints/{o}/{x},{y}` for QPF — that same
   response carries **hourly `relativeHumidity`, `dewpoint`, `temperature`** (verified live). One
   parse away from the CART leaf-wetness inputs. Open-Meteo `hourly=` covers non-US + ERA5-Land history.
3. **Structured label values (rates/PHI/REI) are NOT freely machine-readable** — PPLS gives metadata
   + a PDF link; CDMS/Agrian sell the structured layer. Registration + resistance ARE free (EPA
   APPRIL + CA DPR + UC IPM derivation). This is why plan 086 deferred label extraction, correctly.

🔗 **Absorbs [plan 086](docs/plans/2026-07-20-086-feat-us-pesticide-registration-plan.md)** (→ S2 + seeds S3)
and **supersedes VI runbook P9** (weather disease → S5); S0 resolves P9's own "spike an hourly source"
decision gate. Adjacent-not-absorbed: ROADMAP Phase 20 owns the spray *work order*; S3 owns the *record*
it will write — draw that line in S3's plan so we don't build two tables.

<details><summary>✅ PLAN 097 — HOURLY forecast modal (SHIPPED + LIVE #520, 2026-07-26)</summary>

**PLAN 097 — HOURLY forecast modal: SHIPPED + LIVE ([#520](https://github.com/russellmoss/wine-inventory/pull/520) → `4bae9ab6`, deploy success, 2026-07-26).**
Tap a day card → modal graphing that day's hourly temp line + rain bars (NATIVE interval width —
OM per-hour, NWS 3/6h QPF buckets), frost/heat threshold reference lines (crossing hour visible +
in words: "reaches 95 °F around 4 PM"), site-local hours, now-marker, °F/°C per vineyard.
`vineyard_forecast_hourly` (isolation 148 tables) replaced in the same ingest tx; assistant
answers "what time will it freeze tonight?" (crossingTimes). ⚠️ **The modal SELF-HEALS missing
hourly rows** (refresh-once-on-open — Russell's live find on Stoney Hill; a fresh daily forecast
never trips the on-view refresh). Plan `docs/plans/2026-07-26-097-…` (completed). Live proofs:
Madera "reaches 95 °F ~4 PM"; Stoney Hill 1.66 in incl. a real past-midnight bucket; Paro monsoon
rain 13:00–20:00.
</details>

<details><summary>✅ PLAN 096 — Weather forecast + rainfall: ALL 5 PHASES SHIPPED + LIVE IN PROD (2026-07-26)</summary>

**PLAN 096 — Weather forecast + rainfall time-series: ALL 5 PHASES SHIPPED + LIVE IN PROD (2026-07-26, deploy `bcd70e29` success).**
PRs [#514](https://github.com/russellmoss/wine-inventory/pull/514) (P0 foundations) ·
[#515](https://github.com/russellmoss/wine-inventory/pull/515) (P1 rainfall) ·
[#516](https://github.com/russellmoss/wine-inventory/pull/516) (P2 forecast) ·
[#517](https://github.com/russellmoss/wine-inventory/pull/517) (P3 warnings+notifications) ·
[#518](https://github.com/russellmoss/wine-inventory/pull/518) (P4 observability+goldens) ·
[#519](https://github.com/russellmoss/wine-inventory/pull/519) (**deploy fix: the `10 */6` cron
failed EVERY prod deploy from #516 — Vercel Hobby rejects sub-daily crons at DEPLOY time, invisible
to CI/local build; forecast cron is DAILY 15:10 UTC, on-view refresh >6h carries intra-day
freshness; restore 6-hourly only on Pro**). Plan `docs/plans/2026-07-26-096-…` (completed) ·
council `council-feedback-096-…` (Codex+Gemini, 13 folded, 1 refuted). **The forecast strip sits at
the TOP of /vineyards/weather** (Russell: most actionable info first). 7-day NWS (US) / Open-Meteo
(Bhutan, elevation-downscaled to the true site), tiered frost/heat badges + claim-first digest
notifications to all members + all-clears, official NWS banner verbatim, rainfall bars+cumulative
with a 30d/7d/custom range that works in January (year-round ingest, 13,152 rows seeded).
⚠️ Standing gotchas: ONE site-local "today" (site-time-core — never re-add a UTC today);
delete-horizon-then-insert is what "replace" means for forecasts; ai-native's coverage doc goes
stale on ANY core-export change (`verify:ai-native -- --write` before push — it failed #517's CI once).
</details>

<details><summary>✅ Vineyard Intelligence P3 — NDVI DISPLAY (SHIPPED + LIVE #498, 2026-07-26)</summary>

All 11 units, reviewed (4 specialists) + fixed. Plan `docs/GIS/phases/phase-3-ndvi-display-plan.md` (completed) · report
`phase-3-report.md`. ⚠️ **The P3 plan + council files were LOST (never saved) — reconstructed from memory at build time.**
</details>

<details><summary>✅ Vineyard Intelligence P3 — NDVI display (viz half) — SHIPPED + LIVE 2026-07-26 (#498)</summary>

Schema (`SpatialDatasetDerivative` + `SpatialStyle`, RLS applied to live DB, `verify:tenant-isolation` 141 tables) ·
`warp.ts` UTM→north-up-3857 (council #1, **sub-pixel registration test is the merge gate**) · `resolveDomain` +
min-spread clamp (#4) · NDVI value histogram · Int16×10000/−32768 derivative cache (#6, idempotent claim-first) ·
serving route (zero-dep `node:zlib` PNG + ETag/must-revalidate #7) · `SatelliteMap` raster arm · map UI (6 modes,
palette, legend+badges) · locked-domain side-by-side comparison + saved styles · `compare_ndvi_dates` tool.
- **Proven:** registration gate (synthetic + real fixture), `verify:ndvi-display` 20/20, `verify:ndvi`/`ai-native`
  green, 103 gis tests, tsc+eslint clean. Browser-QA'd Demo Winery (`qa_ndvi_display_vy`): overlay registers on
  block outlines, modes re-domain live, nearest→pixelated, styles apply, 2-date locked comparison renders.
- ⚠️ **Gotchas:** (1) UTM raster on a 3857 basemap misregisters ~10 m — **WARP first**, only the registration test
  catches it; (2) `SpatialStyle` SYSTEM uniqueness needs PARTIAL indexes (Postgres NULL ≠ NULL); (3) `@vercel/blob`
  now needs `allowOverwrite:true` for deterministic-key idempotent writes (latent P2 bug, fixed); (4) Leaflet
  `imageOverlay.getElement()` is null before onAdd — set `image-rendering` AFTER `addTo(map)`.
- **Deferred (documented):** pixel B−A diff MAP (per-block delta ships via the tool); analytical 3×3 stored
  smoothing; polygon-exact display clip (v1 = estate AOI masked to valid pixels); TENANT-scope styles.
</details>

**⚡ P4 soil (Wave 1 lane B) — ✅ BUILT + LIVE-QA'd on `feat/vi-p4-soil`, PR #502 MERGING (2026-07-26).**
All 9 units committed (8 feat commits + planning). Migration `20260725140000_soil_snapshot` **applied to prod**
(additive, Bhutan untouched). Gates: tsc 0, **vitest 4024/0**, **`verify:soil` 23/23** (e2e DB, injected SDA),
`verify:tenant-isolation` (+soil RLS), `verify:invariants` 39/39 (SOIL-1), `verify:ai-native`, `verify:naming` 25/25.
**Live browser QA PASSED** (in-app pane, Demo): pulled a real Finger Lakes block through the UI → live NRCS →
6 soil cards (Mardin 39% pH 6.6, Volusia 26%, Valois 18%…) + "Other (4 slivers <1%)" with Water folded+retained,
100% covered, survey NY123; DB read-back matched (9 comps, geodesic areaSqM 912,832). Plan:
[phase-4-soil-documentation-plan.md](docs/GIS/phases/phase-4-soil-documentation-plan.md) · council (11 findings folded):
[phase-4-council-feedback.md](docs/GIS/phases/phase-4-council-feedback.md).
✅ **SOIL MAP OVERLAY ADDED (2026-07-26)** — the deferred Wave-4 item, de-risked by a live geom spike (clipped
`STIntersection.Reduce.STAsText` = ~10 KB/block). Best-effort 3rd SDA call stores block-clipped display
geometry (`displayGeometry` column, migration `20260726120000`); pure WKT→GeoJSON + per-map-unit **colored
vector overlays via P1's `overlays` prop (ZERO SatelliteMap-internals change)**; **"Soil layer" toggle + color
legend on `/vineyards/maps`**. Live browser QA: toggling painted **18 soil polygons inside the block** (paths 1→19),
Water in a distinct blue, legend "39% Mardin / 26% Volusia / …". `verify:soil` 24/24 (+geometry stored, EMPTY
dropped); 30 overlay unit tests. ⚠️ QA fixture "QA-Soil Overlay Vineyard" left in Demo for viewing — clean up after.

▶️ **PR OPEN → [#502](https://github.com/russellmoss/wine-inventory/pull/502)** (soil docs + map overlay + click-panel + labels). Merged `main` (P3 #498) in. Post-merge + follow-on gates green (vitest **4060/0**, verify:soil 25/25, invariants/ai-native/tenant-isolation).
✅ **SOIL AUTO-PULLED FOR EVERY US VINEYARD BLOCK (2026-07-26).** Soil was on-demand only → most US vineyards
were empty. Now a `runSoilSweep` (idempotent `pullBlockSoil` per block: cached no-op/non-US skip/missing pull,
capped per run) + daily cron `/api/cron/soil-sweep` (CRON_SECRET, mirrors ndvi-poll) + `npm run backfill:soil`.
Backfill ran: **all 13 Demo US blocks now have soil** (WV Oregon, Oakville, RRR…); Bhutan's 5 skipped (non-US).
✅ **TWO MAP PAGES FOLDED INTO ONE "Map Explorer" at `/vineyards/maps` (2026-07-26).** The old NDVI console
(`/vineyards/ndvi`) + block-summary map merged into a single layer-stack explorer: blocks + NDVI + soil,
toggle + reorder + click-inspect. **The map now renders even with no NDVI scene** (NDVI is one optional layer)
so a soil-only vineyard still gets a map. `/vineyards/ndvi` → permanent redirect (links/bookmarks/assistant
navigate keep working); single nav entry; old `MapsClient` modal retired (block details + soil cards still on
`/reference`). Live QA: /maps=explorer, /ndvi redirects, RRR shows NDVI+soil, no-scene vineyard shows map+soil.
✅ **SOIL LAYER ON THE NDVI MAP (2026-07-26)** — `NdviMapPanel` now stacks NDVI + soil via a `MapLayerControl`
(per-layer visibility toggle + up/down reorder, top-of-map-first) → ordered `overlays` painted bottom→top.
**Live QA on Russian River Ranch: NDVI raster + soil polygons render together** (labels FaD/HtC/GdE), toggle
each on/off, reorder flips the stack (verified NDVI↔Soil top swap), click a polygon → tabbed panel. The user's
"don't see it" was because soil was only on `/vineyards/maps`, not the `/vineyards/ndvi` page — now fixed there.
✅ **CLICK-TO-INSPECT + LABELS ADDED** — click a soil polygon → tabbed detail panel (Overview/Chemistry/Physical/Source via `Tabs`); map-unit symbol (`musym`, e.g. "MdB") fetched+stored per unit and painted centered in each polygon (permanent center tooltip). `SatelliteMap` extended additively (`onOverlayFeatureClick` + overlay `label`) — no fork. **Live QA: labels render (62B/68B/152B/77B… centered in polygons); click-panel is code+unit-test verified** but the flaky in-app pane unmounts the modal between JS calls so the live click screenshot couldn't be captured (user can click it). ⚠️ QA fixture "QA-Soil Overlay Vineyard" + dev server left up for viewing — clean up after.
⚠️ Shares `prisma/schema.prisma` + the shared prisma CLIENT
with the parallel P3/P8 lanes — **`prisma generate` gets clobbered by their generates; regenerate right before any
tsc/verify/dev-server run.** P3 display migrations (`..._ndvi_display_*`) are already in prod but not on this branch (fine).

<details><summary>✅ VI P8 — Weather & Climate spine — SHIPPED + LIVE to main (#500–#511, 2026-07-26)</summary>

`docs/GIS/phases/phase-8-weather-climate-spine-plan.md` (BUILT) · report `phase-8-report.md`. **All merged + live in prod.**
**Migration `20260725150000_weather_schema` is APPLIED to prod**
(bumped past the parallel P3 `ndvi_display` + P4 `soil_snapshot` slices already in the DB).

**Post-spine follow-ons shipped (all live):**
- **Station/source selector + clickable Leaflet station map** (#504) — grower picks which station reports.
- **Winkler long-term normal (10/20-yr selectable) + WSU-style cumulative GDD chart** (#505–#508) — °F, base 50°F,
  April–Oct, 5 comparison lines (longterm/cool/hot/last/current), interactive crosshair scrub + zoom (±/pinch/drag-pan).
- **#509 — "No tenant context" fix**: server actions now wrap ingest in `runAsTenant()` (`requireTenant()` helper);
  dataless-primary fallback in `read-core` + `selectPrimaryCore` skips completeness-0 stations (Madera read 0 → fixed).
- **#510 — non-US vineyards (Bhutan) get weather**: `resolveVineyardCentroid` fallback chain adds the grower's **GPS pin**
  (`VineyardDetail.gpsLat/gpsLng`); `backfill-core` uses **NASA POWER** (global, keyless) where gridMET has no coverage.
  Manually primed 7 of 8 Bhutan vineyards (Gelephu has no pin yet).
- **#511 — durable sweep auto-prime**: the daily cron (`/api/cron/weather-poll`, 15:40 UTC) now enumerates ALL active
  vineyards and primes any located-but-empty one (current season + 20yr backfill + `weatherAutoRefresh` on), capped 30/run.
  ➡️ **Gelephu will self-populate on the next cron run once its GPS pin lands** — no manual step needed.

**Proven with REAL live data** (Russian River Ranch + Bhutan) + a deterministic fixture gate:
- 3 tenant tables (fact-table `vineyard_climate_daily` + 1:1 `vineyard_weather_config` + daily-keyed
  `weather_provider_usage`); 6-provider registry (gridMET-via-ACIS, RCC-ACIS station, NASA POWER, USGS EPQS
  LIVE; Daymet+CDO fixture-tested); ingest (344 rows/4.7s, obs-shift visible); `query_climate` tool (R9
  freshness fallback + operating-tz-beats-viewer both proven live); grower card (browser-rendered real data:
  GDD 656.5, Winkler I, GST 18.42 Warm, **3-source spread 499–656**).
- Gates: `verify:weather` 12/12, `verify:tenant-isolation` ✓, `verify:ai-native` ✓, 46 weather unit tests, +4 goldens.
- ⚠️ **Isolated worktree Prisma client** (copied @prisma into worktree + generated) so DB/dev-server work here
  never touched the P4 session's main-checkout client. `.env` copied into worktree (gitignored).

**Follow-ons (small):** alert INBOX EMIT stubbed (detection done); explicit weather case in
`verify-tenant-isolation.ts`; gridMET RH needs a direct adapter (4B); doc weave (brief §13/§14 + runbook
ledger); **merge the code PR after P3/P4 slices settle** (Unit 1 migration already in prod).
</details>

<details><summary>✅ Vineyard Intelligence P2 — NDVI core (data half) — SHIPPED + LIVE IN PROD 2026-07-25</summary>

All 11 units merged: schema slice **[#495](https://github.com/russellmoss/wine-inventory/pull/495)** + feature units
**[#496](https://github.com/russellmoss/wine-inventory/pull/496)** (squash-merged to main; prod deploy `B6D8Lm9H` success).
Plan `docs/GIS/phases/phase-2-ndvi-core-plan.md` (completed) · report `phase-2-report.md`.

- 5 tenant-scoped tables (`spatial_scene`/`spatial_dataset`/`spatial_analysis_job`/`block_spatial_metric`/`cdse_usage_counter`)
  + `vineyard.ndviAutoAdd`; `geotiff.js` decoder (bit-exact vs P0 tifffile); C1 idempotent-materialization outbox;
  block metrics (mask gate + Y-FLIP + 0.5 floor); sweep+cron (DARK auto-add); quota; `process_ndvi`/`query_ndvi_stats`
  assistant tools; thin console `/vineyards/ndvi`.
- **PROVEN via `verify:ndvi` (DB e2e) + TWO browser-QA passes** (Claude-in-Chrome, Demo login): per-block NDVI means land
  in the DB (0.591/0.768/0.670; live Oakville 0.443 in UTM 10N), full provenance, C1 idempotency, WITHHELD/low-coverage.
- ⚠️ **NEW gotchas (see [[vineyard-intelligence-p2-plan]]):** (1) CDSE non-square pixels → `buildProcessRequest` snaps UTM
  bbox to 10 m; (2) the Y-FLIP (`rasterRow = H-1-gridRow`); (3) the adopt path must persist COMPLETED to the JOB ROW,
  not just return it (browser QA caught the IN_FLIGHT leak — `verify:ndvi` now asserts the row); (4) console all-access =
  `isTenantAdminLike` (admin OR developer), not `role==="admin"`; (5) scripts driving the adapter need `--conditions=react-server`.
</details>

<details><summary>Grower module → Vendor parity (plan 095, #489) — SHIPPED (PR #493, live in prod)</summary>

<details><summary>Grower module → Vendor parity (plan 095, #489) — SHIPPED (PR #493, live in prod)</summary>

Third-party growers auto-link to a QBO-synced Vendor, estate growers don't. Schema + 2 migrations, write core,
`create_grower` tool, `/setup/growers` UI, isolation cases. ⚠️ Deploy was blocked ~20h by a PRE-EXISTING
`.vercelignore` bug (shipped `scripts/` not `test/`) — see [[vercelignore-scripts-test-build-break]]. **CI green ≠
Vercel build green when `.vercelignore` strips files.**
</details>

<details><summary>Vineyard Intelligence P0 — GO verdict (done, unshipped)</summary>

**P0 COMPLETE — VERDICT: GO on the no-worker architecture.** All 16 units on
`spike/vi-p0-no-worker` (pushed, **no PR yet**). Runbook §7 ledger flipped to 🟩.
[ADR 0009](docs/architecture/decisions/0009-vineyard-intelligence-no-worker-architecture.md) ·
[phase report](docs/GIS/phases/phase-0-report.md). 3891 tests green.

At realistic scale (~50 ha, 20 blocks): **390 ms** compute, **451 MB** peak RSS, against
pre-committed limits of 5000 ms / 512 MB. Clipping sub-quadratic in vertices (10×→5.3×), nearly flat
in blocks (10×→1.5×). Coverage validated **cell-by-cell** vs `exactextract` (292 cells, max 2.95e-8,
every non-zero diff explained by the ORACLE's float32). Live scene: 342×342 px, 767 KB, 2153 ms,
0.892 PU, 80.8% valid, block NDVI means 0.281–0.709.

⛔ **Five things not to re-derive** (all now corrected in runbook rule §2.13 itself):
1. **`harmonizeValues` is BACKWARDS.** Baseline guard is `units:"REFLECTANCE"`; the flag only clamps
   negatives, and clamping fabricates `NDVI = 1.0`. Pin it **false**.
2. **Baseline is NOT in the Process API** — needs a CDSE **STAC** `processing:version` call.
3. **`resx:10` under CRS84 = 10 DEGREES** → "3504.23 m/px exceeds 1500". Needs a METRIC CRS.
4. **SCL must be `DN`**, in a `units` ARRAY parallel to `bands`. Two input objects → "Dataset with
   id: 1 not found".
5. **Weighted type-7 quantiles IGNORE their weights** (median 50.5 for `[1×9, 100×1]`). Pinned the
   midpoint form instead.

⚠️ **Constraint is MEMORY, not time** — 451/512 MB. Scale-register tripwire at 400 MB or ~2M px.
⚠️ Free tier binds on **REQUESTS** (10k/mo), not PU → one estate-wide raster, clipped N ways.
Dev-only Python tools: `pip install exactextract numpy tifffile`. Runtime deps 22→23 (`proj4` only).

▶️ **NEXT:** `/review` then `/ship` the P0 branch (16 units, no PR yet). Then Wave 1 opens:
**P1 planting geometry ⚡ P4 soil cards ⚡ POF offline** — P4 and POF never depended on this verdict.

✅ **P1 SHIPPED TO PR — [#494](https://github.com/russellmoss/wine-inventory/pull/494) open (branch merged w/ main, CI running). Runbook §7 → 🟪 QA.**
[phase-1 plan](docs/GIS/phases/phase-1-planting-geometry-plan.md) · [council](docs/GIS/phases/phase-1-council-feedback.md) ·
[phase report](docs/GIS/phases/phase-1-report.md). tsc 0, **172 GIS/assistant tests green**,
**`verify:planting-geometry` 13/13** on the real Demo tenant (create→blade-split zero-lost-area→IoU
version→migration byte-identical), `verify:tenant-isolation` + `verify:ai-native` green. Additive migration
`20260724120000_planting_geometry` APPLIED to prod (new tables + nullable cols; Bhutan untouched).
✅ **Browser QA PASSED** (2026-07-24, via Claude-in-Chrome on the user's real browser — the in-app browser
refuses the HTTP localhost origin here). Russian River Ranch: migration proposed **2 separate plantings**
(not bridged), confirmed all-or-nothing → 2 DERIVED areas + yellow boundary overlay + migrated badge;
assistant answered structure Q&A. ⚠️ **RRR is now migrated in Demo (real QA write)** — revert available. ⚠️ **`next dev` regenerated a STALE Prisma client** (dropped
the new models, tsc 0→60) — stop the dev server before `prisma generate`; regen after adding models.
⚠️ **Standing P2 obligation:** warn-only topology means P2 must RE-VALIDATE the mask before NDVI stats.
Council changed two architecture calls before any code:
1. **Boolean geometry kernel = `jsts`, NOT `polyclip-ts`.** Recentring to UTM fixes OUR arithmetic but NOT
   the martinez family's internal coincident-edge failure P0 rejected — it's a precision-model problem, not
   a coordinate-scale one. JSTS `GeometryPrecisionReducer` + `OverlayNG` + native line-splitter.
2. **Split = true line-split ("blade"), NOT buffer-and-corridor.** Corridor-difference destroyed the shared
   row-middle boundary and minted a permanent gap = unassigned area. Blade produces adjacent blocks sharing a
   mathematically identical edge, zero lost area.
Russell's four decisions: **JSTS** · **IoU-gated versioning** (IoU>0.98 = trace correction in place, no stale
cascade; ≤0.98 = new version + mark stale) · **all-or-nothing per-vineyard migration** (`Vineyard.plantingMigratedAt`
gate) · **warn-only topology** (chose the non-recommended option — saves never blocked; **consequence: P2 must
re-validate the mask before computing stats**, carried to the P2 plan + registers).
Also folded: pinned+persisted canonicalization anchor in the fingerprint (else the same shape hashes two ways);
version-bump concurrency = subject row-lock + partial-unique on the open row + stale-write guard; migration
pre-flight topology (never silently heal overlaps, strict <1 m grouping so it can't bridge a road); area shown
as "Productive area" (spacing) primary + "Boundary footprint" (geodesic) secondary.
▶️ **NEXT:** browser-QA `/vineyards/planting-setup` on Demo (user logs in), then `/review` + `/ship` the branch (schema-slice commit can be its own PR). P2 (NDVI core) unblocks once P1 lands.

<details><summary>Planning + council + repo cleanup (done)</summary>

**Vineyard Intelligence P0 — plan 094 WRITTEN + COUNCIL-REVIEWED, not yet built.**
Plan: [2026-07-24-094-…](docs/plans/2026-07-24-094-spike-vineyard-intelligence-p0-plan.md) (16 units).
Council: [council-feedback-094](docs/plans/council-feedback-094-vineyard-intelligence-p0.md).
P0 is the Wave-0 solo gate — `P1←P0`, `P2←P0+P1` — proving or killing the **no-worker** architecture.

Both reviewers **confirmed** the load-bearing claim (fractional coverage is polygon ∩ *convex* rect,
so hand-rolled Sutherland–Hodgman is exact, zero deps) and both said the first draft's *instrument*
would have blessed a wrong architecture. Six structural fixes folded in; Russell chose all three
recommended options (add `proj4` for the spike · estate-wide fetch · prove the canvas paint in P0).

⛔ **Five things not to re-derive:**
1. **`harmonizeValues` does the OPPOSITE of what runbook §2.13 says.** In REFLECTANCE units the BOA
   offset is applied *regardless*; the flag only clamps negatives to zero → clamped `B04=0` yields a
   fabricated `NDVI = 1.0`. Real guard = pin `units: "REFLECTANCE"` + `harmonizeValues: **false**`.
   **Runbook §2.13 + §5 need correcting (Unit 15).**
2. **The processing baseline is NOT in the Process API response.** `inputMetadata.serviceVersion` is
   Sentinel Hub's service version, not the ESA baseline. Use the CDSE **STAC** `processing:version`.
3. **Free tier binds on REQUESTS (10k/mo), not PU** — a 50 ha request is ~0.038 PU. Per-block fetching
   burns 50 requests per look; **one estate-wide raster = 1 request**. Hence the fetch-shape decision.
4. **S-H exactness has a ULP precondition.** Clipping must *assign* the exact edge scalar
   (`intersect.x = pixel_max_x`), never lerp it — else U-shape bridges stop cancelling and area leaks
   **silently**. And Unit 1 must *reject* self-touching/self-intersecting rings: signed area is
   algebraic, not geometric, for those.
5. **`polyclip-ts` is the WRONG fallback** (was in the first draft). `setPrecision` is process-global
   with never-reset snap trees, 3–5× slower when set, and a *larger* epsilon can make failures worse.
   Fallback is **`jsts`** (real `PrecisionModel` + snap-rounding).

✅ **Unit 0 credentials CLEARED + verified live (2026-07-24).** CDSE `client_credentials` grant works
(~0.6–1.2 s); 📌 **`expires_in = 1800 s` (30 min)**, confirmed against the JWT `exp − iat` — CDSE does
not document this, so it is a measured fact, and Unit 10's 120 s skew is 6.7% of it.
`BLOB_READ_WRITE_TOKEN` already existed in Vercel (store connected 9 d ago) and was pulled into local
`.env` append-only after a `.env.bak-<ts>` backup (47 → 48 vars). 🎯 **The research's one UNVERIFIED
item is now CONFIRMED: private blob + `Range` → HTTP 206** (put 464 ms, ranged GET 4 B in 327 ms, probe
deleted) — so a range-indexed raster layout on Blob is viable and Unit 12 shrinks to latency only.

✅ **Unit 0 fully CLEARED (2026-07-24).** Three commits on `claude/vineyard-intelligence-phase-defad5`,
**not yet pushed / no PR**:
`931595b0` docs/GIS tracked · `eb09ecf8` plan 094 + council · `7a5647ea` proj4.
`npm ci` restored this worktree (688 pkgs; leaflet/@geoman-io/@turf/polyclip-ts/@types/geojson were in
the lockfile but absent from disk). `proj4@2.20.9` + `@types/proj4` added — round-trip error **0.00 mm
(UTM 18N) / 1.46e-6 mm (UTM 46N)**, and recentring headroom measured at **ULP 1.57e-10 m @ 705 km
easting vs ~2.2e-14 m recentred** (the ~4 digits Unit 2 claims). `tsc --noEmit` clean;
**3,660 tests green**, 0 failures.

⚠️ **`docs/GIS/` was committed to THIS BRANCH, not `main`** — the main checkout is in **DETACHED HEAD**
at `6082be2a` (a commit there would dangle), and `main` is checked out in the
`virginia-fruit-ipm-knowledge-8ba0f8` worktree. The detached HEAD is pre-existing and worth fixing.
Also: `.env.bak-20260724-081051` holds secrets — gitignored, delete when comfortable.

▶️ **NEXT:** push + PR the three commits, then `/work` the plan. P4 (soil) and POF (offline) do **not**
depend on P0's verdict and can start anytime.

</details>

</details>

<details><summary>Previous objective — /bug-triage merged-sweep fix (done, live on main)</summary>

**`/bug-triage` re-offered SHIPPED code as new work — FIXED and LIVE on `main` ([PR #478](https://github.com/russellmoss/wine-inventory/pull/478), squash `0b649b74`).**
New **Merged Sweep** phase + boilerplate-plan-issue detection. `.claude/workflows/` is outside the
auto-fix fence, so #478 took an owner merge rather than the automation.
⚠️ **A worktree only picks this up on a fresh checkout** — sibling worktrees still carry the OLD
`bug-triage.js`. Run `/bug-triage` from a checkout at `origin/main`.

</details>

<details><summary>Previous objective — PLAN 091 voice pronunciation (done, in prod)</summary>

**PLAN 091 — voice pronunciation. DONE. #464 RESOLVED, in prod (#474 + #477, squash `b2dcd70e`).**
Russell's verdict on the phoneme build: "WAY better than what we had."
Plan: [2026-07-23-091-…](docs/plans/2026-07-23-091-feat-voice-pronunciation-lexicon-plan.md).
Audit: [docs/kb-eval/pronunciation-lexicon-audit.md](docs/kb-eval/pronunciation-lexicon-audit.md).

Landed: TTS switched to `eleven_flash_v2` (honours inline `<phoneme>` tags, **same ~75ms**
as v2_5, English-only which this app already is); 11 CMU-Arpabet phoneme rules + the
EC-1118 expansion; the matcher, the miner, and the rejected screen as a negative result.
3,653 tests green.

⛔ **Three things not to re-derive:**
1. **`eleven_flash_v2_5` SILENTLY IGNORES phoneme tags.** Accepts them, changes nothing,
   no error. Plan 091 ruled phonemes out on this basis and wrongly assumed any model
   change cost latency — it doesn't, and that mistake cost a whole wasted build round.
2. **The TTS→STT screen does NOT work, structurally.** STT outputs the word you MEANT
   regardless of pronunciation — exactly the signal being measured. It passed Syrah and
   Saccharomyces (both wrong) and flagged a correct `cellar` as *seller*. Ear only.
3. **A model switch re-rolls EVERY word, not just tagged ones.** `bâtonnage` had no rule,
   passed on v2_5, regressed on v2. Re-listen to the whole batch after a model change.

▶️ **NEXT — Pronunciation Settings (Russell asked for it, not yet planned).** Type a word,
record yourself saying it, pick the matching playback; developer entries global, tenant
overrides on top (mirror `KnowledgeSource` — resolve globals at READ time, do NOT copy
into tenants, or you repeat the SYSTEM_TEMPLATES gap). Speech→phoneme is the risky step:
propose candidates, let the ear confirm. Also: `toSpeakable` runs client-side too, so
per-tenant rules mean moving lexicon application into the speak route only.

</details>

🟩 **S5a (lane C — powdery index + latent-infection ledger): LEDGER BUILT AND VERIFIED; the index is
a NO-GO.** [phase report](docs/spray_assistant/phases/S5a-report.md)
[probe report](docs/spray_assistant/phases/S5a-diurnal-fidelity-probe.md) ·
[plan v2](docs/spray_assistant/phases/S5a-powdery-index-latent-ledger-plan.md) ·
[council](docs/spray_assistant/phases/S5a-council-feedback.md)

⛔ **The pre-committed no-go TRIGGERED again — all 8 sites failed.** Gubler-Thomas point deltas were
scored from Felber et al. 2018 reconstructions against **genuine station hourly METAR** (IEM ASOS,
6 seasons/site, Wilson CIs), not ERA5 — council C2's methodological fix. The failure is **structural,
not tuning**, on four independent lines: a sawtooth control performs as well as the calibrated model;
our sites violate its shape assumptions *far less* than the sites it was calibrated on (0.2–1.4% vs
Felber's own 27%); consecutive-hours-in-band MAE is **2.2–3.4 h against a rule thresholded at 6 h**;
and Savalkar's monthly-station-statistics mitigation lifted no station-oracle site (it made Stoney
Hill *worse*) because that >75% error reduction was for a smooth accumulator and this is a
narrow-window threshold counter — plan §1.2 confirmed by measurement.

**The error runs in the crop-loss direction:** G1 unsafe-miss breaches its 2% bar at six of eight
sites, worst **13.6% at Madera** — the same site S0 flagged for reporting its highest confidence on
its worst inputs. **Unlike ADR 0012 there is no regime split to narrow to:** the best oracle in the
fleet (Russian River, 3.7 km) scored *worse* than a 9.8 km one.

→ **S5a ships the LEDGER ONLY. The powdery index moves to S5b behind S1, which is now load-bearing
for powdery mildew and not only for leaf wetness.** Units 3–4 (`diurnal-core`, `powdery-core`) do
not ship as a risk engine.

✅ **The ledger is BUILT, migrated to prod, and verified.** Units 1, 2, 5, 6, 7, 8, 9, 10, 11 all
landed: `latent_infection_event` (append-only, RLS, 7 CHECKs), the resolution rules, the read seam,
`query_spray_decision` **thin + hard-refusing** (first `SPRAY_CONTRIBUTORS` entry), 26 unit tests,
and **`verify:latent-infection` — 43 assertions green against the live DB**. `verify:invariants`
49/49, `verify:tenant-isolation` green incl. 6 new cases, `verify:ai-native` green, build green.

⚠️ **The append-only trap, worth remembering repo-wide:** `GRANT SELECT, INSERT` does NOT make a
table append-only — `ALTER DEFAULT PRIVILEGES` already granted `app_rls` full DML on every new
table, so a narrow GRANT changes nothing. It needs an explicit **`REVOKE UPDATE, DELETE, TRUNCATE`**.
Caught only by test-applying the migration to a disposable Neon branch; `prisma validate` checks the
Prisma schema, not the SQL. See [[append-only-needs-revoke-not-grant]].

✅ **Bhutan's 8–9 °C weather gap — ESCALATED FROM S5a AND NOW FIXED (PR #536).** It was elevation,
and it was resolvable. NASA POWER publishes the elevation of the grid cell it answers with
(`geometry.coordinates[2]`) and the adapter was discarding it: **Bajo's cell sits at 3,038 m against
a vineyard at 1,229 m.** Re-sampling ERA5 at POWER's own cell elevation collapsed the bias from
**−9.71 °C to +1.80 °C** across all 8 sites at a 4.7–6.1 °C/km lapse rate. Two parts, because either
alone would be wrong: an **ERA5 archive provider passing `elevation=`** (POWER rows are deliberately
NOT lapse-corrected at ingest — that would put a derived number in a column contracted as "the
SINGLE source of this row"), plus **`source-fidelity-core`**, which WITHHOLDS hard-boundary
classifications when the source's own reported elevation is >300 m off the site, while still
rendering the raw series, GDD and GST. Winkler classes are ~278 °C-days wide — 1 °C moves the label,
so there is no "approximately right" region. Live: Bajo Region I "too cool" + fabricated April
frosts → **Region V "very hot", 0 frosts**; three sites that read identically are now distinct.
`nasa_power` rows kept as a second source, so it is reversible. **The guard proved itself
mid-backfill** — Open-Meteo 429'd on Paro, ingest fell back to POWER, and the card withheld Paro's
classifications instead of showing the old wrong ones.
⚠️ **This does NOT reopen S5a's index NO-GO** — Bhutan was `consistency_only` tier, the gate is
per-site and never averaged, and the six US sites failed independently against genuine station METAR.
🪝 **Left alone, found in passing:** Gortshalu / Lingmethang / Norzinthang have NO forecast rows at
all (`vineyard_forecast_daily` empty for them). Separate issue.




**SPRAY INTELLIGENCE S3a (lane C) — plan written + council-reconciled, READY FOR `/work`
(2026-07-26).** Branch `claude/s3a-spray-application-record-2572f2`. The spray application record
(header + material / mixing-order / block lines) + planned harvest date as an audited event stream.
**Blocks Wave 2** (S7a, S8, S6, S7b, S9). Plan:
[phases/S3a-spray-record-plan.md](docs/spray_assistant/phases/S3a-spray-record-plan.md) · council:
[phases/S3a-council-feedback.md](docs/spray_assistant/phases/S3a-council-feedback.md).
3 PRs: schema slice first → domain cores (**this is what unblocks Wave 2**; the UI is NOT on the
critical path) → minimal surface + QA. Council reversed one decision: **a correction COPIES the
facts snapshot, never re-resolves it** (re-resolving would repaint a July spray with November's
registration data — rule §3.8). Open for Russell: D1 canonical-metric storage for a US regulatory
record · D2 assistant allowlist tier · D3 the 24 h segment-gap threshold.
⚠️ Three sibling lanes are planning concurrently — `prisma/schema.prisma` and the runbook ledger are
shared; schema slices serialize.

**PLAN 090 — UNITS 1-10 DONE (18 commits, NOT pushed). RE-INDEX COMPLETE (606 docs), DIFF JUDGED.**
Plan: [2026-07-22-090-…](docs/plans/2026-07-22-090-fix-kb-rag-retrieval-quality-plan.md).
Verdict: [docs/kb-eval/DIFF-090.md](docs/kb-eval/DIFF-090.md). `verify:knowledge-base` **21/0**.

**IVES Technical Reviews — LIVE and MERGED (#465).** 209 docs / 3,316 chunks, default-ON for both
tenants, **209/209 dated (100%)** vs ~31% corpus-wide. Default-on is the MEASURED position: staged
`false` → crawled → enabled for Demo alone → `verify:kb-register` vs the pre-IVES baseline →
**4/120 slots moved (3%, cap 25%)**, 17 of 20 questions untouched. Baseline re-captured so the
accepted state is the new reference.

⛔ **The licensing ADR (0009) is DECLINED — Russell, 2026-07-22. Do NOT re-propose it.** Facts live in
each `KnowledgeSource.license`. IVES is the ONLY source with a real CC BY grant; every other rests on
an absence of objection. VT asserts copyright with no licence (accepted risk).

⚠️ **Two bugs their smoke test caught while reporting `5 docs / 70 chunks / 0 errors` — read the rows
back, never trust the tally:** `indexDocument` writes `publishedAt`/`canonicalTitle` **unconditionally
including null** (so all 209 would have been undated — fixed by re-applying OAI metadata AFTER
indexing), and an OAI record carries one `<dc:title>` **per language**, so first-match filed English
articles under German titles.

🔗 **Their filed-not-fixed breadcrumb issue is the SAME defect plan 090 fixes**, and their note that
"fixing the code does NOT fix the corpus — it needs a re-crawl per source" is exactly right. Plan 090
supplies that re-crawl (`npm run reindex:knowledge`) and has now run it across **all 1,378 PDF
documents**. IVES itself is HTML, so it is NOT covered by that pass and still carries the polluted
title — it needs the same treatment.

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

**PLAN 086 — US pesticide registration + resistance-group coverage. ABSORBED INTO SPRAY INTELLIGENCE
(2026-07-26) — do not work it standalone.** Units 1–3, 5–7, 9, 11 → **S2**; Unit 10 (spray record) seeds
**S3**; Unit 8 (assistant tool) → **S11** so the program ships ONE composite tool, not two. Its Key
Decisions, measured Unit-4 de-risk, and Risks tables carry over verbatim — read it before planning S2/S3.
See [SPRAY_ASSISTANT_RUNBOOK.md](docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md) §2.
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


1. ✅ **POPPED 2026-07-28 — assistant false-source-denial (Gironde) + the eval-fixture gap it led to,
   both FIXED and merged.** Grew directly out of entry 2 below (the corpus-repair campaign): Russell
   live-tested the assistant post-repair and it told him **"I don't have anything from the Chambre
   d'Agriculture de la Gironde"** — a real, live, `defaultEnabled` French source with 17 documents.
   Calling `search_knowledge_base` for the SAME question returned `found: true` with that exact
   publisher's passages in 4 of the top 6 results, correctly cited. Retrieval was never the bug — the
   model was handed good, on-topic, cited passages and told the user it had none, apparently
   over-indexing on well-known English sources (Cornell/UC Davis/OWRI/AWRI) and treating anything
   unfamiliar or non-English as "not in this app." Two follow-up test questions Russell tried live
   both still failed before the fix landed.
   Fixed in **[#556](https://github.com/russellmoss/wine-inventory/pull/556)** (merged `bbc3a087`): a
   new deterministic runtime guard (`retrieval-overclaim-guard.ts`, mirrors the existing write
   over-claim guard) detects a "no KB coverage" claim in the model's text when
   `search_knowledge_base` actually returned results that turn, injects a one-shot repair prompt
   (look again, translate/cite non-English passages rather than discarding them), and a `finally`
   correction backstop if the repair doesn't land. Plus tool-description rule 10: "if a passage came
   back, you have that source — do not deny it." Verified 5/5 × 3 negative controls live against the
   real Anthropic API; confirmed (via `git stash`-isolating the change) no regression in the adjacent
   legality-refusal eval.
   That isolation test surfaced a SEPARATE, pre-existing bug in that same legality-refusal golden:
   its `biology-no-spurious-refusal` negative control was ALSO failing live (0–40%) because its
   fixture only stubbed `search_knowledge_base` — the live model, with `query_climate` /
   `query_field_reports` / `query_spray_decision` now in its tool registry, reasonably called those
   too for a disease-pressure question, fell through the eval harness's nonsense `{found:false}`
   default (a shape none of those tools actually return), and derailed before ever citing the corpus.
   Fixed in **[#558](https://github.com/russellmoss/wine-inventory/pull/558)** (merged `f8723293`):
   stubbed all three tools in their REAL return shapes; added a description cross-reference on
   `query_climate`/`query_field_reports` telling the model to still consult `search_knowledge_base`
   for the underlying biology even when the tenant's own data shows nothing; tightened
   `query_spray_decision`'s description to lead with its POWDERY-MILDEW-ONLY scope so it stops
   getting called on downy-mildew questions; added a floor to `search_knowledge_base` rule 9 so the
   model stops volunteering its legality caveat unprompted on an answer nobody asked a legality
   question about. Verified 5/5 live, ×3 runs.
   Follow-on in **[#559](https://github.com/russellmoss/wine-inventory/pull/559)** (merged `aad690f8`):
   the OTHER three legality-refusal cases (`captan-clearance`, `refuses-the-verdict-not-the-
   information`, `rei-no-results`) were separately regex-brittle in their own `mustMention` checks —
   e.g. "I can't give you a yes/no" didn't match the narrow verb alternation, a real live paraphrase
   scored as a false failure. Extracted one shared `DECLINES_TO_CERTIFY` regex instead of three
   independently-drifting copies (same root cause as the fixture gap, just in the assertions). All 4
   legality-refusal cases now score 5/5 in one full run against the real API.
   ⚠️ **Pattern worth remembering**: this is the second time in this same session a golden's STUBBED
   tool set went stale as soon as the live tool registry grew past what the golden anticipated. Adding
   a new assistant tool is a silent hazard to every OLDER eval that doesn't stub it.

2. ✅ **POPPED 2026-07-28 — the corpus repair campaign (plan 100 Unit 2) is DONE, and it found a
   second, separate bug.** ~3,270 of ~3,312 candidate documents re-fetched + re-chunked on the
   fixed splitter across all 22 affected sources (`awri`, `ifv-france`, `wine-australia`,
   `osu-owri`, `lvwo`, `ifv-occitanie`, `ives-technical-reviews`, `umc`, `vt-enology-notes`,
   `cornell-grapes`, `wsu`, `uc-ipm`, `wbi`, `ets`, `osu-extension`, `icvv`, `scott-labs`,
   `chambre-gironde`, `incavi`, `enartis`, `laffort`, `mapa`). Ran across a real overnight internet
   outage and a Claude-account switch (background `tsx` processes are OS-level, not tied to any
   Claude session — survived both once reconnected); resumed repeatedly via `--stale-before`
   dry-runs with zero data loss each time (every write is transactional per document). One resume
   attempt genuinely STALLED (22 min with zero writes anywhere in the corpus while still reporting
   "running") — caught by checking `max(embeddedAt)` directly against wall-clock time rather than
   trusting the process status, `TaskStop`'d, and resumed clean.
   `ets` needed its OWN dedicated `crawl:ets` script, not the generic `reindex:knowledge` tool — it's
   a JSON-API source (`webapi.etslabs.com`) whose canonical URLs are React-SPA shells; the generic
   tool was fetching 903-byte empty pages and correctly refusing them as `low-confidence`. Fixed via
   `npm run crawl:ets` (48 docs / 318 chunks / 0 errors).
   🔴 **~20-document residual is INTENTIONALLY left un-reindexed, correctly blocked by the NEW
   `numeric-loss` guard (Unit 3b) — and diagnosing why surfaced a real, PRE-EXISTING, SEPARATE bug.**
   `ives-technical-reviews`, `lvwo`, `osu-owri` all have documents whose "heading" is not a short
   label but a full citation blurb (IVES: `## Mortality and vigour…` — a ~400-char sentence including
   the paper's own DOI). `parseSegments` treats HEADING TEXT AS PURE BREADCRUMB MATERIAL — it is
   NEVER re-emitted as body content — so when `capBreadcrumb`'s 140-char cap truncates an oversized
   heading, whatever falls past the cap is discarded with no trace anywhere in the corpus (confirmed:
   the DOI `oeno-one.2023.57.1.5575` exists in the raw extracted markdown, in ZERO of 22 output
   chunks). This is NOT the `String.match(/g)` bug from PR #544 — it is a different defect in how
   `chunk.ts` treats abnormally-long headings, in the exact area
   `claude/grape-guide-pdf-kb-87c8d8`/`plan 099`'s breadcrumb-collapse work is already active in, so
   deliberately NOT patched here to avoid two sessions colliding on the same function. `awri`'s
   `s2100.pdf` and `uc-ipm`'s pesticide-checklist page are a THIRD, unrelated, pre-existing gap
   (confirmed `lowConfidence: true`, zero extractable markdown — always been unindexable, nothing to
   do with tonight). `umc`'s last doc is a `skippedRedirectDenied` `/en/` variant — out of scope by
   design, not a content bug. Filed in TODOS as its own item with full repro.
   Full suite green (409 files / 4,967 tests), tsc clean, after the campaign.

3. ✅ **POPPED 2026-07-27 — all three PRs MERGED, PNW Handbooks is chunked + embedded + LIVE FOR
   EVERY TENANT.** [#544](https://github.com/russellmoss/wine-inventory/pull/544) (chunker fix) +
   [#545](https://github.com/russellmoss/wine-inventory/pull/545) (PNW source, staged dark) +
   [#547](https://github.com/russellmoss/wine-inventory/pull/547) (`defaultEnabled` flip, its own
   commit per convention — never enabled in the PR that adds a source) all merged to main.
   **59 documents / 142 chunks live**, KB-1-audited clean (2 table-shaped pages correctly refused at
   ingest, 0 stored chunks, confirmed not a leak). Both Unit 11 gates passed: displacement 0/120
   slots changed (`verify:kb-register`), cross-region 0/40 PNW passages leaked into Bhutan on
   generic queries pre-flip. Russell's call: flip globally. Note the flip needed TWO steps, not
   one — `defaultEnabled` lives on the `KnowledgeSource` DB row, so the config edit alone changed
   nothing until `seed:knowledge-sources` ran; re-verified post-seed that Bhutan now surfaces PNW
   passages (3/40 on the same 5 generic queries), in line with how every other US-specific source
   (UC IPM, WSU, OSU Extension) already behaves there. Both eval artifacts (`kb-eval/snapshot.json`,
   `kb-register-baseline.json`) checked for drift and left untouched — 0 diff, since both run
   against Demo Winery, which already had PNW enabled before the global flip.
   Branches/worktrees pruned: `kb-chunker-text-integrity`, `pnw-handbooks-kb-source`,
   `pnw-handbooks-default-enable` all gone (local + remote) after their squash-merges; the original
   `grape-kb-ingestion-a530f9` worktree registration had already been unregistered (its directory is
   this session's tracked cwd, left alone).
   ⚠️ **Merging #544 has a cost side effect, now live**: `CHUNKER_VERSION` is folded into
   `deriveIndexHash` unconditionally, so the monthly sweep progressively re-indexes (and re-embeds)
   every document it re-fetches. That is the repair mechanism working as designed, but it is real
   embedding spend — a dedicated campaign for the ~630 confirmed-corrupted documents (specifically
   the ones the monthly sweep won't reach: `autoCrawl:false` sources, robots-blocked re-fetches)
   is still NOT run and needs its own go-ahead.
   🔴 **~630 of 3,299 corpus documents are corrupted — about one in five.** Measured read-only by
   re-fetch + byte diff (Unit 3): heuristic candidates 44/64 confirmed (69%), random NON-candidates
   **16/90 confirmed (18.2%, 95% CI ±8.1pp)** → ~590 more across the 3,235 unflagged, CI ~330–850.
   **The heuristic had ~7% recall**, so the stale set is effectively the whole corpus — which
   retires the plan's original "re-index only the confirmed" scoping and vindicates council C3.
   Confirmed in 13 of 14 candidate sources: `uc-ipm` herbicide table `0.5 → 5`, `awri` `15.5 → 5`,
   `cornell-grapes` Wilcox guide `4.0 → 0`, `wsu` VEEN `0.0005 → 0005`.
   Shipped: `splitIntoSentences` (lossless scanner, boundary rule deliberately unchanged);
   `findDroppedNumericTokens` wired into `indexDocument` as a fail-closed `skipped:"numeric-loss"`;
   `deriveIndexHash` moved to a payload object with **`CHUNKER_VERSION` folded in unconditionally**
   (so the monthly sweep now progressively repairs every document it re-fetches) and
   `rawContentHash` documented as RAW bytes, never filtered HTML. 19 new tests, full suite
   **395 files / 4,696 tests / 0 failures**, tsc clean, lint 0 errors.
   ⚠️ **NOT run: the repair campaign** (~630 docs re-fetched + re-embedded = real spend + a live
   corpus mutation). Needs Russell's go-ahead. Also still open: PR B + PR C, both blocked on the
   SKB/KB-1 merge.
   Prior state: **RECON + PLAN + COUNCIL DONE; 5 design questions answered by Russell 2026-07-27
   ("accept all recommendations").**
   [plan 099](docs/plans/2026-07-26-100-fix-kb-text-integrity-and-pnw-handbooks-plan.md) (12 units,
   4 PRs) · [council](docs/plans/council-feedback-100-kb-text-integrity-pnw-handbooks.md).
   🔴 **The headline is no longer the ingestion — it is a LIVE silent text-loss bug in our own
   chunker.** `splitBySentences` (`src/lib/knowledge/chunk.ts:115`) uses `String.match(/g)` with a
   regex that cannot match a decimal point, and `match(/g)` **SKIPS** unmatched spans instead of
   failing: `"abc. 0.5 def"` → `["abc. ", "5 def"]`. The `0.` is deleted with no error.
   `tailForOverlap` (:131) shares the regex, so overlap tails carry the loss too. Fires on any block
   over `MAX_TOKENS` (700) that force-splits. Live result in EM 8413: `0.5–1 lb ai` indexed as
   `5–1 lb ai` — **a citable 10× dose error in a pesticide guide.** Root-caused from first
   principles; Defuddle is exonerated. Council's Gemini arm made the severity point sharply: a
   corrupted rate is often *agronomically plausible* (5 lb/A of sulfur is normal; 5 lb/A of a Group 3
   DMI is catastrophic and illegal), so nobody catches it — the citation makes it look authoritative.
   🔴 **Second architectural find: the KB-1 gate reads the WHOLE raw page** (`index-documents.ts:106`)
   while the section filter does not run until :190 — so an enforcing gate drops a PNW disease page
   **wholesale, biology and all**, before the filter can strip `Chemical control`. Council's Codex arm
   gave a better fix than the plan's (keep the gate where it is; make the filter a **pure projection**
   feeding it; one centralized clear path) **and** caught that the idempotency hash must stay a
   fingerprint of the **raw** bytes — hashing filtered HTML makes changes inside dropped sections
   invisible forever.
   🔴 **Third: Gemini changed a design decision.** Stripping the whole `Chemical control` section
   discards the fungicide **resistance-management prose** (FRAC 3/11 resistance documented in OR/WA;
   alternate groups; ≤2 sprays per group) — tier B, and the best content on the page. The cut must be
   **block-level within** the section: keep the `<p>` preambles, drop the `<ul>`/`<table>` product rows.
   Same applies to `Biological`/`Cultural control`, which also name products.
   Also corrected: the cross-region test was designed backwards — MMR contaminates **generic** queries,
   not regional ones, because `mmrSelect(…, 0.7)` actively rewards dissimilarity.
   Original recon (measured, do not re-litigate):
   • **EM 8413 IS ALREADY IN THE CORPUS AND IT IS A DEFECT, NOT A WIN.** `osu-extension` doc
   `/catalog/em-8413-…`, 47 chunks. Its rate tables are **Airtable `<iframe>` embeds** (3) — the
   substance never arrived, only the empty tag got indexed (chunks 4, 14). 2 raw `<table>` blobs
   survived Defuddle unconverted → chunks 7–9 + 16–23 are raw `<td headers="table-cell-413816-…">`
   garbage. **Numeric corruption in a pesticide-rate document**: `0.5–1 lb ai` indexed as `5–1 lb ai`,
   `0.5 lb ai` → `5 lb ai`, `0.5 inch` → `5 inch` (leading `0.` eaten, markdown ordered-list read).
   That is a citable 10× dose error. Mojibake `Temperature (В°C)`. `publishedAt` = **2014-12-18** while
   the page links the **2026** PDF → freshness scoring believes an annually-revised safety document is
   12 years old. The real content is the PDF
   (`/sites/extd8/files/documents/donnelja/pest-management-guide-for-wine-grapes-in-oregon-2026.pdf`),
   which `crawl-osu-extension.ts` never discovers (it reads links from the 2 hubs + sitemap, never from
   a catalog page body).
   • **PNW Handbooks (`pnwhandbooks.org`) is NOT in the registry and is technically an easy add.**
   robots `*` = `Allow: /`, `Crawl-delay: 10`, Content-Signal `search=yes, ai-train=no, use=reference`
   — **identical posture to the `osu-extension` source already in the registry** (OSU hosts both). Our
   UA is NOT on the named blocklist (ClaudeBot/GPTBot/CCBot are). One flat sitemap, 4,999 locs, clean.
   **71 pages in scope**: 27 `/plantdisease/host-disease/grape-vitis-spp-` (== the user's list exactly)
   + 1 cultivar table + 17 `/insect/small-fruit/grape` + 9 `/weed/…/vineyard-grape` + 16
   `/pesticide-safety`. ⚠️ **Exact-prefix `grape-vitis-spp-` is load-bearing**: a naive `/grape|vine/`
   regex also takes 4 `oregon-grape-berberis-aquifolium-*` pages (*Mahonia*, an ornamental shrub — NOT
   a grapevine), `ivy-boston-grape`, 3 tree-fruit `*-grape-mealybug`, `puncturevine`,
   `blackberry-vines`, `garlic-wild-allium-vineale`, `cucurbit-vine`, `potato-vine-kill` — 27 false
   positives. Extraction is excellent (Defuddle: 3,836 clean words on powdery mildew, no `<table>` at
   all). Per-page `Last-Modified` exists but is **Varnish-generated (all "today") → useless**; content
   hash is the seam. Metadata `published` is the Drupal node-create date (2015) — same freshness lie as
   EM 8413.
   • ⛔ **THE BLOCKER: this collides head-on with the KB-1 tier-C rule Russell set 2026-07-26**
   (TABULAR product→fact = never in the corpus). Measured product-signal line density: `/pesticide-safety`
   **0%** (pure PPE/WPS/spill/pollinator prose — unambiguously safe and valuable); insect pages **22%**;
   disease pages **30%**; `/weed/…/vineyard-grape` **46% and effectively 100% tier C** (`dichlobenil
   (Casoron 4G) / Rate 4 to 6 lb ai/A / Site of action Group 20 / Chemical family Nitrile`) — and the
   weed pages are the part the user asked for by name. **The boundary runs THROUGH the middle of every
   disease and insect page, not between pages**: `Chemical control` is a bulleted product list carrying
   rate + PHI + FRAC group + REI (`Abound at 10 to 15.5 fl oz/A … Group 11 fungicide. 4-hr reentry.`).
   So this needs a **`sectionFilter`, like `vt-enology-notes` — and PNW splits on body headings, not
   `<a name>` anchors, so the existing `"anchor-heading"` strategy does NOT fit.**
   • ⛔ **And the KB-1 gate is NOT ON MAIN** — `src/lib/knowledge/boundary/` lives only on the unmerged
   `claude/skb-knowledge-sources-plan-bd36b7` (9 commits). Ingesting PNW first puts 71 pages of
   product/rate/REI text in with **no gate at all**, and per the SKB build log the gate must run
   **before** the idempotency short-circuit or already-indexed tier-C chunks stay retrievable forever.
   → **Russell decides the scope before any build.** Recommended order: land SKB/KB-1 → fix EM 8413 →
   then PNW prose-only. Full write-up in `TODOS.md`.

1. ✅ **POPPED — UC IPM knowledge source + corpus dates + stale-guidance warning. MERGED (#405,
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

## ✅ Done recently

- **🔴 2026-08-05 — P0 assistant 400 ROOT-CAUSED and fixed ([#583](https://github.com/russellmoss/wine-inventory/pull/583), open).**
  Four of Mike's tickets consolidated into one defect: both message reads bounded with `asc` + `take`,
  which serves the OLDEST N rows, so any conversation past 200 messages replayed an array ending on an
  assistant turn and 400'd on **every** subsequent send. Fixed newest-first + reverse, plus a pure
  invariant in `buildReplayMessages` (never end on an assistant turn — bail to `[]` and let the route
  fall back to the client history) and a Sentry warning on that fallback. Reproduced and re-verified
  against the live 246-message conversation. 491 assistant tests green.
- **📋 Plan 107 (assistant tool surface) drafted + council-reviewed 2026-08-04 — PLANNING ONLY, no code.**
  Audit found 96 tools flat against a self-named ~40 cliff, ten compensating prompt rules, and no
  external API surface at all (no MCP / OpenAPI / llms.txt). Research killed one whole unit — read-side
  tool calls are already persisted in `assistant_message.metadata.trace.toolCalls`, so measurement is a
  query, not a migration. Gemini's review then established the rule now recorded in `docs/api-strategy.md`:
  **boundary rules may move into a tool description, composition rules may not** — and since an MCP client
  supplies its own system prompt, anything prompt-resident is absent over MCP, which makes this a
  prerequisite of Phase 10 rather than a detail of it. ⚠️ Codex failed to run; the Prisma/type lens is
  still unreviewed. Files: plan `docs/plans/2026-08-04-107-…-plan.md`, council
  `docs/plans/council-feedback-107-assistant-tool-selection.md`, amended `docs/api-strategy.md`.

- **✅ Assistant read-aloud (🔊 on a text reply) — SHIPPED AND LIVE 2026-08-02**
  ([#574](https://github.com/russellmoss/wine-inventory/pull/574) → `a3b3cded`, Vercel prod deploy
  green). Every finished assistant message now carries a speaker beside 👍/👎 that speaks the reply in
  the same ElevenLabs voice, **with no microphone involved** — so it works where voice mode can't.
  Deliberately NOT routed through `useVoiceSession`: that runs a live turn loop over a token stream,
  this is one click on a message that is already finished. Two small pieces instead — pure
  `planSpeech` (`src/lib/voice/read-aloud.ts`, 10 unit tests) and `useReadAloud` (Web Audio, one clip
  of synthesis lookahead). First sentence ships alone so audio starts ~1s in; chunks stay under the
  speak route's 1500-char cap **because that cap slices rather than rejects**. Same server gate as
  voice mode, stops on dock-collapse and on a hands-free session opening. Owner request, no plan file.
  ⚠️ Not browser-QA'd locally — the owner is testing it live on prod.

- **✅ Prod OAuth login report — SHIPPED 2026-08-02**
  ([#573](https://github.com/russellmoss/wine-inventory/pull/573) → `b46d90f5`). The 500 did not
  reproduce and the DB proved the Google round-trip had already succeeded; the fix that landed is the
  adjacent defect that made the 500 *invisible* — the auth proxy was swallowing Sentry's `/monitoring`
  tunnel, so the login page reported no client errors at all. 14 tests, `tsc`/`eslint` clean, verified
  against production after deploy.

- **✅ Phase 3b (plan 104) SHIPPED AND FLAG FLIPPED 2026-07-29** — three PRs, main at `13cbc62c`.
  The v2 nav went from *un-shippable* (17 of 56 routes reachable) to live. `nav/sections.ts` feeds
  BOTH the sub-navs and Ctrl-K; `route-reachability.test.ts` fails CI on any route nothing links to;
  `/setup` is a real hub; "The vineyards" became a top-level group equal to "The wine".
  Crawl: **17 → 38 of 58** reachable. Four independent reviewers ran before the PR.
- **✅ App-wide WCAG remediation ([#563](https://github.com/russellmoss/wine-inventory/pull/563))** —
  the authed axe gate had gone unrun for a phase and was hiding real defects, none of them
  regressions: 26 tables that only a mouse could scroll, `opacity`-as-state dragging text to 2.5:1,
  `--ink-500` shipping at 3.41:1 under a comment claiming 4.6:1, a fill colour used as a foreground,
  and 23px controls under the AA minimum. **axe 82/82 green.** Three new guards compute the answer
  instead of trusting a comment.


- **✅ Plan 104 (Phase 3b — finish the v2 IA) BUILT 2026-07-28**, 5 commits on
  `claude/cellarhand-v2-phase3b-ia-41e485`. `src/lib/nav/sections.ts` (one module feeds BOTH the
  sub-navs and Ctrl-K), `test/route-reachability.test.ts` (the orphan guard — a contextual claim
  names the file that links to it and the guard reads that file; a redirect exemption is checked
  against the page for a `redirect()` call; a hub is only credited once its page renders
  `<HubSectionNav hub="...">`), the `/setup` hub, `hasVineyard` fixed on all three surfaces, and
  `route-stability`'s two drifted lists now derived instead of hand-typed. Zero schema changes,
  `AssistantDock` diff empty, suite 5,513 passing.

- **✅ Assistant false-source-denial (Gironde) + the legality-refusal eval-fixture gap it exposed —
  BOTH FIXED (2026-07-28), see tangent-stack entry 1 above for the full write-up.** Merged
  [#556](https://github.com/russellmoss/wine-inventory/pull/556) (retrieval-overclaim guard),
  [#558](https://github.com/russellmoss/wine-inventory/pull/558) (tool-fixture + tool-description
  fixes), [#559](https://github.com/russellmoss/wine-inventory/pull/559) (shared regex, killed the
  brittle per-case duplication). All 4 legality-refusal cases now score 5/5 live.

- **✅ Cellarhand UI/UX v2 Phase 0 + Phase 1 BUILT (2026-07-28) — 10 units, 10 commits, not PR'd.**
  See the Current objective above for the full picture. The parts worth remembering even after the PR
  lands: **eight** independent status→colour maps existed, not the six the audit counted (two were
  hand-rolled ternaries inside a single JSX attribute); the `gold`→`wine` rename was 2.5× the plan's
  estimate (31 literal sites / 24 files / 33 typed files); `/compliance` and `/compliance` excise both
  DO render status as a Badge, contrary to the plan; a **partial batch failure on the execute screen
  set `failures` without `error`, so it was completely silent to a screen reader** — a cellar hand
  would have believed all N tanks recorded; `var(--gold)` has never existed as a token, so a border
  styled with it silently rendered the default; and `--lavender`/`--orange`/`--bright-mauve` are NOT
  unclaimed (the vineyard variety palette in `src/lib/vineyard/colors.ts` uses their exact hexes), so
  DESIGN.md backlog item 3 is closed as "keep", not "prune".

- **✅ Product design audit — whole-app, read-only (2026-07-28).**
  [docs/audits/product-design-audit-2026-07-28.md](docs/audits/product-design-audit-2026-07-28.md).
  Owner-requested detour from the spray lane (spray objective above is UNCHANGED). Senior-product-designer
  pass over DESIGN.md, `/styleguide`, `AppShell` nav, the 21-component `ui/` barrel, and representative
  screens for cellar / vineyard / manager / admin / accounting — plus a live headless sweep of 24 routes ×
  2 viewports on Demo Winery with an in-page a11y probe. **No code changed.**
  Headlines: work-order Execute hides actuals behind "Edit" **and shows "Offline — will retry" with no
  outbox**; undo exists on `/bulk` but not on Execute for the same act; **TTB filing is irreversible with
  no confirm** (breaks the product's own rule 6); no global search / breadcrumbs / skip link (13-21 tab
  stops before content, `aria-current` on 0 nav links); **78% of controls (293/376) under 44px** because
  `Button` hardcodes 34/42/50; `/bulk` renders fully collapsed (no wine visible); 1 `loading.tsx` and
  0 `not-found.tsx` across 57 routes. Recommended slice: **work order → Execute → recorded**
  (runner-up `/bulk`, sequenced right after). `/compliance` is the best-designed screen in the product.
  ⚠️ Two env traps cost real time and are worth fixing: **`localhost:3000` is squatted by another project
  ("Savvy Labs")** and `.env` pins `BETTER_AUTH_URL=http://localhost:3000`, so any other port fails login
  with "Invalid origin". Demo creds `demo@demo.com / demo1234` are valid (CLAUDE.md correct);
  `owner@demowinery.test / DemoWinery!2026` is a second valid owner.
- **✅ Cornell NY/PA Grape Guide is LIVE in the KB (2026-07-27) + the breadcrumb defect it exposed.
  Plan 099, [#543](https://github.com/russellmoss/wine-inventory/pull/543) MERGED (`64db4cd9`),
  crawled, measured, `defaultEnabled:true` for all tenants.**
  Owner asked to ingest the [2025 Grape Guide preview PDF](https://cropandpestguides.cce.cornell.edu/Preview/2025/2025_Grape_Guide_Preview.pdf).
  **Three blockers were surfaced and the owner decided to proceed anyway (2026-07-27):** plan 087 lists
  that host as "paid. Do not crawl." (the *unreachable* half of that note is stale — it serves 200); the
  preview is a 25-page sampler of a 166-page **paid** book spanning all 8 chapters, so pages 22-24 are
  tier-C product × rate × REI/PHI tables; and it carries "© 2025 Cornell University. All rights reserved."
  with no grant. Decision: ingest, **paraphrase + cite rather than reproduce, withdraw on request** — the
  same posture `vt-enology-notes` already runs under. Posture is recorded in the source's `license` string
  so takedown is `active:false` + `reset:knowledge-source`.
  **The bigger half was a corpus-wide defect this forced out.** The guide extracts *cleanly* (56 headings,
  confidence gate passes) yet collapsed to **11 distinct breadcrumbs across 77 chunks, 75 truncated** — the
  68-char title plus a 63-char cover-title H1 ate 134 of the 140-char budget and the cap truncated the
  *tail*, deleting every real heading. Fixed in `chunk.ts` (drop a heading restating the root; elide the
  MIDDLE, never the leaf) → **46 distinct breadcrumbs, 19/77 elided, 0 over cap.** Closes the long-open
  `TODOS.md` breadcrumb entry for the duplication half. ⚠️ **NOTHING self-heals** — review killed the
  claim that PDFs would: `PDF_EXTRACT_VERSION` → `"2"` changes only the index hash, but the sweep 304s
  before `indexDocument` runs, 16 of 26 sources are `autoCrawl:false` and not in the sweep at all, and
  `crawl:curated` doesn't pass `ignoreValidators`. **`reindex:knowledge` is the only lever**, deferred
  (~23.5k chunks of Voyage spend) and tripwired. Also corrected `scale-register.md`: the KB entry claimed
  🟢 while its own ~10k-chunk tripwire had been crossed at ~23.5k.
  ✅ **Unit 6 COMPLETE — LIVE for all tenants 2026-07-27.** 1 doc / **82 chunks** / 46 distinct
  breadcrumbs; `publishedAt` 2025-04-30; displacement **1/120 slots (1%)** vs a 25% gate;
  `verify:knowledge-base` 21/21, `kb-subscriptions`, `kb-register`, `kb-boundary` all green.
  🔻 **THE GATE FIRED, AND IT WAS RIGHT.** The FIRST crawl produced a **corrupt** document and was
  thrown away — only 10/20 active ingredients and **6/24 trade names** survived, and chapter 8 stored a
  table *header* plus `... EPA Reg. 5TG 3, 21 1 year 12 hr 62719-175` where the PDF says
  `^Snapshot **2.5TG** …`. A rate table that looks authoritative and is wrong. Source was hard-closed
  (`active:false`) — no tenant ever had it on. **Cause: it ran one commit before [#544 / plan 100 PR A]**,
  where `splitBySentences`'s `String.match(/g)` silently DELETED spans it couldn't match (`0.5`→`5`),
  firing on any block over `MAX_TOKENS` — i.e. exactly a 3-page pesticide table. Re-crawled on the fixed
  chunker (`CHUNKER_VERSION` 2 + `reset:knowledge-source`): **20/20 AIs, 24/24 trade names, 10/10
  decimals, 8/8 EPA reg numbers, 5/5 page-22 rows verbatim**, zero corruption signatures.
  ⚠️ **`verify:kb-boundary` says `product-table 0` for this source and that is NOT safety evidence** —
  it is the PDF blindness in `TODOS.md`. The numeric spot check cleared this document, not the gate.
  🔑 **Both crawls printed `documents:1, errors:0`.** Only comparing stored cells against the PDF told
  them apart. A version bump plus a green run proves nothing about content.
- **🟩 SKB — ALL 11 UNITS COMPLETE except Unit 10's operator-gated MSU crawl (2026-07-27).** PR 1
  (#538, merged) + Units 4, 6-11 on branch `claude/skb-knowledge-base-expansion-c58f7c`, not yet
  PR'd. Plan: [SKB-knowledge-sources-plan.md](docs/spray_assistant/phases/SKB-knowledge-sources-plan.md) ·
  report: [SKB-report.md](docs/spray_assistant/phases/SKB-report.md) · QA:
  [SKB-qa-report.md](docs/spray_assistant/qa/SKB-qa-report.md).
  - **Shipped:** the KB-1 boundary gate (PR 1, live). **Penn State Extension** (new, 45 hand-curated
    tier-A grape disease/IPM articles from a live 94-item hub enumeration, dark on landing). **Virginia
    Tech grape IPM RECONCILED** (`virginia-fruit` was a live DB-only orphan with `allowPrefixes:["/"]`
    seeded from an unmerged branch — now a real config entry).
  - ⚠️ **Both new sources needed a live-crawl-driven scope fix, found by actually crawling, not by
    reasoning about config:** PSU's hub `allowPrefix` admitted off-mandate sub-hubs
    (wine-production, business-management-and-marketing, a staff directory); VT's `allowPrefixes:["/"]`
    let `--follow` wander into apple/pear/peach orchard content and 14 years of pesticide-use-stats
    pages. Both rescoped to exact `allowPaths` lists; 38 total off-scope documents withdrawn from the
    live corpus.
  - ✅ **The KB-1 gate caught two REAL product tables in hand-curated PSU content** a human had
    picked as tier-A on title alone (spotted-lanternfly management, an herbicide grower-survey
    writeup) — the strongest evidence yet that the detector generalizes past its own test fixtures.
  - 🔴 **D13 cross-region contamination REPRODUCES, measured not assumed (Unit 9):** a Michigan
    downy-mildew probe mixes Wine Australia/AWRI with eastern sources; a Pennsylvania grape-berry-moth
    probe mixes UC IPM with `virginia-fruit`/Cornell. `extension-psu` stays dark as a direct
    consequence. **`virginia-fruit`'s pre-existing `defaultEnabled:true` sits in a measured-mixed
    result right now, in production — left as an explicit open question for Russell, not decided.**
    See [SKB-region-finding.md](docs/spray_assistant/phases/SKB-region-finding.md).
  - MSU stays DORMANT; `verify:msu`'s self-authorizing language narrowed so one live PASS no longer
    implies un-dormanting. The operator-gated `crawl:source msu-grapes --follow` is pending — see
    [SKB-msu-decision.md](docs/spray_assistant/phases/SKB-msu-decision.md) for the exact command.
  - Displacement 8/120 (3%) PASSED; `verify:knowledge-base` 26/26; `verify:kb-boundary` PASS
    corpus-wide; corpus is 37,759 chunks (D11's scale-register tripwire number corrected).
  - ⚠️ **Environment note:** mid-session, Edit/Write on existing AND brand-new tracked files stopped
    reaching the disk `npm`/`tsx`/git actually read from in this worktree (confirmed via
    `git hash-object`); worked around by routing every change through Bash heredocs for the rest of
    the session. Recorded in memory (`edit-write-disk-desync-worktree`) — root cause not confirmed,
    leading suspect is OneDrive sync on the `Documents`-hosted repo.
- 🔴→🟩 **Bhutan weather elevation bias FOUND AND FIXED (2026-07-26, branch
  `claude/weather-elevation-fidelity`, PR #536)** — a LIVE-tenant data-quality defect surfaced by the S5a
  Unit 0 probe. NASA POWER answers with its ~50 km cell's MEAN elevation, **1.0–1.8 km above** each Bhutan
  vineyard, so the series ran **4.8–9.7 °C cold**: the card showed **Winkler Region I at Region V sites**,
  Jones "Too cool" at a subtropical valley, **frost events on nights that were ~12 °C**, and Bajo (1,230 m)
  identical to Ser Bhum (2,773 m). Fix = an elevation-downscaled ERA5 archive provider (the same
  `elevation=` correction the FORECAST path already had) + `source-fidelity-core`, which **withholds the
  hard-boundary classifications** when the source's own reported elevation is >300 m off the site (§3.6)
  rather than mislabelling them. Migration applied + all 8 vineyards re-ingested on the live tenant;
  observed and forecast now agree to the decimal. POWER rows kept as a second source (reversible).
  Report: `docs/analysis/bhutan-nasa-power-elevation-bias.md`.
- **/bulk composition-editor phantom ADJUST fixed (2026-07-26, PR #534):** `updateComponentVolume`
  targeted the lot-tuple total while the editor displayed the component PROJECTION — on a blend (Demo T5,
  2026-SY-2: 6995 L tuple vs 6370 L Syrah share) saving the untouched value drew 625 L. Now: untouched
  save = no-op, blend-share edits refused with guidance, single-origin edits unchanged. Pure plan fn +
  regression test (`src/lib/bulk/component-adjust.ts`). Server-side only — composes with plan 098's
  unit-input work (merged #533).
- **Plan 098 tenant unit preferences BUILT (2026-07-26, branch `claude/tenant-unit-preferences-78472c`;
  merged to main as #533)** —
  all 12 units done: 7 nullable AppSettings unit columns (Migration A) + the audited hoist-if-uniform
  Migration B (Demo hoisted IMPERIAL; Bhutan's disagreeing weather/geometry values preserved — zero
  behavior change, both migrations APPLIED to the live DB); `src/lib/units/display.ts` is the ONE
  display-unit authority (weather/units-core + phenology/units are re-export shims); settings card +
  UnitsProvider; weather/vineyard/cellar/harvest/ferment display sweeps; volume INPUTS with inline
  adornment + dirty-check round-trip; assistant threads units through route → runAssistant →
  ToolContext → query_climate display strings (the Oregon-forecast °C bug fixed). Full vitest green,
  verify:naming/invariants/ai-native green. **Remaining: interactive browser QA on Demo Winery
  (needs the user's pane login) + /review + /ship.**

- **🔴 RELEASE BLOCKER FOUND + FIXED (2026-07-26): `AppUser.vineyardIds` was ALWAYS `[]` under
  `app_rls`.** Surfaced during S4 browser QA (it blocked the pass) but pre-existing and unrelated to S4.
  **[PR #530](https://github.com/russellmoss/wine-inventory/pull/530)** (branch
  `claude/relaxed-bardeen-5cfae9`). Complementary to #529, NOT superseded by it — see the S4 entry below.
  **Root cause — the GLOBAL-parent / RLS-child read seam:** `userSelect` in `src/lib/dal.ts` selected
  `vineyardMemberships`. `User` is a GLOBAL model, so the tenant extension passes `prisma.user.*`
  **straight through** and never opens its `set_config('app.tenant_id', …)` tx; `user_vineyard` is
  RLS-FORCED, so the nested join was evaluated with **no tenant GUC** and fail-closed to zero rows —
  silently, no error. Reproduced deterministically against the live DB (`app_rls` `rolbypassrls=false`:
  nested read `[]`, same read with the GUC set returns the row).
  **Blast radius (every non-admin manager):** field notes unreachable; the vineyard-scoped assistant
  dead (`assistant/scope.ts`, `query-brix`, `query-recent-harvests`, `db-create`/`db-update`); `/lots`
  lens off; and on `/users` **silent DATA LOSS** — checkboxes render from those ids and
  `setUserVineyards` REPLACES the set, so ticking one vineyard dropped every existing membership.
  ⚠️ **Local `DATABASE_URL` is ALREADY `app_rls`** (owner URL kept as `DATABASE_URL_OWNER_POOLED_BACKUP`).
  **Vercel's `DATABASE_URL` is UNCONFIRMED — Russell must check.** If prod still connects as
  `neondb_owner` (BYPASSRLS) this was latent and would have become total at the app_rls cutover.
  **Fix:** membership set moved to `src/lib/users/vineyard-memberships.ts`
  (`loadVineyardMembershipIds` / `…ByUser`), read AFTER `getCurrentUser` resolves the effective tenant
  (support org → active org), with `tenantId` as an EXPLICIT arg (K12-safe, can't recurse via
  `resolveTenantFromSession`). `toAppUser` now REQUIRES `vineyardIds`. All 3 call sites fixed
  (`dal.ts`, `users/actions.ts`, `(app)/users/page.tsx`).
  **Guards:** `test/global-model-tenant-relation-select.test.ts` (static, DMMF-driven — proven
  non-vacuous by reintroducing the bug) + 4 new `verify:tenant-isolation` checks that pin BOTH the empty
  pass-through read and the correct scoped one. tsc/eslint clean, `verify:tenant-isolation` ALL PASSED.
  ⛔ **Trap found in passing — do NOT re-derive:** `runAsTenant(id, () => prisma.x.op(…))` with a
  NON-async arrow **does not work**. Prisma returns a LAZY thenable, so `$allOperations` runs after
  `store.run()` has exited → "Tenant context required", or worse, silently the OUTER tenant. Must be
  `async () => await …`. ~6 pre-existing sites still have the broken shape (masked today) — logged in
  the security register's watch list + a task chip.
  ℹ️ The DB holds exactly **ONE** `user_vineyard` row (`awerth@gmail.com` → Demo Winery) — the row the
  QA report attributed to `russellmoss87@gmail.com` (id `50d97614-…`) is **not there**.

- **TENANT-3 — the lazy-`PrismaPromise` tenancy bug class: SWEPT + CLOSED STRUCTURALLY**
  (branch `claude/silly-goldwasser-d2aedf`, 2026-07-26). `runAsTenant(t, () => prisma.x.op())` with a
  **non-async** arrow BUILDS the query inside the ALS scope and **runs it after the scope exits** —
  the tenant extension's hook then reads the store from outside. With no ambient context it throws;
  with an ambient **outer** `runAsTenant` live it silently uses the **outer** tenant. AST sweep found
  exactly **8** sites (the 8 known ones — no others). Fixed on two fences: (1) *structural* —
  `runAsTenant`/`runWithTenantContext` now wrap the callback in `async () => await fn()`, so the
  thenable is forced inside the scope however the callback is written; (2) *shape* — all 8 call sites
  rewritten `async () => await …`, guarded by a new AST scan `npm run verify:tenant-callbacks` (wired
  into CI). Pinned by `test/tenant-context-lazy.test.ts` (9 cases incl. the nested outer-tenant one;
  4 fail if the wrapper is removed). Registered as invariant **TENANT-3** + a security-register entry.
  🔎 **`npm run verify:reminders` was RED on `main` because of this** — it died at the step-2
  `ComplianceReport.create`. Now green end-to-end (15 assertions) for the first time; that unmasked a
  second, unrelated bug in the script itself (the badge assertion compared a **30**-day count to a
  **60**-day one), also fixed. Gates: tsc 0, eslint 0 errors, **vitest 4482/0**,
  `verify:tenant-isolation` / `raw-sql` / `invariants` (45/45) / `tripwires` / `parity` / `ai-native` /
  `work-orders` / `feedback` / `naming` all green.
  🔻 **TWO CORRECTIONS to what #531 originally claimed — believe these, not the PR description.**
  (1) #531 said `src/lib/users/vineyard-memberships.ts` and the security-register section
  "GLOBAL model may never select a relation to a tenant-scoped table" existed on no branch. **Wrong.**
  They are on **[#530](https://github.com/russellmoss/wine-inventory/pull/530)** (`claude/relaxed-bardeen-5cfae9`),
  which was still OPEN — the sweep searched local refs before that branch carried the work. #530 is the
  real fix for the sibling bug (CI green: `check` + `tenant-isolation` + `review`).
  (2) #531 then re-graded the GLOBAL-model/RLS-child seam to LOW-MED, following #529's note. **Also
  wrong** — #530 browser-proved it side by side on `/users` (unfixed server: Aaron Werth `[]`; fixed:
  `["WV Oregon"]`). #529's `isTenantAdminLike` gate is a real fix but only routes **admin-like** roles
  away; a genuine `role:"user"` manager still gets `vineyardIds: []`, and #529 never touches `/users`,
  where the checkboxes render from those ids and `setUserVineyards` REPLACES the set — **a silent
  membership WIPE**. Invisible while the runtime connects as owner (BYPASSRLS); **total the moment
  `DATABASE_URL` is `app_rls`.** So it IS an app_rls-activation blocker. See
  [[global-model-rls-child-read-seam]]. ✅ `main` has since been merged INTO #530 (TENANT-3 + both
  corrections included), so the `NOW.md` / `security-register.md` overlap is resolved.
- **Spray Intelligence S3a — record + planned harvest: SHIPPED (2026-07-26). PR1 [#523](https://github.com/russellmoss/wine-inventory/pull/523) + PR2 [#524](https://github.com/russellmoss/wine-inventory/pull/524) MERGED → WAVE 2 UNBLOCKED (S7a, S8, S6, S7b start against the merged cores); PR3 [#527](https://github.com/russellmoss/wine-inventory/pull/527) browser-QA'd GREEN.**
  Seven append-only tables (DB triggers + at-most-once correction incl. VOID), facts-as-of
  snapshots (copied verbatim on correction — KD-14), knownness CHECKs (SPRAY-3), planned-harvest
  event stream with the `plannedHarvestChangesSince` watermark, legacy field-note seam.
  `verify:spray-record` = 14/14 on Demo. In-browser QA caught 2 real bugs, both fixed in-phase
  (`d11c38d8`): untouched prefill area provenance, and the correction-prefill UTC→datetime-local
  shift (+4 h on every instant). QA report `docs/spray_assistant/qa/S3a-qa-report.md`;
  ADR 0010 (facts-as-of replay); S7a/S2b/S6 constraints written into runbook §9.

- **Spray S2 — registration + resistance master BUILT (all 12 units, 2026-07-26).** PR-1
  [#522](https://github.com/russellmoss/wine-inventory/pull/522) merged (schema slice landed alone
  and first, as planned, so the three sibling lanes serialize behind it); PR-2
  [#525](https://github.com/russellmoss/wine-inventory/pull/525) CI green; PR-3 open. Live in the
  prod tables: 2,420 active grape registrations, 833 CA-registered, 361 AIs bucketed with zero
  unclassified, `verify:pesticide` 31/31, `verify:invariants` 42/42, 4,330 unit tests green.

- **S4 (Spray Intelligence lane D) — phenology precision + the growth-dilution model: SHIPPED.**
  [#521](https://github.com/russellmoss/wine-inventory/pull/521) schema slice ·
  [#526](https://github.com/russellmoss/wine-inventory/pull/526) the feature ·
  [#529](https://github.com/russellmoss/wine-inventory/pull/529) QA close-out — all merged and live. Six new weekly
  block observations through all five projections, a biofix-anchored GDD phenology interpolator, a
  growth-dilution model with a post-stagnation leaf-expansion tail, a provenance-carrying read DTO,
  pure honesty labels, the authoring UI, the assistant payload, and `verify:phenology`. 135 new
  tests. Two *pre-existing* bugs fixed in passing: falsy values (`false`/`0`) silently dropped from
  the write-confirmation card, and `markRemainingHealthy`'s `JSON.stringify` comparison that adding
  any `BlockStatus` key would have broken. **Browser QA GREEN**: the scouting stage gate fires in
  all three states, `shootLengthCm: 0` / `hedgedThisWeek: false` / `clusterDamage: NOT_ASSESSED`
  all survived UI → action → DB, and read-back renders a gap and a checked-clean as two different
  sentences. The blocker turned out to be a one-line `isTenantAdminLike` gate on the field-notes
  page (#529) — that fix is correct and is what unblocked this QA.
  ⚠️ **CORRECTION to this entry's original "not the RLS theory / re-graded LOW-MED" call: that
  re-grade was wrong.** #529 only routes ADMIN-LIKE roles away from the manager branch; a genuine
  `role: "user"` manager still reads `vineyardIds: []`, and #529 does not touch `/users`, where the
  silent membership WIPE lives. The RLS seam is real, measured, and fixed separately in **PR #530**
  (see the entry above) — the two changes are complementary, not alternatives.

- **CI flake killed: `test/compliance-fill-pdf.test.ts` vs. the 5s vitest default** — **MERGED to
  `main`** ([PR #492](https://github.com/russellmoss/wine-inventory/pull/492), squash `896fec40`;
  branch + worktree deleted). The TTB round-trip parses the 3.1 MB
  fillable AcroForm twice + saves once; it ran ~4.2s standalone and timed out at 5380ms under
  full-suite load. Root cause of the slowness: **pdf-lib's default `parseSpeed` is `Slow`** (yield to
  the event loop every 10 objects — a browser default), ~350ms per parse of this form.
  Fix = `parseSpeed: ParseSpeeds.Medium` in `fill-pdf.ts` (prod gets the speedup too, still yields)
  + `Fastest` on the test's own loads + an explicit **30s** per-test timeout. Assertions untouched.
  ✅ Verified neutral: all **621** field names/values round-trip identically at every parse speed
  (the residual ~4-byte jitter inside a compressed object stream happens run-to-run at a FIXED speed
  too — pre-existing, not from this change). Round-trip 1032→413ms standalone, **1139ms under full
  parallel load** (was 5380ms); full suite 312 files / 3660 tests green; tsc + eslint clean.
  ⚠️ `npm run verify:ttb` was NOT run (it needs `.env`/DB and the worktree had none). CI's `check` +
  `tenant-isolation` were green and the unit round-trip asserts the same field mapping, so this is a
  belt-and-braces gap only — run it from the MAIN checkout next time `fill-pdf.ts` is touched.
- **`/bug-triage` re-offered PRODUCTION CODE as new work — FIXED, LIVE on `main` ([PR #478](https://github.com/russellmoss/wine-inventory/pull/478), squash `0b649b74`).**
  Ticket `cmrwdgt2u…` ("assistant should read a vessel's/lot's operation history") was ranked the
  run's ONE actionable plan-ready item, pointing at plan issue #466 — a day AFTER the work shipped in
  #468 (`query-operations.ts`, `operation-history.ts`, 30 tests, 7 goldens).
  🔎 **Three facts had to combine:** (1) #468 was **hand-built by a parallel session**, so nothing
  stamped the PR on the ticket — `prNumber` stayed null; (2) **Reconcile only closes items that HAVE
  a resolved fix PR**, so a null prNumber is never even a candidate; (3) **the PR sweep lists only
  `--state open`**, so a PR that merged BEFORE the run is invisible and the `linkedFeedbackId`
  body-extraction (which already works for sweep-merged PRs) never ran on it.
  Fix = a new **Merged Sweep** phase: scan recently-merged PRs, pull cuid-shaped ids out of the PR
  BODY by **shape + proximity** to feedback/ticket wording (phrasings differ — ``Closes the feedback
  item `<id>` `` vs ``Automated fix from bug ticket `<id>` ``), validate via the read-only
  `triage:lookup`, reconcile to RESOLVED **only if `isOpen`**, fan out to cluster duplicates.
  ⚠️ **Permissive extraction is safe because `triage:lookup` is a TOTAL VALIDATOR** — a bogus id
  comes back `missing`, so the DB is the gate, not the regex. Bounded by `maxMergedScan` (50) + a
  `mergedAt` cutoff from the `today` arg (workflow scripts **cannot call `Date.now()`**, so no
  `today` = count cap only).
  🔻 **Anything reconciled is pulled OUT of the run's own action lists AND build waves** — enforced
  in JS after the build planner returns, because "the prompt said not to" is not enforcement, and
  handing a builder shipped work was the actual defect.
  🔻 **Second bug in the same area: every `feedback: plan` issue is a TEMPLATE STUB.**
  `scripts/feedback-plan-agent.ts` emits identical boilerplate for every run and nothing ever writes
  `planMarkdown` back, so "plan-ready" routinely means an empty issue — and the build planner was
  emitting `/work <planUrl> — build the plan as written` for it. Now judged by a boilerplate-coverage
  test (real/hand-edited plans respected; an unreadable issue is never downgraded) and stubs route to
  `/plan`.

- **`/bug-triage` `counts.reconciled` reported 390 for 1 item — FIXED (PR #459).** The Reconcile agent
  alone ran with a bare `{ additionalProperties: true }` schema, so `{ results: "<json string>" }`
  validated and the counts builder took `.length` of the STRING. Fixed at both altitudes:
  `RECONCILE_SCHEMA` types `results` as a real array (so StructuredOutput rejects a stringified answer
  and the model retries), plus an `asArray()` parse at the call site that falls back to the
  deterministic one-row-per-item list rather than a bogus count. Audited every sibling count — all
  other array-bearing agent fields are already typed arrays under `additionalProperties: false`, so
  Reconcile was the only loose contract.
  ⚠️ **`dryRun: true` gates the Reconcile agent out entirely**, so a dry run can NEVER exercise this
  path (it returns 0/0) — verify with a harness over the committed source, not a dry run. Proof:
  1 item → `counts.reconciled = 1`.
  🔎 **The `.gitattributes` LF pin this branch originally carried was DROPPED on rebase — #458
  (`ebf52f31`) already landed it on `main`.** Worth knowing why it looked missing: the pin only
  applies at CHECKOUT, so a worktree created BEFORE it landed still hands the Workflow tool CRLF and
  `/bug-triage` still refuses to launch there. Fix per-worktree with
  `perl -pi -e 's/\r\n/\n/g' .claude/workflows/bug-triage.js`, not with another pin.

- **The winery has its own CLOCK — `AppSettings.timeZone`** (follow-on to the due-TIME feature below,
  asked for by Russell: "is this timezone-aware, or is it a setting?"). It was neither: #472 resolved a
  requested wall clock against the **viewer's browser**, which is right for a crew standing in the
  winery and wrong for anyone reading from elsewhere. Work is planned where the wine is, so the winery
  now gets a configured zone that WINS over the reader's, for everything place-bound: WO due entry +
  display, the assistant's tools and its "today", the overdue/due-today lanes, and the ferment
  stall-detector's day bucketing (which had a `timeZone` param since Phase 6 that nobody ever passed).
  • **NULLABLE on purpose** — unset means "not configured" and every reader falls back to the viewer's
  own zone, i.e. exactly #472's behaviour. The migration changes nothing for any existing tenant.
  • 🔻 **A pre-existing UTC bug, now fixed:** `buckets.ts` computed day boundaries with
  `getFullYear/getMonth/getDate` = SERVER-local = UTC in prod. A WO due 9pm Eastern is 01:00Z the next
  day, so it read **"upcoming" on the very evening the crew had to do it.**
  • 🔻 **I caused a real regression and the test suite caught it, not the linter:** putting
  `getWineryTimeZone()` inside `runAssistant` added a DB read to the assistant's hot path and **tripled
  the suite's wall clock (31s → 96s)**, because that loop is deliberately DB-free so its tests can
  construct it without a database. Resolved in the ROUTE instead; suite back to 31s. If an assistant
  test starts timing out, look for a new await in `run.ts` before blaming the flake.
  • ⚠️ **`Intl.supportedValuesOf("timeZone")` omits bare `UTC` and the whole `Etc/*` family**, so the
  canonical list has to add UTC back or the resolver's own fallback is unstorable. And the write gate
  is stricter than the read gate for a reason: **`"EST"` formats fine and is a FIXED −5 with no daylight
  rule** — a winery that stored it would run an hour off for eight months. Only ids Intl enumerates.
  • ⚠️ **`react-hooks/set-state-in-effect` is an ERROR here** — it bit both the seeded-due localization
  and the settings card's live clock. Both became `useSyncExternalStore`; the clock's `getSnapshot` must
  return the time **rounded down to the tick**, since a raw `Date.now()` re-renders forever.
  Gates: tsc 0, eslint 0, **vitest 3583/0**, `verify:invariants` 37/37, `verify:naming` 25/25,
  `next build` clean. Browser-QA'd on Demo in the sharpest case — winery set to Los Angeles while the
  viewer sat in New York, on a night when the two were on **different calendar days**: the settings card
  showed both clocks, the builder defaulted to the winery's Jul 22 (not the viewer's Jul 23), the
  assistant resolved "tomorrow" on the winery's calendar, and both paths stored **16:00Z = 9:00 AM PDT**
  where the previous WO #62 sits at 13:00Z = 9am EDT. Demo restored to unset; QA WOs cancelled.

- **Work orders take a requested TIME of day, not just a date** (feedback `cmrwkmapf…`, Demo,
  FEATURE_REQUEST). Reporter was issuing a 30-min pumpover on T7 and wanted it "tomorrow at 9am":
  the duration was capturable, the clock time was not, and the cap-management flow took **no due
  date at all**. Fixed across every authoring path — builder + template form, the edit page, and
  all five assistant tools (`issue_cap_management_wo` gains `dueDate`/`dueTime` from zero;
  `create_work_order`, `issue_operation_wo`, `manage_work_order` schedule, `propose_work_order`).
  • 🔻 **`dueAt` was ALWAYS a DateTime — the column was never the blocker, every writer just fed it a
  date.** The genuinely new data is the requested PRECISION: an instant cannot distinguish "the 23rd"
  from "the 23rd at midnight", and midnight work is real at harvest, so it can't be inferred. Hence
  `work_order.dueAtHasTime` (migration `20260722030000_…`, additive, `false` default = correct for
  every legacy row). Without it, a date-only WO would render "12:00 AM" and read as real scheduling.
  • 🔻 **The load-bearing bug is TIMEZONE, and it would have shipped silently.** The server runs UTC,
  so resolving "9am" there puts a California crew's pumpover at 2am. The viewer's IANA zone is now
  threaded from both `/api/assistant` call sites → `ToolContext.timeZone`, the wall clock resolves to
  an instant **at propose time**, and the INSTANT is what the confirm token carries (the committer
  can't re-resolve it differently). Same fix corrects the prompt's "today", which was UTC-derived and
  already off by one for anyone west of Greenwich after ~5pm.
  • ⚠️ **`datetime-local` is the obvious control and it's WRONG here** — it rejects a date-only value
  (renders blank), so it cannot represent the WOs that already exist or let anyone clear a time set by
  mistake. Two controls; an empty time IS the date-only state.
  • 🔎 **Intl renders only the fields you name** — passing `hour`+`minute` alone to `toLocaleString`
  silently dropped the date, so the detail page read "Due 9:00 AM". Caught in the browser, not by tsc.
  Gates: tsc 0, eslint 0, **vitest 3571/0** (38 new), `verify:invariants` 37/37, `verify:naming` 25/25,
  `verify:ai-native` green, `next build` clean. Proven on Demo end-to-end BOTH ways — builder UI and
  the assistant card ("due 2026-07-23 at 9:00 AM") — with a DB read-back showing `13:00Z / hasTime=true`
  = 9:00 AM Eastern, beside the reporter's own WO #60 still at `dueAt=null`. QA fixtures cancelled.

- **Confirmed action cards no longer stick, and the next card actually comes up** (feedback
  `cmrwiky4p…`, Demo). Reporter issued two nutrient work orders in one turn (Day 1 Fermaid-O, Day 2
  DAP); confirming the first left it on screen at full height and the second never surfaced. **Three
  defects, only the first of which the ticket describes:**
  • a resolved card was immortal — the green state kept the whole card (preview + task table + cost +
  diff) forever. Now it lingers ~2.2s then folds to a one-line receipt, KEEPING the outcome message
  and the "View X →" link (deleting it would take away the user's only pointer to what was written).
  • 🔻 **the auto-follow switched itself off permanently, and this is the real reason the second card
  was unreachable.** `shouldStickToBottom(el)` was measured **inside the effect that runs AFTER React
  committed the new content**, so it asked "is the user near the bottom of a transcript that just grew
  by a 320px card?" — always no. One tall item in one render killed following for the rest of the
  session. In the dock (a ~180px scroller) the FIRST proposal card did it. The gate now reads a
  `stickRef` written only by real scroll events, i.e. where the user was BEFORE the content arrived.
  • ⚠️ **voice had a single card slot** — a second `proposal` event in one turn OVERWROTE the first, so
  an announced write became permanently unconfirmable. Now a queue, and a confirmed card retires
  instead of staying pinned above the composer for the rest of the session.
  🔎 **The reveal's first cut was subtly wrong and only measurement caught it:** bottom-align-if-below /
  top-align-if-above looks complete, but a 320px card in a 180px scroller that has scrolled off the TOP
  has its bottom edge above the fold too — so it took the top-align branch and "revealed" the card with
  Confirm just as unreachable as before (feedback #203 all over again). Anything taller than the
  viewport now gets its FOOT pinned.
  Gates: tsc 0, eslint 0, **vitest 3529/0**, `verify:naming` 25/25, `next build` clean. Browser-QA'd on
  Demo end-to-end in the dock (two cards → confirm → fold → next card's Confirm in view → confirm →
  none remain); QA work orders cleaned up with `scripts/qa-cards-clean.ts`.

- **The assistant can read a vessel's/lot's OPERATION history — MERGED + LIVE** (PR #468, squash
  `a9016c3f`, branch pruned; feedback `cmrwdgt2u…`, the ledger counterpart to #463's chemistry read). Nothing in the assistant surface touched `LotOperation` — `query_transfers`
  is RACK-only, `query_audit` is entity CRUD (cellar ops are not audit rows), `query_cellar_contents`
  is point-in-time — so "what additions did we make to T2" had no path. `query_operations` wraps the
  **same loaders the pages render from** (`getVesselTimeline` / `getLotDetail`), so it cannot drift
  from what the operator sees. Russell's two scope calls: a vessel question means the **current fill**
  (`allTime` opts out), and the sweep ships in v1 ("which tanks haven't been punched down in 3 days").
  Three ways this could have lied, all closed: neutral ops (ADDITION/FINING/CAP_MGMT) carry **no**
  ledger lines so every query UNIONs `lot_treatment`; a vessel with no matching op is returned in
  `neverInThisFill`, never dropped from an "overdue" answer; and a **pre-LEDGER-12 co-resident-lot
  fan-out** wrote one treatment row PER LOT, so an addition fanned across 3 lots reported the dose 3×
  — `dedupePhysicalTreatments` collapses it (8 such groups live in Demo; caught by reading real rows,
  not fixtures). 30 new tests, suite 3425 passing, `verify:ai-native` + lint + tsc green, verified
  read-only on Demo across 12 scenarios.

- **KB citation tombstone shows an EXCERPT, not the whole withdrawn document — MERGED + LIVE**
  (PR #462, squash `8f6099b5`, branch pruned). From Russell's copyright question: paraphrase-with-
  citation IS the right shape and `search-knowledge-base.ts` already does it, but **citation cures
  plagiarism, not infringement**. `renderTombstoneHtml` served up to 20,000 chars verbatim precisely
  when a publisher had pulled the page. Now `buildTombstoneExcerpt` caps at 600 chars on a word
  boundary, `take: 3` on the read, truncation disclosed, `noindex, noarchive`, plus a **retraction**
  warning (a safety point, not only a legal one). 10/10 tests. Not browser-verified — the tombstone
  only renders for a *withdrawn* document.

- **Voice mode no longer cuts the user off mid-thought (ticket `cmrvhj5b8…`) — MERGED (PR #460,
  squash `ddeeaaf8`).** Reporter, hands-free on a phone: *"it would maybe let me talk for like 30
  seconds before it would just start thinking."* **The 30 seconds was a red herring — there is no
  utterance cap anywhere**; `DEFAULT_VAD_OPTIONS.hangoverMs` was a FLAT 1200ms, so 30s was simply the
  first time he paused longer than that. People thinking out loud pause about that long constantly.
  Now adaptive (1600ms base → 3000ms cap, scaling with how long the speaker has held the floor) plus
  onset/release hysteresis (0.04 to start, 0.025 to stay), with a **"✓ Done talking"** control as the
  opt-out. ⚠️ **Barge-in stays deliberately FLAT** — lowering that bar lets the assistant's own echo
  sustain a run ([[voice-mode-barge-self-interrupt]]). Still needs Russell's phone re-test: the pure
  timing is tested, the *feel* can't be. ⚠️ The AGENTIC_FIX agent raced this ticket and its draft
  PR #457 changed **only the test file**, asserting a fix it never made to `vad.ts` — red CI from the
  first push, closed as superseded. `gh pr diff --name-only` before trusting a red auto-fix PR. Also:
  `closeFeedbackItemCore` does NOT neutralize a `PR_OPENED` run (only `QUEUED`/`AWAITING_APPROVAL`),
  so the ticket would have closed still advertising the dead PR.

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

_Last updated: 2026-07-28 — **Plan 104 / Phase 3b BUILT** on `claude/cellarhand-v2-phase3b-ia-41e485`
(5 commits). The v2 nav's blocking gap is closed: every static route is nav-reachable,
palette-findable, or exempt with a stated reason, and `test/route-reachability.test.ts` fails CI on
the next orphan. `SectionNav` finally has consumers. Two plan corrections, both source-verified:
`/bottled` + `/finished-goods` are redirect stubs (so Unit 7 does not exist), and `/assistant` +
`/winemaking-calculator` are palette-only because `AssistantDock` had to stay diff-empty. Everything
is behind `NEXT_PUBLIC_NAV_V2`; flipping it is still a separate decision. Suite 5,513 passing (one
documented whole-suite contention flake), tsc clean, lint 0 errors._

_Last updated: 2026-07-28 — **Phase 4 (Ctrl-K palette + global search) and Phase 5 (SavedViews/Narrow + derived StageIndicator) BUILT** on `claude/cellarhand-v2-next`. Phase 2/3 shipped as [#557](https://github.com/russellmoss/wine-inventory/pull/557). Keyboard hints are **Ctrl, never ⌘** (owner instruction; deliberate deviation from the handoff — the crew is on Windows), with a permanent guard against Mac modifier glyphs in `src/`. Search tenancy is the real risk and is tested: extended prisma client only, role from the session never the client, every branch bounded. Suite 428 files / 5,277 passing (one documented flake). Axe green on /login at both viewports.

Also this date, from the KB session on `main`: _Last updated: 2026-07-28 — **Plan 100 corpus repair campaign DONE**: ~3,270 of ~3,312 documents
re-chunked across all 22 affected sources; ~20 correctly refused by the numeric-loss guard, which
surfaced a SEPARATE pre-existing bug (long headings-as-citation-blurbs silently truncated by
`capBreadcrumb`, discarding real content — not the PR #544 bug, filed in TODOS, deliberately not
patched here since another session is actively in `chunk.ts`'s breadcrumb logic). Also this date:
**Cellarhand UI/UX v2 Phase 0 + Phase 1 BUILT (10 units, 10 commits) on
`claude/cellarhand-v2-phase-reconciliation-a926e3`, not PR'd and not axe/browser-verified.** Plan
[101](docs/plans/2026-07-28-101-feat-cellarhand-v2-phase0-1-reconciliation-plan.md) is `completed`
and carries an Execution record of the eight places the plan was wrong about the repo. Green:
`tsc --noEmit`, `eslint` (0 errors), 5,068 vitest tests / 418 files, 6 new suites. Not green because
not run: `qa:a11y` + `qa:visual` (need a dev server with `.env` on THIS branch) and `npm run build`
(needs `DATABASE_URL`). The Spray Wave 1 objective is PUSHED onto the tangent stack, verbatim, under
"Also in flight" — nothing lost.
Prior: **Plan 100
SHIPPED IN FULL, all three PRs merged** ([#544](https://github.com/russellmoss/wine-inventory/pull/544) chunker fix, [#545](https://github.com/russellmoss/wine-inventory/pull/545) PNW Handbooks source, [#547](https://github.com/russellmoss/wine-inventory/pull/547) `defaultEnabled` flip — Russell's call, live for every tenant): the chunker was silently DELETING text (`splitBySentences` used `String.match(/g)`, which skips spans it cannot match, so `0.5 lb ai` indexed as `5 lb ai`). Fixed, with a lossless scanner + a standing ingest-time numeric-integrity guard + `CHUNKER_VERSION` folded unconditionally into `deriveIndexHash`. Measured read-only: **~630 of 3,299 corpus documents corrupted, about 1 in 5** (candidates 44/64; random non-candidates 16/90 = 18.2%) — the monthly sweep now progressively repairs what it re-fetches; a dedicated repair campaign for the rest is NOT run and needs a go-ahead. PNW Handbooks is live for all tenants: 59 documents / 142 chunks, KB-1-clean. Task branches pruned (local + remote). Correction to the note below: **SKB PR 1 has since MERGED as #538**, so the KB-1 gate is on main. Also this date: **S5a Unit 0 gate ANSWERED: the powdery index is a NO-GO on reconstructed hourly (all 8 sites failed; consecutive-hours-in-band MAE 2.2–3.4 h against a rule thresholded at 6 h; unsafe-miss 13.6% at Madera). S5a ships the LEDGER ONLY; the index moves to S5b behind S1, which is now load-bearing for powdery mildew and not just leaf wetness. Bhutan's daily series may be 8–9 °C off vs ERA5 — escalated as its own investigation.** Also this date: plan 098 tenant unit preferences built (all 12 units; QA + ship pending); S2b product-facts FOUNDATION merged + live (#535), phase still open. And: **SKB PR 1 + Unit 5 BUILT AND QA'd on `claude/skb-knowledge-sources-plan-bd36b7` (units 1/2/3/5 of 11, not yet PR'd): the KB-1 tabular-vs-prose boundary is enforced INLINE at the pre-extraction seam, `search_knowledge_base` refuses the legality VERDICT rather than the query, and `allowPaths` exists. Units 4 + 6-11 all need .env / live crawls / an operator-gated probe.** Prior: **Spray Wave 1: S0 (weather-lane spike, lane A) COMPLETE — PR [#528](https://github.com/russellmoss/wine-inventory/pull/528): the gate is answered and S1 is NARROWED to eastern regimes (reanalysis inputs fail at coastal-fog and hot-arid-interior sites, both live Demo sites). No production code, 0 Neon branches left, all gates green.** **TENANT-3 swept + closed structurally: `runAsTenant` now forces its callback
inside the ALS scope, 8 call sites rewritten, `verify:tenant-callbacks` + `test/tenant-context-lazy.test.ts`
added, CI wired. `verify:reminders` recovered from red-on-`main` to 15/15.** Also this date: **S3a spray
record SHIPPED: PR1+PR2 merged (Wave 2 unblocked), PR3 browser-QA'd GREEN (2 findings found+fixed: prefill
area provenance, correction UTC→datetime-local shift). S2 (registration + resistance) BUILT — schema slice
merged (#522), Units 2-11 green (#525), 2,420 grape registrations + 361 AIs live with zero unclassified.
S4 (phenology + growth) SHIPPED — #521 + #526 + #529 merged and live, 135 new tests, browser QA GREEN (the
S4 blocker was a one-line isTenantAdminLike gate on the field-notes page); scouting coverage 0/0 = NOT YET
MEASURABLE, recorded as-is.** ⛔ **Do NOT read #529 as clearing the GLOBAL-model/RLS-child seam — that
re-grade was WRONG. It only routes admin-like roles; a real `role:"user"` manager still gets
`vineyardIds: []` and `/users` silently WIPES memberships the moment `DATABASE_URL` is `app_rls`.
[#530](https://github.com/russellmoss/wine-inventory/pull/530) is the fix — CI green (`check` +
`tenant-isolation` + `review`), `main` merged in, browser-QA'd on Demo, ready to land. ⚠️ Still open for
Russell: is Vercel's production `DATABASE_URL` `app_rls` or still `neondb_owner`? That decides whether
this was already live in prod or latent (the Vercel env page is blocked to the agent, prod needs a
login, and Neon telemetry is unavailable in this region).** Prior: **detour resolved and LIVE on `main`: the `compliance-fill-pdf` CI flake is
fixed** (PR #492, squash `896fec40`; branch + worktree deleted). pdf-lib's default `parseSpeed` is `Slow`;
`Medium` in `fill-pdf.ts` + `Fastest` + a 30s timeout in the test take the round-trip from 5380ms-under-
load to 1139ms with assertions untouched. `verify:ttb` never ran (no DB in a worktree); CI was green.
Objective unchanged →
**Vineyard Intelligence P0 planned + council-reviewed (plan 094, 16 units).**
Both reviewers confirmed the convex-window/Sutherland–Hodgman reframe and both rejected the first draft's
instrument; six fixes folded in. Three corrections not to re-derive: `harmonizeValues` is backwards in
runbook §2.13, the processing baseline needs a STAC call, and the free tier binds on requests not PU.
Blocked on Unit 0 — `docs/GIS/` is untracked, and there are no CDSE credentials or blob token in `.env`.
Prior: **`/bug-triage` reconcile blind spot closed and LIVE on `main` (PR #478,
squash `0b649b74`).** Triage ranked a ticket as the run's one actionable item a day after the work shipped in a
hand-built PR #468: nothing stamped the PR on the ticket, Reconcile needs a PR on the ticket, and the
PR sweep lists only OPEN PRs. New **Merged Sweep** scans merged PRs for a feedback id in the body,
validates it through `triage:lookup` (a bogus id comes back `missing` — the DB is the gate, not the
regex), and reconciles only if still open; reconciled items are stripped from the run's actions and
build waves in JS. Also: every `feedback: plan` issue is a static TEMPLATE STUB, so "plan-ready" now
routes stubs to `/plan` instead of `/work`. Prior: **`counts.reconciled` fixed (PR #459).** A count reported
390 for one reconciled item because the Reconcile agent's schema was bare enough
(`additionalProperties: true`) to accept a stringified array, so `.length` counted CHARACTERS. Fixed at
the schema AND the call site. ⚠️ `dryRun: true` gates the Reconcile agent out entirely, so a dry run can
NEVER exercise that path — verify with a harness over the committed source, not a dry run.
Prior: **PLAN 090 UNITS 1-9 DONE (12 commits, unpushed); the PRODUCTION RE-INDEX
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
Prior: **the assistant can finally read a tank's Brix back** (bug report
Prior: **the assistant can now read a vessel's/lot's operation history back**
(feedback `cmrwdgt2u…`) — the ledger counterpart to the chemistry read below. `query_operations`
reuses the vessel-History and lot-timeline loaders verbatim, defaults a vessel question to the
current fill, and sweeps a whole vessel type for "which tanks are overdue for a punchdown". The
load-bearing catch came from reading real Demo rows rather than trusting fixtures: **one physical
action on a pre-LEDGER-12 vessel wrote one treatment row per co-resident lot**, so a dose fanned
across 3 lots would have been reported 3×. Prior:_

_2026-07-22 — **the assistant can finally read a tank's Brix back** (bug report
`cmrw8s5ct…`, PR #463). It could write a chem panel and read current contents but had no read tool
for `AnalysisPanel`, so a tank-Brix question reached for the vineyard-block ripeness tool and
dead-ended in "open the lot page". `query_measurements` covers a lot, a vessel, a vessel range, or
every vessel of a type. **Russell's scope rule is the load-bearing part: never average across
vessels** — comparisons are per-vessel enumeration or a ranking sort, so "which tank is closest to
dry" names a tank instead of inventing a cellar-wide number. Guarded against the two ways a ranking
lies: readings of different ages (staleness warning; the live sweep hit a real 18.4-day spread) and
vessels with no data (reported, never dropped). 25 new tests, suite 3377/0, verified read-only on
Demo across 10 scenarios. Prior:_

_2026-07-22 — **the KB citation tombstone no longer re-serves a withdrawn document in
full.** From Russell's copyright question: paraphrase-with-citation IS the right shape and the
assistant already does it, but citation cures plagiarism, not infringement — and one path
(`renderTombstoneHtml`) served up to 20,000 chars verbatim precisely when a publisher had pulled the
page. Capped to a 600-char excerpt via a pure, tested `buildTombstoneExcerpt`, `take: 3` on the read,
truncation disclosed, `noindex, noarchive`, plus a retraction warning (safety, not only legal).
10/10 tests, tsc + eslint clean. MERGED as **#462** (`8f6099b5`); not browser-verified — the
tombstone only renders for a *withdrawn* document. Prior:_

_2026-07-22 — **voice mode no longer cuts the user off mid-thought** (ticket `cmrvhj5b8…`,
PR #460 MERGED `ddeeaaf8`, ticket RESOLVED, branch pruned). The listen VAD's flat 1200ms silence bar
became an adaptive 1600→3000ms one that scales with how long the speaker has held the floor, plus
onset/release hysteresis so a trailing syllable doesn't start the clock; a "Done talking" control is
the opt-out. The reported "30 seconds" was a red herring — there is no utterance cap, that was just the
first pause over 1.2s. tsc + eslint + 3338 tests green on main. ⚠️ The auto-fix agent raced this ticket
and its draft PR #457 changed ONLY the test file (red CI, tests for a fix it never made) — closed as
superseded. NOT browser-verified: the fix is about how a real pause FEELS, so Russell has to re-test on
a phone. Prior:_

_2026-07-21 — **the backlog is CLEAR: 0 active feedback items, 0 open PRs.** A full
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

_Last updated: 2026-07-28 — product design audit landed (docs/audits/product-design-audit-2026-07-28.md); spray Wave 1 objective unchanged.
Phase 4/5 recorded as merged (#561); an attempted `/ship` for Phase 6 found no Phase 6 work in the repo, so it was
planned (103) and BUILT the same session on `claude/cellarhand-v2-phase6-tanks` — 13 units, 10 commits, ready to PR._

Also this date, from the KB/assistant session on `grape-kb-ingestion-a530f9`: _Last updated: 2026-07-28 —
**Tangent stack entry 1 POPPED: assistant false-source-denial (Gironde) + the legality-refusal
eval-fixture gap it exposed, both fixed and merged** ([#556](https://github.com/russellmoss/wine-inventory/pull/556),
[#558](https://github.com/russellmoss/wine-inventory/pull/558), [#559](https://github.com/russellmoss/wine-inventory/pull/559)).
Full write-up is the tangent-stack entry itself — short version: Russell live-tested the assistant
after the corpus repair campaign and it falsely denied having any Chambre d'Agriculture de la
Gironde content, even though `search_knowledge_base` returned it correctly cited; fixed with a new
deterministic retrieval-overclaim guard + a tool-description rule. Isolating that change surfaced a
SEPARATE pre-existing gap in the same legality-refusal golden (its biology negative control's
fixture never stubbed `query_climate`/`query_field_reports`/`query_spray_decision`, so the live
model's now-broader tool calls fell through to a nonsense default and derailed the answer) — fixed
with real-shaped stubs plus three tool-description cross-references, then a shared regex fix for
brittle paraphrase-matching in the other three cases. All 4 legality-refusal cases score 5/5 live
against the real Anthropic API. Spray Wave 1 and Cellarhand v2 objectives unchanged by this work._

_Last updated: 2026-07-29 — **Cellarhand v2 RFC AMENDMENT PASS complete** (docs-only, `91cd1dcd`).
All four RFCs amended in place with dated changelogs; still `proposed`. Struck one wrong finding in
the gate brief (**OD-7** — Phase 9 HAD landed; the brief was written from a checkout one commit
behind, at `f7040b7e`). Reversed RFC-002 §3.4 toward the shipped `topping.ts` because the proposed
op shape violates `LEDGER-6` and its `EXTERNAL` workaround would silently break the 5120.17 fold.
Owner now owes exactly two answers: **OD-3's membership half** and **OD-4**. Spray Wave 1 unchanged._

_Last updated: 2026-07-29 (later) — **Cellarhand v2 domain gate CLEARED.** Owner answered both
blocking questions: OD-3's membership half → **work-order snapshot** (ADR 0014, invariant GROUP-3,
no `addedAt`/`removedAt`), and OD-4 → **nominal allowed and badged *nominal*** (`CaptureMethod.NOMINAL`
joins `DERIVED` in M1; provenance is now a trinary). Both recorded in the RFCs, the ADRs and the gate
brief. Phase 7 is unblocked. Only open owner call left is RFC-004 §3.5.1's rate limit, a Phase-10
item. Spray Wave 1 unchanged._

_Last updated: 2026-07-30 (later) — **M1 SHIPPED AND LIVE IN PRODUCTION** (#568 -> e8fa98ce; migration applied 15:49:55, verified against the live enum, not inferred from the merge). #567 merged (0da23c88). Unit 2 is unblocked; next action is /work from Unit 2 on claude/cellarhand-v2-phase7-m2._

_2026-07-30 — **Phase 7 PLANNED + APPROVED; M1 built and PR'd.** Plan 106 written
against `main` @ `91cd1dcd` with 13 RFC-vs-code findings; PR #567 merged (`0da23c88`) so the amended
RFCs + ADR 0013/0014 + GROUP-1/2/3 are on `main`. **F3 is the finding that resized the phase:**
`WorkOrderTask` has no group reference and `resolveGroupMembers` discards the group id, so ADR 0014's
"a DRAFT reads live membership" is false against the code — GROUP-3 would have been a green check
over a no-op. **F13 was found while building M1:** the enum widening broke `tsc` in three files, so
M1 also carries RFC-000 §2's "filter on type" enforce step. **Unit 2 is blocked on the M1 DEPLOY, not
the merge.** Spray Wave 1 unchanged._

_Last updated: 2026-07-30 (later still) — **Cellarhand v2 Phase 7 Units 2–12 BUILT** on
`claude/cellarhand-v2-phase7-barrel-groups-2e50fe` (6 commits). Four migrations pending on
production: /cellar/groups 500s until they are applied. GROUP-1/2/3 flipped to `guarded` with three
guards, each observed FAILING before it passed (verify:invariants 53/53). The OD-3 partial-index
question is resolved by denormalising `groupType` with two triggers owning it — a partial index
predicate cannot reference another table. F3 was the real work: WorkOrderTask had no group reference
at all, so the snapshot had nothing to snapshot from. Deliberately NOT built: AD_HOC creation, the
group EDITING UI (/cellar/groups is read-only), SC-08. /bulk group create+deactivate is now
admin-only — a real behaviour change, D7. Spray Wave 1 unchanged._

_Last updated: 2026-07-30 (late) — **recorded-volume correction built + DB-proven** on
`claude/barrel-volume-edit-d09b07` @ `c738b391` (feedback `cms8a9nau0005i8045l65vomp`). The feature
request also uncovered a real defect: an upward volume adjustment was routed through the DRAW helper
and threw, which is why the reporter's edit appeared inert. Awaiting browser QA, then PR. Previously:
**Cellarhand v2 Phase 7 MERGED + LIVE** (#569 -> `1a1e2d1a`;
four migrations applied to production 19:57, verified against the live DB). An adversarial review
caught that GROUP-3 was enforced on a column nothing read — green CI, wrong path — fixed in
`55d437fc` and the guard rebuilt to read the real one. Pruned the empty `phase7-m2` collision branch
and two merged worktrees. Spray Wave 1 unchanged._

_Last updated: 2026-07-31 — **Map Explorer: taller maps + an on-map layer key that genuinely restacks.**
Built on `claude/map-explorer-layers-height-5cd415`, browser-proven against the live pane, not yet PR'd.
The reorder bug was structural (a raster and a vector cannot restack inside Leaflet's single shared
`overlayPane`); the fix is one pane per stack slot. Blocks joined the stack as a toggleable, per-block
layer. Full suite 5,688 passing; 14 new tests for the pure slot arithmetic._

_Last updated: 2026-07-31 (later) — **Map Explorer chrome collapsed to TWO buttons.** Owner asked for
one "Menu" disclosure holding layers → export → history → hide pin (in that order), under Fullscreen,
top-right; the separate top-left layer card is gone. Measure/Clear-lines went in too, so editable maps
carry the same two buttons. Verified live: order correct, the menu survives a layer toggle (so you can
restack several), closes on outside pointer-down and on Escape (fullscreen's Escape defers to it)._

_Last updated: 2026-08-02 — **prod OAuth login report closed out** ([#573](https://github.com/russellmoss/wine-inventory/pull/573)
-> `b46d90f5`; check/tenant-isolation/GitGuardian green, Vercel production deploy succeeded, fix
re-verified against prod). The reported 500 remains WITHOUT a root cause — it did not reproduce and the
database showed the user's Google sign-in had already succeeded; what shipped is the reason it was
invisible._

_Last updated: 2026-08-02 — **assistant read-aloud shipped and live**
([#574](https://github.com/russellmoss/wine-inventory/pull/574) -> `a3b3cded`; check / review /
tenant-isolation / GitGuardian green, Vercel production deploy succeeded). A 🔊 speaker on every finished
assistant reply, mic-free, reusing `/api/assistant/speak`. Live QA is the owner's — it was not
browser-verified locally._

_Last updated: 2026-08-03 — **recorded-volume correction rebased onto `main` @ `5db70812`**
([#571](https://github.com/russellmoss/wine-inventory/pull/571), still OPEN). No code changed: the PR
had been unmergeable for 3 days on a single conflicting path, `NOW.md` itself — the only overlap
between its 15 files and the 21 that main touched in #572 / #573 / #574. `git merge-tree` named that
one path and nothing else; all 969 lines of feature code auto-merged clean. Resolved by keeping both
histories and promoting the recorded-volume block to the current objective. Still unmerged, and still
carrying the `computeProportionalDraw` defect fix — `/bulk`'s volume input has been silently inert for
increases the whole time it waited._

_Last updated: 2026-08-04 — **recorded-volume correction MERGED AND LIVE**
([#571](https://github.com/russellmoss/wine-inventory/pull/571) -> `3de798e8`; check / review /
tenant-isolation / GitGuardian green, Vercel production deploy completed 03:06:57Z). It had been open
and abandoned since 07-31, unmergeable for 3 days on `NOW.md` alone — the only overlap between its 15
files and the 21 that #572/#573/#574 touched. Rebased, resolved, merged. **Two loose ends:** (1) the
feedback ticket `cms8a9nau0005i8045l65vomp` is still unresolved — the write-back needs `triage:resolve`
from a checkout with `.env`; the `/bug-triage` MERGED SWEEP should reconcile it, since the PR body
opens with ``Closes feedback `cms8a9nau0005i8045l65vomp` `` and the merge is well inside the 14-day
window. (2) Barrel B3 is **still recorded at 100 L** — the capability shipped, the reporter's data was
deliberately not edited._

_Last updated: 2026-08-04 (later) — **bug-triage live run complete; the backlog's shape is the
finding.** 28 items → 7 primaries, 5 product-gap / 1 defect / 1 unclear, and **zero build waves** —
the constraint is planning and investigation, not builders. Merged sweep reconciled
`cms8a9nau0005i8045l65vomp` (shipped in #571, `prUrl` was null) and correctly declined two ids intake
already owned. 0 ERP conflicts, 5 cautions, all of the same mutate-history class. Runbook:
`TRIAGE-RUNBOOK.md`. Getting the run to launch took clearing four blockers worth remembering: a main
checkout 32 commits stale on a docs branch, broken IPv6 on an iPhone-hotspot network (Prisma's Rust
engine takes the AAAA answer and gives up where every Happy-Eyeballs tool silently fell back), no
`.env` in the worktree the session was rooted in, and 2,095 CRs in `.claude/workflows/bug-triage.js`
(the `eol=lf` pin only applies at checkout, so an already-checked-out copy stays CRLF and the Workflow
approval dialog refuses it)._

_Last updated: 2026-08-04 (later still) — **P0 assistant investigation: two defects fixed and live,
reported root cause still open** ([#581](https://github.com/russellmoss/wine-inventory/pull/581) ->
`69522112`; check / review / tenant-isolation / GitGuardian green, Vercel production deploy completed
17:34:37Z). Shipped: Sentry capture on BOTH assistant catch sites, `maxDuration` 60 -> 300, and a soft
deadline that winds the tool loop up before the platform kills it. Ticket `cmsdy4uom0006jp04iav07edp`
stays OPEN on purpose. Two lessons worth keeping: (1) **an error path that logs nothing is itself the
P0** — same shape as the OAuth/Sentry finding on 08-02, twice in one week; (2) **an `assistant-fix/*`
or `claude/*` branch gets NO Vercel preview** — `vercel.json`'s `ignoreCommand` exits 0 for exactly
those patterns and exit 0 means SKIP, so those branches are verifiable only after landing on main._

_Last updated: 2026-08-05 — **REDIRECT-1 fixed in the working tree (not committed, not PR'd).** A
broad code-health review flagged six findings; the owner picked finding 2. `requireReadyUser()` does
not return a decision — it calls Next's `redirect()`, which signals by THROWING `NEXT_REDIRECT` — and
21 actions ran that gate INSIDE a catch-all, so an expired session rendered the literal string
`NEXT_REDIRECT;replace;/login;307;` instead of bouncing to /login. Fixed with `unstable_rethrow(e)` as
the first statement of 10 catch blocks (`weather/actions.ts` ×8, and the duplicated `withTenant`
wrappers in `spray/actions.ts` + `harvest/planned-harvest-actions.ts`). New guard
`scripts/check-redirect-passthrough.ts` (`verify:redirect-passthrough`, static AST scan over
`"use server"` files, wired into CI's `check` job) + register note REDIRECT-1 + the INVARIANTS.md
narrative. **The guard was proven by reverting the fix — it flags 9 sites red and goes green when
restored**; it also correctly IGNORES `listNearbyStations`, whose gate sits above the try. Local gate
green: tsc clean, lint 0 errors, 464 files / 5,768 tests passing, all 9 CI static guards pass.
Two things worth carrying forward: (1) the same three files each hand-rolled a `withTenant` +
a local `ActionResult` type that drops the canonical `code` field and returns raw `e.message` to the
browser — review finding 3, still open; (2) the review's **finding 1 is the bigger one and is
untouched** — the D9 vineyard ACL (`canAccessVineyard`) is referenced in only 8 files, so weather,
spray, soil, plantingArea, spatial and vineyard-block CRUD authorize to TENANT only. A manager scoped
to vineyard A can delete a block in vineyard B, while the assistant's own `db_update` refuses exactly
that ("You can only edit records in your assigned vineyard"). The LLM path is stricter than the GUI._

_Last updated: 2026-08-05 (later) — **VINEYARD-1 closed in the working tree (not committed, not PR'd).**
Review finding 1: `canAccessVineyard` (D9) is an INTRA-tenant fence and Postgres does not enforce it (RLS
scopes by TENANT), so it held only in the 8 files that applied it — leaving **53 exported actions** across
weather, spray, soil, planting areas, NDVI and block CRUD authorized to tenant only. A manager assigned to
vineyard A could read AND mutate vineyard B. Owner chose the full scope (writes **and** reads) and
fail-closed on an empty membership set. Shipped: new `src/lib/vineyard/scope.ts` (one authority, all FK
paths documented) + gates on 66 exported actions across 10 modules, guard
`scripts/check-vineyard-scope.ts` (`verify:vineyard-scope`, static AST, in CI's `check`), 13 unit tests,
register note VINEYARD-1 + INVARIANTS.md narrative. Guard proven by reverting: **53 red, then green**.
Three things worth carrying forward: (1) the proof it was a bug and not a policy was INTERNAL — `entities.ts`
marks `Vineyard`/`VineyardBlock` `vineyardScoped: true` and `db_update` already refused out-of-scope edits,
so the assistant path was stricter than the GUI path for the same rows; (2) **keyed actions throw, list reads
filter** — a manager legitimately sees a subset, so throwing would blank a working board, while returning []
on a keyed action would disguise a denial as "no data"; (3) spray gates on the **footprint** (every vineyard
its block lines touch), never the header `vineyardId`, which is only "defaulted from the FIRST block line" —
trusting it would let a manager name their own vineyard while spraying another site.
⚠️ **BEHAVIOR CHANGE ON A LIVE TENANT, read before merging.** A non-admin with NO `user_vineyard` row now
loses these surfaces (the security register notes the live DB holds ONE such row). That is the fail-closed
direction plan 092 requires, but assign memberships to any real `role: "user"` account first, or they will
hit "You can only work with your assigned vineyard." `runNdviSweepNowAction` is now admin-only (a
tenant-wide job has no vineyard to scope by). This is an app-layer fence with ZERO DB enforcement and does
NOT replace plan 092 / Phase 23, which moves it into a capability matrix + RESTRICTIVE RLS quad; when that
lands, supersede VINEYARD-1 rather than deleting it. Local gate green: tsc clean, lint 0 errors,
465 files / 5,781 tests, 12 CI static guards. Review finding 3 (duplicated `withTenant` + a local
`ActionResult` that drops `code` and returns raw `e.message`) is still open._

_Last updated: 2026-08-05 (later still) — **GLOBAL-1 closed: the SECOND branch of the VINEYARD-1 rule
(not committed, not PR'd).** `assertScoped` (in BOTH `db-update.ts` and `db-create.ts`) reads
`if (entity.vineyardScoped) { …membership… } else if (!isTenantAdminLike(user)) throw "Only an admin or
developer can change global records."` — VINEYARD-1 closed the `if`, and the `else` was still open, so
**13 GUI writes** let any authenticated user rename the tenant's varieties, add/deactivate locations,
add/retire a tank, and create finished goods + categories that the assistant refused them. Fixed:
`locations`/`vessels` → `adminAction`, `inventory` catalog paths (`importInventory`, which creates
categories via ensureCategory, and `addFinishedGoodAction`) → admin, and `reference/actions.ts` gets a
**per-kind** gate. Also folded in the regulatory one: **`upsertTenantProductFacts` wrote
`worstCaseReiHours`/`worstCasePhiDays` (worker re-entry + pre-harvest intervals, snapshotted onto every
later spray record) behind `requireReadyUser()` alone** — the authorization side of PEST-1 (critical):
PEST-1 stops the DATA path rendering an unknown as a clearance, but an unprivileged user could type a
number. New guard `verify:global-catalog-admin` (GLOBAL-1, in CI's `check`), 8 tests, register note +
narrative. Guard proven by reverting: **13 red, then green.**
Three things worth carrying forward: (1) **`reference/actions.ts` must stay polymorphic** — its `RefKind`
is `"variety" | "vineyard"`, so a blanket `adminAction` would be wrong in the OTHER direction and lock
managers out of their own vineyard; a test asserts it still uses the open `action` wrapper with the gate
inside; (2) that same module mutates **Vineyard** rows, which the first VINEYARD-1 sweep MISSED because
the module name gives no hint — it is now in that guard's list too (71 actions / 11 modules); (3) the
CATALOG-vs-OPERATIONAL line is drawn from the assistant itself — `adjust-inventory`/`adjust-consumable`
are not `adminOnly`, so stock movement stays open, and `findOrCreateWineSku` is deliberately untouched
because it runs inside a bottling flow and gating it would block bottling for cellar staff.
⚠️ **KNOWN UX FOLLOW-UP, deliberately not done:** `/vessels`, `/locations`, `/reference` and `/inventory`
do NOT gate their edit UI on admin, so a non-admin now sees Add/Edit controls that fail with "Admins
only." The server is correct; the buttons are cosmetically wrong. Hiding them is UI work across 4 pages
(DESIGN.md applies) and was out of scope for an authorization fix — flagged for a decision.
Same live-tenant caveat as VINEYARD-1: this is app-layer with ZERO DB enforcement and does not replace
plan 092, which turns role checks into a capability matrix (`configure` on settings/reference). Local
gate green: tsc clean, lint 0 errors, 466 files / 5,789 tests, 13 CI static guards. Review finding 3
(duplicated `withTenant` + a local `ActionResult` that drops `code` and returns raw `e.message`, with
only 6 captureException in all of src) is still open and is now the top remaining item._

_Last updated: 2026-08-05 (evening) — **VINEYARD-1 runtime proof written and wired into CI; NOT yet
executed against a real database (no .env / Postgres / Docker on this box).** Before this, the fence was
verified only statically + by unit tests on pure logic — nobody had ever observed it deny anything, which
is a weak claim for an authorization control. Added `scripts/verify-vineyard-scope-runtime.ts`
(`verify:vineyard-scope-db`) + a new CI job `vineyard-scope-db` that runs it against a throwaway pgvector
Postgres **as `app_rls` (NOBYPASSRLS)** — the role the app actually runs as, and the only role the proof
is meaningful under. It creates and deletes its OWN throwaway tenant, so it needs no seed.
The proof is now three parts, none sufficient alone: (1) static — every action reaches a gate;
(2) runtime — the FK paths resolve to the right vineyard, a CROSS-SITE spray record reports BOTH its
vineyards, and the membership set actually LOADS; (3) unit — the fail-closed decisions. Check (2)'s
membership assertion is load-bearing: per the security register 2026-07-26 `vineyardIds` was silently
`[]` for every user under app_rls, and **an empty set makes every deny-check vacuously pass**, so a
totally broken fence looks identical to a working one.
⚠️ **A refactor was required to make this possible, and it is the interesting part.** The gates reach
`getActionUser()` → `@/lib/dal` → `next/navigation`, so importing `scope.ts` from a plain `tsx` process
dies on `React.createContext is not a function` (Next's CLIENT router context) before touching a DB — i.e.
the first version of this script could never have run, in CI or anywhere. Split into
`src/lib/vineyard/scope-core.ts` (SCRIPT-SAFE: prisma + access + action-error only — the repo's existing
`*-core.ts` convention) and `scope.ts` (the session gates, re-exporting the core so no call site changed).
Verified locally as far as is possible without a DB: the script now loads, reaches its first query, fails
LOUDLY with a clear error, exits 1, and does NOT print a success line. Local gate green after the split:
tsc clean, lint 0 errors, 466 files / 5,789 tests, 10 static guards. **Still to do: run
`npm run verify:vineyard-scope-db` once against a real Postgres** (or just let the new CI job run it on
the PR) — that is the first time the fence will actually be observed denying anything._

_Last updated: 2026-08-05 (late) — **self-review of the four changes found TWO defects in my own work;
both fixed.** (1) **Gate placement broke the return-don't-throw contract.** In the three modules whose
header says "actions RETURN { ok:false, error } rather than throwing — production redacts thrown errors",
I had put the D9 gates OUTSIDE the error envelope: 4 spray + 2 planned-harvest gates sat before
`withTenant(...)`, and 3 weather gates sat outside any `try`. Security was correct (denied either way) but
the DENIAL MESSAGE was lost — a refused manager would have seen Next's opaque "An error occurred in the
Server Components render" instead of "You can only work with your assigned vineyard." Fixed by moving the
spray/planned-harvest gates INSIDE the `withTenant` callback (also more correct — the resolvers hit prisma
and now run under an explicit `runAsTenant`) and adding a `gateVineyard()` denial helper to weather in that
module's own idiom. `loadVineyardClimateSummary` and `refreshVineyardWeather` still throw, correctly: their
signatures carry no error channel. (2) **The GLOBAL-1 guard had a silent hole** — its read-name heuristic
skipped any export starting with get/find/check/search, so a future `getOrCreateVariety` or
`findOrCreateSku` write would have bypassed the guard with NO warning. Now a read prefix only counts as a
read if the name contains no write verb; verified `getOrCreateSku`/`findOrCreateWineSku`/`checkAndCreate`
are all CHECKED again. Lesson worth keeping: **both defects were in the parts I wrote by scripted bulk edit
and then only verified with green guards** — the guards passed the whole time, because neither of these is
a thing they measure. Re-verified after the fixes: tsc clean, lint 0 errors / no new warnings, 466 files /
5,789 tests, 10 static guards green, and a re-run of the gate-placement analysis reports 0 defects._

_Last updated: 2026-08-05 (night) — **data-layer workstream A COMPLETE (uncommitted): the referential
graph is no longer invisible.** Measured first, and two premises turned out false: enum discipline is
GOOD (116 real enums vs 15 validated strings) and tenant isolation is genuinely strong — so neither is a
data-layer problem. What IS structural: **42% of models (79/188) carry reference columns with no Prisma
`@relation`**, because cross-tenant-risk FKs are composite `(tenantId, refId) → (tenantId, id)` and Prisma
cannot express them. **291 composite constraints existed only as SQL inside 186 migration files** — nothing
checked that a new `*Id` column got its constraint, or that a drop was noticed, and `migrate diff` is
documented broken here. Owner chose: **keep composite FKs, tool around them** (the safety property is
worth the tax), and for money: **design so either GL future stays open** (no lock-in).
Shipped: `gen:fk-registry` (replays the migration history → `prisma/fk-registry.json`, 435 constraints /
337 composite / 98 simple), `verify:fk-registry` (FK-1 static guard, in CI's `check`),
`verify:fk-registry-db` (proves the registry matches `pg_constraint` **including column order**, in the
renamed `db-proofs` CI job), register note FK-1 + INVARIANTS narrative + the triage table in
`docs/architecture/data-model.md`.
Four things worth carrying forward: (1) **replay was necessary, not defensive** — my grep found 2 FK
drops, the replay applied **20**, so collecting additions alone would have let stale definitions win;
(2) the guard converted an invisible graph into **157 → 89 → 85** undeclared columns, where ~45 of the
first cut were never FKs and *could not be* (actor snapshots point at the GLOBAL `user` table, which has
no `tenantId`, so a composite FK is impossible and a simple one would make accounts undeletable);
(3) **`locationId` had to be exempted per column, not by name** — it is a genuine composite FK on
`cellar_material`/`supply_lot` and a documented plain ref on four other tables, so a name-based rule would
have punched a hole in the real ones; (4) the runtime proof deliberately does NOT auto-rewrite the registry
on mismatch — that would launder a detected drift.
⚠️ **Open decision, needs a human:** `Lot.origin{Vineyard,Block,Subblock,Variety}Id` — forgotten
constraints, or deliberate snapshots that must outlive a deleted vineyard? Also flagged: denormalised
`vineyardId` on `BlockSpatialMetric`/`BlockSoilSnapshot`/`SpatialDatasetDerivative` can **silently drift**
from the block's real vineyard — an integrity risk, not just a missing constraint. Ratchet is shrink-only
(a stale baseline entry also fails), so the 85 can only go down.
Local gate green: tsc clean, lint 0 errors, 466 files / 5,789 tests, 11 static guards, generator
deterministic (re-run byte-identical), and the ratchet negative-tested BOTH ways (a new undeclared column
fails; a stale baseline entry fails). `verify:fk-registry-db` has NOT run — no DB locally; it loads,
reaches its query, and fails loudly. **Next: workstream B (money value type)** — the other structural
items are B (money, 5 precisions on money columns, no value type, no GL), C (the accounting outbox is a
3-way polymorphic union that costs a schema change per new posting source), D (three parallel inventory
movement ledgers), E (plan 092 DB-enforced authz)._

_Last updated: 2026-08-05 (late night) — **#2 fixed (denormalised vineyard cannot drift) and a REAL BUG
found in my own FK generator.** Owner was right that #2 was never a decision — I had called it "worth
fixing on its own merits" and then filed it under decisions; inconsistent, corrected.
**The fix, and why it adds no cascade path.** The three `vineyardId` copies
(`block_spatial_metric`, `block_soil_snapshot`, `spatial_dataset_derivative`) were unconstrained
DELIBERATELY, to avoid "a redundant cascade path" — a fair concern. So instead of ADDING an FK on
`vineyardId`, the existing parent key was **WIDENED**: `(tenantId, blockId) -> vineyard_block(tenantId,
id)` became `(tenantId, blockId, vineyardId) -> vineyard_block(tenantId, id, vineyardId)`. Same
constraint count, same cascade topology, but a copy that disagrees with its parent is now **unstorable**
rather than merely discouraged. Migration `20260805150000_denormalized_vineyard_cannot_drift` is
repair-then-enforce per AGENTS.md, and the repair is DETERMINISTIC (the parent is the authority for its
own vineyard, so a drifted child is corrected to it — not a guess).
⚠️ **THE BUG, worth remembering.** `gen-fk-registry` applied every `ADD` in a migration and then every
`DROP` — by pattern type, not by POSITION in the file. So a migration that drops and re-creates a
constraint under the same name (exactly the shape of "widen a key") **lost it entirely**. Found because
the registry count FELL when I widened the three keys. Fixing the replay to be position-ordered recovered
**4 pre-existing constraints that had been wrongly missing**: `reservation_tenantId_taskId_fkey`,
`vessel_activity_event_tenantId_taskId_fkey`, and `spray_application_supersedes_fkey` /
`supersededBy_fkey`. **That means my triage last message was wrong** — I called the "reversal/supersede
self-references" likely omissions; two of them were always constrained and my parser was hiding them.
The shrink-only ratchet is what surfaced it: it reported 6 stale baseline entries rather than letting the
loosening pass silently. Baseline 89 → 85 (4 documented `locationId` plain refs) → **79**.
**Also answered: `Lot.origin*Id` is NOT a deliberate snapshot — it is an unconstrained reference, and the
dangling case is reachable.** Evidence: (a) vineyards ARE deletable in production —
`assistant/entities.ts:440` is the `db_delete` path; (b) of 20 inbound FKs to `vineyard` only 6 are
RESTRICT, and the one that protects lots is `lot_vineyard`, which is written by crush/press/blend/split
but **NOT** by `bulk/actions.ts:122`, which creates a lot with `originVineyardId` and no `lot_vineyard`
row; (c) `describeDelete` enumerates DECLARED relations, so it cannot see `Lot.originVineyardId` at all
and would not block the delete; (d) every real snapshot in this schema pairs an id with a LABEL
(`lotCode`, `vesselCode`, actor `email`) — `origin*Id` has no paired name column, so it is not
functioning as a snapshot. Recommendation: constrain with ON DELETE RESTRICT to match `lot_vineyard`'s
posture. NOT yet done — it is a live-data migration and wants the same repair-then-enforce treatment.
Local gate green: prisma validate + generate OK, tsc clean, lint 0 errors, 466 files / 5,789 tests,
11 static guards, generator deterministic. `verify:fk-registry-db` still unrun (no DB) — and it is now
MORE valuable, since it is precisely what would have caught the ordering bug on its own._
