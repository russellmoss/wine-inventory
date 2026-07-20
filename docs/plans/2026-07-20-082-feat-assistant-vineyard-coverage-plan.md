---
title: Close the assistant's vineyard + block coverage gap
type: feat
status: completed
date: 2026-07-20
branch: claude/assistant-vineyard-coverage
depth: standard
units: 7
---

## Overview

The assistant can log Brix on a block but cannot tell you where the vineyard is. GPS,
elevation, soil, and manager live on `VineyardDetail`, which is not registered as an
assistant entity at all. On top of that, the block's `creatable` and `editable` field
lists drifted apart in opposite directions, and row/vine spacing — the two numbers that
derive planted acreage — are writable by neither.

This closes the gap by extending the existing `EntityConfig` registry rather than adding
new tools, and by pulling the field coercion that today lives only in the UI's
`parseBlockForm` into a pure module both write paths share.

## Problem Frame

A winemaker sitting in the truck asks "what are the coordinates for Estate?" or "set the
vine spacing on Block 1 to 5 feet." Today the first is unanswerable and the second is
unwritable. They have to stop, open `/reference`, find the vineyard modal, and type it in.
That is precisely the moment the assistant exists to remove.

Three of the four gaps are worse than "missing":

- **Spacing is a correctness hazard, not just an omission.** `vineCount` is writable and
  the spacings are not, so the assistant can move a block into a state where the derived
  planted acreage (`prisma/schema.prisma:404` comment) is wrong, with no assistant path to
  correct it. It can break the number and cannot fix it.
- **Variety is create-only.** `buildCreate` resolves a variety by name
  (`entities.ts:166-178`); `editable` has no variety field at all. So a mis-set variety is
  permanently un-fixable by the assistant. Replants and corrections require the UI.
- **`abbreviation` is neither creatable nor editable**, so an assistant-created vineyard
  lands with `abbreviation = null` and cannot participate in lot codes until a human opens
  the reference UI. The assistant creates a half-built record and reports success.

**Product pressure test.** Is "more assistant fields" the right problem, or a proxy? It is
the right problem, but the framing matters: the underlying issue is that
`src/lib/assistant/entities.ts:91` labels the block config a *"Unit 1 vertical slice"* and
nothing ever came back to finish it. The asymmetry between `creatable` and `editable` is
not a design; it is a half-built config that shipped. The durable fix is not just adding
fields, it is making the two lists derive from one shared definition so they cannot drift
again. That is Unit 2's real job.

What happens if we do nothing: the assistant stays credible for operations (Brix, picks,
yields) and quietly unreliable for the reference data underneath them. That asymmetry
teaches users not to trust it, which is more expensive than the missing fields.

## Requirements

- MUST: Assistant can read and write `VineyardDetail` fields — `gpsLat`, `gpsLng`,
  `elevationM`, `soilType`, `manager`, `defaultUnit` — including on vineyards that have no
  detail row yet.
- MUST: Block `variety` becomes editable, reusing the existing name-resolution behavior.
- MUST: `rowSpacingM` / `vineSpacingM` become both creatable and editable, with the same
  unit conversion the UI applies.
- MUST: `Vineyard.abbreviation` becomes creatable and editable, with format validation.
- MUST: The assistant write path and the UI write path agree on coercion, unit conversion,
  and validation. Divergence here is the actual defect class.
- MUST: `verify:parity`, `verify:ai-native`, `verify:invariants`, and the existing
  assistant eval suites stay green.
- MUST: New write capability carries golden eval coverage consistent with the existing
  `MUST_PROPOSE` conventions.
- SHOULD: `creatable` and `editable` for a given entity derive from one source so they
  cannot silently drift apart again.
- SHOULD: Audit rows for detail-field edits carry the same `entityType` regardless of which
  path wrote them.
- NICE: A `zero is not null` fix for the spacing coercion (see Risks).

## Scope Boundaries

**In scope:**

- `VineyardDetail` fields, surfaced through the existing `Vineyard` entity config.
- Block `creatable` / `editable` symmetry, spacing, variety-on-update.
- `Vineyard.abbreviation`.
- A shared pure coercion module used by both `parseBlockForm` and `entities.ts`.
- Golden eval cases + unit tests + regenerated coverage docs.

**Out of scope:**

- `VineyardSubblock` — no UI demand established, and it compounds the nested-write problem
  this plan is already taking on once. Revisit after this lands.
