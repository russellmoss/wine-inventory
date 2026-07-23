---
name: bug-triage
description: |
  Product-goalie bug-triage TEAM for the winery ERP. Works the /developer feedback
  backlog end-to-end AND keeps it honest: RECONCILES against git (closes out bugs
  whose fix PR already merged), PRIORITIZES what's genuinely active (what to smash
  first, the easy wins), ROOT-CAUSE vets every open fix PR (a real fix vs a cosmetic
  band-aid hiding a deeper bug), then ACTS — dispatches the fix agent for NEW
  no-brainers, auto-merges the tight-gate PRs, and WRITES STATUS BACK (RESOLVED on
  merge/reconcile, DISMISSED on reject, TRIAGED+verdict when handed to a human) so
  nothing lingers at NEW. Queues the rest for a human with a verdict.
  Use when asked to "triage the bugs", "work the bug backlog", "smash these bugs",
  "which bug fixes should we merge first", "merge the no-brainer bug fixes", "close
  out the resolved bugs", or to run the bug goalie. For debugging ONE specific error /
  500 / stack trace, use /investigate. For the merge verdict on a SINGLE PR, use
  /merge-check.
allowed-tools:
  - Workflow
  - Bash
  - Read
  - AskUserQuestion
---

# /bug-triage — the product goalie

`/investigate` debugs one bug. `/merge-check` triages one PR. This works the **whole
backlog** and keeps it truthful: it closes out bugs already fixed, prioritizes the
rest, checks whether each proposed fix reaches the root cause, **dispatches** fixes for
the clear ones, **auto-merges the no-brainers**, and **writes every item back to its
real status**. You approve the plan once and read the box score.

## The team (roles, run as one deterministic workflow)

1. **Intake** — pulls DB truth (`npm run triage:list`) and resolves each item's fix PR
   against git (`gh pr view` → MERGED / OPEN / CLOSED). Carries the plan/skip context
   (`modeAtSubmission`, `githubIssueUrl`, `planMarkdown`, `developerNotes`). One
   reconciled backlog.
2. **Reconcile** — a bug whose PR already **merged** but still reads NEW/TRIAGED is
   written back to **RESOLVED** — so the queue stops lying. Already-closed and
   in-flight (fix agent still running, no PR yet) items are set aside, not re-worked.
   ⚠️ This step only fires when the ticket **carries** the PR. Work that shipped in a
   **hand-built** PR (nothing stamped it on the ticket) is caught later, by the
   **Merged Sweep** — see step 6b.
3. **Cluster (dedup)** — groups the active items by **one shared root cause**, including
   **across tenants** (the fence is tenant-agnostic app code, so ONE PR fixes all).
   Each cluster elects a **primary** (furthest-along wins: open-PR > PLANNED >
   awaiting-dispatch > NEW); the rest become `linked-duplicate` and take no independent
   action. Conservative — same symptom ≠ same cause; unsure → singleton. `cluster=false`
   disables it. Only primaries flow to the next steps.
4. **Triage lead (goalie)** — first **types** each primary by its *disposition* — what KIND
   of problem it really is, judged from the root cause (see below) — then ranks by damage ×
   blast-radius (how many tenants the cluster hits) × effort and buckets each: `dispatch`,
   `review-pr`, `plan-ready`, `needs-human`, `dismiss`. The **type gates the bucket**: only a
   `defect` in-fence is dispatchable; a `product-gap` routes through the existing PLAN
   workflow when no fix conflict exists; `unclear` is `needs-human`; a
   `not-a-bug` is `dismiss`; a `model-behavior` miss dispatches only when a *new* prompt/eval
   lever exists (else `needs-human`). A **PLANNED** item is `plan-ready`; a **SKIPPED** item is
   bucketed from its skip reason. If a defect's real fix lives **outside the fence**
   (`src/lib/work-orders`, prisma, tenancy), it's `needs-human`. The goalie ALSO runs a
   separate **ERP-standards conformance pass** on every item (see the section below): would the
   *requested* change push the system of record off-standard? A `conflict` verdict hard-blocks
   automation regardless of type.
5. **Fix reviewers** — one per open PR, in parallel. Each answers the load-bearing
   question: **root fix or cosmetic band-aid?** *and* **does the diff stay standard for an ERP?**
   A symptom-silencer never auto-merges; a diff that reaches the fix by breaking a system-of-record
   standard (editing a posted record in place, hard-deleting history, widening past the tenant
   fence) is likewise queued with the concern named.
6. **PR sweep** — the feedback path above only sees a PR when an *active feedback item points at
   it*. This step triages **every OTHER open PR** — the ones built but never resolved (agentic-fix
   drafts left un-merged, automation-loop pileups like three copies of the same docs-refresh,
   standalone feats) — and buckets each: **merge** (clears the same tight gate, un-drafting a
   finished draft first), **close** (superseded / duplicate / stale — *recommend only*, never
   auto-closed), **fix-first** (failing CI or conflicting), **needs-human** (out-of-fence, large, a
   real feature). Same root-cause + ERP-standards reviewer. See "The PR sweep" below. `sweepPrs=false` skips it.
