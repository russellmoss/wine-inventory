---
title: Living registers for the product thesis — Capability-Parity + AI-Nativeness (core→tool) guard
type: feat
status: draft
date: 2026-07-06
branch: claude/laughing-lichterman-175f94
depth: standard
units: 8
revised: 2026-07-06 (post-council — AST import-graph, full corpus ingest, allow-list ratchet, Unit 9 dropped)
---

## Overview

Add two new self-defending "brain" registers that enforce the two things that *are* the product
thesis but are currently only captured as one-shot prose: (1) a **Capability-Parity Register** — the
living version of the `analysis/incumbent-teardown/` — that answers "what do Vintrace/InnoVint do, do
we cover it, and is our AI-native version better?" at every `/plan` and `/ship`; and (2) an
**AI-Nativeness guard** that fails CI when a domain **core** ships with **no assistant tool** — the
missing upstream link to the existing `TRIP-AI-EVAL` (tool→golden) gate. Both reuse the proven
machinery verbatim: typed `.md` note + `.base` dashboard + `verify:*` guard + CI + non-blocking
post-commit hook.

## Problem Frame

The vault today has two kinds of machinery. **Living loops** (invariants, tripwires, scale/security
registers) that self-defend via typed note + `verify:` guard + `.base` + PreToolUse injection — these
work. And **one-shot analyses** (`incumbent-teardown/SYNTHESIS.md`, `FIX_RUNBOOK.md`, the 997-article
`vintrace-docs`/`innovint-docs` corpus) that were true the day they were written and drift the moment
the next phase ships.

The gap: the loops enforce that the app is *correct, safe, scalable, secure* — but nothing enforces
*why the product wins*: "talk-to-it instead of train-on-it" (AI-native) and "easiest migration + beats
the incumbents." As we build agentically, CI can stay green on invariants while the product quietly
drifts off-thesis. If we do nothing, the teardown becomes stale reference and each un-wired feature
erodes the moat with no alarm.

This plan converts the two thesis dimensions into enforced living loops using the *exact* patterns
already proven, inventing no new conventions.

## Requirements

- MUST: A `docs/architecture/parity/` register of typed `.md` notes (Obsidian-vault-native), one per
  incumbent capability, with fields: `incumbent`, `capability`, `status`
  (covered|partial|gap|deliberately-omitted), `ourApproach`, `aiNativeEdge`, `evidence`.
- MUST: `parity.base` dashboard grouped by `status`, mirroring `invariants.base`/`tripwires.base`.
- MUST: `npm run verify:parity` guard — fails if a note with `status: covered` has a dead/missing
  `evidence` path (mirror of the invariant guard-existence check).
- MUST: Pilot-populate the register from ONE corpus slice — the ~8 barrel/cellar-ops capabilities —
  so the shape is validated before committing to all ~997 corpus articles.
- MUST: An AI-Nativeness guard (`npm run verify:ai-native`) that fails CI when a domain core under
  `src/lib/**/*-core.ts` is **not import-graph-reachable** from any assistant tool and is not
  allow-listed. Reachability computed from CODE (TS compiler API / ts-morph), not a doc (council C1/C2).
- MUST: The guard **auto-generates** the human-readable coverage table in
  `docs/architecture/assistant-coverage.md` from the same graph (between generated markers), and a
  drift-check fails CI if the committed doc is stale (doc becomes a build artifact, not hand-maintained).
- MUST: Register it as a `guard`-kind tripwire note (`TRIP-AI-CORE`) — NOT `static` (a core→tool
  cross-reference cannot be expressed as a single forbidden regex).
- MUST: Wire both guards into `.github/workflows/ci.yml` (hard gate) and `.githooks/post-commit`
  (non-blocking), following the invariants/tripwires wiring exactly.
- MUST: Both guards pass green on landing via a **ratcheting** allow-list — CI asserts allow-list
  length ≤ a hardcoded max that can only *decrement*; each entry carries `owner` + `reason`/issue
  (council C5). Mirrors `UNCOVERED_OK` but cannot grow.
- MUST: Parity register is **corpus-complete on day one** — an ingestion script generates ~997
  `status: gap` stub notes from the vintrace/innovint corpus so the dashboard shows honest coverage;
  NOT 8 hand-written notes (council C4).
- SHOULD: A `docs/_templates/parity.md` template wired via the existing `docs/_templates` folder.
- SHOULD: `.gitattributes` forcing LF on the new note/script paths (council S5).

## Scope Boundaries