- Block `polygon` and `color` — these are map-drawing surfaces. A polygon is not something
  a user dictates to an assistant, and `color` is cosmetic. Deliberately omitted; record as
  such in the parity register so the gap is documented rather than forgotten.
- Any new assistant *tool*. The `db_*` trio already covers this; adding tools would trip
  the `assistant-tools.eval` write-tool guards for no user benefit.
- Changing the `FieldSpec` type to add per-field transform hooks. See Decision D.

## Research Summary

### Codebase Patterns

**EntityConfig** (`src/lib/assistant/entities.ts:31-72`): 7 required members, 8 optional.
The write triple is `editable` / `current` / `update`; the create triple is `creatable` /
`buildCreate` / `create`. `db_update` hard-gates on all three being present
(`tools/db-update.ts:44`). Adding an entity or extending a config requires **no registry
change** — `getEntity()` and `allowedEntityNames()` derive from the `ENTITIES` object at
`entities.ts:434-443`.

**FieldSpec** (`src/lib/assistant/fields.ts:9-17`) is `{name, type, required?, min?, max?,
enumValues?, description?}`. There is **no per-field parse/validate/resolve hook**.
Coercion is a closed `switch` on `FieldType` at `fields.ts:21-57`. Consequence: any
transform (unit conversion, FK resolution) must live in `buildCreate` (create path) or
inside the entity's own `update` impl (update path). `buildCreate` already does this for
variety; `update` has **no precedent** — every existing `update` is a flat spread into
Prisma.

**Nested writes are new ground.** Grepping all of `src/lib/assistant` for `upsert`,
`connect:`, and nested `create: {` returns zero matches. Every `create` is a flat
single-model `tx.<model>.create`; every `update` is a flat `tx.<model>.update`. FKs are
always written as scalar ids via `...UncheckedInput`. The only existing multi-model write
is `cascadeRestrict.run` (`entities.ts:132` → `src/lib/vineyard/block-delete.ts`), and only
for deletes. `VineyardDetail` is a true 1:1 (`prisma/schema.prisma:388`, `vineyardId
@unique`), and the app writes it via `upsertVineyardDetail`
(`src/lib/vineyard/actions.ts:167-221`).

**units.ts is pure and importable.** `src/lib/vineyard/units.ts` declares "No Prisma, no
I/O" and verifiably has no `"use server"`, no `server-only`, no React or Prisma imports.
`ftToM`, `toCanonicalSpacing`, `acresToHa` are all safely importable from `entities.ts`.
This is what makes the shared-coercion approach cheap.

**findConflict** (`entities.ts:65`, factory at `:80-89`) receives assembled create `data`
post-`buildCreate` and is the NAMING-1 case-insensitive identity guard. Used by `vineyard`,
`variety`, `location`, `finishedGoodCategory`. It is called twice per create — preview
(`db-create.ts:53`) and commit (`db-create.ts:75`) — deliberately, for the stale-card case.

### Eval + register constraints

**The eval does not execute tools.** `runExchange` (`test/evals/assistant-must-propose.eval.test.ts:58-108`)
posts to the Anthropic API and inspects `content`; write tools terminate the loop the
instant they are *named* (`:88-91`), and read tools get canned `fixture` strings (`:99-104`).
New cases may assert **which write tool was selected** and **which arg keys are
present/absent** — nothing about ready/draft status, picker contents, or committed rows.
Those belong in `test/assistant-*.test.ts`.

A case whose premise is "this record exists" **must stub its reads**, or
`DEFAULT_EMPTY_RESULT` tells the model the opposite and talks it out of writing. Turn cap
is `MAX_EVAL_TURNS = 4`.

**Current state on main (`c54329a8`): 5 `MUST_PROPOSE` cases + 2 controls, and no
`db_create`/`db_update` case at all.** PR #387 (`d5735abf`) is *not* merged; its
`delete-ambiguous-block` case and rule-44 rewrite live only on
`claude/fix-picker-tool-descriptions`. **This plan must branch off #387, not off main** —
see Risks.

**`verify:ai-native`** builds a real TypeScript import graph rooted at
`src/lib/assistant/tools/**` + `registry.ts` and requires every `*-core.ts` to be
*reachable*, not one-to-one mapped. Adding an entity config does **not** trip it —
`entities.ts` is already reachable. The live hazard is that
`docs/architecture/assistant-coverage.md` is a **generated artifact**; any reachability
change makes it stale and fails check mode. Fix is `npm run verify:ai-native -- --write`
and commit.