6b. **Merged sweep — "did this already ship?"** The step above sees only **open** PRs, and Reconcile
   (step 2) sees only PRs the ticket **carries**. A fix built **by hand** — by a parallel session, not
   dispatched by the feedback automation — lands in neither: nothing writes the PR onto the ticket, so
   the ticket keeps reading open while the code is in production, and triage cheerfully re-offers it as
   new work. So this step scans the **recently merged** PRs, pulls a cuid-shaped feedback id out of each
   PR **body** (matched by shape + proximity to feedback/ticket wording, because phrasings vary —
   `Closes the feedback item \`<id>\`` on a hand-built PR, `Automated fix from bug ticket \`<id>\`` on a
   dispatched one), resolves each id against DB truth with `triage:lookup`, and reconciles it to
   **RESOLVED only if it is still open**. Any such item is also **pulled back out of this run's own
   action list and build waves** — you never build what already shipped. See "The merged sweep" below.
7. **Issue sweep** — the OTHER pile that accumulates untouched: **every open GitHub issue**. Two
   classes. **`feedback: plan` issues** (opened by the plan automation) are **auto-reconciled CLOSED**
   when their source ticket is provably RESOLVED/DISMISSED — a mechanical close on DB truth, since the
   issue's own text carries only the plan-run id, not the ticket id (the map lives in the DB, read via
   `triage:issues`). **Sentry error issues** are clustered + classified — dev-worktree noise, a domain
   guard firing as designed (empty vessel / over-capacity / not-enough-stock), config/already-fixed, or
   a real bug — and **recommend-closed** (never auto; a real bug is routed to `/investigate`). See "The
   issue sweep" below. `sweepIssues=false` skips it; `maxIssueCloses` (default 10) caps the auto-closes.
8. **Act (the hands)** — dispatches AGENTIC_FIX runs, routes product gaps through
   `triage:plan`, squash-merges only tight-gate PRs, surfaces completed plans for review,
   and **closes the loop with cluster fan-out**: on a primary's
   merge/dispatch/dismiss the status write-back is applied to **every duplicate in the
   cluster** too (RESOLVED on merge, TRIAGED-linked on dispatch, DISMISSED on reject),
   so one deployed solution closes every reporter. PLANNED → TRIAGED "plan ready — run
   /work" (+ the plan link). Also **auto-closes the stale `feedback: plan` issues** the issue sweep
   reconciled. Nothing is left silently at NEW.

## The disposition axis — what KIND of problem (assigned at triage, not intake)

Not every "bug report" is a bug, and not every bug has a code lever. The goalie types each
item into **one disposition**, and the disposition decides which workflow it belongs in. This
is the granularity that stops the fixer from flailing on a problem it can't fix:

| Type | What it is | Route |
|---|---|---|
| `defect` | A real code bug with a concrete lever (wrong logic, crash, broken control) | Auto-fix if in-fence → `dispatch`; else `needs-human` |
| `model-behavior` | An LLM/assistant adherence miss (over-claimed a write, wrong tool, ignored a rule). Root cause is prompt/eval — **stochastic**, a tweak is a *mitigation*, never a guaranteed fix | `dispatch` only if a **new** prompt rule / eval golden exists (in `src/lib/assistant` + `test/`) and it wasn't already tried; a repeat of an already-shipped rule → `needs-human`. A merge does **not** "close" the behavior |
| `product-gap` | The app has no place for what the user needs — missing capability, unmodeled path, a design decision. A feature request wearing a bug costume | `triage:plan` → existing `feedback_plan`; human only when fix work conflicts. **Never** the auto-fixer |
| `not-a-bug` | Works-as-designed, user-error, permissions, or an empty-state mistaken for a failure ("the data is gone" = wrong role / no rows yet) | `dismiss` with the reason |
| `unclear` | Genuinely can't tell without digging | `needs-human` → `/investigate` |

**The reporter's intake `kind` (`BUG_REPORT` / `FEATURE_REQUEST` / `Assistant 👎`) is a HINT, not
the disposition.** A winemaker can't know if their complaint is a schema gap or a prompt miss —
the type is assigned by the goalie *after* root-cause, and recorded in the write-back note
(prefixed `[type]`) so it survives in `developerNotes` for the next run. The report returns a
`byType` tally so you see the shape of the backlog at a glance.

## Outcome notes — what gets written back (the reporter reads this)

Every action closes the loop with an **outcome note** written to the item's `developerNotes`
via `triage:resolve --note`. The note is not bookkeeping — it's what the human sees in the
`/developer` console as the item's outcome, so it must say what actually happened:

- **Fixed** → what + *how*: the root cause in a phrase + what the change/PR did.
  `[defect] Fixed — off-by-one in the racking date picker; merged PR #123 (clamp to the vintage window).`
- **Not fixed** → *why* + what's next: the reason + the next action/owner.
  `[product-gap] Not auto-fixed — no lot-level Brix field exists; routed through triage:plan.`
- **Mitigation** (model-behavior) → say it's a mitigation that may recur.
  `[model-behavior] Mitigation only — added an eval golden + tool-scope rule; adherence is stochastic, may recur.`

Rules the write-back keeps for you: notes are **prepended newest-first**, each **stamped**
`[bug-triage <iso>]`, **capped at 5000 chars** (oldest entries drop off), and every one begins
with the disposition `[type]`. On a cluster, the **same outcome fans out** to every duplicate.
The console (`/developer`) parses these stamped entries into a read-only outcome timeline and
shows the newest one inline on the backlog row — so keep each note tight (~2 lines) and factual,
and never leave a literal `<placeholder>` in a note. The repo script
`scripts/bug-triage-set-status.ts` owns the stamping/merge/cap + the audit row; the workflow
only supplies the `<note>` text.