**In scope:**
- The two registers, their guards, CI + post-commit wiring.
- Full corpus ingestion: a script generating ~997 `status: gap` parity stubs (dashboard honest day one).
- AI-native guard = AST import-graph reachability + auto-generated coverage doc + ratcheting allow-list.

**Out of scope:**
- The "parity-drift" and "incumbent-freshness" CI automation loops (separate future work; this plan
  builds the register they would feed).
- Changing the existing `TRIP-AI-EVAL` / `assistant-tools.eval.test.ts` gate — we ADD the upstream
  link, we do not touch the working downstream one.
- Any change to app runtime code / cores / tools themselves (guards are read-only over the tree).
- The PreToolUse parity-injection hook (dropped post-council — keep PreToolUse for invariants only).
- Hand-authoring the `ourApproach`/`aiNativeEdge`/`covered` status for all 997 (stubs default to
  `gap`; enrichment happens incrementally as capabilities ship, or via a later loop).

## Research Summary

### Codebase Patterns

**Guard scripts** (`scripts/verify-invariant-guards.mjs`, `scripts/verify-tripwire-guards.mjs`): pure
Node `.mjs`, glob `docs/architecture/<reg>/*.md` (exclude `README.md`), regex frontmatter parser that
**normalizes CRLF→LF first** (Windows-critical), validate each note's `verify:` resolves to a real
npm script (`SCRIPTS[name]`) or existing file path, `process.exit(1)` on any gap. The tripwire script
adds an `enforce` dispatch: `guard` (verify exists), `static` (`scanForbidden()` greps a `forbid:`
regex under `in:`), `observe` (captures `signal:`, never fails).

**Note format** (`docs/_templates/{invariant,tripwire}.md`, live notes): YAML frontmatter
(`id`, `group`, `severity`, `enforce`/`enforcedBy`, `verify`/`forbid`/`in`/`signal`, `status`,
`appliesTo[]`, `tags[]`) + `# ID — title` + `> [!callout]` one-liner + attribute bullets + wikilinks
(`[[system-map]]`). **LF only** or the parser silently skips the note.

**`.base` format** (`invariants.base`, `tripwires.base`): `filters` (`file.hasTag(...)`, exclude
`_templates`), `formulas` (icon expressions), `properties` (displayName map), `views[]` (table/cards,
`groupBy.property`, `order[]`). Grouped views are just a `groupBy` on a frontmatter field.

**CI wiring** (`.github/workflows/ci.yml` lines 26–33, `check` job): three hard gates run before
vitest — `verify:invariants`, `verify:invariant-frontmatter`, `verify:tripwires`. New guards slot in
after line 32.

**Post-commit** (`.githooks/post-commit`, registered via `core.hooksPath`): runs each guard, greps
output for `MISSING|FIRED|✗`, prints a nudge, **always `exit 0`** (non-blocking locally, hard in CI).

**PreToolUse hook** (`.claude/hooks/inject-brain-context.mjs`, matcher `Edit|Write|MultiEdit`): a
`HOT[]` list of governed prefixes; if the edited path matches, scans `invariants/`, matches notes
whose `appliesTo[]` prefixes the path, injects a `⚠ governed code` block. Extensible by adding a
directory scan + a section.

**Assistant architecture:** `src/lib/assistant/registry.ts` collects `ALL_TOOLS` (`AssistantTool`:
`name`, `kind: "read"|"write"`, `inputSchema`, `run`). Write tools resolve names → call a domain
**core** (`src/lib/**/*-core.ts`, ~14 files, script-safe, owns invariants) → return a confirm-nonce
proposal. Existing D26/H8 gate (`test/evals/assistant-tools.eval.test.ts`) fails if a write **tool**
lacks a golden case in `assistant-write-tools.golden.ts` unless allow-listed in `UNCOVERED_OK`.

### Prior Learnings

- Vault notes and shell scripts here **must be LF**; CRLF fails the frontmatter parser and the
  approval sanitizer (`health-remediate-loop-gotchas`, and the tripwire parser normalizes for this).
- `invariant-drift.test.ts` is pre-broken (SyntaxError since the rebrand) — ignore it in vitest output.
- No `.env` in the worktree, so `verify:*` DB-backed guards can't run locally; these two new guards
  are **pure Node over the file tree** (no DB) so they DO run locally and in the `check` CI job.
- Coverage matrix (`docs/architecture/assistant-coverage.md`) already enumerates cores↔tools — reuse
  it to seed the allow-list rather than re-deriving.