**`verify:parity`** reads `docs/architecture/parity/*.md`. `status: covered` requires
`evidence` to be a real repo-relative path. It never inspects the tool registry.

**`test/evals/assistant-tools.eval.test.ts`** is a separate register that runs with no API
key: every write tool needs a golden case or an `UNCOVERED_OK` entry, plus a `COMMITTERS`
entry in `commit.ts`. `db_create`/`db_update`/`db_delete` are already in `UNCOVERED_OK` as
"generic CRUD catch-all" — this plan adds no tools, so that register is untouched.

**NAMING-2** (`docs/architecture/invariants/NAMING-2-honest-rename.md:19`) governs renames
as append-only `LotCodeEvent` and requires lookup-by-`code` to resolve to `id` first. Its
`appliesTo` is `[src/lib/lot/, src/lib/ledger/]` — **the vineyard entity path is outside
its scope**, and this plan writes no `code` field. It is respected by not being touched.
There is no `VINEYARD-*` or `ASSISTANT-*` invariant today.

### Prior Learnings

`rstack-learnings-search` returned nothing for this query. Relevant facts from session
memory instead:

- `EntityConfig.findConflict` was the fix for ticket #309's duplicate-variety guard —
  confirms the registry is the right seam for identity rules.
- Ticket #313 (vessel→lot auto-resolve) shows the precedent for name-resolution living in
  the entity/tool layer.
- Assistant UI has no jsdom/RTL in this repo — assistant surfaces are manual-QA-only. Unit
  tests must target the pure layer, not components.
- Worktrees lack `.env`; DB-touching verify scripts must run from the main checkout.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| **A. Wrap server actions, or keep direct Prisma?** | Keep direct Prisma in `entities.ts`, but extract the *pure* coercion/validation into a shared module both paths import | Wrap `src/lib/vineyard/actions.ts` from the entity config | The actions are `"use server"`, take `FormData`, and do their own auth + `revalidatePath`. They are structurally uncallable from a tool runtime that works in `ValidatedValues` + `tx`. Wrapping them would mean faking FormData. The real defect is not "two call paths" — it is *two copies of the coercion rules*. Extracting the pure part fixes the actual divergence and leaves the transactional shapes appropriate to each caller. |
| **B. `VineyardDetail` as its own entity, or flattened onto `Vineyard`?** | Flatten onto the existing `Vineyard` config; `update` performs the upsert | Register `VineyardDetail` in `ENTITIES` | A separate entity cannot be *updated* before it exists, and most vineyards have no detail row — `db_update` would fail on exactly the first-time case that matters most. It also forces the user to think in terms of a "detail record," which is an implementation artifact. Users say "the vineyard's coordinates." Flattening costs one `include` in `current` and an upsert in `update`. |
| **C. Audit `entityType` for detail-field edits** | Match the UI: emit `VineyardDetail` for detail fields via an optional per-entity audit override | Accept `entityType: "Vineyard"` for everything, as `db-update.ts:101` does today | Divergence between two write paths for the same column is exactly the drift class this plan exists to remove. If an auditor filters `entityType = "VineyardDetail"`, assistant edits must not vanish from the result. |
| **D. Add a per-field `transform` hook to `FieldSpec`?** | No. Put conversion in the entity's `buildCreate` and `update` | Extend `FieldSpec` with `parse`/`transform` | `FieldSpec` and its closed `switch` are shared by all 8 entities. Changing them to serve one entity's spacing fields is a framework change with a blast radius far wider than the problem. `buildCreate` already sets the precedent for imperative per-entity transforms. Revisit under rule-of-three: if a third entity needs a transform, generalize then. |
| **E. Where do `creatable`/`editable` come from?** | One shared per-entity field table, with `creatable`/`editable` derived from it | Keep two hand-maintained arrays | Two hand-maintained arrays is *precisely how this bug happened*. Deriving both from one table means a new field is covered on both paths by construction, and a deliberate asymmetry has to be written down as such. |
| **F. Branch base** | Branch off `main` — **resolved 2026-07-20** | Branch off `claude/fix-picker-tool-descriptions` | PR #387 merged as `de889cc1` while this plan was being written. `origin/main` now carries the rewritten rule 44 (`prompt.ts:44`) and the `delete-ambiguous-block` golden case, both verified present. The concern that motivated this decision — writing new `db_update` eval cases against the old rule 44, which is known to produce prose instead of tool calls — no longer applies. |

## Implementation Units

### Unit 1: Shared pure coercion for vineyard fields