## The ERP-standards pass — don't fix a bug by degrading the system of record

A winery ERP is not a generic CRUD app: it is an **append-only, double-entry, audited system of
record**. The most dangerous "bug fixes" are the ones that make the reporter's complaint go away by
quietly breaking that — letting a user *edit or delete a past ledger entry* (the standard is a
**correction event**), making an *executed operation editable in place* (the standard is
**supersede, never overwrite**), *syncing inventory FROM Commerce7 as truth* (the ERP is
**authoritative**, C7 is a replica), or *widening a query past the tenant fence*. Each solves the
symptom and leaves the ERP a spreadsheet.

So, independent of the disposition axis, the goalie runs a **conformance pass** on every actionable
item, asking one question: *if we built exactly what this item asks for, would it push the system of
record off-standard?* The rubric is grounded in this repo's own invariant register
(`INVARIANTS.md` + `docs/architecture/invariants/`) — append-only immutable history, correction-as-event,
double-entry conservation, immutability of posted/executed records, tenant isolation (RLS), audit-trail
attribution, master-data identity governance, exactly-once outbox posting, and compliance-chain integrity.
Each item gets one verdict:

| Verdict | Meaning | Effect |
|---|---|---|
| `ok` | Fully consistent with the standards | Normal routing |
| `caution` | Touches a governed area; buildable, but the builder must be told the standard to uphold | Builds normally; the standard is named on the runbook task |
| `conflict` | The **requested solution** can only be met by breaking a standard — the pain is real but the ask is non-standard | **Hard-blocked** from auto-merge, dispatch, and every parallel build wave; queued for a human to **redesign the ask** into a conformant shape (correction event / supersede / outbox / tenant-scoped) before any code |

The fix reviewers apply the same rubric to each open PR's **diff** (a genuine root fix can still be
non-standard). A `conflict` on either lens blocks auto-merge no matter how green the other gates are.
Every `caution`/`conflict` is reported back to you (see the report + the runbook's **⚠️ ERP-standards
pass** section) so you see, up front, which reported items would take the ERP off-standard if built as asked.

## The PR sweep — we build PRs but never resolve them

The feedback path only reviews a PR when an **active feedback item points at it**. Anything else —
an agentic-fix PR the fixer opened but nobody un-drafted and merged, three copies of the same
`docs(brain)` auto-refresh the loop kept opening, a standalone feature branch — is **invisible to
triage and piles up**. The sweep fixes that: it enumerates **every open PR** (`gh pr list --state
open`), sets aside the ones the feedback path already claimed, and runs the **same root-cause +
ERP-standards reviewer** on the rest. Each orphan PR lands in one bucket:

| Bucket | What it is | Action |
|---|---|---|
| **merge** | A complete, correct change that clears the **same tight gate** (fence-only, CI green, root/docs/chore, merge-safe, small, ERP-ok, mergeable) | **Auto-merged** — un-drafting a *finished* draft first (a draft only qualifies if it's genuinely done: green CI, coherent diff, no WIP markers). If it ties to a feedback item, that item is written **RESOLVED** too |
| **close** | Superseded, a duplicate of another open PR, or stale-and-conflicting/abandoned | **Recommend only** — the sweep **never auto-closes**. You get the reason + the ready `gh pr close` command |
| **fix-first** | Wanted, but CI is failing or the branch conflicts | Queued with `/investigate then fix` |
| **needs-human** | Out-of-fence, large, a real feature (auth/schema), or anything needing eyes | Queued with the ready `gh pr merge` command |

The un-draft-and-merge behavior is the point: it clears the built-but-unresolved backlog. It stays
**conservative** — an incomplete draft, a failing check, a conflict, an out-of-fence diff, or any
ERP-standards `conflict` never auto-merges; it's surfaced for you. Closes are always your call. The
sweep's results land in the report's **PR sweep** block and the runbook's **🧹 PR sweep** section
(auto-merged / recommend-close / fix-first / needs-human, each with a one-paste command). `sweepPrs`
(default `true`) toggles it; `maxSweepMerges` (default 5) caps auto-merges; `dryRun` reports the whole
sweep and lands nothing.

**Reconciling aged-out source tickets (closes the loop).** An agentic-fix PR names its source ticket
in the body (`Automated fix from bug ticket <id>`). When the sweep merges such a PR, it writes that
ticket back to **RESOLVED** — even if the ticket had **aged out of the intake window** (`triage:list`
caps at 8 items/tenant, so an older ticket is invisible to the feedback path). The reviewer extracts
the `linkedFeedbackId`; for any id the in-window backlog doesn't carry, the sweep resolves it straight
from the DB via `npm run triage:lookup` (read-only, cross-tenant, by id, no cap) to get its
tenant/source, and reconciles it **only if it's still open** (never rewrites one already
RESOLVED/DISMISSED). This is what stops "the fix merged but the ticket sat open forever." Reported under
the runbook's **🔗 Aged-out tickets reconciled** line and the `sweep.linkedReconciled` /
`prsLinkedTicketsReconciled` fields.

## The merged sweep — "this already shipped, stop offering it as work"