### External Research

None needed — this is internal tooling that mirrors existing scripts. No new deps.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Parity note "liveness" check | `status: covered` ⇒ `evidence` must resolve to an existing path | Check every note; check nothing | Mirrors invariants exactly (only `guarded` notes need a live `verify:`). Gaps/omitted are claims-in-progress, not liabilities. |
| AI-native check enforcement kind | `guard`-kind tripwire backed by `verify:ai-native` script | `static` forbid-regex | A core→tool cross-reference is a set-difference across two dirs; the `static` grep can only forbid a single pattern in one scope. Must be a real script. |
| **AI-native detection (eng-review [1] → council C1/C2, REVISED)** | **AST import-graph:** use the TS compiler API / ts-morph to compute reachability from `src/lib/assistant/tools/*` through wrappers to exported `*Core` symbols; fail if a core is unreachable and not allow-listed. **Auto-generate** the `assistant-coverage.md` table from the same graph (drift-checked). | Coverage-doc-anchored (council: measures the wrong thing — doc-consistency, not reachability); naive symbol-grep of tools/ (false gaps from wrappers); tool `covers:[]` field (touches every tool def) | Council consensus: code is the source of truth. An import graph resolves the wrapper problem that killed grep, and auto-generating the doc turns a hand-maintained liability into a build artifact that can't rot. `typescript` is already a dep (TS compiler API), so likely no new dep (ts-morph only if it materially simplifies). |
| **Green-on-landing + ratchet (council C5)** | `ai-native-allowlist.mjs` seeded so CI is green, BUT CI asserts `length ≤ MAX` (a hardcoded cap you decrement as gaps burn down — can only shrink) + each entry carries `owner`+`reason` | Stale-check only (institutionalizes the gap set as permanent policy) | A seeded escape hatch without a ratchet is a permanent rug; the monotonic cap forces the backlog to shrink. |
| Relationship to TRIP-AI-EVAL | ADD `TRIP-AI-CORE` (core→tool); leave TRIP-AI-EVAL (tool→golden) untouched | Fold into one | Two links of one chain (core→tool→golden). Keeping them separate keeps each guard single-purpose and the existing gate stable. |
| **Parity scope (eng-review pilot → council C4, REVISED)** | **Corpus-complete:** an ingestion script generates ~997 `status: gap` stubs from the vintrace/innovint corpus in this PR; dashboard shows honest coverage day one | 8 hand-written notes (council: false coverage, deferred sweep never lands); drop notes + rely on importers (importers unbuilt — no enforcement for months) | A register that only ever holds 8 notes is a disguised Jira board. Generating the full universe as gaps makes the dashboard truthful and the gate meaningful, at near-zero cost via a script. |
| **PreToolUse parity injection (council DQ, REVISED)** | Dropped | Keep as deferred | Injecting competitor-strategy teardowns into the coding context burns tokens and won't prevent a bug; PreToolUse stays scoped to invariants. |
| **Guard code sharing (eng-review [3])** | Extract `scripts/lib/vault-notes.mjs` (frontmatter parse, CRLF-normalize, note-glob, repoRoot); use in the TWO new scripts only | Refactor all 4 scripts; copy-paste | DRY for new code without refactoring the two working CI-gate scripts (blast-radius control). |
| **Guard meta-tests (eng-review [4])** | Add node-env vitest fixtures per guard (dead-evidence→exit 1, clean→exit 0, uncovered-core→exit 1) | Manual fixtures only | These are load-bearing CI gates; "well-tested is non-negotiable." Cheap with CC, regression-proofs the gate. |
| Parity `evidence` for `covered` (eng-review [2]) | Require a concrete repo-relative path; wikilinks allowed only for gap/partial | Allow wikilinks everywhere | Wikilink→path resolution is fuzzy for a script; a concrete path is cheaply `existsSync`-checkable. |

## Implementation Units

### Unit 1: Parity note template + register scaffold