**Goal:** One module that owns "how a vineyard/block field value becomes a canonical column
value," imported by both `parseBlockForm` and `entities.ts`.
**Files:** create `src/lib/vineyard/field-coercion.ts`; modify `src/lib/vineyard/actions.ts`
(`parseBlockForm:107-124`, `upsertVineyardDetail:167-221`); create
`test/vineyard-field-coercion.test.ts`
**Approach:** Export pure functions for the values both paths need: spacing (delegating to
`toCanonicalSpacing` in `units.ts`), elevation (`ftToM`), GPS latitude/longitude range
validation, and `abbreviation` normalization + format check. No Prisma, no `"use server"`,
no React — this file must stay importable from the assistant runtime, same discipline as
`units.ts:1-2`. Refactor `parseBlockForm` to call it so there is exactly one definition;
this unit should be behavior-preserving for the UI.
**Tests:** Round-trip ft↔m at the values the UI offers. GPS out-of-range (lat > 90, lng >
180) rejects. Abbreviation shorter than 2 / longer than 4 / non-alphanumeric rejects.
**Explicitly: spacing of `0` must produce a validation error, not `null`** — see Risks R1.
**Depends on:** none
**Execution note:** characterization-first — capture `parseBlockForm`'s current outputs
before refactoring it, so the UI path is provably unchanged.
**Patterns to follow:** `src/lib/vineyard/units.ts` (purity discipline and header comment)
**Verification:** `npx vitest run test/vineyard-field-coercion.test.ts` and the existing
vineyard tests stay green.

### Unit 2: Derive `creatable` / `editable` from one field table

**Goal:** Make the drift that caused this plan structurally impossible to repeat.
**Files:** `src/lib/assistant/entities.ts` (block config `:93-195`)
**Approach:** Replace the two hand-written `FieldSpec[]` arrays with a single table whose
entries carry the `FieldSpec` plus a mode flag (`both` | `create-only` | `update-only`),
and derive `creatable` and `editable` from it. Any field defaulting to `both` means the
default outcome is symmetry. Where an asymmetry is genuinely correct, it now has to be
declared, which is a comment the next reader can evaluate.
**Tests:** Extend `test/assistant-entities.test.ts` with an assertion that for every
registered entity exposing both lists, any field appearing in exactly one is explicitly
flagged — a guard against silent re-drift.
**Depends on:** none
**Patterns to follow:** `src/lib/assistant/fields.ts:9-17` for the `FieldSpec` shape
**Verification:** `npx vitest run test/assistant-entities.test.ts`; the derived arrays must
be a superset of today's for both paths.

**Build note (Unit 2, 2026-07-20):**

- **Applied to all 8 writable entities, not the block alone.** The unit's stated goal is to make
  the drift structurally impossible; a guard covering one entity does not do that. Auditing the
  registry also found **Vessel carries the identical shape** — `blendName`, `oakOrigin`,
  `cooperage`, `toastLevel`, `cooperageYear` are update-only for no recorded reason, so you cannot
  set a barrel's cooperage when you add it. Left unchanged here (this unit is a pure refactor) and
  logged in `TODOS.md`.
- **The compiler enforces it, not the test.** `EntityField` is a union where `why` is mandatory
  whenever `mode` is set, so a silent one-sided field does not typecheck. The test is the second
  net, catching the one thing types cannot: spreading `withFields()` and then hand-overriding
  `creatable`/`editable`.
- **Existing asymmetries are labelled honestly rather than blessed.** Deliberate ones (parent FK on
  create, `isActive` on update) carry a real rationale; ones nobody ever decided are marked
  `UNDECIDED_DRIFT` so the next reader can tell the difference.
- **Behavior-preservation is proven, not asserted:** a golden table locks all 8 entities' derived
  lists to their pre-refactor values and passed unmodified on the first run.
- **The guard was verified by sabotage.** Hand-overriding `editable` after the spread fails 3
  assertions; injecting an undeclared one-sided field fails 2; both go green on restore. (Twice now
  on this project a detector has been trusted without being seen to fail — not repeating that.)