**The blind spot (observed 2026-07-23).** Triage ranked ticket `cmrwdgt2u…` ("Assistant should be able
to read a vessel's/lot's full operation history") as the run's **one actionable plan-ready item**,
pointing at plan issue #466 — a day *after* the work shipped in **PR #468** (`query-operations.ts`,
`operation-history.ts`, 30 unit tests, registered with 7 golden eval cases). It offered production code
as new work. Three facts combined:

1. PR #468 was **hand-built by a parallel session**, not dispatched by the feedback automation, so
   nothing wrote the PR onto the ticket — its `prNumber` stayed `null`.
2. **Reconcile** only closes items that HAVE a resolved fix PR. A null `prNumber` means it was never
   even a candidate.
3. The **PR sweep** enumerates only `--state open`. A PR that merged *before* the run is invisible to
   it, so the `linkedFeedbackId` body-extraction that already works for sweep-merged PRs never ran.

**What the merged sweep does.** Scans `gh pr list --state merged` (bounded — see the args), extracts
every cuid-shaped id near feedback/ticket wording from each PR **body**, resolves them with the
read-only `npm run triage:lookup`, and reconciles the still-open ones to **RESOLVED** through the same
`triage:resolve` write-back + outcome-note stamping as every other close, **fanning out to cluster
duplicates** like any other reconcile.

Why permissive extraction is safe: `triage:lookup` is a **total validator**. An id that isn't a real
ticket comes back in `missing` and is dropped, and only `isOpen === true` is ever written — an already
RESOLVED/DISMISSED ticket is **never** rewritten. Over-matching costs nothing; under-matching is the
bug. Every dropped candidate is still listed in the runbook, so nothing disappears silently.

Bounded by `maxMergedScan` (50 PRs) **and** a `mergedAt` cutoff (`today` − `mergedSinceDays`, default
14 days; `mergedSince` overrides), so it never walks the whole PR history. Writes are capped separately
by `maxMergedReconcile` (20); overflow is reported, not silently dropped. `dryRun` reports what it
**would** reconcile and writes nothing. `sweepMergedPrs=false` skips it.

Reported under the runbook's **🚢 Already shipped — reconciled from merged PRs** section (alongside
🔗 Aged-out), the `sweep.mergedReconciled` / `sweep.mergedSkipped` / `sweep.supersededByShipped`
fields, and the counts `mergedPrsScanned` / `alreadyShippedReconciled` / `alreadyShippedSkipped` /
`rankedItemsSupersededByShipped`.

## "Plan-ready" is often a STUB — check before telling anyone to `/work` it

Every `feedback: plan` GitHub issue is opened from a **static template**
(`scripts/feedback-plan-agent.ts` emits identical markdown for every run — only the title carries the
run id), and nothing ever writes `planMarkdown` back to the ticket. So a "plan-ready" item routinely
points at an issue whose entire content is boilerplate — "Plan only; no code changes", "Review the
linked app feedback item in the developer console" — with no plan in it. #466 was exactly this.

The workflow now **fetches each plan issue and judges it in JS** (a boilerplate-coverage test, so a
hand-edited or genuinely-generated plan is respected as real, and an issue that can't be read is
*never* downgraded on a failed fetch). A stub is routed to **plan-first (`/plan`)**, not
`/work <planUrl>` — enforced deterministically after the build planner returns, not merely asked for
in the prompt. Surfaced as `planReady[].planStub` / `planStubReason` and the `planStubsRerouted` count.

## The issue sweep — we open issues but never close them

The PR sweep clears built-but-unresolved PRs; the **issue sweep** clears the open-**issue** pile that
grows on its own — the `/developer` feedback path never touches a GitHub issue. Two classes accumulate,
and each gets its own treatment:

- **`feedback: plan` issues** (author `app/github-actions`) — the plan automation opens one per PLAN
  run and stamps its URL on the source feedback ticket. Nothing ever closes it when the ticket
  resolves, so they pile up open and stale. The sweep **auto-closes** one **only when its source
  ticket is provably RESOLVED/DISMISSED** — a mechanical reconciliation on DB truth, capped by
  `maxIssueCloses` (default 10). The catch it navigates: the issue's own title/body carries only the
  **plan-run id**, not the ticket id (so `triage:lookup` returns *missing* for it) — the real map lives
  in the DB, on the ticket's `githubIssueUrl` column. `npm run triage:issues` (read-only, owner
  connection, **uncapped**, cross-tenant) inverts that column into `{ issueNumber → ticket status }`,
  so the sweep knows which plan issues are stale regardless of the intake window. A plan issue with no
  DB mapping (orphaned) or one beyond the cap is **recommend-close only**, never auto.