**Goal:** Establish `docs/architecture/parity/` as a vault-native register with a template.
**Files:** `docs/_templates/parity.md` (create), `docs/architecture/parity/README.md` (create).
**Approach:** Copy `docs/_templates/invariant.md` structure. Frontmatter schema for parity notes:
`id` (PARITY-<n>), `group` (domain, e.g. `cellar-ops`), `incumbent` (vintrace|innovint|both),
`capability` (short label), `status` (covered|partial|gap|deliberately-omitted), `ourApproach`
(prose/link), `aiNativeEdge` (assistant utterance or "parity only"), `evidence` (repo path or
`docs/plans/...` link), `tags: [parity]`. Body = `# PARITY-<n> — <capability>` + `> [!info]` one-line
stance + attribute bullets + `[[system-map]]`/`[[assistant-coverage]]` wikilinks. README explains the
register + fields (mirror the invariants README tone). **LF endings.**
**Tests:** none (docs). Validated by Unit 4's guard.
**Depends on:** none
**Patterns to follow:** `docs/_templates/invariant.md`, `docs/architecture/invariants/` note bodies.
**Verification:** Files exist, LF endings (`file docs/architecture/parity/*.md` / no CRLF).

### Unit 2: Corpus-ingestion script → ~997 gap-stub parity notes (council C4)

**Goal:** Make the register corpus-complete and the dashboard honest on day one.
**Files:** `scripts/ingest-parity-corpus.mjs` (create), `docs/architecture/parity/PARITY-*.md`
(generated, ~997).
**Approach:** Read the corpus indexes (`vintrace-docs/INDEX.md`, `innovint-docs/INDEX.md`) — each
lists categorized articles with titles + source links. For each article, emit one parity stub note:
deterministic `id` (e.g. `PARITY-VT-<section>-<slug>` / `PARITY-IV-...`), `incumbent`, `capability`
(article title), `status: gap` (default), `evidence:` = the corpus article path (a real file → passes
the guard as a gap), empty `ourApproach`/`aiNativeEdge`. Idempotent (re-run overwrites the generated
block, preserves any hand-enriched fields via a `<!-- enriched -->` marker or a separate frontmatter
key the script won't clobber). For the ~8 barrel/cellar-ops capabilities already covered (Rack,
Topping, Cap-Mgmt, Barrel-Maintenance, etc. from research), the script (or a follow-up hand pass)
sets `status: covered` + real `ourApproach`/`aiNativeEdge`/`evidence` so the dashboard shows a real
non-zero numerator. Mark the 2 known gaps (lees sub-lot, barrel-groups CRUD) `status: partial`.
**Tests:** the generated notes are validated by Unit 5's guard; the ingestion script gets a smoke
test in Unit 8 (parses a fixture index → N stubs).
**Depends on:** Unit 1
**Patterns to follow:** `vintrace-docs/INDEX.md` / `innovint-docs/INDEX.md` structure;
`analysis/incumbent-teardown/operations-workflow.md` §3 for the covered/gap classification of the
cellar-ops slice.
**Verification:** `node scripts/ingest-parity-corpus.mjs` generates ~997 notes; `npm run
verify:parity` passes; `parity.base` shows honest coverage (e.g. "~1% covered, ~99% gap") and the
Gaps view is populated.

### Unit 3: `parity.base` dashboard grouped by status

**Goal:** At-a-glance "what do the incumbents do that we don't."
**Files:** `docs/architecture/parity/parity.base` (create).
**Approach:** Mirror `tripwires.base`. `filters`: `file.hasTag("parity")`, `file.ext == "md"`,
exclude `_templates`. `formulas`: `status_icon` (covered✅ / partial🟨 / gap❌ / omitted⚪),
`edge` = `aiNativeEdge`. `properties`: id, capability, incumbent, formula.status_icon, ourApproach,
evidence. `views`: "All (by status)" (`groupBy: status`), "⚠ Gaps & partial"
(`filters: status == gap OR status == partial`), "AI-native edge" (order by aiNativeEdge), "Gallery" cards.
**Tests:** none (Obsidian renders it; YAML must parse).
**Depends on:** Unit 1
**Patterns to follow:** `docs/architecture/tripwires/tripwires.base` verbatim structure.
**Verification:** Valid YAML; opens in Obsidian; the Gaps view shows the 2 gap notes.

### Unit 4: Shared vault-note helper

**Goal:** One DRY home for the note-parsing logic the two new guards share (eng-review [3]).
**Files:** `scripts/lib/vault-notes.mjs` (create).
**Approach:** Export small pure fns: `repoRoot()`, `readNote(path)` (reads + normalizes CRLF→LF —
Windows-critical), `parseFrontmatter(text)` (regex parser matching the existing scripts, scalars +
list fields), `listNotes(dir)` (glob `*.md`, exclude `README.md`). No behavior change to the two
existing scripts (they keep their inline copies — blast-radius control); this helper serves the NEW
scripts only.
**Tests:** covered indirectly by Unit 8 (the guards that use it).
**Depends on:** none
**Patterns to follow:** `scripts/verify-invariant-guards.mjs` frontmatter parser;
`scripts/verify-tripwire-guards.mjs` CRLF-normalize (line 38).
**Verification:** `node -e "import('./scripts/lib/vault-notes.mjs')"` loads without error.