- Gates: tsc 0, eslint 0 errors/0 warnings, vitest **2778 passed** on a clean checkout of this
  branch — exactly the Unit 1 baseline of **2761** plus the 17 tests added here.
  (First measured 2756/2739 in the shared main checkout; both numbers were polluted by a parallel
  session's uncommitted work. The delta was right, the absolutes were not. Re-measured clean.)
- ⚠️ Unit 3 will change the `VineyardBlock` rows in the golden (variety → both, planting fields →
  both). Update those rows and only those.

### Unit 3: Block symmetry — variety on update, planting fields on create

**Goal:** Close gap 2. `variety` becomes editable; `numRows`, `clone`, `rootstock`,
`irrigated` become creatable.
**Files:** `src/lib/assistant/entities.ts`; `test/assistant-entities.test.ts`
**Approach:** With Unit 2's table in place this is mostly declaration. The real work is the
update path: variety arrives as a *name* and must resolve to a `varietyId`, but `update`
receives raw `ValidatedValues` and no resolution hook exists. Extract the existing resolver
from `buildCreate:166-178` into a named helper and call it from both. Because resolution
does a DB read and can be ambiguous, it must run **before** the transaction and surface the
same `resolveOneOrChoice` picker behavior the rest of the write path uses — not throw. Add
`variety` to `current` (`:143-148`) so the before→after preview shows the variety name, not
a bare id.
**Tests:** Resolver helper: exact match, case-insensitive match, ambiguous (returns a
choice, does not throw), no match. Round-trip a create with the newly-creatable fields.
**Depends on:** Unit 2
**Patterns to follow:** `entities.ts:166-178`; `resolveOneOrChoice` usage in
`tools/db-update.ts:53-63`
**Verification:** `npx vitest run test/assistant-entities.test.ts test/assistant-choice.test.ts`

### Unit 4: Row and vine spacing, both paths

**Goal:** Close gap 3 — the correctness hazard.
**Files:** `src/lib/assistant/entities.ts`; `test/assistant-entities.test.ts`
**Approach:** Add spacing to the Unit 2 table as `both`. Values arrive in the unit the user
spoke ("8 foot rows"), so declare an explicit unit alongside rather than guessing: a
`spacingUnit` enum `FieldSpec` (`enumValues: ["imperial","metric"]`) defaulting to
imperial. Conversion goes in `buildCreate` (create) and in the entity's `update` impl
(update), both delegating to Unit 1's coercion. `current` should render spacing back in the
tenant's display unit so the preview is legible, not raw meters.
**Tests:** Create and update with imperial input persist correct canonical meters. Metric
input passes through. Zero and negative reject with a field-named error. A block whose
`vineCount` changes and whose spacing is then corrected produces the acreage the UI would
compute for the same inputs.
**Depends on:** Units 1, 2
**Verification:** `npx vitest run test/assistant-entities.test.ts test/vineyard-field-coercion.test.ts`

### Unit 5: `Vineyard.abbreviation`

**Goal:** Close gap 4 — stop the assistant creating lot-code-broken vineyards.
**Files:** `src/lib/assistant/entities.ts` (vineyard config `:199-232`);
`test/assistant-entities.test.ts`
**Approach:** Add `abbreviation` as `both`, validated by Unit 1's normalizer (2-4 chars,
alphanumeric, uppercased). Because it is a lot-code token, extend the vineyard's existing
`findConflict` (`:229-231`) to also reject a case-insensitive abbreviation collision — the
existing guard only checks `name`, so two vineyards could still collide on the token that
actually appears in lot codes. Note this is a pre-existing hole this unit closes as a side
effect.
**Tests:** Create with a duplicate abbreviation in differing case is refused with a
conflict label. Format violations reject. Update to an abbreviation held by another
vineyard is refused.
**Depends on:** Units 1, 2
**Patterns to follow:** `nameConflict` factory at `entities.ts:80-89`
**Verification:** `npx vitest run test/assistant-db-create-dedup.test.ts test/assistant-entities.test.ts`

### Unit 6: `VineyardDetail` flattened onto the Vineyard entity (GPS, soil, manager)

**Goal:** Close the largest gap — the assistant gains GPS and site metadata.
**Files:** `src/lib/assistant/entities.ts`; `src/lib/assistant/tools/db-update.ts` (audit
override only); `test/assistant-vineyard-detail.test.ts`
**Approach:** This is the unit with genuinely new mechanics — no existing entity config
performs a nested write, so treat it carefully.
- `editable`: add `gpsLat`, `gpsLng`, `elevationM` (accepting feet per Unit 1), `soilType`,
  `manager`, `defaultUnit` (enum).
- `current`: switch to an `include` of the detail relation and flatten. **It must return a
  well-formed record when no detail row exists** — every detail field simply absent —
  rather than throwing or short-circuiting the whole preview.