- **Sentry issues** (label `sentry` / author `app/sentry`) — Sentry auto-files every captured error as
  an issue and most are **not** actionable. The goalie **reads the full stack** and classifies each:
  **dev-noise** (a `.claude/worktrees/…` path **anywhere** in the frames — never a prod signal),
  **expected-validation** (a domain guard firing as designed — "Barrel is empty", "would exceed
  capacity", "not enough stock" — surfaced as an error; it recommends a Sentry ignore rule so the class
  stops recurring), **config-or-fixed** (a config error, or a stale pre-fix dev artifact whose failing
  file+line no longer has the pattern on `main`), or a genuine **real-bug** (an unexpected crash, a true
  tenant-context leak, an N+1). Everything but a real bug is a **recommend-close** (with the reason + a
  ready `gh issue close` command); a real bug is **routed to `/investigate`**. Sentry closes are
  **never automatic** — judging noise is the operator's call. **The full-stack rule matters:** a
  dev-worktree event's TOP frames often look prod-clean (`src/lib/…`) while the `.claude/worktrees/…`
  tell sits deeper — judging from the title or top frame alone once mislabeled a stale, already-fixed
  error as a real bug (#237), so a `real-bug` verdict requires *confirming* no worktree path AND that
  the failing path still exists on `main`.

The safety spine matches the PR sweep exactly: **auto-act only on provable reconciliation, recommend
everything else.** `dryRun` reports the whole sweep and closes nothing. Results land in the report's
**issue sweep** block (`issueSweep`, counts `issuesScanned`/`issuesReconcileClosed`/
`issuesRecommendClose`/`issuesRouteBug`/`issuesKept`) and the runbook's **🗂️ Issue sweep** section
(auto-closed / recommend-close / route-as-bug). `sweepIssues` (default `true`) toggles it.

## The runbook + parallel builds (clear the backlog fast)

After triage acts, a **Parallelize** phase turns the ranked backlog into a **build plan** and
renders `TRIAGE-RUNBOOK.md` — a living, tick-as-you-go checklist. The point: don't build the
backlog one item at a time. The planner figures out which actionable items touch **disjoint
files/domains** (and have no dependency on each other) and groups them into **waves**:

- A **⚡ parallel-safe wave** is a set of builds you can run **at the same time**, each in its
  own Claude Code instance, on its own branch + PR, with **no merge conflict** — because their
  file/domain sets don't overlap. Three unrelated product-gaps/defects → three instances
  building + committing + pushing simultaneously.
- A **🔒 sequential wave** waits on an earlier one — either because two items would touch the
  same module/schema table (a real conflict) or one `dependsOn` the other (e.g. "validate the
  AVA field" depends on "store the AVA field" landing first). The runbook records `dependsOn`.
- The planner is **conservative**: unsure whether two items are disjoint → it sequences them,
  because a false "parallel-safe" produces an actual merge conflict.
- Items already moving (auto-dispatched fix agents, merged PRs) are listed under **🚧 In flight
  — do NOT rebuild** so a second instance never duplicates work. Product-gaps with no plan yet
  go under **🧭 Plan first** (run `/plan`); unclear items under **🔍 Investigate first**.

**How to use it:** open `TRIAGE-RUNBOOK.md`, take Wave 1, and for each task spin up a separate
Claude Code instance with the task's `do:` command (`/work <planUrl>`, `/investigate then /work`,
`review PR #N`). When Wave 1's PRs land, move to Wave 2. Tick items off as you clear them.

## Steps

1. **Confirm scope + intent.** This WRITES to `main` (auto-merges PRs, dispatches fix
   runs) and writes item statuses. Map user scope to workflow args:
   - `autoMerge` (default `true`), `dispatch` (default `true`), `reconcile` (default
     `true`), `cluster` (default `true` — group duplicates + fan out the write-back;
     `false` = every item is its own cluster), `dryRun` (default `false` — plan +
     cluster + review + **runbook** only, zero side effects), `maxMerges` (5),
     `maxDispatch` (5), `sweepPrs` (default `true` — also triage EVERY open PR, not just
     feedback-linked; `false` skips the sweep), `maxSweepMerges` (5 — cap on sweep auto-merges),
     `sweepIssues` (default `true` — also triage EVERY open GitHub issue: auto-close stale
     `feedback: plan` issues on DB truth, recommend-close Sentry noise; `false` skips it),
     `maxIssueCloses` (10 — cap on issue reconciliation auto-closes),
     `sweepMergedPrs` (default `true` — also scan RECENTLY MERGED PRs for feedback ids and
     reconcile tickets whose work already shipped in a PR nothing stamped on them; `false`
     skips it), `maxMergedScan` (50 — merged PRs examined), `mergedSinceDays` (14 — the
     `mergedAt` cutoff, counted back from `today`), `mergedSince` (an ISO date that overrides
     `mergedSinceDays`), `maxMergedReconcile` (20 — cap on already-shipped write-backs),
     `tenantQuery` (limit to one tenant), `today` (an ISO date string,
     e.g. `2026-07-18`, stamped into the runbook header — pass the current date).
   - ⚠️ **`today` also bounds the merged sweep.** Workflow scripts cannot call `Date.now()`,
     so "the last 14 days" can only be computed from a date you pass in. Omit `today` and the
     merged scan falls back to the `maxMergedScan` count cap alone — still bounded, just coarser.
     Pass the current date.
   - **Run from the wine-inventory repo checkout that has `.env`** (the main repo) — a
     bare `.claude/worktrees/*` checkout has no `.env`/`node_modules` and the scripts
     fail there.
   - ⚠️ **Pass `args` as a JSON OBJECT, never a JSON string.** The Workflow host can hand
     the script a string, in which case `args?.dryRun` is `undefined` and every flag
     silently collapses to its LIVE default (this once merged two PRs on a `dryRun:true`
     run). The workflow now **fails closed** — a string/malformed `args` clamps the whole
     run to `dryRun` — and it **logs the resolved mode** at the start of Intake and returns
     it as `mode`. Always confirm `mode.dryRun`/`mode.autoMerge` in the result match what
     you intended, and treat a non-null `mode.argsWarning` as "my flags were ignored, rerun."
   - If the user hasn't opted into auto-merge this session, offer `dryRun: true` first
     so they see the plan + runbook before anything lands.
2. **Run the team:**
   ```
   Workflow({ name: 'bug-triage', args: { autoMerge, dispatch, reconcile, cluster, dryRun, maxMerges, maxDispatch, sweepPrs, sweepIssues, maxIssueCloses, sweepMergedPrs, maxMergedScan, mergedSinceDays, maxMergedReconcile, tenantQuery, today } })
   ```
   (If the name doesn't resolve, fall back to the repo-relative path:
   `Workflow({ scriptPath: '.claude/workflows/bug-triage.js', args })`.)
   It runs Intake → Reconcile → Cluster → Prioritize → Review → PR Sweep → **Merged Sweep** →
   **Issue Sweep** → Act →
   **Parallelize** → Report in the background and returns `status` (`done` | `dry-run` | `empty`) with
   `mode` (the resolved flags + any `argsWarning`), `runbook` (the rendered
   `TRIAGE-RUNBOOK.md` markdown), `buildPlan` (the structured parallel waves),
   `planSummary`, `counts`, `reconciled`, `inFlight`, `clusters`, `planReady`, `skipped`,
   `ranked`, `reviews`, `actions`, `sweep` (PR sweep), `issueSweep` (issue sweep).
3. **Write the runbook, then report the outcome to the user:**
   - **First, write the runbook.** Take the returned `runbook` string and write it verbatim
     to `TRIAGE-RUNBOOK.md` at the repo root (use the Write tool). This is the living,
     tick-as-you-go checklist that lets you (and a fleet) clear the backlog step by step —
     it always includes the **parallel build plan**. Then link it in your report.
   - **Confirm the mode.** State whether the run was `dryRun` or `live` from `mode`, and if
     `mode.argsWarning` is non-null, tell the user their flags were ignored (clamped to dry
     run) and rerun with corrected args before anything lands.
   - Lead with the **plan of attack** (`planSummary`) and the box score (`counts`), including
     the **disposition breakdown** (`byType`) — e.g. "3 defects, 1 product-gap, 1 not-a-bug" —
     so the operator sees how much of the backlog is actually auto-fixable vs. needs a plan.
   - **⚠️ ERP-standards flags** (`erpStandardsFlags`, counts `erpConflicts`/`erpCautions`) — call
     these out prominently, right alongside the build plan. For each **conflict**: the item, the
     standard its requested fix would break, and the conformant redesign a human should pursue
     (correction event / supersede / outbox / tenant-scoped) — these are **held out of every build
     wave** and blocked from auto-merge/dispatch. For each **caution**: the standard the builder
     must uphold. This is the "did we keep it standard for an ERP" answer the operator asked for.
   - **Parallel build plan** (`buildPlan.waves`) — the headline for "what do we build next":
     for each wave say whether it's ⚡ parallel-safe (build concurrently in N instances) or
     🔒 sequential, and why. Call out the P0/P1 tasks and any dependencies. This is what the
     user asked for when they want to narrow product gaps *fast*.
   - **Clusters** — same-root-cause groups (esp. cross-tenant): the primary, the root
     cause, and how many tenants/tickets ride one fix. Call out the big blast radii.
   - **Reconciled** — bugs closed out because their fix already merged.
   - **Merged** — each auto-merged PR (url) + the bug it closed (now RESOLVED) + any
     **duplicates fanned out** to RESOLVED with it.
   - **Dispatched** — NEW defects now being fixed on CI; their PRs surface next run.
   - **Plan-routed** — PRODUCT_GAP items sent through the existing PLAN workflow; a
     queued/running wrong-kind fix is reported as a conflict, never canceled.
   - **Plan-ready** — items whose plan-mode run produced a **plan** (not code): the plan
     link (`githubIssueUrl`) + snippet, now TRIAGED for a human to review and `/work`.
   - **Dismissed** — non-bugs written back to DISMISSED, with why.
   - **Skipped** — runs the agent declined, with the **reason** it gave, routed to
     dismiss or human.
   - **Queued for human** — the ranked list with each PR's verdict and, when the fix
     was cosmetic, the **deeper issue** to fix properly (candidates for `/investigate`
     or `/plan`) + the ready `gh pr merge` command.
   - **🧹 PR sweep** (`sweep`, counts `prsScanned`/`prsSweptMerged`/`prsCloseRecommend`/
     `prsFixFirst`/`prsNeedsHuman`) — the open-PR-backlog cleanup, the answer to "what should be
     merged to main and cleared out." Report: **auto-merged** (`sweep.merged` — PR # + any feedback
     item resolved), **recommend close** (`sweep.closeRecommend` — superseded/duplicate/stale, with
     the reason + ready `gh pr close` command; **the user confirms these — they are never
     auto-closed**), **fix-first** (`sweep.fixFirst` — failing/conflicting), and **needs-human**
     (`sweep.needsHuman` — out-of-fence/large/feature, with a ready `gh pr merge`). Surface the
     recommend-close list prominently — that's usually the bulk of the pileup.
   - **🚢 Already shipped** (`sweep.mergedReconciled`, counts `mergedPrsScanned`/
     `alreadyShippedReconciled`/`alreadyShippedSkipped`/`rankedItemsSupersededByShipped`) — tickets
     that were still open while their fix sat in production, found by scanning merged PR bodies.
     Report each as "ticket → shipped in PR #N", and **call out `sweep.supersededByShipped`
     explicitly**: those are items this run had already ranked as actionable before discovering the
     work was done. That number is the honest measure of how much re-offered work the sweep caught —
     do not bury it. Also mention `sweep.mergedSkipped` if non-empty (candidate ids found but not
     written: not a real ticket / already closed / past the cap).
   - **🧭 Plan stubs** (`planReady[].planStub`, count `planStubsRerouted`) — "plan-ready" items whose
     linked issue is the plan automation's empty template. Say plainly that these need `/plan`, NOT
     `/work` — a builder sent to that url finds boilerplate, not a plan.
   - **🗂️ Issue sweep** (`issueSweep`, counts `issuesScanned`/`issuesReconcileClosed`/
     `issuesRecommendClose`/`issuesRouteBug`/`issuesKept`) — the open-ISSUE-backlog cleanup, the
     answer to "the GitHub issues are piling up — deal with them." Report: **auto-closed**
     (`issueSweep.reconcileClosed` — stale `feedback: plan` issues whose ticket already resolved,
     closed on DB truth), **recommend-close** (`issueSweep.recommendClose` — Sentry noise / expected-
     validation / stale, with the reason + ready `gh issue close` command; **the user confirms these —
     never auto-closed**; flag any `suggestFilter` ones as needing a Sentry ignore rule), and
     **route-as-bug** (`issueSweep.routeBug` — genuine Sentry defects, each with `/investigate #N`).
     Surface the recommend-close list prominently — Sentry noise is usually the bulk of the pile.
   - **In-flight / Errors** — fixes still running; anything that refused.
