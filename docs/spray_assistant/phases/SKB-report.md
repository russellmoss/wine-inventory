# SKB — Knowledge-base IPM source expansion: phase report

**Status: all 11 units complete.** Branch `claude/skb-knowledge-base-expansion-c58f7c`, not yet PR'd.
Plan: [SKB-knowledge-sources-plan.md](SKB-knowledge-sources-plan.md) · council:
[SKB-council-feedback.md](SKB-council-feedback.md).

## What shipped

**PR 1 (Units 1-3 + 5, merged earlier as #538):** the KB-1 boundary detector
(`boundary/product-table-core.ts`), the inline ingest gate in `index-documents.ts`, the legality-
verdict refusal in `search_knowledge_base`, and the `allowPaths` exact-path admission primitive.

**This session (Units 4, 6-11):**

- **Unit 4** — pre-SKB baseline captured and committed (`docs/kb-register-baseline.json`,
  `docs/kb-eval/snapshot.json`), with an immutable phase-scoped copy
  (`SKB-baseline-register.json`) so a later session recapturing the shared file cannot destroy the
  before-evidence.
- **A real bug fix, found before any source landed:** `verify:kb-boundary` misreported two already
  correctly-gated `pnw-handbooks` documents as leaks. The auditor was re-fetching raw live pages and
  re-running the detector on content whose chunks the ingest gate had already cleared to zero -
  reporting the gate catching a table as the gate leaking one. Fixed with a new `empty` verdict;
  21/21 then full-suite tests green.
- **Unit 6 — Penn State Extension**, new source. 45 tier-A grape disease/IPM articles hand-curated
  from a **live fetch** of the hub's real 94-item listing (not the sitemap keyword-matched, which the
  plan warned against), `allowPaths`-scoped, dark on landing (`defaultEnabled: false`).
- **Unit 7 — Virginia Tech grape IPM**, a **reconciliation**: `virginia-fruit` was already live in
  the DB (69 docs, 260 chunks, `defaultEnabled: true`) with no config entry at all, seeded from a
  branch that never merged. Given a real config for the first time.
- **Two scope-tightening fixes, both found by actually crawling rather than by reasoning about the
  config in the abstract:** PSU's hub `allowPrefix` admitted off-mandate sub-hubs (wine-production,
  business-management-and-marketing, a staff directory, a features aggregator); VT's inherited
  `allowPrefixes: ["/"]` let a `--follow` crawl wander into sibling apple/pear/peach orchard content,
  station pages, a faculty bio, and 14 years of pesticide-use-statistics pages. Both rescoped to
  exact `allowPaths` lists; 34 + 4 already-indexed off-scope documents withdrawn (tombstoned) from
  the live corpus.
- **Unit 8** — 5 new retrieval cases, each checked against the live corpus before being written.
  `verify:knowledge-base` 26/26. `verify:kb-register` displacement 8/120 (3%), PASSED.
  `verify:kb-boundary` PASS corpus-wide, with the KB-1 gate catching two REAL product tables in
  hand-curated PSU content (a spotted-lanternfly management article and a herbicide grower-survey
  writeup) that a human had selected as tier-A on title alone.
- **Unit 9** — cross-region contamination (council C4/D13) measured, not assumed: **it reproduces**.
  2 of 4 region-bound probes returned a climate-mixed result set. `extension-psu` stays dark as a
  direct consequence. `virginia-fruit`'s pre-existing live status is left as an explicit open
  question for the owner - it sits in a measured-mixed result right now, in production, and that is
  not something this phase decided to change either way.
- **Unit 10** — the operator-gated MSU crawl was NOT run (by design - see D9's own reasoning and
  `SKB-msu-decision.md`). `verify:msu`'s self-authorizing language was narrowed so a single live PASS
  no longer implies un-dormanting.
- **Unit 11** — this report, the QA report, the runbook rule/ledger/scope/risk updates, the
  scale-register D11 number correction + new D13 entry, and the data-sources design doc update.

## Gates

- `npx tsc --noEmit` clean throughout.
- Full `npx vitest run`: 4933/0 (two whole-suite-contention timeouts on pre-existing, unrelated tests
  confirmed passing in isolation with headroom).
- `npm run verify:kb-boundary`: PASS corpus-wide.
- `npm run verify:knowledge-base`: 26/26.
- `npm run verify:kb-register`: displacement 8/120 (3%), PASSED.
- `npm run verify:kb-subscriptions`: PASS (unaffected by this phase, confirmed green).
- `npm run verify:invariants`: 50/50.
- `npm run verify:msu`: config PASS, live BLOCKED (Imperva, expected, not a regression).

## What this phase does NOT settle

- **`extension-psu`'s `defaultEnabled` flip** — blocked by D13's cross-region finding, not a timing
  question. It stays dark until a region filter exists.
- **`virginia-fruit`'s `defaultEnabled` status** — an open question for Russell, surfaced in
  `SKB-region-finding.md`, not decided by this phase either way.
- **MSU's populate/un-dormant decision** — pending the operator's own crawl run, per D8/D9.
- **The region-filter architecture itself (D13)** — deliberately out of scope; this phase measures
  and gates on the hazard, it does not build the fix.

## Environment note

Mid-session, Edit/Write tool calls on already-existing tracked files (and, later, on two brand-new
files) stopped reaching the disk that `npm`/`tsx`/git actually read from in this worktree, while the
harness's own view showed the edits as applied. Diagnosed via `git hash-object` matching HEAD exactly
despite a reported-successful edit. Worked around for the rest of the session by routing every file
change through Bash (`cat >`/`cat >>` heredocs, `sed -i`), verifying with `git diff --stat HEAD`
before trusting any change, and committing promptly. Recorded in the user's memory system
(`edit-write-disk-desync-worktree`) so a future session does not lose the same hour to it.