- `update`: split incoming values into Vineyard columns and detail columns; issue
  `tx.vineyardDetail.upsert({ where: { vineyardId }, create: {...}, update: {...} })`,
  mirroring `actions.ts:184-188`. Skip the upsert entirely when no detail field changed, so
  a plain rename does not conjure an empty detail row.
- **Decimal handling:** `gpsLat`/`gpsLng`/`elevationM` are `Decimal?`. `actions.ts:191-193`
  explicitly `.toString()`s them before diffing, which indicates `diff` wants primitives.
  Normalize before both the preview `fmt` and the audit `diff`, or the before→after card
  will render Decimal objects and the audit diff may report spurious changes.
- **Audit (Decision C):** add an optional per-entity audit-split so detail-field changes are
  logged with `entityType: "VineyardDetail"`, matching `actions.ts:210`. Keep it narrow —
  an optional hook on `EntityConfig`, not a rewrite of `db-update.ts:101`.
**Tests:** Update GPS on a vineyard with **no** existing detail row creates one. Update on
an existing row modifies it. A name-only update writes no detail row. Decimals render as
plain numbers in the preview. Latitude 91 rejects. Audit rows carry the right `entityType`
per field group.
**Depends on:** Units 1, 2
**Patterns to follow:** `src/lib/vineyard/actions.ts:167-221`
**Verification:** `npx vitest run test/assistant-vineyard-detail.test.ts test/assistant-confirm.test.ts`

### Unit 7: Eval coverage, registers, and generated docs

**Goal:** Prove the new capability is actually reachable by the model, and leave every
register green.
**Files:** `test/evals/assistant-must-propose.golden.ts`;
`docs/architecture/parity/*.md` (new/updated notes);
`docs/architecture/assistant-coverage.md` (regenerated)
**Approach:** Add `MUST_PROPOSE` cases that assert *tool selection and arg keys only* — the
harness cannot observe outcomes (`eval.test.ts:88-91`). Proposed cases:
- `vineyard-gps-update` — "set the GPS for Estate Vineyard to 38.29, -122.45" → `db_update`,
  `readyRequires: ["entity","values"]`. Stub `db_find` so the vineyard reads as existing.
- `block-spacing-update` — "change the vine spacing on Block 3 to 5 feet" → `db_update`.
- `block-variety-fix` — "Block 3 is actually Merlot, not Cabernet" → `db_update`. This is
  the phrasing most likely to be answered in prose, so it is the case worth having.
Every case **must** carry a `fixture` stubbing its reads, or `DEFAULT_EMPTY_RESULT` tells
the model the record does not exist and the case fails for the wrong reason. Record each
case's pre-change `baseline` before writing the fix, so the PR can state a real
before→after rather than asserting improvement.
Then: add parity notes for the newly covered capabilities with `status: covered` and real
`evidence` paths, and a `deliberately-omitted` note for block polygon/color so the
out-of-scope decision is documented rather than lost. Regenerate the coverage doc.
**Tests:** The structural (non-LLM) half of the eval must pass with no API key: every
`readyRequires` key must exist in `db_update`'s `inputSchema.properties`
(`eval.test.ts:215-254`).
**Depends on:** Units 3, 4, 5, 6
**Verification:** `npm run verify:parity`, `npm run verify:ai-native` (then `-- --write` and
commit if the coverage doc is stale), `npm run verify:invariants`,
`ASSISTANT_EVAL=1 npm run eval:assistant-must-propose`

## Test Strategy

**Unit tests:** vitest, flat in `test/`, named `assistant-*.test.ts` / `vineyard-*.test.ts`,
importing source through the `@/` alias — matching the 35 existing assistant tests. Target
the pure layer (coercion, resolvers, entity config shape). This repo has **no jsdom/RTL**,
so assistant UI is out of reach for automated tests by construction.

**Eval:** `MUST_PROPOSE` golden cases, selection-and-args only. Run at
`ASSISTANT_EVAL_RUNS=10` for the new cases so the reported rate is meaningful; a 5-run pass
on a stochastic model is noise.

**Measure before and after.** Record each new case's failure rate *before* the entity
changes land. #387 is the cautionary tale here: the tool-description prepends measured
1/6 and looked like a fix until they were measured. Do not report a fix that has not been
measured on both sides.