4. **Don't hand-merge the queued PRs blind.** They're queued because they need your
   eyes — a cosmetic-fix flag means the reported bug likely still bites.

## The tight auto-merge gate (the SAFE bar)

A PR auto-merges **only if ALL** hold (any miss → queued):
- **Fence-only** — every changed file is within `src/app/(app)`, `src/app/api/feedback`,
  `src/components`, `src/lib/assistant`. Auth/DB/schema/migrations/tenancy/prisma/
  secrets/workflows → out.
- **CI fully green** and **MERGEABLE** (pending ≠ green). This now includes
  `feedback-test-gate`: an agent fix that changes code but ships no `test/` change FAILS,
  so a missing regression test blocks auto-merge automatically. The only way past it is a
  human applying the `no-regression-test` label — if you see that label, the PR was
  consciously shipped untested and needs your eyes, not a rubber stamp.
- **Root fix, not cosmetic** — the reviewer confirmed it addresses the root cause. The PR body
  now carries a **Class sweep** section (general form of the defect + sibling instances found +
  any left unfixed). Read it first: a sweep listing `⚠️ LEFT` instances means the class is only
  partly fixed and the reporter will be back. An empty/hand-wavy sweep is itself a review flag.
- **Merge-safe** — no red flags, no stacked yellows (same model as `/merge-check`).
- **Small** — ≤ ~150 changed lines, ≤ ~8 files.

