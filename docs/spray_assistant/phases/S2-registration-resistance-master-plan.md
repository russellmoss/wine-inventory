---
title: S2 — US pesticide registration and resistance-group master
type: feat
phase: S2
wave: 1
lane: B
status: council-reconciled
date: 2026-07-26
branch: claude/s2-spray-intelligence-pesticide-9a83f3
depth: deep
units: 12
absorbs: docs/plans/2026-07-20-086-feat-us-pesticide-registration-plan.md (Units 1–7, 9, 11)
council: S2-council-feedback.md
---

# S2 — Registration and resistance master

**Read first, in this order:** [plan 086](../../plans/2026-07-20-086-feat-us-pesticide-registration-plan.md)
in full · [runbook](../SPRAY_ASSISTANT_RUNBOOK.md) §3, §9 "S2", §10 ·
[data-sources design](../spray-data-sources-design.md) §3, §6 ·
[discovery brief](../spray-decision-discovery-brief.md) §3, §14, §17.1 ·
[runbook council feedback](../RUNBOOK-council-feedback.md) P1 and S9 ·
**[this plan's council feedback](S2-council-feedback.md)** — every finding and its adjudication.

This plan **absorbs plan 086**. Its Key Decisions, its measured Unit-4 de-risk, and its Risks table
carry over verbatim and are **not re-derived here**. What this document adds is (a) the current-repo
research plan 086 could not have (it predates the runbook's council review and plans 085/096),
(b) the standing rules that changed since, and (c) the PR slicing that keeps this lane from colliding
with three sibling lanes.

**Council-reconciled 2026-07-26.** Three safety bugs were folded in — bearing/non-bearing site
modifiers, jurisdiction-is-required, and the premix GAP rollup. Each is marked ⚑ where it lands.
Nothing was rejected outright; three *proposed fixes* were replaced while their problems were
accepted (see the council record).

**Not in scope, deliberately:** plan 086's **Unit 8** (assistant tool) defers to **S11** so the
program ships one composite tool, not two (runbook §3.15, §5). Plan 086's **Unit 10** (spray record)
is **S3a**, a sibling lane running in parallel right now. **S2b** (product facts master — PHI, REI,
rainfast, mobility class, product versioning, the non-US manual path) is this lane's *second* PR and
is planned separately; S2 leaves it schema room and nothing more.

---

## Problem frame

A grower planning a spray needs two exact answers before any agronomy happens: *is this product
legally registered on grapes in my state*, and *what mode of action is it, so does my program
actually rotate*. Cellarhand can answer neither. There is no pesticide table, no product identity,
no resistance code — `src/lib/pesticide/` does not exist and neither does any adjacent directory.

The load-bearing decision, carried from plan 086 and re-affirmed by the data-sources design §4.2:
**this is structured data queried by exact match, not prose queried by similarity.** It lives in
relational tables. The corpus answers *"why is powdery pressure high this week"*; the relational
layer answers *"can I legally apply this."*

**What makes S2 dangerous rather than merely useful.** A registration table that is quietly
incomplete is worse than no table: a grower reads a missing resistance code as "no restriction" and
believes they are rotating when they are not. That is the program's most dangerous failure mode
(runbook §3.6, brief §3.1), and it is why the coverage report is a MUST rather than a nicety.

The council sharpened this into a general principle worth stating once, because it governs six of the
decisions below: **this phase fails open or it fails closed, and every edge of the model is a place it
can fail open.** The tri-state enum, the `siteType` split, the DB CHECK on derivation provenance, the
jurisdiction argument, the premix rollup, and the exact-match rule are all the same idea applied at
six different seams. What review found was not a flaw in the idea — it was three seams the first draft
had not applied it to.

**Pressure test.** Is this the right problem? Yes, and the runbook's council review sharpened why:
S7a (legality + rotation) is the first phase that delivers grower-visible value, needs no weather
modeling at all, and cannot start without S2 and S2b. This is the critical path to the Wave-2
milestone. The alternative framing — buy structured label data and skip the derivation — stays a
documented upgrade path (data-sources §5), not a v1 dependency.

---

## Scope

**In:** plan 086's Units 1–3 (APPRIL parse → schema → idempotent ingest), 4 (AI→resistance-code
derivation **with** the coverage report), 5 (CA DPR state layer), 6 (county/SLN restriction flags),
7 (`epa-pesticide` KnowledgeSource row for the toggle + citation plumbing only,
`defaultEnabled: false`), 9 (monthly refresh wiring), 11 (`verify:pesticide`).

**Added by this plan** — standing rules that changed after plan 086 was written, plus the council folds:

| Addition | Why | Source |
|---|---|---|
| Entitlement in the **service layer**, not the tool | S9/S10 are server components and would bypass a tool-level check; S2's tool does not exist until S11 | runbook §3.10, council C7 |
| A composite `factsAsOf` every read returns | S3a is building the facts-as-of snapshot **in parallel right now**; a single scalar revision id is a false contract because one lookup spans four sources on different cadences | rule §3.8; S2 council C1 |
| `parseRegistrationNumber` — exact-match only, with `malformed`, `unsupported-format`, and `not-found` all distinct | a malformed reg number must never fuzzy-match; an adjuvant must not be *called* malformed | runbook council S9; S2 council C6, G4 |
| Tri-state `ResistanceResolution` + CHECK constraints, **and a most-conservative product rollup** ⚑ | makes "gap is not a clearance" a schema property — at the AI level *and* at the premix level | runbook §3.6; S2 council G3 |
| ⚑ **`siteModifier`** (bearing / non-bearing) on every site registration | a non-bearing-only herbicide on bearing vines makes the crop unsellable; brief §3 names it a hard stop and plan 086 dropped it | brief §3; S2 council G1 |
| ⚑ **Jurisdiction is a required argument**; federal registration alone is never a clearance | states restrict federally-registered products, and S2 ships only the CA layer | S2 council G2 |
| Mark-and-sweep + revision publish states | upsert-only leaves a de-registered product answering "registered" forever | S2 council C2, C8 |
| Curated `ai-normalization.json` and `trade-name-map.json` | salts/esters/copper variants would swamp `GAP` with false gaps; extension sources key on trade names and nothing mapped them to reg numbers | S2 council G5, G6 |
| Monthly **re-derivation** + a coverage **delta** | the accepted-risk mitigation for having no vendor update SLA | runbook §3.17, §10, council P1 |
| Two invariant notes + `verify:` guards | runbook §11 names *"a coverage gap never renders as no-restriction"* as invariant candidate #1 | runbook §11 |

**Out, and where it went:** assistant tool → S11. Spray record → S3a. PHI/REI/rainfast/mobility class,
**product versioning**, and the tenant manual-override path → **S2b** (do not build the override here;
S2b builds the mechanism once and it serves both the US unrecognized-product case and Bhutan). Label
rate/PHI extraction from PDFs → Later. NY/OR/WA state layers → Later — **but see G2: deferring them
costs us the right to say "registered" outside CA, and that is now enforced rather than assumed.**
Ingesting non-EPA (CA-state-only) products → S2b; S2 only leaves the schema room. Any coverage-gap
*visual* treatment → **S9** owns the risk visual vocabulary; S2 must not invent a fifth colour.

**Lane boundary.** This lane owns `src/lib/pesticide/`, `scripts/ingest-appril.ts`,
`scripts/ingest-cdpr.ts`, `scripts/derive-resistance-codes.ts`, `scripts/verify-pesticide.ts`, and
one entry in `src/lib/knowledge/config.ts`. It does **not** touch `src/lib/spray/`,
`src/lib/fieldnotes/`, or `src/lib/weather/`.

---

## Research summary (current repo, 2026-07-26)

Plan 086's endpoint probing stands. What follows is what changed in the codebase since, and it
changes three of plan 086's unit designs.

### Shared-file collisions, verified rather than assumed

| File | S2 touches? | Handling |
|---|---|---|
| `prisma/schema.prisma` + migrations | **yes** | **Schema-slice PR first**, alone, serialized against sibling lanes |
| `src/lib/tenant/models.ts` (`GLOBAL_MODELS`) | **yes** | one line per model; part of the schema slice |
| `scripts/verify-tenant-isolation.ts:28` | **yes** | a **deliberate inlined duplicate**; update in the same commit or `verify:tenant-isolation` reds |
| `test/tenant-context.test.ts` | **yes — third sync point** | hard-codes the expected global set. **Verify the exact file and line at `/work` time** — this came from the council reviewer's read, not our research pass |
| `src/lib/knowledge/config.ts` | **yes** | one `KNOWLEDGE_SOURCES` entry **+ a `TRUSTED_DOMAINS` entry** — host gate and path gate are separate (`config.ts:117-119`) |
| `.github/workflows/knowledge-recrawl.yml` | **yes** | one additive step + one heredoc block |
| `package.json` | **yes** | one `verify:pesticide` script, one devDependency |
| `docs/architecture/assistant-coverage.md` | **no** — see K1 | removes one shared-file collision entirely |
| `src/lib/spray/contributors.ts` | **no** | S2 creates no contributor module |
| `test/evals/assistant-*.golden.ts` | **no** | no tool ships in S2 |

### Three findings that change plan 086's unit designs

**1. There is no spreadsheet library in the repo.** No `xlsx`, `exceljs`, `node-xlsx`, `papaparse`,
or any CSV parser in `package.json`. The only CSV code is a private ~30-line function at
`src/lib/migration/generic-fixture.ts:16`. Nothing parses fixed-width anywhere. So Units 3 and 6 both
start with a dependency decision, and the 98 MB / 366,579-row stream is a genuine implementation risk.

**2. `fetchDocument` is the wrong tool for a 98 MB bulk file.** `src/lib/knowledge/crawl/fetcher.ts:102`
caps at `MAX_BYTES = 15 MB` (`:56`) with an `opts.maxBytes` override (`:108-110`) — but it *buffers*
via `readCapped` (`:78-92`) and is shaped for documents entering the corpus. The bulk files need
their own streaming path. What to reuse: the host gate, `src/lib/knowledge/crawl/ssrf.ts`, the
`tls.ts` root-certificate handling (data-sources §6 — *always spread `tls.rootCertificates`; undici's
`connect.ca` replaces the default store*), and `statusMeansRemoved` for the 404-is-a-coverage-signal-
never-a-retry rule (plan 096 lesson).

**3. `verify:ai-native` fires on filename, with no path restriction.** `scripts/verify-ai-native.mjs:129`
matches `*-core.ts` anywhere under `src/`, plus at least one exported symbol ending in `Core`
(`:101-115`), then BFS's the import graph from `src/lib/assistant/tools/` and `registry.ts`. A
`src/lib/pesticide/registration-core.ts` exporting `lookupRegistrationCore` would fail CI on merge,
because S2 ships no tool. `GAP_ALLOWLIST` is capped at `MAX_ALLOWED = 2` and may only shrink — the
runbook (§5) explicitly forbids parking a soon-to-be-covered core there.

### Conventions to follow verbatim

- **Global-table migration header:** `prisma/migrations/20260718140000_knowledge_base_schema/migration.sql:1-6`
  (declares GLOBAL / no `tenantId` / no RLS / hand-written / app_rls DML auto-granted by the
  `ALTER DEFAULT PRIVILEGES` from `20260701000900_app_rls_role`). The paired `..._knowledge_base_rls`
  migration documents *why* no policy — S2 writes the same pair of headers. **Do not** use the
  `AGENTS.md:52-73` Phase-12 tenant checklist; S2's tables are the deliberate opposite case.
- **Migration creation on this box:** hand-authored SQL via
  `npx prisma migrate diff --from-url "$DATABASE_URL_UNPOOLED" --to-schema-datamodel ./prisma/schema.prisma --script | grep -v 'search_vector'`
  → `npx prisma migrate deploy`. Never interactive `migrate dev`. Stop the dev server before
  `prisma generate` (EPERM on the query-engine DLL). Confirm a no-op `migrate diff` afterwards.
  **Prisma cannot express partial unique indexes or CHECK constraints** — both are hand-added to the
  generated SQL, which is one more reason this repo hand-authors migrations.
- **Script ergonomics** (`scripts/crawl-ets.ts`, `scripts/recrawl-knowledge.ts`): `--dry-run` via
  `process.argv.includes`, every DB touch inside `runAsSystem`, `await disconnectSystem()` on both
  paths, the shared fatal handler, a flat counter object printed as `done: {json}`, and
  **`process.exitCode = 1` rather than `process.exit()`** after printing a marker so `tee`'d stdout
  is not truncated (`recrawl-knowledge.ts:208-211`). **Never a bare `catch {}`** — always log a
  truncated message (`:70-72`: an opaque error count once hid a filter regression).
- **Stdout summary marker:** the repo's one existing marker is `::KB_RECRAWL_SUMMARY::` +
  `JSON.stringify(obj)` on one line (`recrawl-knowledge.ts:192`), consumed by
  `knowledge-recrawl.yml:73`. S2 follows the same shape.
- **`verify:*` shape:** `scripts/verify-knowledge-base.ts` — docblock header with invocation forms,
  an `assert(cond, name, detail)` helper with `passed`/`failed` tallies (`:48-54`), a summary line,
  `disconnectSystem()`, then `if (failed > 0) process.exit(1)` (`:235-241`). The **typed case table
  lives in a separate importable module** (`scripts/kb-eval-cases.ts:1-10` — the verify script runs
  `main()` at import and therefore cannot be imported from).
- **Adding a knowledge source is a 3-step edit:** `KNOWLEDGE_SOURCES` entry + `TRUSTED_DOMAINS`
  entry + re-run `npm run seed:knowledge-sources`. `autoCrawl`, `sitemapUrls`, `sectionFilter` are
  config-only and never persisted (`scripts/seed-knowledge-sources.ts:16-25`), so **no migration**.
- **`crawlCadence` is documentation only** — nothing reads it to schedule anything
  (`config.ts:152-154`). Monthly refresh comes from `autoCrawl` defaulting true, and `autoCrawl:false`
  *excludes* a source from the monthly workflow. That is exactly why Unit 10 adds its own workflow
  step rather than riding the source's cadence.

---

## Key decisions

Plan 086's Key Decisions table carries over **verbatim and unchanged**. The decisions below are the
ones plan 086 did not make, or could not have made. K11–K14 are council folds.

| # | Decision | Choice | Alternatives | Rationale |
|---|---|---|---|---|
| K1 | Module naming under `src/lib/pesticide/` | **No `-core.ts` suffix.** `appril-parse.ts`, `cdpr-parse.ts`, `reg-number.ts`, `restrictions.ts`, `resistance-derive.ts`, `lookup.ts` | `*-core.ts` + an `INTERNAL` allowlist entry | S2 ships **no user-facing capability** — the capability is S7a's legality engine and S11's tool. Registering a core no tool can reach for three waves is a false coverage signal, and `GAP_ALLOWLIST` is capped at 2 and may only shrink. When S7a lands `legality-core.ts` importing `lookup.ts`, the BFS reaches these transitively and nothing needs renaming. Matches `src/lib/knowledge/`, which has zero `-core.ts` files. |
| K2 | Where resolution status lives | A **required tri-state enum** `ResistanceResolution { CODED, NO_CODE_EXISTS, GAP }` with a CHECK tying `code IS NOT NULL` ⟺ `CODED` | nullable `code`, absence means unknown | A nullable column makes "we don't know" and "there is no code" the same value, and *that* is the failure the phase exists to prevent. Made a schema property so no consumer can get it wrong. |
| K3 | `siteType` | A separate required column `ResistanceSiteType { SINGLE, MULTI, UNKNOWN }`, independent of `code` | one field carrying either the code or `N/A` | **Plan 086's measured constraint 1, verbatim.** Cornell marks captan/copper `N/A` (*not a rotation partner*); UC IPM gives `M 04`/`M 01` (*the taxonomic code*). Both are right — different questions. One field forces a wrong answer to one, and rotation is the one that produces bad advice. With both, captan is `code: "M 04", siteType: MULTI` and S7a's rotation engine keys off `siteType`, not code presence. |
| K4 | Product-level code derivation | A required `derivedFrom` provenance enum, **plus a DB CHECK: `subjectKind = 'PRODUCT'` forbids `derivedFrom = 'AI_KEYED_TABLE'`** | a comment and a unit test | **Plan 086's measured constraint 2, verbatim.** An AI-keyed source lists trade names as *products containing this AI*, not *products whose code is this*. `Switch` appears under `cyprodinil (9)` but Switch is **9/12**; a naive join silently drops group 12 — an under-count of a mode of action, the dangerous direction. As a CHECK, the naive join **cannot be inserted**. |
| K5 | Biologicals — **the decision plan 086 deferred** | **Strain-suffix normalization within an explicitly cited species is allowed; genus generalization is not.** `Bacillus subtilis strain AFS032321` collapses onto a cited `Bacillus subtilis` row. `Bacillus mycoides` and `Cerevisane` get no inferred code and land in `GAP`. | (a) rules that generalize by genus; (b) mark all biologicals `GAP` | Strain-suffix collapse is *naming normalization* over one cited organism. Genus generalization is *inference* — the same silent mis-count K4 forbids, in the other direction. Plan 086 measured that 4 of 6 misses were biologicals and that this is where the paid guide's value concentrates; leaving them visibly in `GAP` turns that into a purchasing decision with a number attached instead of a hidden hole. |
| K6 | Registration-number resolution | A pure `parseRegistrationNumber` returning a discriminated union with a `format` tag, then **exact match on the canonical string only** | `findFirst` with `contains` / case-insensitive / trigram similarity | A malformed reg number must never fuzzy-match — a near-miss that resolves confidently to the wrong product produces a confidently wrong legality answer. Enforced by a source-scan guard, not by discipline. |
| K7 | Entitlement boundary | `src/lib/pesticide/lookup.ts` is the **only** module in the lane importing `@/lib/prisma`, and every exported read checks the `epa-pesticide` subscription first, failing closed | check it in the S11 tool (plan 086's original choice) | **Runbook §3.10 / council C7.** The data is tenant-global with no RLS, and S9/S10 are server components that would bypass a tool-level check. One choke point is mechanically testable. |
| K8 | Facts revision | A **composite `factsAsOf`** — `{ publishedRevisionId, apprilAsOf, cdprAsOf, resistanceArtifactSha256 }` — on every read, backed by `PesticideDataRevision` with `RUNNING / FAILED / PUBLISHED` states | (a) a single scalar `revisionId`; (b) full bitemporal `valid_from`/`valid_to` on every table | **S2 council C1.** A scalar is a *false* contract: one lookup spans four sources on different cadences. Full bitemporal versioning is over-build for S2 and solves a problem S3a does not have — S3a snapshots resolved **values**, not a pointer into history. The composite is the honest middle. **Coordinate the exact shape with S3a before either lane lands.** |
| K9 | xlsx reader | `exceljs` streaming `WorkbookReader`, as a **devDependency**, used **only inside `scripts/`** | SheetJS `xlsx` (stale on npm, CVE history); hand-rolled zip + SAX | Streaming is non-negotiable at 98 MB / 366k rows. devDependency + scripts-only keeps it out of the Next bundle (`scripts/` is already `.vercelignore`d, and a `scripts/*.ts` import once broke the Vercel build). **The pure parse module takes `Record<string,string>[]` and imports nothing** — which is also what makes it fixture-testable with no network. Fallback if the shared-strings table blows memory: unzip the entry and SAX-parse. Unit 3 **measures** this. |
| K10 | Curated artifact location | `src/lib/pesticide/data/*.json` — three files: `resistance-codes.json`, `ai-normalization.json`, `trade-name-map.json` | plan 086's root `data/resistance-codes.json` | No `data/` directory exists at the repo root and no precedent for one. Co-locating keeps the artifacts import-typed, travelling with the module, inside the lane's file boundary. |
| **K11** ⚑ | Bearing vs non-bearing | `PesticideSiteRegistration.siteModifier { BEARING, NON_BEARING, UNSPECIFIED }`, parsed from the APPRIL site string and carried in the lookup payload | ingest "Grapes (Non-bearing)" as plain grape registration | **Council G1.** Hundreds of herbicides and fumigants are non-bearing-only. Applying one to bearing vines is an illegal application producing illegal residues — **the harvested crop becomes unsellable**. Brief §3's hard-stop list names it and plan 086 dropped it. `UNSPECIFIED` is the honest default; it is not "both." |
| **K12** ⚑ | Jurisdiction | **Required argument** on every legality read. Federal registration alone is **never** `ok: true`. Outside CA → `state-registration-unknown` (federal fact still shown, just not as a clearance). Outside the US → `jurisdiction-unsupported` | return the federal answer and let a later phase layer state law on top | **Council G2.** FIFRA lets a state restrict a federally registered product; S2 ships only the CA layer. Without this the system **fails open on a legal question** for every non-CA tenant. This is the gap-is-not-a-clearance rule applied to jurisdiction, and it is also the honest hook for the non-US path (rule §3.9). |
| **K13** ⚑ | Product-level resistance rollup | **Most-conservative rollup**: any constituent AI in `GAP` makes the *product* `GAP`. Known partial codes travel as explicitly-labelled *partial evidence*, never as the answer | return the array of codes that did resolve | **Council G3.** A premix of a coded AI and an uncoded AI would have returned `[7]`, and a grower reading a clean group-7 rotation breeds resistance to whatever the other AI is. This violates the program's own rule that a premix counts against every group it contains. It is invariant **PEST-1**'s actual teeth. |
| **K14** | Freshness of removals | **Mark-and-sweep** inside a revision: every row carries `lastSeenRevisionId`; rows unseen in a completed run flip to `WITHDRAWN_FROM_SOURCE`, never deleted | pure upsert | **Council C2.** Upsert-only leaves a de-registered or de-listed product answering "registered" forever — in a domain where the `uc-ipm` config comment already says *"registrations get cancelled"* is why freshness is safety-relevant. Retaining the row (rather than deleting) keeps the audit trail and is what makes Unit 10's coverage delta honest. |

### The legality composition rule *(council C12 — answered here because nothing else owned it)*

**Most restrictive wins**, and each layer can only subtract:

1. **Federal site registration is necessary, never sufficient.** It also carries `siteModifier` (K11).
2. **State registration is a required conjunct.** Absent state data is `UNKNOWN`, never `NO` and
   never an implicit yes (K12).
3. **Restrictions are subtractive**, and a restriction we could not resolve is itself disqualifying.

The **only** composition yielding `ok: true` is: federally registered on grapes for this
`siteModifier` **and** state-registered in this jurisdiction **and** no unresolved restriction.
Everything else degrades to a typed not-ok result. There is no path from partial knowledge to a
clearance — which is the whole design.

---

## PR slicing

Three PRs. **The schema slice lands alone and first**, because three sibling lanes (S0, S3a, S4) are
planning schema slices in the same window and those serialize (runbook §4 shared-file map).

| PR | Contents | Gate to merge |
|---|---|---|
| **PR-1 — schema slice** | `prisma/schema.prisma` + the paired `_pesticide_schema` / `_pesticide_rls` migrations + `GLOBAL_MODELS` in **all three** sync points + the schema shape test | `tsc`, `npx vitest run`, `verify:tenant-isolation`, a no-op `migrate diff` after deploy. **No app code.** |
| **PR-2 — registration lane** | Units 2–8 — reg-number resolution, APPRIL parse + ingest, the lookup service + entitlement + jurisdiction, CDPR state layer, restriction flags, the KnowledgeSource entry | branch-local: `tsc` + unit tests + the boundary guards. Serialized from main: `verify:tenant-isolation`, `verify:kb-subscriptions` |
| **PR-3 — resistance lane** | Units 9–11 — derivation + three curated artifacts + coverage report, monthly refresh, `verify:pesticide`, the invariant notes | all of PR-2's, plus `verify:pesticide`, `verify:invariants`, `verify:ai-native` |

Then Unit 12 (QA pass + report), then `/ship`, then the phase report and the runbook ledger row.

**Two gate tiers** (runbook council S10): `tsc`, pure unit tests and the guard tests run branch-local
in the worktree. Everything DB-backed runs **from the main checkout at
`C:\Users\russe\Documents\Wine-inventory`** — worktrees have no `.env`. Run `npx prisma generate`
immediately before any `tsc` / `verify` / `dev` in any worktree.

⚠️ **Known limitation, accepted for this lane** (council C11): that last instruction is a *ritual, not
isolation* — sibling lanes can still clobber the shared generated client between `tsc` and `vitest`.
The real fix is a per-worktree generated-client output path, which is a repo-wide change outside this
lane's file boundary and would collide with all three siblings. **Raise it at the program level; do
not fix it unilaterally here.** Record it in `TODOS.md` during `/work`.

---

## Implementation units

### Unit 1: Schema slice — pesticide reference tables *(PR-1, lands alone)*

**Goal:** the relational home for registrations, ingredients, state registrations, restrictions, and
resistance assignments — with the safety contracts expressed as constraints rather than conventions.

**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_pesticide_schema/migration.sql`,
`prisma/migrations/<ts>_pesticide_rls/migration.sql`, `src/lib/tenant/models.ts`,
`scripts/verify-tenant-isolation.ts`, `test/tenant-context.test.ts`, `test/pesticide-schema.test.ts`

**Approach.** Tenant-**global** reference data — no `tenantId`, no RLS — following the `FxRate` /
`KnowledgeSource` precedent (`prisma/schema.prisma:4040-4072`). Entitlement is enforced at the
service layer (K7), and both migration headers say so explicitly, citing the precedent, so the
exemption reads as deliberate rather than as an oversight. Add every new model to `GLOBAL_MODELS` in
**all three** sync points: `src/lib/tenant/models.ts:22-39`, the deliberate inlined mirror at
`scripts/verify-tenant-isolation.ts:28`, and the hard-coded expected set in
`test/tenant-context.test.ts` *(council C5 — confirm the exact line before editing; it came from the
reviewer's read, not ours)*.

**Models.**

- `PesticideDataRevision` — `status { RUNNING, FAILED, PUBLISHED }`, `startedAt`, `completedAt`,
  `apprilAsOf`, `cdprAsOf`, `resistanceArtifactSha256`, `summary Json?`. **Reads resolve only against
  `PUBLISHED`** (council C8), so a crashed or partly-failed run never exposes mixed old/new rows under
  a misleading stamp.
- `PesticideProduct` — `epaRegNumber String?` and `caRegNumber String?`, each with a **partial unique
  index** `WHERE ... IS NOT NULL`, plus a CHECK that **at least one is present** (council G4: adjuvants
  and 25(b) minimum-risk products are federally exempt but CA-state-registered, and a NOT NULL
  `epaRegNumber` would make them permanently unrepresentable). `labelDate`, `productName`,
  `companyName`, `registrationStatus`, `labelNames[]`, `pestCategoryRaw`, `lastSeenRevisionId`.
  **S2 ingests only EPA-numbered products** — the nullable column is schema room, not scope.
- `PesticideActiveIngredient` — `pcCode` (the durable EPA key), `casNumber`, `name` (**verbatim from
  APPRIL — normalization never rewrites identity**), `normalizedName`, and
  `parentActiveIngredientId` self-relation for the salt/ester/copper collapse (council G5, K5).
- `PesticideProductIngredient` — join, carries `percent`. PK `(productId, activeIngredientId)`.
- `PesticideSiteRegistration` — `siteCodeRaw`, `siteNameRaw`, `isGrape`, and ⚑ **`siteModifier
  { BEARING, NON_BEARING, UNSPECIFIED }`** (K11).
- `PesticideStateRegistration` — `state`, `status { REGISTERED, NOT_REGISTERED, UNKNOWN }`, `siteCode`.
- `PesticideUseRestriction` — `state`, `counties[]`, `kind`, `exception`, and the **verbatim label
  sentence** for citation.
- `PesticideResistanceAssignment` — `subjectKind`, `activeIngredientId?`, `productId?`, `scheme`,
  `resolution`, `code?`, `siteType`, `derivedFrom`, `sourceUrl`, `sourceTitle`, `sourceAsOf`,
  `reviewedBy`, `reviewedAt`, `revisionId`.

Enums are all new — **`CREATE TYPE` only, no `ALTER TYPE` anywhere**, so the Windows enum rule is
satisfied trivially and there is nothing to isolate.

**Constraints and indexes** (hand-added to the generated SQL — Prisma expresses neither):

1. `resolution = 'CODED'` ⟺ `code IS NOT NULL` — K2.
2. exactly one of `activeIngredientId` / `productId` set, matching `subjectKind`.
3. `subjectKind = 'PRODUCT'` forbids `derivedFrom = 'AI_KEYED_TABLE'` — **K4, the Switch guard.**
4. `siteType` NOT NULL — K3.
5. `epaRegNumber IS NOT NULL OR caRegNumber IS NOT NULL` — G4.
6. **Partial unique indexes** on `PesticideResistanceAssignment`, one per `subjectKind`:
   `(activeIngredientId, scheme) WHERE subjectKind = 'ACTIVE_INGREDIENT'` and
   `(productId, scheme) WHERE subjectKind = 'PRODUCT'`. **Council C3: a Prisma `@@unique` over
   nullable columns does not dedupe** — Postgres treats `NULL` as distinct — and duplicate rows would
   double-count coverage and rotation.
7. Indexes for the actual read paths (council C9): `(productId, state)` on state registrations and on
   restrictions; `lastSeenRevisionId` on every swept table; `normalizedName` and
   `parentActiveIngredientId` on ingredients.

`PEST_CAT` is stored raw and nullable, and **null means unknown, not "no category"** — 317 grape rows
are blank and would vanish from any class-filtered view.

**Schema room for S2b, and nothing more.** S2b will add a per-product facts table plus a tenant-scoped
override variant. What S2 provides: the unique natural keys it can reference, `labelDate` as an
attribute, and the full `provenance` union in the result type (Unit 5). **What S2 explicitly does NOT
claim** *(council C13)*: that `labelDate` on a current-state row establishes a version key. It does
not. **S2b owns product versioning** — better to under-claim than to hand S2b a key that does not hold.

**Tests:** a schema shape test mirroring `test/commerce7-schema.test.ts` — no PII columns; every new
model present in all three `GLOBAL_MODELS` sync points; all seven constraints/indexes present in the
migration SQL.
**Depends on:** none
**Verification:** `npx prisma migrate deploy` from the main checkout; a follow-up `migrate diff` is a
no-op (after `grep -v search_vector`); `npm run verify:tenant-isolation` green.

---

### Unit 2: Registration-number resolution *(pure)*

**Goal:** a malformed reg number can never resolve to a product; an adjuvant is never *called*
malformed; and no negative result can read as a clearance.

**Files:** `src/lib/pesticide/reg-number.ts`, `test/pesticide-reg-number.test.ts`
**Approach:** a pure `parseRegistrationNumber(input)` returning a discriminated union with a **format
tag** — `{ ok: true, format: "EPA_FEDERAL" | "CA_STATE_ONLY" | "EXEMPT_25B", canonical }` or
`{ ok: false, reason: "malformed" }`. EPA canonical form is `COMPANY-PRODUCT` with an optional
`-DISTRIBUTOR` segment, digits only. Reject non-ASCII hyphens, trailing characters, missing separator,
empty segments. Trim surrounding whitespace but **never** "repair" the interior.

**The format tag is council G4's fold.** Many labels *require* an adjuvant; adjuvants are federally
exempt but CA-state-registered with alphanumeric numbers, and FIFRA 25(b) minimum-risk products
likewise lack standard EPA digits. Calling those `malformed` would be a lie, and it would make a
legally-required tank component unloggable for S3a. S2 **resolves** only `EPA_FEDERAL`; the other two
formats produce `unsupported-registration-format` at the lookup — a typed hook S2b and S3a fill.

**Council C6:** a pure parser cannot return `not-found`; that is the lookup's result, not the
parser's. Parse returns `ok | malformed`; lookup returns the rest.

**Execution note:** test-first. This unit is a safety gate and its whole value is in the rejections.
**Tests:** `100-1234` and `264-1152-2217` canonicalize as `EPA_FEDERAL`; a CA-state-only number
canonicalizes as `CA_STATE_ONLY`, **not** `malformed`; `1001234`, `100-1234x`, `100‑1234` (U+2011
non-breaking hyphen), `100-`, `-1234`, `""`, and a 200-char string all return `malformed`; a test
asserts no result variant is truthy-coercible into "permitted".
**Depends on:** none
**Verification:** unit tests; the Unit 11 boundary guard proves no fuzzy matcher exists in the lane.

---

### Unit 3: APPRIL fetch + parse *(pure parse; script owns I/O)*

**Goal:** turn the 98 MB dump into validated, typed records with no DB writes and no library coupling
in `src/` — **including the bearing/non-bearing distinction.**

**Files:** `src/lib/pesticide/appril-parse.ts`, `src/lib/pesticide/bulk-fetch.ts`,
`test/pesticide-appril-parse.test.ts`, fixtures under `test/fixtures/pesticide/`
**Approach:** `appril-parse.ts` is pure over `Record<string, string>[]` and imports nothing — that is
what keeps `exceljs` out of the Next bundle (K9) and the tests network-free. It parses `AIS`
(`Name (PCcode/CAS) - (pct%)`), `SITES`, `PESTS`, `LABEL_NAMES`, and keeps `PEST_CAT` raw —
**do not collapse multi-class values, and treat blank as `unknown` rather than dropping the row.**

Grape discrimination is `/\bGrapes?\b(?!fruit)/` — "Grape-Ivy" is an ornamental and must not match,
"Grapefruit" must not match — ⚑ **and then the site string is parsed for the bearing modifier (K11).**
`"Grapes (Non-bearing)"` yields `siteModifier: NON_BEARING`; a bare `"Grapes"` yields `UNSPECIFIED`,
**not** `BEARING`. Council G1: hundreds of herbicides and fumigants are non-bearing-only, and
flattening that produces an illegal application whose residues make the crop unsellable.

`bulk-fetch.ts` is the lane's own streaming download: SSRF check via
`src/lib/knowledge/crawl/ssrf.ts`, host checked against an explicit pesticide-source allowlist,
`tls.rootCertificates` **spread** into the undici agent (never `rejectUnauthorized: false`), stream
to a temp path with a byte cap, return the path plus the response `Last-Modified` (which becomes
`PesticideDataRevision.apprilAsOf`). A 404 is a coverage signal and is **never** retried.

**Open the unit with a 15-minute measurement, not an assumption:** confirm whether EPA publishes a
CSV alongside the xlsx (a CSV removes K9 entirely), and if not, measure peak RSS reading the real
file with `exceljs`'s streaming reader. If the shared-strings table blows memory, fall back to
unzipping the sheet entry and SAX-parsing. Record the measurement in the phase report either way.

**Tests:** multi-AI premix parse; blank `PEST_CAT` survives as `unknown`; grapefruit and Grape-Ivy
both rejected; **`"Grapes (Non-bearing)"` yields `NON_BEARING` and a bare `"Grapes"` yields
`UNSPECIFIED`**; a malformed `AIS` cell is reported, never silently dropped.
**Depends on:** Unit 2
**Verification:** unit tests; the parsed grape-registration count matches plan 086's measured 2,509
and the distinct-AI count matches 338. A material divergence is a **finding**, not a number to
overwrite — it means the dump changed shape.

---

### Unit 4: APPRIL ingest script *(idempotent, mark-and-sweep)*

**Goal:** an idempotent load of grape-scoped registrations that **also retires what disappeared**.

**Files:** `scripts/ingest-appril.ts`, `package.json`
**Approach:** `crawl-ets.ts` ergonomics verbatim — `--dry-run`, a `KB_MAX_DOCS`-style cap, per-record
try/catch with a flat tally and a **truncated** error message (never a bare `catch {}`), everything
inside `runAsSystem`, `disconnectSystem()` on both paths, the shared fatal handler.

Open a `PesticideDataRevision` as `RUNNING`, upsert on the canonical `epaRegNumber` from Unit 2
stamping `lastSeenRevisionId`, then **sweep**: rows carrying an older `lastSeenRevisionId` flip to
`WITHDRAWN_FROM_SOURCE` — never deleted, because this is an audit trail (K14, council C2). Only on a
clean finish does the revision flip to `PUBLISHED`; a run with hard failures ends `FAILED` and
**publishes nothing** (council C8). A row whose reg number fails to parse is **counted and reported**,
never guessed at.

Emit `::PESTICIDE_INGEST_SUMMARY::{json}` on one line before exiting, and use `process.exitCode = 1`
rather than `process.exit()` so a `tee`'d stdout is not truncated.

**Tests:** a re-run is a no-op (0 changed); a changed registration status updates in place; **a
product removed from the source flips to `WITHDRAWN_FROM_SOURCE` and stops answering "registered"**;
a `FAILED` run leaves the previously `PUBLISHED` revision serving reads; a malformed reg number lands
in the tally rather than the table.
**Depends on:** Units 1, 2, 3
**Verification:** `--dry-run` reports ~2,509; the second real run reports 0 changed; a
fixture-driven third run with one product removed reports exactly one withdrawal.

---

### Unit 5: Lookup service — entitlement, jurisdiction, and the result contract

**Goal:** one choke point for every read, gated on entitlement **and** jurisdiction, failing closed on
both.

**Files:** `src/lib/pesticide/lookup.ts`, `src/lib/pesticide/types.ts`,
`test/pesticide-entitlement.test.ts`
**Approach:** `lookup.ts` is the **only** module under `src/lib/pesticide/` that imports
`@/lib/prisma` (K7, enforced by the Unit 11 guard). ⚑ **Jurisdiction is a required argument** (K12).
Every exported read returns a discriminated union — no bare nulls, no throw-on-absent:

```
{ ok: true,  data, factsAsOf, provenance }
{ ok: false, reason: "source-not-enabled" }
{ ok: false, reason: "malformed-reg-number", detail }
{ ok: false, reason: "unsupported-registration-format", format }
{ ok: false, reason: "not-found" }
{ ok: false, reason: "state-registration-unknown", federalStatus }   ⚑ G2
{ ok: false, reason: "jurisdiction-unsupported" }                    ⚑ G2 / rule §3.9
```

`factsAsOf` is the **composite** from K8 — `{ publishedRevisionId, apprilAsOf, cdprAsOf,
resistanceArtifactSha256 }` — because one lookup spans four sources on different cadences and a
single scalar would be a false contract (council C1). **Coordinate the exact shape with S3a before
either lane lands.**

`provenance` is the **full union `"registry" | "grower-supplied"` from day one**, with S2 only ever
*producing* `"registry"`. Council C4 is right that widening a literal union later is a breaking change
for exhaustive consumers — the earlier claim that it was forward-compatible was simply wrong.

Tenant comes from the caller's session or `runAsTenant`, **never** from an argument a model could
supply. Subscription check first, before any query.

The legality composition rule (above) lives here: federal is necessary-not-sufficient, state is a
required conjunct, restrictions subtract, and **no combination of partial knowledge produces
`ok: true`**. ⚑ The product-level resistance payload applies **K13's most-conservative rollup**: any
constituent AI in `GAP` makes the product `GAP`, with resolved codes carried as explicitly-labelled
partial evidence.

**This is the entitlement boundary for S9, S10, *and* S11** — S11's tool consumes this service rather
than re-implementing the check (council C7). Say so in the module docblock so S11's author does not
add a second, divergent gate.

**Tests:** a tenant without the subscription gets `source-not-enabled` for every exported read, and
the check returns **before any query runs** (assert on a mocked prisma that is never called); a
non-CA US jurisdiction with a federally-registered product gets `state-registration-unknown`, **never
`ok: true`**; a non-US jurisdiction gets `jurisdiction-unsupported` and **the app does not throw**
(rule §3.9 — Bhutan is a live tenant); a premix with one `GAP` AI resolves `GAP` at product level; no
result variant can be read as a permission.
**Depends on:** Units 1, 2
**Verification:** unit tests, plus the real-service entitlement case in `verify:pesticide` (council
C7 — `verify:kb-subscriptions` proves the *generic* toggle works and proves nothing about this lane).

---

### Unit 6: CA DPR state layer

**Goal:** answer *"registered in California, on grapes"* — the one jurisdiction S2 can answer at all.

**Files:** `src/lib/pesticide/cdpr-parse.ts`, `scripts/ingest-cdpr.ts`,
`test/pesticide-cdpr-parse.test.ts`
**Approach:** fixed-width parse of `product.dat`, `prod_site.dat`, `site.dat` — pure, offsets in one
named table at the top of the module so a mis-decode is one edit. Grape site codes 1014 / 1020 /
1021 / 1022 / 1501 / 29141 / 29143. Join to `PesticideProduct` on the canonical EPA reg number from
Unit 2. **Do not touch `preharvest_interval.dat` / `reentry_interval.dat`** — plan 086 established
they are unit lookup tables (D/H/M), not values. A product absent from CDPR is `NOT_REGISTERED`; a
product we could not resolve is `UNKNOWN` — two different rows, **never merged**, because K12 treats
them differently. Same mark-and-sweep and revision semantics as Unit 4.

CDPR rows lacking an EPA number (adjuvants, 25(b) products) are **counted and reported, not ingested**
— S2b owns them. The schema room is already there (Unit 1, G4).

**Tests:** **Gavel 75DF and Fusilade DX both resolve to registered-on-grapes-in-CA** — the
counter-intuitive verified cases, committed as fixtures because plan 086 mis-decoded the status column
once already; a product absent from CDPR resolves to `NOT_REGISTERED`; an unparseable line is
tallied, not dropped; a CA-state-only row is counted in the deferred bucket rather than dropped
silently.
**Depends on:** Units 1, 2, 4
**Verification:** the two verified cases pass against committed fixtures and again live.

---

### Unit 7: County / SLN restriction flags *(pure)*

**Goal:** structured, non-binary county restrictions that keep the 24(c) carve-out.

**Files:** `src/lib/pesticide/restrictions.ts`, `test/pesticide-restrictions.test.ts`
**Approach:** pure detection over label text, emitting `{ state, counties[], kind, exception, quote }`
where `exception` is `"24c-sln" | null` and `quote` is the label sentence **verbatim** so the citation
is the source, not our paraphrase. `/Nassau|Suffolk/` caught 4/4 restricted products with zero false
positives across four sentence structures — but a binary banned flag is wrong, because Luna carries
*"except as permitted under FIFRA 24(c), Special Local Need registration."*
**Tests:** all four verified phrasings as fixtures; **Luna Experience yields `exception: "24c-sln"`,
not a plain ban**; Luna's separate *"Aerial Application Prohibited in New York State"* is captured as
its own distinct restriction, not folded into the county one.
**Depends on:** Unit 3
**Verification:** unit tests over the four captured labels.

---

### Unit 8: `epa-pesticide` knowledge source + toggle

**Goal:** reuse the shipped per-tenant toggle for entitlement and citation plumbing, without paying
the corpus cost.

**Files:** `src/lib/knowledge/config.ts`
**Approach:** one `KNOWLEDGE_SOURCES` entry — `key: "epa-pesticide"`, `tier: 1`, `autoCrawl: false`,
**`defaultEnabled: false`** (this is how non-US tenants stay clean and how the feature ships dark),
`license` recording EPA's public-domain posture. **Plus a `TRUSTED_DOMAINS` entry** — host gate and
path gate are separate concerns in this file (`config.ts:117-119`), and plan 086's Unit 7 described
only one of them. Then re-run `npm run seed:knowledge-sources`; no migration
(`seed-knowledge-sources.ts:16-25` persists 9 fields and `autoCrawl` is not one of them).

Note in the entry comment that `autoCrawl: false` **excludes this source from the monthly recrawl
loop** — correct here (no pages are crawled) and exactly why Unit 10 adds its own workflow step
rather than relying on `crawlCadence`, which nothing reads (`config.ts:152-154`).

**Tests:** none new — covered by `verify:kb-subscriptions`.
**Depends on:** none
**Verification:** the source appears in the settings card, **default off**; `verify:kb-subscriptions`
green.

---

### Unit 9: Resistance derivation, curated artifacts, and the coverage report

> **Plan 086's Unit-4 de-risk (measured 2026-07-20) governs this unit. Read
> [plan 086](../../plans/2026-07-20-086-feat-us-pesticide-registration-plan.md) §"Unit 4 de-risk
> result" before implementing. Its three constraints are carried into K3, K4, and K5 above and are
> not restated here.**

**Goal:** the AI→code table, every row cited, every gap visible, rotation-eligibility modeled
separately from chemical identity — **and a coverage report whose `GAP` bucket means something.**

**Files:** `src/lib/pesticide/resistance-derive.ts`, `src/lib/pesticide/data/resistance-codes.json`,
`src/lib/pesticide/data/ai-normalization.json`, `src/lib/pesticide/data/trade-name-map.json`,
`scripts/derive-resistance-codes.ts`, `test/pesticide-resistance-derive.test.ts`

**Three curated artifacts, one discipline.** Each is human-reviewed, and every row in every one of
them carries `sourceUrl`, `sourceTitle`, `sourceAsOf`, `reviewedBy`, `reviewedAt`. A row missing a
citation or a reviewer fails the schema test — no exceptions, because an uncited row is
indistinguishable from a guess six months from now.

1. **`resistance-codes.json`** — the assignments. Also `subject`, `subjectKind`, `scheme`,
   `resolution`, `code`, `siteType`, `derivedFrom`.
2. **`ai-normalization.json`** *(council G5)* — the salt / ester / hydrate collapse. APPRIL carries
   "Copper hydroxide", "Copper octanoate", "Copper sulfate pentahydrate" as distinct strings while
   extension sources say "Copper (M 01)"; exact string matching would drop most copper and mancozeb
   products into `GAP` and **swamp the coverage report with false gaps**, which is as useless as no
   report. This is a **curated, cited mapping — not a suffix-stripping regex**, because a regex is
   exactly the inference K5 forbids. Applied **only for resistance-code assignment, never for
   identity**: the `PesticideActiveIngredient` row keeps its APPRIL name and gains
   `parentActiveIngredientId`.
3. **`trade-name-map.json`** *(council G6 — the missing link neither this plan nor plan 086 had)* —
   extension guides key on trade names ("Rally 40WSP"); APPRIL trade names carry ™, ®, and alternate
   spellings. A normalization pass (strip ™/®, case-fold, collapse whitespace) **proposes** candidates
   and a **human confirms** — never auto-applied, because an auto-applied trade-name match is the same
   silent mis-attribution K4 and K6 exist to prevent.

**Source precedence, explicit, conflicts surfaced and never silently resolved:**

1. Extension **structured tables** (UC IPM conventional + biologicals — already Tier-1 in our corpus).
2. Extension **prose**, LLM-extracted and human-reviewed (Virginia Tech ENTO-635-C; MSU Extension
   `/news/` articles, which carry FRAC codes in narrative and add cold-climate coverage for MI/NY
   products CA guides never mention). Tier-2, cited, never a table join.
3. Label text — **single-AI products only.** Label-text scraping systematically drops the SDHI
   partner in premixes (Luna 7+3 → 3; Miravis 7+12 → 12; Gavel M03+22 → none).

**Binding constraint (runbook §3.17, upheld against the runbook council's P1):** no FRAC / HRAC / IRAC
compilation is parsed or redistributed. Codes are derived from Tier-1 extension sources already in the
corpus, every row cited. Unit 11's licensing guard makes this mechanical rather than aspirational.

**The coverage report** is the deliverable, not a byproduct. It buckets all 338 grape AIs into
`CODED` / `NO_CODE_EXISTS` / `GAP` with **zero unclassified**, and reports three sub-counts separately:
the **biologicals share of `GAP`** (the number that turns the Cornell purchase from an opinion into a
decision — data-sources §5, runbook §12.5), the **normalization-recovered** count (how much of the
copper/mancozeb tail `ai-normalization.json` rescued), and **cited codes we could not attach to a
product** (trade names that resolved to no reg number — itself worth knowing).

**Tests:** a premix yields **both** codes; ⚑ **a premix of a `CODED` AI and a `GAP` AI resolves `GAP`
at product level and never reports rotation-ready (K13)**; the single-AI label path; strain-suffix
collapse onto a cited species (K5) with a **negative** test that `Bacillus mycoides` gets no inferred
code; **`ai-normalization.json` never merges two AIs carrying different codes**; a known uncoded AI
(sodium hypochlorite) lands in `NO_CODE_EXISTS`, **not** `GAP`; **captan resolves with
`siteType: MULTI` regardless of which source supplied the code**; **`Switch` resolves to 9 AND 12,
never 9 alone**; a `PRODUCT` assignment derived from an AI-keyed table is rejected by the DB CHECK.
**Depends on:** Units 1, 3
**Verification:** the coverage report shows zero AIs unclassified; spot-check **Zampro → 45, 40** and
**Pristine → 7, 11** (both independently confirmed twice during plan 086's research).

---

### Unit 10: Monthly refresh + re-derivation + coverage delta

**Goal:** the mitigation for the one risk the runbook council was right about — the derived table has
**no vendor update SLA**.

**Files:** `.github/workflows/knowledge-recrawl.yml`
**Approach:** one step with `id: pesticide`, `if: always()`, between the recrawl step and the issue
step, using the same `set -o pipefail` / `tee` / `grep` / `sed` pattern into `pesticide-summary.json`,
with the same `[ -s … ] || echo '{"error":…}'` fallback. Extend the issue-body heredoc with a second
fenced block. No new secrets, no new job — the existing `knowledge-recrawl` concurrency group
correctly serializes it. Raise `timeout-minutes` only if the measured runtime demands it.

**The re-derivation is mandatory, not optional** (runbook §3.17). The step runs ingest **and**
re-derivation, and the summary carries a **coverage delta**: AIs new since the last published
revision (which land in `GAP` by construction and must be **named** in the issue body), AIs whose
resolution changed, registrations whose status changed, and — now that Unit 4 sweeps — **products
withdrawn from the source**, which is the line a grower's PCA would actually want to see. A silent
monthly ingest that never re-derives is precisely the drift the accepted risk describes.

**Inherit from plan 085, do not re-solve:** its Unit 4 makes the tombstone pass treat a
`fetchDocument` throw as a *flag* rather than "page is gone." That is the failure mode that would
mass-tombstone a source on a transient fetch error.

**Depends on:** Units 4, 6, 9
**Verification:** a `workflow_dispatch` run; the issue body contains both summaries and a coverage
delta section naming any new-and-uncoded AIs.

---

### Unit 11: `verify:pesticide` + the boundary guards

**Goal:** house-pattern end-to-end proof, plus the mechanical guards that turn this plan's safety
rules into CI failures.

**Files:** `scripts/verify-pesticide.ts`, `scripts/pesticide-verify-cases.ts`,
`test/pesticide-boundaries.test.ts`, `package.json`,
`docs/architecture/invariants/PEST-1-gap-is-not-a-clearance.md`,
`docs/architecture/invariants/PEST-2-exact-match-product-resolution.md`
**Approach:** follow `scripts/verify-knowledge-base.ts` — docblock header with invocation forms, the
`assert(cond, name, detail)` helper with tallies, `runAsSystem`, Demo Winery (`org_demo_winery`,
**never** Bhutan), a summary line, `disconnectSystem()`, then `if (failed > 0) process.exit(1)`. The
**typed case table goes in `scripts/pesticide-verify-cases.ts`** so tests can import it —
`verify-pesticide.ts` runs `main()` at import and therefore cannot be imported from. Register as
`"verify:pesticide": "tsx --env-file=.env scripts/verify-pesticide.ts"`.

Cases assert the full chain — registration → `siteModifier` → AI → resistance code + `siteType` → CA
status → county restriction — plus every Success Criterion below, and specifically **the real-service
entitlement case** (council C7): call `lookup.ts` itself with the `epa-pesticide` subscription off and
assert `source-not-enabled`. `verify:kb-subscriptions` proves the *generic* toggle works and proves
nothing whatsoever about this lane.

`test/pesticide-boundaries.test.ts` is a **source-scan guard** over `src/lib/pesticide/`,
`scripts/ingest-*.ts`, `scripts/derive-resistance-codes.ts`, and the three JSON artifacts:

- **only `lookup.ts` imports `@/lib/prisma`** (K7);
- **no fuzzy matcher** — no `contains` / `startsWith` / `endsWith` / `mode: "insensitive"` /
  `similarity` / `levenshtein` in any query touching a registration number (K6);
- **every `sourceUrl` host in every artifact resolves to a seeded `KnowledgeSource` / `TRUSTED_DOMAINS`
  entry** — a **positive allowlist**, per council C10. The earlier design only proved three committee
  hostnames were absent, which proves absence, not approval. This is strictly stronger and it is the
  mechanical proof of *"no FRAC/HRAC/IRAC compilation anywhere in the diff"*;
- every artifact row carries `sourceUrl` + `sourceAsOf` + `reviewedBy`.

Two invariant notes follow the `docs/architecture/invariants/` frontmatter shape (`id` / `group` /
`severity` / `enforcedBy` / `verify` / `status` / `appliesTo`), both with
`verify: "npm run verify:pesticide"`. **PEST-1** is invariant candidate #1 from runbook §11: *a
coverage gap never renders as no-restriction* — ⚑ and its teeth are K13's premix rollup, not just the
AI-level enum. **PEST-2**: *product resolution is exact-match only; malformed, unsupported-format, and
not-found are distinct and none is a clearance.* Run `npm run verify:invariants` after adding them.

**Depends on:** all
**Verification:** `npm run verify:pesticide` green from the main checkout; `verify:invariants`,
`verify:invariant-frontmatter`, `verify:tenant-isolation`, `verify:ai-native`, `npx vitest run` green.

---

### Unit 12: QA pass + report

**Goal:** the standing gate (runbook §3.16, [QA-PROTOCOL](../qa/QA-PROTOCOL.md)) — not optional, not
waivable by parallelism, not replaced by unit tests.

**Files:** `docs/spray_assistant/qa/S2-qa-report.md`
**Approach:** dev server from the **main checkout** on the feature branch, `npx prisma generate`
first, the **user logs in once** with the Demo Winery credentials (Claude never types a password),
`get_page_text` / `read_page` for reads — screenshots hang in the pane.

S2's only browser-visible surface is the settings knowledge-sources card. Most program-wide safety
cases have no surface yet, and **a skipped case is written down as skipped, with the reason — a blank
row reads as a pass and that is how a safety regression ships.** The honest mapping:

| Case | S2 status |
|---|---|
| **SAFE-14** (source disabled → not-enabled path) | **Exercisable now, at the service layer.** No assistant tool until S11, so prove it with a `runAsTenant("org_demo_winery", …)` script calling `lookup.ts` with the subscription off and on. Browser half: the card shows `epa-pesticide` **default off**. |
| **SAFE-3 / SAFE-4** (gap vs no-code-exists) | **Data-layer only.** No rendering exists — S9 owns the visual vocabulary. Prove the tri-state **and the premix rollup** in the DB via `verify:pesticide` and say so. Do **not** invent a visual treatment here. |
| **SAFE-19** (non-US tenant does not brick) | ⚑ **Partially exercisable now.** S2b builds the manual path, but K12's `jurisdiction-unsupported` result exists in S2 — prove via script that a non-US jurisdiction returns it cleanly rather than throwing. |
| **SAFE-1, 2, 5–13, 15–18, 20–23** | ⏭ not-yet-applicable — the surfaces do not exist. List each with the phase that will make it testable. |

Plus S2's own functional cases: the toggle flips and persists; a `verify:pesticide` run captured; the
coverage report attached with its **actual numbers**, including the biologicals share of `GAP`;
`verify:naming` green **before and after**.

**Depends on:** all
**Verification:** `docs/spray_assistant/qa/S2-qa-report.md` exists with every safety row filled in as
pass, fail, or explicitly-deferred.

---

## Test strategy

**Unit (vitest, branch-local):** every parse, derivation, and detection module is pure and
fixture-driven — no network, no Prisma, no React. Fixtures under `test/fixtures/pesticide/` include
the counter-intuitive verified cases as first-class artifacts: Gavel 75DF, Fusilade DX, Luna
Experience's two distinct restrictions, Zampro, Pristine, Switch, captan, a non-bearing-only
herbicide, and a synthetic coded+GAP premix.

**Guard tests (branch-local):** the four source scans in Unit 11. These are the difference between a
rule and a comment.

**Integration (serialized, from the main checkout):** `verify:pesticide` against Demo Winery,
`verify:tenant-isolation`, `verify:kb-subscriptions`, `verify:invariants`, `verify:ai-native`.

**Manual (Unit 12):** the toggle, and the service-layer not-enabled and jurisdiction paths proven by
`runAsTenant` read-backs rather than by a toast.

---

## Risks

Plan 086's Risks table carries over **verbatim**. Repeated here so this document stands alone, with
the S2-specific additions marked **(new)** and the council folds marked **(council)**.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Resistance-code coverage gaps read as "no restriction" | MED | **HIGH** | Unit 9's coverage report; the tri-state enum + CHECK make `GAP` a distinct value; **K13's premix rollup closes the product-level hole**; UI must render *gap* distinctly from *no-code-exists* — **S9's job, gated there**. |
| Users read registration data as spray advice | MED | **HIGH** | Every response carries source + `factsAsOf`; the label is the law and we are not it. |
| Trade-name → AI resolution is ambiguous | MED | MED | `trade-name-map.json` — human-confirmed, never auto-applied; unresolved names go to the coverage report as their own bucket, never guessed. |
| EPA changes the dump format/URL | LOW | MED | Unit 3 validates and fails loudly; the monthly job reports into the existing issue. |
| Cold-start ingest exceeds the workflow timeout | LOW | MED | Relational ingest skips embedding entirely. Measure on the first run. |
| CDPR fixed-width offsets are undocumented | MED | LOW | Plan 086 mis-decoded the status column once; Unit 6 pins it with the two verified cases as committed fixtures. |
| Scope creep into rate/PHI extraction | MED | MED | That is **S2b** (curated facts) and Later (label PDFs). |
| **(council G1)** A non-bearing-only product applied to bearing vines | MED | **HIGH — crop-level** | `siteModifier` from Unit 3 through the Unit 5 payload; `UNSPECIFIED` is never read as `BEARING`; S3a/S7a validate against the block's planting date. |
| **(council G2)** Federal registration read as a clearance outside CA | **HIGH** | **HIGH** | K12 — jurisdiction is required and federal alone is never `ok: true`. The system fails closed on jurisdiction, not open. |
| **(council G3)** A premix's uncoded AI silently disappears from the rotation answer | MED | **HIGH** | K13's most-conservative rollup + the golden on a coded+GAP premix. |
| **(council C2)** A de-registered product answers "registered" forever | MED | **HIGH** | K14 mark-and-sweep; withdrawals surface in the monthly delta. |
| **(council G5)** Salts/esters/copper variants swamp `GAP` with false gaps | **HIGH** | MED | Curated `ai-normalization.json`, cited and reviewed; the coverage report reports normalization-recovered separately so the rescue is auditable. |
| **(new)** Derived resistance table has **no vendor update SLA** | MED | **HIGH** | Runbook council P1, upheld with two folds. Mandatory monthly **re-derivation** with a coverage delta (Unit 10) + gap-renders-as-unknown + the tenant manual override, **built once in S2b** — coordinate, do not duplicate. |
| **(new)** A malformed EPA reg number fuzzy-matches to a product | LOW | **HIGH** | Runbook council S9. Unit 2's typed rejection + the Unit 11 source-scan guard. |
| **(new)** Schema-slice PR collides with a sibling lane | **HIGH** | MED | `gh pr list` before starting; PR-1 lands alone and first; rebase before PR-2. |
| **(council C11)** Sibling lanes clobber the shared generated Prisma client between `tsc` and `vitest` | MED | MED | `prisma generate` before every command is a **ritual, not isolation** — accepted for this lane, recorded in `TODOS.md`, **raised at the program level** rather than fixed unilaterally. |
| **(new)** `exceljs` cannot stream the 98 MB / 366k-row dump | MED | MED | Measured in Unit 3 before the design is committed; fallback is unzip + SAX. Check for an EPA CSV first. |
| **(new)** A new `*-core.ts` name reds `verify:ai-native` on merge | MED | LOW | K1 — no `-core` suffix in this lane. |

---

## Success criteria

Plan 086's Success Criteria, **unchanged**, plus the runbook council's S9, the three ⚑ folds, and the
QA gate:

- [ ] All 338 grape AIs resolve to `CODED` / `NO_CODE_EXISTS` / `GAP` — **zero unclassified**
- [ ] Gavel 75DF and Fusilade DX both report registered-on-grapes-in-CA
- [ ] Zampro → 45, 40 and Pristine → 7, 11
- [ ] Luna Experience yields a Nassau/Suffolk restriction **with** the 24(c) exception, not a ban
- [ ] `Switch` resolves to 9 **and** 12; captan resolves with `siteType: MULTI` from either source
- [ ] ⚑ **A non-bearing-only registration is never reported as registered for a bearing block**
- [ ] ⚑ **A federally-registered product in a non-CA US jurisdiction returns
      `state-registration-unknown`, never `ok: true`; a non-US jurisdiction returns
      `jurisdiction-unsupported` without throwing**
- [ ] ⚑ **A premix containing one `GAP` active ingredient resolves `GAP` at product level and cannot
      report rotation-ready**
- [ ] A product removed from the source flips to `WITHDRAWN_FROM_SOURCE` and stops answering
      "registered"; a `FAILED` ingest run publishes nothing
- [ ] Source defaults **OFF**; a tenant without it enabled gets the not-enabled path **at the service
      layer**, before any query runs — proven against the **real** `lookup.ts`, not `verify:kb-subscriptions`
- [ ] **A malformed EPA reg number never fuzzy-matches to a product**, and a CA-state-only or 25(b)
      number is `unsupported-format`, not `malformed`
- [ ] Monthly workflow reports the pesticide summary **and a coverage delta** in its issue
- [ ] `verify:pesticide`, `verify:tenant-isolation`, `verify:kb-subscriptions`, `verify:invariants`,
      `verify:ai-native`, `verify:naming`, `npx vitest run` all green
- [ ] **No FRAC/HRAC/IRAC compilation is parsed or committed anywhere in the diff** — proven by the
      Unit 11 positive-allowlist guard, not by inspection
- [ ] `docs/spray_assistant/qa/S2-qa-report.md` exists with every safety row filled in

---

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem frame | HIGH | Green field verified — no `src/lib/pesticide/`, no pesticide model, nothing adjacent. S7a's critical path is explicit in the runbook. |
| Scope boundaries | HIGH | Units 8 and 10 of plan 086 are assigned to named phases (S11, S3a); S2b's boundary is drawn at product versioning, the override mechanism, and non-EPA products. |
| Implementation units | HIGH | Units 1–8, 10–11 rest on verified endpoints and mapped code with line numbers. Unit 9 rests on plan 086's measured de-risk, and council review added the two artifacts that make its `GAP` bucket meaningful rather than noisy. |
| Test strategy | HIGH | The counter-intuitive verified cases make strong fixtures, and the four source-scan guards make the licensing, entitlement, and fuzzy-match rules mechanical rather than aspirational. |
| Risk assessment | MEDIUM | Improved by review — G1/G2/G3 were unknown-unknowns before it. The residual is that the coverage-gap mitigation is partly UI-dependent and that UI is S9's: **S2 can prove the data is honest; it cannot prove the render is.** That seam is deliberately left to S9's gate. |

---

## Open questions

1. **Cornell guide.** Plan 086 measured that its value concentrates in **biologicals** — it codes
   Stargus, LifeGard, Theia, and Romeo, none of which appear on either free UC IPM page, and which
   made up 4 of 6 measured misses. Unit 9's coverage report now produces three numbers to decide
   against: the biologicals share of `GAP`, the normalization-recovered count, and the unattached
   trade-name count. Re-evaluate against those **and** S2b's measured cannot-determine rate. Still the
   user's call, still not a blocker. Cornell **paused the 2026 edition** pending a 2027 relaunch —
   plan around the 2025 NY/PA guide.
2. **Coverage-gap UI.** How does an uncoded AI render in a rotation view so it cannot read as "no
   restriction"? **S9 owns this** (runbook §3.18). S2 must not invent it, and the QA report must say
   the case is data-layer-only rather than leaving it blank.
3. **Does S2b's tenant override shadow a resistance assignment, or only the product facts?** A grower
   overriding a *resistance code* is a safety-relevant write in a way that overriding a rainfast
   period is not. S2 leaves the full `provenance` union so either is representable; **S2b decides and
   records it.**
4. **The composite `factsAsOf` shape must be agreed with S3a before either lane lands** (council C1).
   S3a is building the facts-as-of snapshot in parallel and consumes this. **This is the one
   cross-lane coordination item in S2** — settle it in the first `/work` session, not at merge.
5. **NY / OR / WA state layers just got more urgent.** K12 means those tenants get
   `state-registration-unknown` for everything, which is *correct* but not *useful*. The data-sources
   design says there is no free bulk source (NYSPAD has no bulk export; PICOL probed 404). Worth
   re-probing before S7a ships, because S7a is where a grower feels it.
6. **Bulletins Live! Two** (data-sources §3.3) is not yet probed for a machine-readable feed. It is
   S7's hard stop, not S2's, but if a feed exists it is registration-shaped data and would belong in
   this lane's tables. Worth a 15-minute probe during Unit 3 and a note in the phase report.

---

## Execution mechanics

- `gh pr list` before starting (done at plan time: only `#488 bot/brain-refresh` open).
- Branch `claude/s2-spray-intelligence-pesticide-9a83f3`; worktree at
  `.claude/worktrees/s2-spray-intelligence-pesticide-9a83f3`.
- Worktrees share ONE `.git` index — stage with `git commit --only <paths>`.
- **Worktrees have no `.env`.** Every DB-backed `verify:*`, every migration, and the dev server run
  from `C:\Users\russe\Documents\Wine-inventory`.
- `npx prisma generate` **immediately before** any `tsc` / `verify` / `dev`, in any worktree — with
  the council C11 caveat above that this is mitigation, not isolation.
- Migrations: hand-authored via `migrate diff … | grep -v search_vector` → `migrate deploy`. Never
  interactive `migrate dev`. Stop the dev server before `generate`. **CHECK constraints and partial
  unique indexes are hand-added** — Prisma expresses neither.
- Council reconciliation is complete; the record is [S2-council-feedback.md](S2-council-feedback.md).
  **Ready for `/work`.**