**Manual verification:** in the Demo Winery sandbox only, per the QA convention. Create a
`QA-`-prefixed vineyard via the assistant, set its GPS and abbreviation, then confirm
persistence with a short `runAsTenant("org_demo_winery", ...)` script that reads the rows
back. The browser proves the UI; the script proves the DB. Clean up the `QA-` fixtures and
keep `verify:naming` green before and after.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1. `toCanonicalSpacing` silently maps `0` and negatives to `null`** via `pos()` (`units.ts:18-23`), while `FieldSpec{min: 0}` would accept `0`. The two layers disagree about what zero means, so "set spacing to 0" would silently clear the field. | HIGH | MED | Unit 1 owns this: validate `> 0` in the coercion module and reject with a field-named error before `toCanonicalSpacing` is ever reached. Explicit test. |
| **R2. Nested detail write is new ground** — no entity config has ever done an upsert inside `update`. Unknown interactions with the confirm-card re-load and audit diff. | MED | MED | Unit 6 is deliberately last among the feature units and separately tested. The `current`-with-no-detail-row case is the one most likely to be missed; it has an explicit test. |
| ~~**R3. Eval cases measured against the old prompt rule 44**~~ — **RESOLVED 2026-07-20.** #387 merged as `de889cc1`; `origin/main` verified to carry the rewritten rule 44 and the `delete-ambiguous-block` case. Branch off main. | — | — | No longer applicable. Retained for the record. |
| **R4. Prompt "rules" are identified by line number** (`prompt.ts`), so inserting a bullet renumbers every rule below it. | LOW | MED | This plan adds no prompt rules. If Unit 7's measurements show a rule *is* needed, append at the end rather than inserting, and note the fragility of the convention. |
| **R5. `assistant-coverage.md` is generated**; a stale copy fails `verify:ai-native` in check mode. | MED | LOW | Unit 7 regenerates with `-- --write` and commits. |
| **R6. Refactoring `parseBlockForm` regresses the UI** — it is the live vineyard editor. | LOW | HIGH | Unit 1 is characterization-first: capture current outputs, refactor, prove identical. Browser-QA the block editor in Demo Winery before merge. |
| **R7. Decimal values leak into the preview card or audit diff** as objects rather than numbers. | MED | LOW | Normalize in Unit 6 before both `fmt` and `diff`; `actions.ts:191-193` shows the existing treatment. |

## Open Questions

1. **`defaultUnit` on `VineyardDetail`** — is this a per-vineyard display preference, and
   should the assistant be able to change it at all? Changing it silently reinterprets every
   spacing number a user reads afterward. Defaulting to including it, but it is the one
   detail field with a plausible argument for read-only.
2. **Should elevation accept below sea level?** (raised during Unit 1) The /reference form has
   always enforced `min: 0` on elevation. Unit 1 inherited that verbatim into the shared
   coercer so both write paths agree — but it refuses real sub-sea-level vineyard sites
   (Death Valley ~-60 m, the Dead Sea region ~-400 m). Changing it is a one-line product
   decision in `field-coercion.ts` that now applies to both paths at once. Not changed
   unilaterally inside a refactor.
3. **NAMING-2 status mismatch** — the note's frontmatter says `status: guarded`, while
   `INVARIANTS.md:79` and `:94` say `planned` with `verify:naming` landing in Phase 1. Not
   this plan's problem and not blocking, but it means the register and the narrative
   disagree. Worth a separate chip.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Gaps established by direct audit with file:line, not inference. |
| Scope Boundaries | HIGH | Subblock and polygon exclusions have stated reasons. |
| Implementation Units | MEDIUM | Units 1-5 are well-trodden. **Unit 6 is the soft spot**: nested upsert inside an entity `update` has zero precedent in this layer, and the `current`-flattening + Decimal + audit-split interactions are reasoned-about rather than observed. Expect Unit 6 to be where surprises land. |
| Test Strategy | HIGH | Eval constraints verified from the harness source, not assumed. |
| Risk Assessment | MEDIUM | R2 is the honest unknown. R1 was found by reading `pos()`, which suggests other similar silent-null paths may exist that this pass did not look for. |

**What would raise Unit 6 to HIGH:** spiking the `current` + `update` pair against Demo
Winery on a vineyard with no detail row, before writing the rest of the unit. That is ~15
minutes and would convert the main unknown into an observation. Recommended as the first
action of Unit 6.

## Build notes — Units 3-7 (2026-07-20)