## Guardrails (baked into the workflow, restated for the operator)

- **Active vs closed is git-truth, not DB-status.** A merged PR means the bug shipped —
  it's reconciled to RESOLVED and never re-triaged, even if its status still said NEW.
- **Every action closes the loop — and fans out.** Merge → RESOLVED, reject → DISMISSED,
  hand-off → TRIAGED+verdict, dispatch → IN_PROGRESS, plan-ready → TRIAGED+plan-link. The
  same write is applied to **every duplicate in the cluster**, so one fix closes every
  reporter. The queue always reflects reality.
- **Dedup is conservative + deterministic.** The LLM proposes clusters; the workflow
  re-elects the primary and derives the action sets in JS. Same symptom ≠ same cause —
  unsure items stay singletons. A **dismiss** only fans out to a duplicate that is truly
  the same root cause. Duplicates never take independent action, so a bad cluster still
  can't merge unsafe code (the tight gate is unchanged).
- **Plan mode is not a fix.** A PLANNED item already ran plan-mode and produced a PLAN
  (stored in `planMarkdown` and/or a GitHub issue) — it is **never re-dispatched**; it's
  surfaced for a human to review and `/work`. A SKIPPED item's reason is carried into the
  queue, never silently dropped.
- **Tight auto-merge, never `--admin`.** Branch protection on `main` is the backstop —
  a merge protection refuses is queued, never forced.
- **Cosmetic ≠ done.** A band-aid is never auto-merged; it's queued with the deeper
  issue named, so a symptom-silencer can't close a real bug.
- **Standard-for-an-ERP is a gate, not a footnote.** Every actionable item and every open PR is
  judged against the system-of-record standards (append-only ledger, correction-as-event,
  double-entry conservation, immutable posted records, tenant isolation, audit trail, master-data
  identity, exactly-once outbox, compliance chain — grounded in `INVARIANTS.md`). A **conflict**
  verdict — the requested change (or the diff) can only be satisfied by breaking a standard —
  **hard-blocks** auto-merge, dispatch, and every parallel build wave; the item is queued for a
  human to redesign the ask into a conformant shape first. A merge that would take the ERP
  off-standard is refused even when CI is green and the fix is in-fence. Cautions build, with the
  standard to uphold named on the task.