### Unit 5: `verify:parity` guard + wiring

**Goal:** Fail CI when a `covered` parity claim has dead evidence.
**Files:** `scripts/verify-parity-guards.mjs` (create), `package.json` (add script),
`.github/workflows/ci.yml` (add step), `.githooks/post-commit` (add block).
**Approach:** Use the Unit-4 helper to list + parse `docs/architecture/parity/*.md`. For each note:
require `id`, `capability`, `status` (∈ covered|partial|gap|deliberately-omitted). If
`status == "covered"`: `evidence` MUST be a concrete repo-relative `path` or `path:line` (eng-review
[2] — no wikilinks for covered), it MUST resolve to a **file** (not a dir), and the resolved path MUST
stay **inside the repo root** (reject `../` escapes — council S1). Notes with `gap`/`partial`/`omitted`
may carry a `[[wikilink]]`/corpus link; a dead link on those is a **warning, not a hard fail** (council
S1 — refactors/hotfixes must not be blocked by non-covered link-rot). Collect violations; warn on
malformed frontmatter / unknown `status`. Expose a pure `run(dir) → {violations, warnings}`; the CLI is
a thin wrapper that `process.exit(1)`s on violations (council S3). Add `"verify:parity"` to
package.json. In ci.yml add `- run: npm run verify:parity` immediately after the `verify:tripwires`
step (~line 32, hard gate, early in the `check` job). In post-commit add a non-blocking block copied
from the tripwire block — **wrapped so it always exits 0 even if node is missing or the script throws**
(council S2); grep `MISSING|✗`, print a nudge.
**Tests:** Unit 8 covers this guard's logic. Plus a manual smoke during /work.
**Depends on:** Units 1–3 (data to check), Unit 4 (helper)
**Patterns to follow:** `scripts/verify-invariant-guards.mjs` lines 39–90; `.githooks/post-commit`
lines 24–44; `ci.yml` lines 30–32.
**Verification:** `npm run verify:parity` exits 0 with pilot notes; a bogus `evidence` path → exit 1
naming the note.

### Unit 6: `verify:ai-native` guard (AST import-graph) + auto-gen doc + ratcheting allow-list (council C1/C2/C3/C5)

**Goal:** Fail CI when a domain core is not import-reachable from any assistant tool; keep the coverage
doc as a generated artifact.
**Files:** `scripts/verify-ai-native.mjs` (create), `scripts/ai-native-allowlist.mjs` (create),
`scripts/gen-assistant-coverage.mjs` (create, or a `--write` flag on the guard), `package.json` (add
scripts), `docs/architecture/assistant-coverage.md` (convert to partly-generated).
**Approach:** **Code is the source of truth, NOT a doc** (council C1). Steps: (1) Use the TS compiler
API (`typescript` is already a dep) — or `ts-morph` only if it materially simplifies — to load the
project and resolve real exported symbols (handles `async`, aliased/re-exports, barrels, multiline —
fixes council C2). Enumerate exported `*Core` symbols in `src/lib/**/*-core.ts`. (2) Build the import
graph rooted at every module under `src/lib/assistant/tools/**` (and `registry.ts`); a core is
**reachable** if some tool module transitively imports the module that exports it. This resolves the
wrapper chain (`rack_wine`→`transferWine`→`transferWineCore`) that made grep unsound. (3) A core is a
**gap** if unreachable AND not in `ai-native-allowlist.mjs`. `process.exit(1)` listing each gap +
file. (4) **Ratchet (council C5):** `ai-native-allowlist.mjs` exports entries `{core, owner, reason,
issue?}`; the guard asserts `entries.length ≤ MAX_ALLOWED` (a hardcoded const, set = seeded count at
landing, only ever decremented) and fails if exceeded or if any entry is stale (core gone from disk).
(5) **Auto-generate the doc:** `gen-assistant-coverage.mjs` (or `verify-ai-native --write`) rewrites
the table in `assistant-coverage.md` between `<!-- BEGIN GENERATED -->`/`<!-- END GENERATED -->`
markers from the graph (core, reachable?, via-which-tool); the human narrative outside the markers is
preserved. The guard runs it in check-mode and FAILS if the committed doc differs from freshly
generated (drift-check, like a prisma-generate drift gate). Seed the allow-list from the current
unreachable set so the build is green on landing.
**Tests:** Unit 8 (fixtures: reachable core → 0 gaps; unreachable core → gap; allow-listed → 0;
over-MAX allow-list → fail; stale entry → fail; doc drift → fail).
**Depends on:** Unit 4 (helper for any note IO; the AST walk is self-contained)
**Patterns to follow:** `test/evals/assistant-tools.eval.test.ts` lines 55–88 (UNCOVERED_OK + stale
check) for the allow-list shape; any existing `typescript`-API usage in the repo (e.g. build scripts).
**Verification:** `npm run verify:ai-native` exits 0 on landing; removing an allow-list entry for a
genuinely-unreachable core → exit 1 naming it; adding a new tool that reaches it → exit 0 + doc
regenerates; hand-editing the generated doc block → drift-check exit 1.