**A shape the plan did not anticipate.** `update` runs *inside* the transaction, so it cannot resolve
a name that turns out to be ambiguous — it has nowhere to ask. Unit 3 therefore added `buildUpdate`,
the pre-transaction mirror of `buildCreate`, returning either augmented values or a `ChoiceRequest`
that `db_update` surfaces as a clickable picker. Units 4, 5 and 6 all then needed the same hook
(spacing conversion, abbreviation collision, elevation conversion), which is good evidence it was the
right seam rather than a one-off. It also grew a third argument, the row id, once Unit 4 needed to
know which vineyard's display unit to render in.

**Resolved FK ids are plumbing.** `internalUpdateKeys` keeps `varietyId` / `rowSpacingM` /
`vineSpacingM` / `elevationM` off the confirm card while they still ride in the values for the audit
diff. Nobody should be asked to approve "varietyId: cmxyz…".

**Two bugs found by building, not by reading:**

1. `spacingToCanonicalM` rejected NEGATIVE spacing with "must be at least 0" — `optFloat`'s `min: 0`
   fired before the `<= 0` check. That message tells the user zero is acceptable, and it is not. Unit
   1's own test asserted only `/Row spacing/`, a loose match that passed with the wrong wording. Fixed
   at the source; the test now asserts the exact message.
2. `db-update.ts` carried a dead `prisma` import — the file's only lint warning.

**Unit 5 closed a pre-existing hole**, as the plan predicted: the vineyard's `findConflict` only ever
checked `name`, so two vineyards could collide on the *abbreviation* — the token that appears in lot
codes — making every code carrying that prefix ambiguous. Now guarded on create AND update.

**Unit 6 stopped deliberately short of symmetry.** The detail fields are update-only, with
`DETAIL_UPDATE_ONLY` stating why: the upsert mirrors proven code (`actions.ts:153`), but a nested
`detail: { create }` inside the vineyard create has no precedent, and `VineyardDetail.tenantId`
defaults to `""` — if the tenant extension does not reach a nested create, the row lands RLS-invisible
rather than erroring. A silently orphaned row on a governed table is worse than a missing feature.
The ~15-minute spike that settles it is in `TODOS.md`.

**Unit 7's parity notes were not written, on purpose.** The register is 997 notes keyed to InnoVint's
published docs, and *none* mentions GPS, spacing, or soil — those capabilities are not in the
incumbent's documentation. Hand-authoring InnoVint-evidenced notes for them would be fabricating
evidence. `verify:parity` is green, and the coverage doc regenerated to no change, correctly: this
plan added FIELDS to entities that `db_update`/`db_create` already covered, not new cores or tools.

**Every guard was sabotage-checked**, not assumed — U2's drift guard (3 and 2 failures), U3's picker
wiring (2 of 3), U6's partial-write and no-empty-row rules (4 and 1). All green on restore. An early
`perl`-based sabotage silently no-op'd and made the tests look falsely robust, which is itself the
argument for doing this.

## Success Criteria

- [~] Assistant can set GPS, elevation, soil, manager on a vineyard **with no existing
      detail row** — built and unit-proven (the upsert's `create` branch is asserted directly),
      but **NOT yet verified in the DB by a `runAsTenant` read-back**. Needs `.env`. See Residual.
- [x] Assistant can correct a block's variety after creation — Unit 3, with a picker on ambiguity
- [x] Assistant can set row and vine spacing on both create and update — Unit 4. The acreage
      equivalence is by construction (both paths call Unit 1's `spacingToCanonicalM`, the same
      function `parseBlockForm` uses), not by a separate computed-acreage assertion.
- [x] Assistant-created vineyards carry a valid `abbreviation` and cannot collide
      case-insensitively — Unit 5, on **both** paths (findConflict only covers create)
- [x] `creatable`/`editable` derive from one table; a test fails if a field silently
      appears in only one — **done (Unit 2), for all 8 writable entities, not just the block**
- [~] New `MUST_PROPOSE` cases added (3) and structurally validated against `db_update`'s real
      schema. **The ≥90%-over-10-runs LLM half has NOT been run** — it needs an API key and costs
      real tokens. **No pre-change baseline exists for these three, and cannot:** before this plan
      `db_update` rejected the field names outright, so the rate was 0 by construction rather than
      by model behavior. Recorded in the golden's own comment rather than left implied.
- [x] `verify:parity` (997 notes), `verify:ai-native`, `verify:invariants` (36/36) green.
      `verify:naming` needs `.env` and cannot run in a worktree — deferred to CI.
- [x] Full `vitest run` green — **2825 passed**, no regressions
- [ ] Block editor browser-QA'd in Demo Winery (Unit 1 refactors its parser) — needs the
      interactive logged-in pane
