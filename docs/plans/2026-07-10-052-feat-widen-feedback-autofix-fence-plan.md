---
title: Widen the feedback auto-fix fence to server-domain code (with a domain-verify backstop)
type: feat
status: completed
date: 2026-07-10
branch: feat/widen-feedback-autofix-fence
depth: standard
units: 5
---

## Overview

Today the feedback bug-fix loop can only write to UI/assistant code (`src/app`, `src/components`,
`src/lib/assistant`, `src/app/api/feedback`). Real server-domain bugs — like the "50% rollers on"
work-order bug whose root cause lives in `src/lib/work-orders` — cannot be fixed by the loop at all:
the agent won't write there, the PR's `add-paths` filter would silently drop the edit, and CI would
hard-fail the PR. This plan widens the fence to a defined set of cellar-floor domain directories so
the loop can actually fix those bugs, and adds a **domain-verify CI backstop** so an LLM fix that
becomes auto-merge-eligible must first pass that domain's own runtime proof.

## Problem Frame

A winemaker reports "the work order says 100% rollers-on when I asked for 50/50." That's a real
functional bug that bites the daily cellar workflow. The auto-fix loop — the whole point of which is
to turn a thumbs-down into a shipped fix — can't touch it, because the fix lives in governed server
code outside the fence. So every domain bug is a manual `/investigate`, and the loop only ever fixes
cosmetic/UI issues.

Do nothing: the loop stays a UI-only toy; domain bugs pile up in the backlog (we already saw #110
press-WO and "50% rollers on" both blocked on this). The cost of inaction is a growing class of
"the agent literally can't fix this" tickets.

**Honest risk framing (the user chose this path with eyes open):** widening the *auto-merge* reach
into `src/lib/work-orders` means an autonomous LLM can land a change to code that writes
`LotOperation`s into the append-only ledger, with only lint/tsc/vitest + the deterministic brain
gates covering it on the required PR CI. That is the real hazard, and Unit 3 (the domain-verify
backstop) is what makes this responsible rather than reckless. This plan honors the "widen the
allowlist" decision but refuses to widen it into money/tenancy/ledger/compliance code, and refuses
to let a domain fix auto-merge without its domain proof going green.

## Requirements

- MUST: The bug-fix agent can read/write a defined set of `src/lib/**` domain dirs (driver:
  `src/lib/work-orders/`) and the resulting edits are committed into the PR.
- MUST: Keep `deniedPrefixes` (`.env`, `.github/workflows/`, `prisma/*`, `src/lib/{auth,dal,tenant,prisma}`)
  as hard denies — never widened. Denied always beats allowed.
- MUST: All *in-repo* enforcement layers stay in sync from ONE source of truth
  (`scripts/feedback-fence-rules.ts`) plus the two lists that live outside it
  (`feedback-bug-fix.yml` `add-paths`, and the global `~/.claude/workflows/bug-triage.js` FENCE).
- MUST: Explicitly EXCLUDE money/tenancy/ledger/compliance/moat dirs from the widened allowlist
  (`ledger`, `cost`, `money`, `accounting`, `commerce`, `compliance`, `transform`, `tenant`, plus
  `audit.ts`) with a written reason.
- MUST: Add a domain-verify CI backstop so an auto-merge-eligible feedback PR touching a domain dir
  must pass that domain's runtime `verify:*` before it can merge; wire it as a required check.