- **The PR sweep clears the "built but never resolved" backlog — but never closes behind your
  back.** Every open PR is triaged, not just feedback-linked ones. A sweep **auto-merge** must clear
  the *same* tight gate as any other merge (plus: complete-not-WIP, mergeable, ERP-ok) — it will
  un-draft a *finished* draft to land it, but an incomplete draft, a failing check, a conflict, or an
  out-of-fence diff is never merged. **Closes are recommend-only** — the sweep hands you the reason +
  the `gh pr close` command and you confirm; it never auto-closes a PR. `dryRun` reports the whole
  sweep and lands nothing.
- **The merged sweep never rewrites a closed ticket, and never builds what shipped.** Ids scraped from
  merged PR bodies are *candidates*, not truth: each is resolved through the read-only
  `triage:lookup`, an id that is not a real ticket is dropped (it comes back `missing`), and only a
  ticket with `isOpen === true` is written — an already RESOLVED/DISMISSED one is left exactly as it
  is. Anything it reconciles is also **removed from this run's dispatch/plan-route/plan-ready lists
  and from every build wave** (enforced in JS after the build planner runs, not just asked for in the
  prompt), because the code is already in production. Every candidate it declines to write is still
  listed, so nothing vanishes silently. `dryRun` reports the whole pass and writes nothing.
- **The issue sweep clears the open-issue pile — auto-closes ONLY on provable reconciliation.** Every
  open GitHub issue is triaged. The ONLY issues it closes itself are stale `feedback: plan` issues
  whose source ticket is provably RESOLVED/DISMISSED — a mechanical close on DB truth (the map comes
  from the ticket's `githubIssueUrl` column via `triage:issues`, uncapped and cross-tenant, never from
  the issue's own text, which carries only the plan-run id), capped by `maxIssueCloses`. **Sentry
  issues are recommend-close only** — dev-worktree noise, guards-firing-as-designed, config/fixed — each
  with a ready `gh issue close` command you confirm; a genuine Sentry bug is routed to `/investigate`,
  never closed. An orphaned or over-cap plan issue is likewise recommend-only. `dryRun` reports the
  whole sweep and closes nothing.
- **Disposition and run kind gate the route — don't feed the fixer what it can't fix.** The
  version-2 intake payload carries `awaitingRunKind`; only `AGENTIC_FIX` enters
  `triage:dispatch`. A `product-gap` goes through `triage:plan` and the existing
  `feedback_plan` event, never the auto-fixer; a `model-behavior` miss
  that already has a shipped rule is `needs-human`, not a re-dispatch of the same prompt tweak
  (LLM adherence is stochastic — a merge doesn't "close" it); a `not-a-bug` is dismissed with
  the reason. Type is assigned from root cause, never trusted from the reporter's intake kind.
- **Dispatch reuses the real pipeline.** `triage:dispatch` == the /developer Approve
  button; the GitHub Actions fix agent writes the code on CI inside the fence — this
  skill never fabricates fixes itself.
- **Read-only review; `dryRun` for a dry skate.** Reviewers only read PRs. `dryRun`
  plans + reviews + builds the runbook with zero writes/merges/dispatches.
- **`dryRun` fails CLOSED — a malformed `args` can't merge behind your back.** `args` must
  reach the script as a JSON object; if it arrives as a string (or any non-object), `dryRun`
  and the other flags would otherwise collapse to their live defaults. The workflow now
  detects that and **clamps the run to `dryRun`**, logs the resolved mode at Intake, and
  returns it as `mode` (with `argsWarning`). Pass args as an object and verify `mode` in the
  result — never assume a run was dry because you asked for dry.
- **Never runs `npm run build`** as a check — that runs `prisma migrate deploy`. Per-PR
  CI is the merge gate.

## Where it lives (always available)

- **Skill + workflow are versioned IN THIS REPO** — this file at
  `.claude/skills/bug-triage/SKILL.md`, plus `.claude/workflows/bug-triage.js` (which carries
  a targeted `!` negation in `.gitignore`, since `.claude/workflows/` is otherwise local-only).
  Clone the repo and `/bug-triage` is available — no install step, and everyone shares one
  copy that updates on `git pull`. Edit it here, not in `~/.claude/`.
- **The scripts it drives live in the repo** (they need `.env` + Prisma):
  `scripts/bug-triage-{list,dispatch,plan,set-status,lookup,issues}.ts`, wired as `npm run
  triage:{list,dispatch,plan,resolve,lookup,issues}`. They ship to `main` via PR — run the skill from
  the repo checkout. `triage:list` surfaces the plan (`planMarkdown`/`planPresent`) and
  plan/skip counts the Cluster + plan-ready steps rely on. `triage:lookup -- --ids=a,b,c` is a
  read-only cross-tenant by-id lookup (no per-tenant cap) used by BOTH the PR sweep (to reconcile a
  merged PR's source ticket that aged out of `triage:list`'s window) and the MERGED sweep (to validate
  every id scraped from a merged PR body — an unknown id comes back `missing`, which is what makes
  permissive extraction safe). `triage:issues` is the
  read-only, uncapped, cross-tenant plan-issue↔ticket resolver the ISSUE sweep uses: it inverts the
  `githubIssueUrl` column into `{ issueNumber → ticket status }` so a stale `feedback: plan` issue can
  be reconciled shut even though the issue's own text names only the plan-run id, not the ticket.

## Cadence

Trigger after a batch of bug reports lands, at a phase boundary, or via `/loop` for a
hands-off goalie — but because it merges to `main` and dispatches real fix runs, manual
triggering (with `dryRun` first when unsure) is the recommended default.