### Unit 7: `TRIP-AI-CORE` tripwire note + wiring

**Goal:** Register the AI-native guard in the tripwire register and run it in CI.
**Files:** `docs/architecture/tripwires/TRIP-AI-CORE-core-not-accounted-for.md` (create),
`.github/workflows/ci.yml` (add step), `.githooks/post-commit` (add block).
**Approach:** `enforce: guard`, `verify: "npm run verify:ai-native"`, `group: assistant`,
`severity: high`, `status: guarded`, `appliesTo: [src/lib/, src/lib/assistant/]`,
`tags: [tripwire]`. Body one-liner: "a domain core not import-reachable from any assistant tool — a
capability you can build but can't talk to; the moat is 'talk-to-it', so every core is reachable,
allow-listed, or CI is red." Wikilink `[[assistant-coverage]]`, `[[TRIP-AI-EVAL]]` (name the chain:
core→tool→golden), `[[system-map]]`. Add `- run: npm run verify:ai-native` to ci.yml after
`verify:parity`. Add the non-blocking post-commit block. Existing `verify:tripwires` will confirm this
note's guard exists. (Council S6: this note is process-only single-source-of-truth for the tripwire
register; the *enforcement* lives in the script, so keep the note thin.)
**Tests:** `npm run verify:tripwires` still passes (new guard-note's `verify:` resolves).
**Depends on:** Unit 6
**Patterns to follow:** `docs/architecture/tripwires/TRIP-AI-EVAL.md`, `TRIP-SEC-NEWTABLE` (guard kind).
**Verification:** `npm run verify:tripwires` green; `npm run verify:ai-native` runs as its own CI step.

### Unit 8: Guard meta-tests + adversarial fixtures (eng-review [4], council S3/S4)

**Goal:** Regression-proof both new CI gates and their parsers.
**Files:** `test/verify-parity.test.ts` (create), `test/verify-ai-native.test.ts` (create),
`test/fixtures/parity-*/`, `test/fixtures/ai-native-*/` (create).
**Approach:** node-env vitest (repo default). Refactor each guard so the CLI is a **thin wrapper over
a pure `run(paths) → {violations}`** (council S3) — tests call `run()` directly, no spawn. Cases:
- **verify:parity:** covered-note w/ live `path:line` → 0; covered w/ dead path → violation; covered w/
  `../` escape → violation; covered w/ wikilink → violation; unknown status → flagged; link-rot on a
  `gap` note → NOT a hard failure (warn).
- **verify:ai-native:** reachable core (through a wrapper) → 0 gaps; unreachable core → gap;
  allow-listed unreachable → 0; allow-list over `MAX_ALLOWED` → fail; stale allow-list entry → fail;
  hand-edited generated doc block → drift-check fail.
- **Adversarial parser fixtures (council S4):** aliased export (`export { x as yCore }`), multiline
  signature, re-export/barrel, CRLF note, malformed frontmatter — assert the AST walk + note parser
  handle each (no false gap, no silent skip).
- **ingestion smoke:** `ingest-parity-corpus` on a 3-line fixture index → 3 stub notes.
**Tests:** these ARE the tests.
**Depends on:** Units 2, 5, 6
**Patterns to follow:** existing `test/*.test.ts` node-env style; ignore pre-broken
`invariant-drift.test.ts`.
**Verification:** `npx vitest run test/verify-parity.test.ts test/verify-ai-native.test.ts` green.

_(Former Unit 9 — PreToolUse parity injection — DROPPED post-council: keep PreToolUse scoped to
invariants; parity lives in the dashboard, not the edit-time context window.)_

### Cross-cutting: `.gitattributes` (council S5)

Add/extend `.gitattributes` to force `text eol=lf` on `docs/architecture/parity/**`,
`docs/architecture/tripwires/**`, and `scripts/**` so CRLF can never become a semantic parser failure.
Fold into Unit 4 (helper) or Unit 5 (first script landing). Every parser still normalizes CRLF→LF on
read as belt-and-suspenders.

## Test Strategy

**Deterministic guards (the real gate):** `verify:parity` and `verify:ai-native` are pure-Node,
no-DB, so they run in the `check` CI job AND locally in the worktree (unlike DB-backed `verify:*`).
Each guard exposes a pure `run(paths) → {violations}` so **Unit 8 vitest meta-tests** exercise the
logic against temp fixtures (dead-evidence→violation, clean→none, uncovered-core→violation, stale
allow-list→violation) with no child-process spawn where avoidable. A manual smoke during `/work`
confirms the CLI wrapper exits 1 on a real violation.

**Existing suite:** full `vitest run` must stay green (ignore the known-broken
`invariant-drift.test.ts`). `verify:tripwires` and `verify:invariants` must stay green (the new
tripwire note's guard must resolve; no invariant touched).

**Manual verification:** open `parity.base` in Obsidian — the "Gaps & partial" view shows the 2 known
gaps; the status grouping renders. Run all four `verify:*` (invariants, tripwires, parity, ai-native)
locally → all exit 0.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| First `verify:ai-native` run surfaces many unreachable cores → red CI | HIGH | MED | Seed the ratcheting `ai-native-allowlist.mjs` from the actual unreachable set at landing; `MAX_ALLOWED` = seeded count; green-on-landing is a MUST. |
| TS-compiler-API import-graph is slow or complex (barrels, path aliases, tsconfig `paths`) | MED | MED | Reuse the repo's `tsconfig` for module resolution; cap the walk to `src/lib`; if the compiler API proves heavy, `ts-morph` is the fallback (added only if it materially simplifies). Meta-tests (Unit 8) cover alias/barrel/multiline. |
| Auto-generated coverage-doc drift-check causes churn / merge noise | MED | LOW | Generate only between markers; deterministic ordering; the human narrative outside markers is untouched. Same pattern as prisma-generate drift gates already tolerated. |
| Ratchet `MAX_ALLOWED` blocks a legitimate new gap when a big core lands with no tool yet | MED | MED | Landing a new core without a tool is EXACTLY the drift we want flagged; the fix is to wire a tool or consciously bump MAX with an owner+reason (a reviewed decision, not silent). |
| ~997 generated notes bloat the vault / slow `verify:parity` | LOW | LOW | Stubs are tiny; guard only path-checks `covered` notes; glob+parse of ~1k small files is well under a second. |
| CRLF slips into a new note/script on Windows → parser skips it silently | MED | MED | `.gitattributes` forces LF (council S5); guards normalize CRLF→LF on read; unparseable/no-status note = violation, not silent skip. |
| `.base` YAML dialect drift breaks Obsidian rendering | LOW | LOW | Copy `tripwires.base` structure verbatim; validate it parses as YAML. |
| Scope creep into building the parity-drift / freshness automation loops | MED | MED | Explicitly out of scope; this plan only builds the register + guards they'd consume. |

## Success Criteria

- [ ] `docs/architecture/parity/` exists with template, README, `parity.base`, and ~997 corpus-generated notes; `parity.base` shows honest coverage (real numerator, ~99% gap) + a Gaps view.
- [ ] `scripts/ingest-parity-corpus.mjs` is idempotent and regenerates the stubs from the corpus indexes.
- [ ] `npm run verify:parity` exits 0 on landing; exits 1 on a dead-evidence / `../`-escape / wikilink-on-covered fixture; link-rot on a non-covered note is a warning only.
- [ ] `verify:ai-native` uses a TS-compiler-API import-graph (code is source of truth), NOT a doc parse or symbol-grep; a wrapper-reached core is correctly counted as reachable.
- [ ] `assistant-coverage.md` table is auto-generated between markers; a hand-edit of the generated block fails the drift-check.
- [ ] `ai-native-allowlist.mjs` ratchets: CI fails if length > `MAX_ALLOWED` or on a stale entry; each entry has `owner`+`reason`.
- [ ] `TRIP-AI-CORE` note added (thin/process-only); `npm run verify:tripwires` and `verify:invariants` stay green.
- [ ] `scripts/lib/vault-notes.mjs` extracted and used by the new scripts; the two existing guard scripts untouched.
- [ ] Guards expose a pure `run()`; CLIs are thin wrappers; post-commit blocks always exit 0.
- [ ] `.gitattributes` forces LF on the new note/script paths.
- [ ] Unit 8 meta-tests green incl. adversarial parser fixtures (aliased/multiline/barrel/CRLF) and doc-drift.
- [ ] Both new guards wired as hard gates in `ci.yml` (early in `check`) and as non-blocking blocks in `.githooks/post-commit`.
- [ ] Full `vitest run` green (excluding pre-broken `invariant-drift.test.ts`); no regressions.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Grounded in the actual vault state + the user's stated thesis. |
| Scope Boundaries | HIGH | Pilot-only + guards; loops explicitly deferred. |
| Implementation Units | HIGH | Every unit mirrors a verbatim existing pattern (3 research agents mapped exact files/lines). |
| Test Strategy | HIGH | Unit 8 adds vitest meta-tests against fixtures (eng-review [4]); guards expose a pure `run()`. |
| Risk Assessment | MEDIUM | Coverage-doc parseability + green-on-landing allow-list are the two things to watch; both have conservative mitigations. |

## NOT in scope

- Populating parity notes for all ~997 corpus articles (pilot slice only; full sweep is a later scheduled loop).
- The parity-drift and incumbent-freshness CI automation loops (this plan builds the register they'd feed).
- Changing the existing `TRIP-AI-EVAL` / `assistant-tools.eval.test.ts` gate (we add the upstream link only).
- Refactoring the two existing verify scripts onto the shared helper (blast-radius control; new scripts only).
- Any change to app cores/tools themselves — guards are read-only over the tree.

## What already exists (reused, not rebuilt)

- `scripts/verify-invariant-guards.mjs` + `verify-tripwire-guards.mjs` — the guard pattern (mirrored).
- `docs/architecture/{invariants,tripwires}/*.base` — the dashboard pattern (mirrored for parity.base).
- `test/evals/assistant-tools.eval.test.ts` (D26/H8) — enforces tool→golden; we ADD core→tool upstream.
- `docs/architecture/assistant-coverage.md` — becomes a GENERATED artifact (table regenerated from the import graph between markers; narrative preserved). No longer the source of truth.
- `src/lib/assistant/registry.ts` + `src/lib/assistant/tools/*` — the real import-graph roots the AI-native guard walks.
- `typescript` (already a dep) — the TS compiler API used for symbol resolution + the import graph.
- `.githooks/post-commit`, `ci.yml` check job, `.claude/hooks/inject-brain-context.mjs` — wiring targets.

## Failure modes

- **CRLF-silent-skip** (a covered note escapes the guard): mitigated — helper normalizes CRLF→LF before parse; not silent because the note still fails to match `covered` and won't be checked... so ALSO: guard treats an unparseable/no-status note as a violation, not a skip. 0 critical gaps.
- **Coverage-doc column unparseable**: mitigated — Unit 6 confirms/normalizes the column; a missing core → hard fail (drift is the signal).
- No failure mode is both untested AND silent AND unhandled → **0 critical gaps**.

## Parallelization

- **Lane A:** Units 1→2→3 (parity template/notes/base) — touches `docs/architecture/parity/` only.
- **Lane B:** Unit 4 (helper) — touches `scripts/lib/`.
- Lanes A and B are independent → parallel.
- **Sequential tail:** Units 5, 6, 7 all edit `package.json` + `ci.yml` + `.githooks/post-commit` (shared files) → **must be sequential** to avoid merge conflicts. Unit 5 needs A+4; Unit 6 needs 4; Unit 7 needs 6; Unit 8 needs 5+6.
- **Conflict flag:** 5/6/7 share three config files. Given the small size, recommend **mostly sequential** execution; parallelize only Lane A vs Unit 4.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (Codex + Gemini) | `/council` | Cross-LLM adversarial | 1 | ADDRESSED | 5 critical + 6 should-fix; 4 design Qs → user chose all recommended; plan revised |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 issues, 0 critical gaps — all resolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | n/a | no UI surface (vault + scripts) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Codex + Gemini independently converged on (a) code-not-doc source of truth for AI-native and (b) allow-list ratchet. High-confidence consensus → adopted.
- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED + COUNCIL ADDRESSED. Plan revised post-council (AST import-graph, full corpus ingest, ratchet, Unit 9 dropped). Awaiting human approval before `/work`.