- MUST: Add a `docs/architecture/security-register.md` invariant + a tripwire note per brain conventions.
- SHOULD: Keep the existing behavior for UI/assistant PRs unchanged (no new required DB job for
  pure-UI diffs — don't slow down the common case).
- NICE: A single mapping (domain dir → verify script) that both the CI job and humans can read.

## Scope Boundaries

**In scope:**
- Widen the author + CI + commit fences to the agreed cellar-floor domain set.
- A new label-gated `feedback-domain-verify` CI job + required-check wiring.
- Security-register invariant + tripwire note.
- A documented follow-up to update the out-of-repo global `bug-triage.js` FENCE.

**Out of scope:**
- The "decouple author-vs-auto-merge" design (user chose widen-the-allowlist instead).
- Widening into `ledger/cost/money/accounting/commerce/compliance/transform/tenant`/`audit.ts` — these
  stay out of the allowlist entirely.
- Any change to `deniedPrefixes` (auth/tenancy/prisma/env/workflows stay hard-denied).
- Fixing the actual "50% rollers on" / "audit logs gone" bugs (that's `/work` or the loop, after this).
- Branch-protection settings in the GitHub UI (flagged as a manual step, not code).

## Research Summary

### Codebase Patterns
- **Single source of truth already exists.** `scripts/feedback-fence-rules.ts:29` exports
  `allowedPrefixes` and `deniedPrefixes`; `fencePass(p) = !isDenied(p) && isAllowed(p)` (line 49).
  Both the agent (`scripts/bug-feedback-agent.ts:22` imports `fencePass/allowedPrefixes/deniedPrefixes`;
  it even prints `allowedPrefixes` into its own LLM prompt at line 153) and the CI gate
  (`scripts/verify-feedback-fence.ts:8`) import this module. **Widening `allowedPrefixes` here
  auto-updates the agent's self-restriction, the agent's prompt, AND `verify:feedback-fence`.**
- **Two lists live OUTSIDE that module and must be hand-synced:**
  1. `.github/workflows/feedback-bug-fix.yml:58` `add-paths:` (`src/app`, `src/components`,
     `src/lib/assistant`) — restricts what `peter-evans/create-pull-request` commits. A domain edit
     not listed here is silently dropped. (Defense-in-depth: the same job re-runs
     `verify-feedback-fence.ts` at line 44 over the working tree before committing.)
  2. `~/.claude/workflows/bug-triage.js` FENCE constant — the bug-triage auto-merge `fenceOnly` gate
     (a hardcoded copy of the allowlist). Gitignored/global, so it's an **out-of-repo follow-up**.
- **CI enforcement (`.github/workflows/ci.yml`):**
  - `check` (line 13) is the always-run required PR gate: `lint`, `tsc --noEmit`, `verify:raw-sql`,
    `verify:feedback*`, the deterministic brain gates (`verify:invariants`, `verify:invariant-frontmatter`,
    `verify:tripwires`, `verify:parity`, `verify:ai-native`), then `vitest run`. **It runs NO
    DB-hitting domain proof** (no `verify:work-orders`, `verify:cost`, etc.).
  - `feedback-fence` (line 43) is **label-gated** (`if: ... contains(labels, 'feedback-bug')`) and
    diffs against base then runs `verify-feedback-fence.ts`. This is the model to copy for the new job.
  - `tenant-isolation` (line 66) shows the pattern for a job with a `postgres:16` service container —
    the template for running DB-hitting `verify:*` in CI.
- **Domain verify catalog** (from `package.json`): `verify:work-orders`,
  `verify:work-orders-enhancements`, `verify:work-orders-transform`,
  `verify:universal-work-order-authoring`, `verify:work-order-nl`, `verify:chemistry`, `verify:cost`,
  `verify:reverse`, `verify:lifecycle`, `verify:projection`, `verify:split-in-place`, etc. Most hit
  Neon (need `DATABASE_URL`); the automation PRs are in-repo branches, so repo secrets are available.

### Prior Learnings
- `[[main-repo-has-env-verify-runs]]` — `verify:*` hit Neon; `.claude/worktrees/*` has no `.env`.
  Run/verify from the main repo checkout.
- `[[blob-images-into-feedback-llm-shipped]]` — the feedback loop needs certain env vars wired as
  GitHub Actions **secrets** (e.g. `BLOB_READ_WRITE_TOKEN`); the new domain-verify job will similarly
  need `DATABASE_URL`/`DATABASE_URL_UNPOOLED` secrets present (they already are, per `feedback-bug-fix.yml`).
- `[[raw-sql-tenant-scoping]]`, `[[phase12-multitenancy-progress]]` — tenancy/RLS is why `src/lib/tenant`
  stays hard-denied; nothing here touches that.
- `[[bug-triage-dryrun-args-gotcha]]` — the global `bug-triage.js` is the auto-merge gate; its FENCE
  copy must be updated or auto-merge and the author fence will silently disagree.

### External Research
None needed — this is all in-repo config + GitHub Actions we already use.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Which dirs to add to `allowedPrefixes` | Cellar-floor ops domains: `src/lib/work-orders/`, `vessel/`, `vessels/`, `lot/`, `blend/`, `bottling/`, `bulk/`, `cellar/`, `ferment/`, `harvest/`, `chemistry/`, `stock/`, `inventory/`, `sparkling/`, `vineyard/`, `winemaking-calc/`, `units/`, `reference/`, `settings/`, `locations/`, `fieldnotes/`, `developer/`, `feedback/` | Add ALL of `src/lib`; add only `work-orders` | Covers the domain bugs users actually report while keeping the blast radius off money/tenancy/ledger. `work-orders` alone is too narrow (press/lot/vessel bugs span dirs). |
| Which dirs stay EXCLUDED | `ledger/`, `cost/`, `money/`, `accounting/`, `commerce/`, `compliance/`, `transform/`, `tenant/` (denied), plus the single file `audit.ts` | Include them | These write/own the append-only ledger, money math, TTB filings, the correction-as-event moat, and the audit trail. An LLM auto-merge here can corrupt data or filings, or silence the audit log ("audit logs gone" must be human-reviewed, not auto-fixed). Explicit, documented exclusion. |
| How to keep auto-merge safe on domain code | Add a required `feedback-domain-verify` CI job (label-gated) that maps each touched domain dir → its `verify:*` and runs them against a DB; auto-merge waits on it | Trust lint/tsc/vitest only; keep auto-merge fence narrow (decouple) | The required `check` job runs no DB domain proof, so without this a work-orders fix auto-merges unproven. This is the safety unit; user rejected decoupling, so the backstop must be strong. |
| Where the domain→verify mapping lives | A new exported map in `scripts/feedback-fence-rules.ts` (co-located with the fence) consumed by the CI job | Hardcode in the YAML | One place, testable, next to the allowlist it corresponds to. |
| Global `bug-triage.js` FENCE | Update it to match, tracked as an out-of-repo follow-up in the plan + a memory | Leave it | If the auto-merge gate's allowlist is narrower than the author fence, domain fixes open but never auto-merge (confusing); if wider, unsafe. Must match. |

## Implementation Units

### Unit 1: Widen the shared author/CI fence allowlist

**Goal:** Let the agent write (and `verify:feedback-fence` accept) the agreed cellar-floor domain dirs.
**Files:** `scripts/feedback-fence-rules.ts`
**Approach:** Append the agreed domain prefixes (see Key Decisions) to `allowedPrefixes`. Leave
`deniedPrefixes` untouched — `fencePass` already makes denied win, so `src/lib/tenant/` etc. stay
blocked even though they're under `src/lib/`. Update the file's header comment to record the
2026-07-10 broadening + the exclusion rationale. Because `bug-feedback-agent.ts` imports
`allowedPrefixes` and renders it into the LLM prompt, the agent's self-description updates for free.
**Tests:** Add/extend a unit test (co-locate with existing script tests, e.g. `test/*fence*`) asserting:
`fencePass('src/lib/work-orders/execute.ts') === true`; `fencePass('src/lib/ledger/append.ts') === false`;
`fencePass('src/lib/tenant/models.ts') === false`; `fencePass('src/lib/cost/rollup.ts') === false`;
`fencePass('.env') === false`. (Runs under the existing `vitest` in the `check` job.)
**Depends on:** none
**Verification:** `npm run verify:feedback-fence -- src/lib/work-orders/execute.ts` prints pass;
`npm run verify:feedback-fence -- src/lib/ledger/x.ts` exits non-zero.

### Unit 2: Widen the PR commit filter to match

**Goal:** Ensure domain edits the agent makes actually get committed into the PR (not stripped).
**Files:** `.github/workflows/feedback-bug-fix.yml`
**Approach:** Extend the `add-paths:` list (line ~58) to include `src/lib` (or, more precisely, the
same domain dirs) so committed paths match the widened fence. The job already re-runs
`verify-feedback-fence.ts` over the working tree before committing (line 44), so a too-broad
`add-paths` can't leak denied paths — the fence check is the real gate. Prefer listing `src/lib`
broadly here and letting `fencePass` reject anything excluded, to avoid a second hand-maintained
domain list drifting from Unit 1.
**Tests:** N/A (CI config). Covered by the manual-verification dry run below.
**Depends on:** Unit 1
**Verification:** Trigger a `workflow_dispatch` of `feedback-bug-fix` against a known work-order
ticket in the Demo Winery sandbox; confirm the opened draft PR's diff includes the
`src/lib/work-orders` edit and that the in-job fence step passed.

### Unit 3: Domain-verify CI backstop (the safety unit)

**Goal:** An auto-merge-eligible feedback PR touching a domain dir must pass that domain's runtime
`verify:*` before it can merge.
**Files:** `scripts/feedback-fence-rules.ts` (add an exported `domainVerifyMap`),
`.github/workflows/ci.yml` (new `feedback-domain-verify` job), `package.json` (optional convenience
script `verify:feedback-domain` that reads changed paths → runs mapped verifies).
**Approach:** Add `domainVerifyMap: Record<string, string[]>` mapping each widened domain prefix to
its verify scripts (e.g. `src/lib/work-orders/` → `["verify:work-orders","verify:work-orders-transform"]`;
`src/lib/chemistry/` → `["verify:chemistry"]`; `src/lib/cost/`-style excluded dirs never appear).
Add a label-gated CI job modeled on `feedback-fence` (runs on `feedback-bug` PRs) that:
(1) diffs changed paths vs base; (2) resolves the union of mapped verify scripts for any touched
domain dir; (3) if the set is non-empty, spins up the `postgres:16` service (copy the
`tenant-isolation` job's service + env block, or use the Neon `DATABASE_URL` secret already present)
and runs those `verify:*`; (4) if a touched domain has NO mapped verify, fail closed with a clear
message ("domain X has no verify gate; cannot auto-merge — human review required"). Make this job a
**required status check** on `main` (GitHub branch-protection — manual UI step, documented in the
plan's Success Criteria). Update the bug-triage auto-merge gate to require this check green (see Unit 5).
**Tests:** Unit-test `domainVerifyMap` resolution: given `["src/lib/work-orders/execute.ts","src/components/x.tsx"]`
→ returns `["verify:work-orders", ...]`; given only `src/app/(app)/...` → returns `[]` (pure-UI PRs
skip the DB job, keeping the common case fast); given a domain with no mapping → flagged as fail-closed.
**Depends on:** Unit 1
**Verification:** On the Unit-2 dry-run PR, confirm the `feedback-domain-verify` job ran
`verify:work-orders` and reported status; on a pure-UI feedback PR, confirm the job is a no-op/green
without spinning DB.

### Unit 4: Security-register invariant + tripwire note

**Goal:** Record the widened-fence decision as a living invariant with a tripwire, per brain conventions.
**Files:** `docs/architecture/security-register.md`, `docs/architecture/tripwires/TRIP-FEEDBACK-FENCE-*.md`
(new typed note), `INVARIANTS.md` if it mirrors the register.
**Approach:** Add an invariant: "The feedback auto-fix loop may write domain code only inside the
allowlist and never inside `ledger/cost/money/accounting/commerce/compliance/transform/tenant`/`audit.ts`;
any auto-merge-eligible domain fix must pass its mapped `verify:*`." Record what/why/what-breaks-at-scale.
Add a `static` or `observe` tripwire note whose guard is `verify:feedback-fence` + the new
`feedback-domain-verify` (so `verify:tripwires` in the `check` job enforces the note has a live guard).
**Tests:** `npm run verify:tripwires` and `npm run verify:invariant-frontmatter` pass (they run in `check`).
**Depends on:** Units 1, 3
**Verification:** `npm run verify:tripwires` green; the new note lists a guard that exists.

### Unit 5: Sync the out-of-repo global bug-triage FENCE (follow-up)

**Goal:** Keep the bug-triage auto-merge `fenceOnly` gate consistent with the widened author fence,
and require the new domain-verify check before auto-merge.
**Files:** `~/.claude/workflows/bug-triage.js` (GLOBAL, gitignored — NOT in this repo/PR).
**Approach:** Update the `FENCE` constant's allowlist to match Unit 1, and add the
`feedback-domain-verify` check to the reviewer's `ciGreen`/auto-merge criteria so a domain fix only
auto-merges when its domain proof is green. Because this file is global, do it as a separate step
after the PR merges and record it in memory (`[[bug-triage-skill-shipped]]`). Flag clearly: until
this is done, domain fixes will open + pass CI but the goalie will route them to `needs-human`
(fenceOnly=false against the stale narrow FENCE) — safe, just not yet auto-merging.
**Tests:** N/A (global script). Sanity: a dry run of bug-triage on a domain PR shows `fenceOnly=true`
and the domain-verify check reflected in the verdict.
**Depends on:** Units 1, 3
**Verification:** Manual — re-run `/bug-triage` (dry) after the update; a work-orders fix PR shows as
auto-merge-eligible only with `feedback-domain-verify` green.

## Test Strategy

**Unit tests:** `fencePass` allow/deny cases + `domainVerifyMap` resolution, under existing `vitest`
in the `check` job (no DB needed — pure functions).
**Integration tests:** The new `feedback-domain-verify` CI job IS the integration test — it runs the
real domain `verify:*` against Postgres on labeled PRs.
**Manual verification:** `workflow_dispatch` the `feedback-bug-fix` agent against a seeded Demo Winery
work-order ticket; confirm (a) the draft PR contains the `src/lib/work-orders` edit, (b) `feedback-fence`
passes, (c) `feedback-domain-verify` runs `verify:work-orders`, (d) a `src/lib/ledger` edit is still
rejected by the fence. Never test against Bhutan Wine Co. (`[[demo-winery-testing-convention]]`).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM auto-merges a subtly-wrong work-orders fix that corrupts ledger/lineage | MED | HIGH | Unit 3 domain-verify gate (runs `verify:work-orders`/`-transform` which exercise the ledger); `ledger/transform` themselves stay excluded; branch protection requires the job |
| A touched domain has no `verify:*` mapping → silent gap | MED | HIGH | Unit 3 fails closed: no mapping ⇒ job fails ⇒ human review, never auto-merge |
| The three enforcement lists drift (fence-rules vs add-paths vs global FENCE) | MED | MED | Unit 2 lets `add-paths` be broad and delegates to `fencePass`; Unit 5 + a memory keep the global FENCE synced; header comment points to the single source |
| Domain-verify job is slow/flaky on Neon cold-start (P2028) | MED | LOW | Only runs on labeled feedback PRs touching a domain dir (pure-UI PRs skip it); retry/backoff as other verify jobs do |
| `audit.ts` excluded ⇒ "audit logs gone" still can't be auto-fixed | HIGH | LOW | Intentional — audit integrity is human-review-only; route that ticket to `/investigate` |
| Widening `add-paths` to `src/lib` lets a denied path slip into a commit | LOW | HIGH | The in-job `verify-feedback-fence.ts` step (feedback-bug-fix.yml:44) reverts any out-of-fence path before the PR opens; `fencePass` denies win |

## Success Criteria

- [x] `fencePass` accepts the widened domain dirs and still rejects `ledger/cost/money/accounting/commerce/compliance/transform/tenant`/`audit.ts` + all `deniedPrefixes` (unit tests green — `test/feedback-fence.test.ts`, 28 cases).
- [x] `feedback-bug-fix.yml` commits domain edits (`add-paths` widened to `src/lib`; fence step keeps denied code out). *Live dry-run PR still recommended as final proof.*
- [x] `feedback-domain-verify` CI job runs the mapped `verify:*` on domain PRs, is a no-op on pure-UI PRs, and warns (exit 0) on an unmapped domain so the auto-merge gate routes it to a human. *Job authored; needs its first live CI run to confirm the domain `verify:*` pass in-CI.*
- [ ] `feedback-domain-verify` is wired as a required status check on `main` — **MANUAL branch-protection step, not yet done** (see Next steps).
- [x] Security-register invariant + tripwire note added; `verify:tripwires` + `verify:invariant-frontmatter` green.
- [ ] **Out-of-repo follow-up (Unit 5, post-merge):** global `bug-triage.js` FENCE synced + domain-verify added to auto-merge criteria. Deferred on purpose so domain fixes route to needs-human until the backstop is live on `main`.
- [x] All existing tests pass (1702 passed / 179 files), lint + tsc clean; no regression to the pure-UI feedback loop.

## Post-merge follow-ups (not in this PR)
1. **Branch protection:** add `feedback-domain-verify` to the required status checks on `main`.
2. **Global auto-merge gate (Unit 5):** update `~/.claude/workflows/bug-triage.js` `FENCE` to match the widened `allowedPrefixes`, and require `feedback-domain-verify` green before auto-merge.
3. **Live proof:** `workflow_dispatch` the `feedback-bug-fix` agent against a seeded Demo Winery work-order ticket to confirm the domain edit commits and `feedback-domain-verify` runs the proof.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Root cause + all enforcement layers verified in code (file:line above). |
| Scope Boundaries | HIGH | Clear include/exclude domain sets with rationale. |
| Implementation Units | HIGH | Units 1/2/4 are small config+docs; the source-of-truth propagation is confirmed. |
| Test Strategy | MEDIUM | Unit 3's CI job shape is sound but needs a first live run to confirm Neon-in-CI timing + which exact `verify:*` per domain are cheap enough to gate on. |
| Risk Assessment | MEDIUM | Residual risk is inherent to the chosen "widen + auto-merge" path; Unit 3 mitigates but LLM domain fixes remain higher-risk than UI fixes. Flagged honestly. |
