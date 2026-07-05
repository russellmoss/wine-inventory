---
title: Winemaking Calculator — page + assistant integration
type: feat
status: complete
date: 2026-07-05
branch: feat/winemaking-calculator
depth: deep
units: 15
---

> **Build log:** PR1 (engine + page, units 1–10 + 13) MERGED to main (squash 5418315, PR #50).
> PR2 (units 11, 12, 14, 15 — CalculationLog + logging + assistant tools + history) BUILT on
> `feat/winemaking-calc-traceability`, plus the two deferred PR1 /review items (doseDescriptor
> factory + typed unit readers). tsc + eslint + `next build` clean; full vitest 1307 green;
> verify:tenant-isolation 34 checks (incl. calculation_log RLS + append-only); eval:assistant,
> verify:invariants, verify:tripwires, verify:raw-sql all green.

## Overview

Build a comprehensive winemaking calculator into Cellarhand, driven by the verified
formulas in `docs/winebusiness-calculator-formulas.md` (37 calculators across 8 sections).
The core is ONE pure calculation engine (`src/lib/winemaking-calc/`) that becomes the single
source of truth. That engine feeds two surfaces: (1) a `/winemaking-calculator` page under the
Winery nav group where a winemaker fills in a form and reads the answer, and (2) a small set of
read-only assistant tools so a user can just ask ("1000 L tank, pH 3.4, free SO₂ 20 ppm — how
much SO₂ to hit 0.08 molecular?") and get the computed answer in chat.

The outcome for the winemaker: the math they currently do on winebusiness.com (or a spreadsheet,
or in their head) now lives inside the ERP, next to the wine it's about, and is reachable by
voice/chat. One engine, two front doors, verified against a known reference.

Every calculation (from either front door) is logged — inputs, output, who, when, which
calculator, from where — to a tenant-scoped, append-only `CalculationLog`. This gives
traceability: if a bad addition happens in the cellar, we can pull up exactly what was entered
and what the calculator returned. In nearly every case that will confirm the calculator was
correct and the entry was user error, but the log makes it *provable* either way — and it doubles
as a debugging trail if a formula ever is wrong.

## Problem Frame

Winemakers run these calculations constantly during harvest and cellar work: SO₂ additions,
chaptalization, acid adjustments, blend math, fortification. Today they leave Cellarhand to do
them on a third-party site or a spreadsheet, then hand-transcribe results back. That's a context
switch, a transcription-error surface, and a missed chance to make the ERP the one place the
winemaker works.

Doing nothing keeps the ERP a system-of-record but not a system-of-work for daily bench math.
The cost of inaction is low individually but compounds: every calc done elsewhere is a reason to
have another tab open. The assistant angle is the real unlock — "just ask" beats "open the
calculator page, find the right calc, fill six fields." The page is the fallback/discovery
surface; the assistant is the fast path.

**Product note (not a blocker):** these are advisory bench calculators, not lab-grade or a
substitute for measurement. Two of the reference formulas (SO₂ Reduction's `35`/`0.0014`
constants) are flagged in the source doc as "verify against the live UI before trusting." We
surface every result with the formula + assumptions used and an advisory disclaimer, mirroring
the existing `report-anomalies` tool's "Advisory only" pattern.

## Requirements

- MUST: A pure, dependency-free calculation engine under `src/lib/winemaking-calc/` covering all
  **computational** calculators in the reference doc (34 of 37; the 3 static reference tables —
  calcs 21, 23, 51 — carry no math).
- MUST: Replicate the reference formulas *exactly*, including the `0.12` lbs/1000-gal sentinel
  branch and every unit-factor table, so results match the verified examples in the doc.
- MUST: A `/winemaking-calculator` page under the Winery nav group, client-only, no persistence,
  that lets the user pick a calculator, enter inputs (with unit dropdowns), and see the result.
- MUST: Read-only assistant tools (`kind: "read"`) that expose the engine so the assistant can
  answer natural-language calc questions, bypassing the write-confirmation gate.
- MUST: Every result (page + assistant) shows the formula/constants and an advisory disclaimer.
- MUST: Every completed calculation is logged to a tenant-scoped, append-only `CalculationLog`
  (calculatorId, inputs JSON, output JSON, unitsUsed, userId, source `PAGE`|`ASSISTANT`, createdAt),
  built to the Phase-12 multi-tenancy checklist (RLS, FK, per-tenant scoping, isolation test).
- MUST: The log is traceable/readable after the fact — a user (or admin) can pull up recent
  calculations, and the assistant can query its own past calculation history.
- MUST: Logging must NOT block or break the result — a log-write failure degrades gracefully
  (the user still sees the answer); logging is fire-and-forget from the user's perspective.
- MUST: Unit tests validating each formula against the worked examples in the reference doc
  (e.g. 1000 US gal +50 ppm → 328.59 g KMBS; 0.8 molecular @ pH 3.4 → 31.9 ppm free).
- SHOULD: The engine is registry-driven (declarative calculator descriptors) so the page renders
  generically and the assistant tools map onto the same compute functions — no formula lives twice.
- SHOULD: Reuse existing constants where identical (`SO2_PKA = 1.81` from `src/lib/chemistry/so2.ts`).
- NICE: Read-tool golden cases for assistant tool-selection regression protection (NOT CI-gated).
- NICE: "Copy result" / show-your-work affordance on the page.

## Scope Boundaries

**In scope:**
- All 34 computational calculators as pure functions + the 3 static reference tables rendered as
  read-only reference content on the page.
- A single client page with the calculators grouped by the doc's 8 sections.
- ~6 domain-grouped read-only assistant tools + system-prompt domain knowledge.
- Exact replication of the reference-doc math (this is a *port*, not a re-derivation).
- A tenant-scoped, append-only `CalculationLog` table (Phase-12 checklist) + a `logCalculation`
  helper wired into BOTH front doors, plus a read surface (recent-calc history panel + an
  assistant `query_calculation_history` tool) for traceability.

**Out of scope:**
- "Apply this result to a lot/vessel" write-back — auto-creating an actual ledger operation
  (e.g. an SO₂ addition op) from a calc result. That's a separate, larger feature crossing the
  ledger invariants. We log the calc; we do NOT mutate wine state from it. Explicitly deferred.
- Editing or deleting log entries. The log is append-only (audit integrity). No update/delete UI.
- Reconciling the engine's formulas with the *different* approximations already in
  `src/lib/ferment/sugar.ts` (cubic Brix→SG) and `src/lib/blend/trial-math.ts`. Those serve
  canonical storage/other flows and use intentionally different math; the calculator engine is a
  faithful port of the winebusiness.com reference and stands on its own. We do NOT refactor the
  existing libs to share.
- Voice-specific UI. The assistant tools work in both text and voice automatically (shared brain);
  no voice-only work needed.
- A `Select`/`Tabs` UI primitive (none exists repo-wide). Use native `<select>` + a simple
  section accordion/tab inlined on the page, matching the existing convention.

## Research Summary

### Codebase Patterns

**Pure-calc lib pattern (the model to follow).** `src/lib/units/measure.ts`, `src/lib/chemistry/so2.ts`,
`src/lib/ferment/sugar.ts`, `src/lib/blend/trial-math.ts` are all pure (no prisma/React/server-only),
unit-tested from a flat `test/` dir with Vitest (`vitest.config.ts` includes `test/**/*.test.ts`,
`vite-tsconfig-paths` for `@/`). Example test shape: `test/trial-math.test.ts`, table-style
`it()` cases. Our engine joins this family.

**Existing overlap to reuse, not fight.** `src/lib/chemistry/so2.ts:12` exports
`SO2_PKA = 1.81` and `molecularSO2()` (the *derive* direction: molecular = free/(1+10^(pH−pKa))).
The reference doc's Molecular-SO₂ calc is the *inverse* (free needed = molecular×(10^(pH−1.81)+1)).
Reuse the `SO2_PKA` constant; add the inverse. Do NOT reuse `ferment/sugar.ts`'s Brix→SG — it's a
cubic approximation, whereas the reference uses `261.3/(261.3−Brix)`; the calculator must match the
reference (self-consistent set), so it carries its own conversions.

**Page anatomy.** `src/app/(app)/` is a single authenticated route group (`layout.tsx:10`
`requireReadyUser()` gates every page — no per-page auth wiring). Pages are usually async server
components → `"use client"` island (e.g. `bulk/page.tsx` → `BulkClient`). A calculator that
persists nothing can be a single `"use client" page.tsx` (see `src/app/styleguide/page.tsx` as a
self-contained client-page template).

**Nav.** The "Winery" group is a nav array, NOT a folder: `src/components/AppShell.tsx:22-30`
(`WINERY = [...]`). Add one `{ href: "/winemaking-calculator", label: "Calculator" }` entry there.

**UI primitives.** Barrel `src/components/ui/index.ts`. Use `Input` (`type="number"`, with
`iconLeft`/`iconRight` for unit affixes — Input.tsx:85-87/107-109), `Card`, `Button`, `Metric`,
`Eyebrow`, `Badge`, `Collapsible`. **No `Select`/`Tabs`/`NumberInput` primitive exists** — use
native `<select>` (the repo-wide convention, 20+ files) and inline section tabs. All styling via
CSS tokens (`src/styles/tokens/*.css`), inline `style={{ var(--...) }}` or Tailwind v4 utilities.

**Assistant tool system.** Registry `src/lib/assistant/registry.ts` — `AssistantTool` type
(name/description/kind/adminOnly?/inputSchema/run), central `ALL_TOOLS` array (20 tools today).
Loop `src/lib/assistant/run.ts` (Anthropic SDK, `claude-opus-4-8`, MAX_TURNS 8): builds tool defs
from the registry, dispatches `tool.run({user}, input)`, feeds results back. **`kind: "read"` tools
bypass the entire write gate** (`run.ts:108` only builds a proposal when `kind === "write"`) — no
signed token, no committer, no `commit.ts` entry. Prompt `src/lib/assistant/prompt.ts`
(`buildSystemPrompt`) is one string; add a "Calculate" capability bullet + advisory rule. Read
tool to mirror: `src/lib/assistant/tools/query-brix.ts` (typed inputSchema + `run` returning a
plain object; drop the Prisma parts). Non-string tool output is `JSON.stringify`'d
(`run.ts:125`) — return plain JS objects (numbers/strings).

**Eval CI gate does NOT touch read tools.** `test/evals/assistant-tools.eval.test.ts:23` scopes
the D26/H8 coverage guard to `kind === "write"` only. Read-only calculator tools need no golden
case and won't trip `npm run eval:assistant`. Optional read goldens are pure regression insurance.

### Prior Learnings

- Plan 038 (`plan038-wo-assistant-template-authoring.md`) is the precedent for adding assistant
  tools: it added 6 tools + an eval-coverage guard for *write* tools. Our tools are read-only, so
  the HARD eval gate does not apply — simpler.
- `pure lib + flat test/ + vitest` is the confirmed, repeated pattern (measure.ts, so2.ts,
  sugar.ts, trial-math.ts). No new test infra needed.
- No tenant/DB wiring for a stateless client page (`src/lib/tenant/context.ts` is server-only and
  layout-gated). Confirmed by research agent.

### External Research

None needed — this is a faithful port of formulas already reverse-engineered and documented in
`docs/winebusiness-calculator-formulas.md`, with worked examples to test against.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where formulas live | One pure engine `src/lib/winemaking-calc/`, section-per-file + a declarative registry | Inline math in the page; inline math in each assistant tool | Single source of truth; page + assistant + tests all consume the same functions. No formula written twice. |
| Reconcile with existing sugar/blend libs? | No — calculator engine is self-contained, a faithful reference port | Refactor `ferment/sugar.ts` to share | Existing libs use *different* (intentional) approximations for canonical storage. Forcing a shared impl would break either the reference match or the storage semantics. Keep them separate; note in scope. |
| Assistant surface shape | ~6 domain-grouped read tools (so2 / sugar+ferment / additions / blending / fortification / convert), each with a small operation enum | 15-20 one-per-calc tools; ONE mega `winemaking_calculate` tool | 6 balances tool-selection accuracy (small, discoverable) against prompt bloat (all tools sent every turn, run.ts:66) and against a single unwieldy discriminated-union schema. |
| Read vs write for tools | `kind: "read"` | write w/ confirmation | Pure computation, no mutation. Bypasses the confirm gate + CI eval-coverage guard entirely. |
| `0.12` sentinel | Replicate the branch verbatim in the dosing helper | "Fix" it to a real factor | The reference reuses the factor slot as a mode flag for lbs/1000-gal; not replicating it yields wrong results (per the doc). Faithful port. |
| Page location | `/winemaking-calculator` under Winery nav | Under Setup/Reference | User asked for it "in winery"; it's a working tool, not config. |
| SO₂ Reduction formula | Include, labeled advisory / "validate against source UI" | Omit it | Completeness (boil the lake), but honestly flagged per the doc's caveat. |
| Static reference calcs (21/23/51) | Render as read-only reference content on the page | Omit; or fake inputs | They're genuinely useful reference (pH↔SO₂-effectiveness table, solution prep, fining dose ranges) with no math to compute. |
| Calc traceability | Dedicated append-only `CalculationLog` table (tenant-scoped, Phase-12 checklist) | Reuse the existing audit trail; log to app logs only | A first-class, queryable table gives durable per-tenant traceability + a readable history UI. App-log-only isn't queryable per tenant; the audit trail is for domain mutations, not advisory calcs. Append-only preserves integrity. |
| Who writes the log | A `logCalculation` server helper: page calls it via a **server action** (inside tenant context); assistant calc tools call it directly in their handler | Log from the assistant run-loop; client-side write | One helper, both doors. **Tension to flag for eng review:** the registry comment says "the tool layer never touches Prisma for writes," but this is audit telemetry, not a user-intended mutation, so calc tools stay `kind: "read"` (no confirmation) yet fire a best-effort log write. Eng review should confirm this is acceptable or propose a run-loop hook instead. |
| Log-write failure | Fire-and-forget / best-effort; never blocks the result | Transactional (fail the calc if log fails) | A calculator must always answer; losing one audit row is preferable to denying the winemaker a number. Log failures are caught + surfaced to server logs, not the user. |
| Reading the log | Recent-calc history panel on the page + `query_calculation_history` assistant read tool | Write-only (fire-and-forget, never surfaced) | Traceability requires the log be *retrievable*; the user explicitly wants to look up "what did the calculator say." Non-admins see their own calcs; admins see the tenant's (scoping mirrors existing read tools). |

## Review Revisions — LOCKED (2026-07-05, council + eng + design)

This plan was reviewed by council (Codex gpt-5.4 + Gemini 3.1-pro), eng, and design.
`council-feedback.md` has the raw findings. The decisions below are authoritative and
OVERRIDE any conflicting detail in the original units above. `/work` must honor them.

**Rollout (LOCKED): TWO PRs.**
- **PR1 — engine + page** (Units 1–10, 13): pure calc engine + `/winemaking-calculator`
  page. No DB, no migration, additive, low blast radius. Ships first.
- **PR2 — traceability + assistant** (Units 11, 12, 14, 15): `CalculationLog` + logging +
  assistant tools + history. Depends on PR1's engine.

**Engine correctness + safety (LOCKED):**
1. **Kill the `0.12` float sentinel** (Unit 1). Model rate units as
   `{ id, label, factor, mode: "multiply" | "divide" }` and branch on `mode`/`id`, never on
   the raw value `=== 0.12`. Delete the "guard by unit key" ambiguity in the old Unit 1.
2. **Shared input-validation layer + `DomainError`** (Unit 1, used by Units 2–9 + 12 + 14).
   One validator runs before compute AND before log: rejects non-finite, enforces `volume > 0`,
   Pearson's `init_alc < target_alc` (and spirit > target) so `(init−target)` is never 0,
   deacid non-zero denominators, valid unit enums. Compute throws `DomainError` (typed); the
   page shows it as an inline message, the assistant surfaces it as text. NEVER a silent NaN/∞.
3. **Molecular-SO₂ guard** (Unit 3). Standard target is 0.5–0.8 mg/L. If `molecularTarget < 0.2`,
   return a warning ("unusually low — standard is 0.5–0.8; did you mean 0.8?"). The motivating
   example's "0.08" is treated as a likely slip for **0.8**; echo the assumed value in output.
4. **Dangerous-calc red banner** (Unit 3 SO₂ Reduction = H₂O₂; Unit 7 copper). A
   `danger: true` descriptor flag → red banner in UI + explicit warning in assistant output.
   Copper: flag when target residual Cu exceeds the TTB ~0.5 ppm limit.
5. **Deacid factors** (Unit 6): ship the reference's revised **0.67 / 0.673 / 0.62** but mark
   the whole deacid calc `advisory: true` + "verify against bench trial / product label"
   (Gemini flags KHCO₃ 0.673 as a possible half-dose vs textbook ~1.33). Do NOT present as
   authoritative.
6. **pH blending** (Unit 9): KEEP the H⁺-space calc but label it an **ESTIMATE** with a hard
   "wine is buffered — the true blend pH needs a bench trial" disclaimer. Guard chaptalization
   to `currentBrix >= 0` (negative Brix is valid for SG but misbehaves in chaptalization).
7. **`CALC_ENGINE_VERSION`** (Unit 1): `export const CALC_ENGINE_VERSION = "1.0.0"`, bumped on
   ANY formula/constant change. Stamped into every log row (makes the log forensic — proves
   code-bug vs user-error even after a fix ships).

**Registry (LOCKED, Unit 10):** discriminated union `kind: "calc" | "static"` (no optional
`compute?`); registry stays **data-only / serializable** (no `ReactContent` in it — static
reference content maps by id at the page layer). The 6 assistant tool `inputSchema`s are
**generated from** each descriptor's `FieldSpec[]`, not hand-authored (DRY; no drift).

**Deferred from PR1 /review into PR2 (bundle with registry.ts changes):**
- **`doseDescriptor(cfg)` factory** — 5 registry descriptors (yeast/nutrient/acid/fining/oak) are
  structurally identical; extract a factory like `conversionDescriptor()` (DRY).
- **Typed unit readers replacing `as` casts** — registry computes cast `s(input) as VolumeUnit` etc.
  without membership checks; on the page the selects constrain units, but PR2's assistant tools feed
  LLM-supplied units, so route enum reads through `requireOneOf` (→ `DomainError`, not silent NaN).

**Traceability / tenancy (LOCKED, Units 11–12, 14):**
8. Use **`user.activeOrganizationId`** (NOT `ctx.user.tenantId` — that field doesn't exist,
   `src/lib/access.ts:15`). Assistant-flow logging MUST explicitly wrap in
   `runAsTenant(user.activeOrganizationId, …)` with a null guard (the assistant request has no
   ALS tenant context — `route.ts:90` calls `runAssistant({user})` directly).
9. `CalculationLog` (Unit 11): new table → `tenantId NOT NULL` from creation (no
   nullable→backfill→set-not-null dance). `CalculationSource` is a NEW enum → no Windows
   "enum-first" split (that rule is only for `ALTER TYPE … ADD VALUE` on an existing enum).
   Columns add `engineVersion String`, `formulaId String` (the calculator id), `userEmail
   String` (snapshot, survives rename/delete). Indexes: `@@index([tenantId, createdAt])`,
   `@@index([tenantId, userId, createdAt])`, `@@index([tenantId, calculatorId, createdAt])`.
10. **DB-enforced append-only** (Unit 11): the migration REVOKEs UPDATE + DELETE on
    `CalculationLog` from the `app_rls` role (grant only INSERT + SELECT). No edit/delete code
    path either. Tamper-resistant audit.
11. **Assistant calc tools stay PURE `kind:"read"`** (Unit 14 — redo). They do NOT call
    `logCalculation` in their handler (that broke the "read tools never write" contract, per
    both reviewers). Instead, `run.ts` gets a **post-tool-result hook**: after a successful
    `calc-*` tool result, the run loop calls `logCalculation({ source: "ASSISTANT", … })`
    best-effort inside `runAsTenant`. One logging path, contract intact.

**Page UX (LOCKED, Unit 13):**
12. **Explicit "Calculate" button** is the compute + log boundary (no live-on-keystroke, no
    debounce ambiguity, no keystroke flood).
13. **Search/filter bar** at top + pin the "big 3" (SO₂ addition, chaptalization, YAN) above
    the section list. Result is the visual anchor.
14. **Interaction state table** (add to Unit 13): incomplete → neutral "enter values" prompt
    (not an error); invalid → inline field error + `DomainError` message; computed →
    result + formula (`--font-mono`) + advisory `Badge` (`gold` advisory / `red` danger);
    history empty → warm "your calculations appear here for traceability"; history loading.
15. **Responsive + a11y** (add to Unit 13): mobile single-column, full-width selects, 44px
    targets, `inputmode="decimal"`, `aria-live="polite"` on the result region (announced when
    it computes), keyboard order inputs → Calculate. Unit inputs: a global Metric/US toggle
    with per-field override (native `<select>`), all via tokens.

**New tests (LOCKED):** `DomainError` cases (Pearson init==target → error not ∞; vol≤0;
molecular<0.2 warn; bad enum); `CALC_ENGINE_VERSION` present on every log row; the run-loop
logging hook writes an `ASSISTANT` row; DB-level append-only (an UPDATE/DELETE as app_rls is
rejected).

## Implementation Units

> NOTE: Units below are the original decomposition. Where they conflict with **Review
> Revisions — LOCKED** above, the LOCKED section wins.

### Unit 1: Engine foundation — unit-factor tables, dosing modes, validation, shared types

**Goal:** The shared primitives every calculator uses: unit-factor tables as `{id,label,factor,mode}` descriptors (no float sentinel), the dosing helper, the `DomainError` validation layer, `CALC_ENGINE_VERSION`, rounding, and shared TS types.
**Files:** `src/lib/winemaking-calc/units.ts` (new); `src/lib/winemaking-calc/validate.ts` (new, `DomainError` + guards); `test/winemaking-calc-units.test.ts` (new)
**Approach:** Port the factor tables from the reference doc but model rate units as `RATE_UNITS: { id, label, factor, mode: "multiply" | "divide" }[]` — the lbs/1000-gal unit is `{ id:"lbs_per_1000gal", factor:0.12, mode:"multiply" }`; everything else `mode:"divide"` (LOCKED revision #1: NO `=== 0.12` branch). `dose({volume, volumeUnit, rate, rateUnit, outUnit})` branches on the unit's `mode`. Also export `VOLUME_TO_LITERS`, `MASS_OUTPUT_FACTORS`, `LIQUID_OUTPUT_FACTORS`, typed enums + label maps for dropdowns. Canonical wobbly constants (US gal `3.7854`, oz `28.3495`), documented. `export const CALC_ENGINE_VERSION = "1.0.0"` (LOCKED #7). `validate.ts`: a `DomainError extends Error` + guards (finite, `volume>0`, enum membership, div-by-zero preconditions) reused by every calc (LOCKED #2). Reuse `round8` from `src/lib/cost/rollup.ts` or a local `round(n, dp)`.
**Tests:** Factor values match doc; `dose()` lbs/1000-gal uses the multiply mode + matches, g/L divides; a rate whose numeric value happens to be `0.12` under a `divide` unit still divides (proves the sentinel is dead); `DomainError` thrown on `volume<=0`, non-finite, bad enum.
**Depends on:** none
**Patterns to follow:** `src/lib/units/measure.ts` (pure, exported unit tables), `src/lib/ferment/sugar.ts:56` (round helper).
**Verification:** `npx vitest run test/winemaking-calc-units.test.ts` green.

### Unit 2: Conversions (Section 1)

**Goal:** Six unit converters — volume, mass, pressure, area, distance (factor-based) + temperature (special-cased °F↔°C).
**Files:** `src/lib/winemaking-calc/conversions.ts` (new); `test/winemaking-calc-conversions.test.ts` (new)
**Approach:** Implement `result_in_unit_i = (input × factor[current]) / factor[i]` over each base-unit factor table from the doc (volume base=L, mass base=g, pressure base=Pa, area base=m², distance base=m). Temperature is special: `°F = °C×9/5+32`, `°C = (°F−32)×5/9`. Expose one function per dimension returning all fields at once (the doc's "fill all fields simultaneously" behavior), or a generic `convertFactorBased(dimension, value, from, to)`.
**Tests:** Round-trip conversions; a few known values (1 acre = 4046.856 m²; 32°F = 0°C; 1 US gal = 3.78541 L).
**Depends on:** Unit 1
**Verification:** `npx vitest run test/winemaking-calc-conversions.test.ts` green.

### Unit 3: SO₂ (Section 2)

**Goal:** SO₂ as liquid solution, SO₂ as KMBS, SO₂ reduction (advisory), molecular↔free SO₂ (both directions).
**Files:** `src/lib/winemaking-calc/so2.ts` (new); `test/winemaking-calc-so2.test.ts` (new)
**Approach:** Port each formula: liquid solution `(((vol×volc)/ratec)×((rate/conc)×100))/sumc`; KMBS `((vol×volc)/targetc)×(target/0.576)/sumc` (0.576 constant); reduction `35/conc×tmp/concc` (flag advisory in output + doc comment); free-SO₂-for-molecular-target `molecular×(10^(pH−1.81)+1)`. **Reuse `SO2_PKA` from `@/lib/chemistry/so2.ts`** for 1.81; optionally re-export `molecularSO2()` for the derive direction so both directions live behind this module. This unit answers the user's motivating question.
**Tests:** Doc's worked examples: 1000 US gal +50 ppm 6% → 3154.5 mL; 1000 US gal +50 ppm → 328.59 g KMBS; 0.8 molecular @ pH 3.4 → 31.9 ppm free. The motivating case: 0.08 molecular... (note: doc examples use ~0.5–0.8; verify units — treat the user's "0.08 free molecular" as 0.8 mg/L or confirm at build time and encode whichever the reference intends).
**Depends on:** Unit 1
**Patterns to follow:** `src/lib/chemistry/so2.ts` (return object echoes inputs + pKa so assumptions are visible).
**Verification:** worked examples match to the doc's stated results.

### Unit 4: Fermentation & Sugar (Section 3)

**Goal:** Brix→alcohol (user factor), Brix→SG + sugar g/L, SG→{Brix,Baumé,Oechsle,alt,sugar}, SG temp correction, yeast dosing, nutrient dosing, YAN.
**Files:** `src/lib/winemaking-calc/sugar.ts` (new); `test/winemaking-calc-sugar.test.ts` (new)
**Approach:** Port using `261.3`, `145`, `259` constants and the temp-correction quadratic (`3.59e-6 T² + 6.971e-5 T − 1.51687e-3`). Yeast/nutrient dosing calls the `dose()` sentinel helper from Unit 1. YAN uses the per-product N-factor table (DAP 0.2127 … Nutrient Vit End 0.028) as an exported map driving a dropdown. Brix→alcohol takes a user-supplied factor (no baked constant). Keep separate from `src/lib/ferment/sugar.ts` (different math, per Key Decisions).
**Tests:** SG↔Brix round-trip via 261.3; SG=1.090 → Brix ≈ 21.6; YAN with DAP factor; temp-correction sign. Note in test comments that these differ from `ferment/sugar.ts`'s cubic approximation by design.
**Depends on:** Unit 1
**Verification:** `npx vitest run test/winemaking-calc-sugar.test.ts` green.

### Unit 5: Chaptalization & Water Dilution (Section 4)

**Goal:** Sugar-to-add to raise Brix; water-to-add to lower Brix (mass-balanced).
**Files:** `src/lib/winemaking-calc/dilution.ts` (new); `test/winemaking-calc-dilution.test.ts` (new)
**Approach:** Port chaptalization `(vol×volc×(target−current)/(denom−target))/outvolc` and the water-dilution mass-balance sequence (tmp4/tmp2/tmp11/tmp10/tmp8 → water volume) using the shared 261.3 SG.
**Tests:** A worked dilution: lowering must from Brix X→Y adds a positive, sane water volume; chaptalization raising Brix adds positive sugar mass.
**Depends on:** Unit 1
**Verification:** `npx vitest run test/winemaking-calc-dilution.test.ts` green.

### Unit 6: Acid Addition & Deacidification (Section 5)

**Goal:** Straight acid dosing; deacidification reagent mass for CaCO₃ / KHCO₃ / K-bicarb-alt at once.
**Files:** `src/lib/winemaking-calc/acid.ts` (new); `test/winemaking-calc-acid.test.ts` (new)
**Approach:** Acid = straight `((vol×volc×rate)/ratec)/sumc` (no 0.12 branch — this calc has no lbs/1000gal option). Deacid: `delta = current_TA/TAc − target_TA/TAc2`, then the three reagents via factors **0.67 / 0.673 / 0.62** (use the current uncommented trio per the doc; do NOT use the old 0.6669/1.334/0.9208).
**Tests:** Deacid returns three masses in the right ratio; using the revised factors; a positive TA drop → positive reagent mass.
**Depends on:** Unit 1
**Verification:** `npx vitest run test/winemaking-calc-acid.test.ts` green.

### Unit 7: Oak, Fining & Copper (Section 6)

**Goal:** Fining, oak (both dosing + 0.12 sentinel), copper as CuSO₄ (×3.93), copper as CuSO₄ solution.
**Files:** `src/lib/winemaking-calc/additions.ts` (new); `test/winemaking-calc-additions.test.ts` (new)
**Approach:** Fining/oak reuse the `dose()` sentinel helper. Copper anhydrous `vol×volc×(rate×3.93)/ratec/sumc`; copper solution `(((vol×rate)/volumec)×(((conc×3.93)/ratec)×100))/sumc` (3.93 constant both).
**Tests:** Fining lbs/1000-gal branch matches; copper ×3.93 salt mass for a target elemental Cu.
**Depends on:** Unit 1
**Verification:** `npx vitest run test/winemaking-calc-additions.test.ts` green.

### Unit 8: Fortification (Section 7)

**Goal:** Pearson's-square spirit volume; the "Sweet Spot" bench-trial dilution ladder (~29 rows).
**Files:** `src/lib/winemaking-calc/fortification.ts` (new); `test/winemaking-calc-fortification.test.ts` (new)
**Approach:** Pearson: `vol×volc×(target−actual)/(init−target)/outvolc` (alcohols entered as %, /100 internally). Sweet-spot: `ss = q5×((q3−q2)/(q1−q2))`, `dd = q5−ss`, then step alc down 0.10%/row for ~29 rows recomputing the two component volumes — return an array of rows (label the tool output "bench trial table").
**Tests:** Pearson raises actual→target with a positive spirit volume; sweet-spot returns a monotonic ladder with correct component split at the top row.
**Depends on:** Unit 1
**Verification:** `npx vitest run test/winemaking-calc-fortification.test.ts` green.

### Unit 9: Blending & Cost (Section 8)

**Goal:** Volume-weighted blend calculator with **chemically-correct pH blending** (H⁺ space); wine cost calculator (2.38 gal/case).
**Files:** `src/lib/winemaking-calc/blending.ts` (new); `test/winemaking-calc-blending.test.ts` (new)
**Approach:** Up to 6 components: total volume, volume %, simple weighted average for alcohol/TA/ppm; **pH via `Hi = 10^(−pHi)×Bi; H_avg = ΣHi/B8×10000; blend_pH = −log10(H_avg×10^−4)`** (the standout formula — replicate exactly). Wine cost: sum 6 cost buckets, %-of-total, weighted metric, composite `E9`, total cases `= B9/2.38`.
**Tests:** Two equal-volume components at pH 3.0 and 4.0 blend to a pH nearer 3.3 (log-correct), NOT the linear 3.5 — assert it differs from the linear mean. Cost: cases = total/2.38.
**Depends on:** Unit 1
**Verification:** `npx vitest run test/winemaking-calc-blending.test.ts` green; the pH-not-linear assertion passes.

### Unit 10: Calculator registry (declarative descriptors)

**Goal:** A declarative catalog tying every calculator's metadata (id, section, label, blurb, input fields + their unit options, output shape, advisory flag) to its compute function — so the page renders generically and the assistant tools map onto the same ids.
**Files:** `src/lib/winemaking-calc/registry.ts` (new); `src/lib/winemaking-calc/index.ts` (new barrel); `test/winemaking-calc-registry.test.ts` (new)
**Approach:** Export `CALCULATORS: CalcDescriptor[]` where each descriptor has `{ id, section, name, description, fields: FieldSpec[], compute(input): CalcResult, advisory?: boolean, staticRef?: ReactContent }`. `FieldSpec` declares field name, kind (number/select), unit-option set (referencing Unit 1's tables), default. The 3 static-reference calcs (21/23/51) carry `staticRef` content and no `compute`. Barrel re-exports engine fns + registry.
**Tests:** Every descriptor with a `compute` runs on its declared default inputs and returns a finite result (coverage guard — proves no descriptor is wired to a missing/throwing fn). Count assertion: 34 computational + 3 static = 37.
**Depends on:** Units 2–9
**Verification:** `npx vitest run test/winemaking-calc-registry.test.ts` green; count = 37.

### Unit 11: `CalculationLog` table + migration + RLS (Phase-12 checklist)

**Goal:** A tenant-scoped, append-only table that records every calculation for traceability.
**Files:** `prisma/schema.prisma` (edit — new `CalculationLog` model + `CalculationSource` enum); `prisma/migrations/<ts>_calculation_log/migration.sql` (new); `scripts/verify-tenant-isolation.ts` (edit — add a case); `test/tenant-isolation.test.ts` (edit — add a case); `docs/architecture/system-map.md` + registers if the ship brain-refresh flags it
**Approach (incorporates LOCKED #8–#10):** Model fields: `id`, `tenantId String NOT NULL` + `@@index([tenantId])` (new table → NOT NULL from creation, no backfill dance), `userId String` (FK → User), `userEmail String` (snapshot — survives rename/delete, no join for history), `calculatorId String` (registry id) + `formulaId String`, `section String`, `inputs Json`, `output Json`, `unitsUsed Json`, `source CalculationSource` (`PAGE` | `ASSISTANT`), `engineVersion String`, `advisory Boolean @default(false)`, `danger Boolean @default(false)`, `createdAt`. Composite indexes: `@@index([tenantId, createdAt])`, `@@index([tenantId, userId, createdAt])`, `@@index([tenantId, calculatorId, createdAt])`. Phase-12 checklist: FK → `organization(id)` ON DELETE RESTRICT; `ENABLE` + `FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy USING **and** WITH CHECK on `current_setting('app.tenant_id', true)`; NOT in `GLOBAL_MODELS` denylist; app_rls grants. **DB-enforced append-only (LOCKED #10):** grant app_rls only INSERT + SELECT, `REVOKE UPDATE, DELETE ON "CalculationLog" FROM app_rls`. `CalculationSource` is a NEW enum → create it in the same migration (no Windows enum-first split — that's only for `ALTER TYPE … ADD VALUE`). `migrate diff → deploy`, not interactive.
**Tests:** `test/tenant-isolation.test.ts` proves tenant A cannot read tenant B's rows; a test proves an UPDATE/DELETE as app_rls is REJECTED (append-only). `npm run verify:tenant-isolation` includes the new table.
**Depends on:** none (schema work; independent of the engine)
**Patterns to follow:** the Phase-14 `compliance_report` build (CLAUDE.md cites it as the checklist exemplar); `prisma-neon-migrations-windows` + Windows-enum learnings.
**Verification:** `npm run db:generate`; migration applies; `npm run verify:tenant-isolation` green.

### Unit 12: `logCalculation` server helper + server action + read access

**Goal:** One server-side helper both front doors call to append a log row (best-effort), plus a scoped read function powering the history surfaces.
**Files:** `src/lib/winemaking-calc/log.ts` (new, `"server-only"`); `src/app/(app)/winemaking-calculator/actions.ts` (new — server action wrapping `logCalculation` for the page)
**Approach:** `logCalculation(input)` writes a `CalculationLog` row via the extended `prisma` (tenantId auto-injected from session/ALS; if the assistant request lacks ALS tenant context, wrap in `runAsTenant(ctx.user.tenantId, …)`). **Best-effort:** wrap in try/catch, on failure log to server console + swallow (never throw to the caller) — satisfies the "must not block the result" requirement. Export `queryCalculationHistory({ userId?, calculatorId?, limit })` returning recent rows scoped like `query-brix` (non-admin → own userId; admin → tenant-wide). The page server action validates input shape then calls `logCalculation` with `source: "PAGE"`.
**Tests:** `test/winemaking-calc-log.test.ts` — `logCalculation` swallows a simulated write error (returns without throwing); `queryCalculationHistory` applies the non-admin userId scope. (Uses the `server-only` stub alias from `vitest.config.ts`.)
**Depends on:** Unit 11
**Patterns to follow:** `src/lib/assistant/tools/query-brix.ts` (scoped read), existing `*/actions.ts` server actions, `src/lib/tenant/context.ts` (`runAsTenant`/`requireTenantId`).
**Verification:** `npx vitest run test/winemaking-calc-log.test.ts` green; a manual calc on the page inserts a row (check via `npm run db:studio`).

### Unit 13: Calculator page + nav + logging

**Goal:** The `/winemaking-calculator` page under the Winery nav group: pick a calculator, enter inputs, read the result with formula + advisory note; each completed calc is logged.
**Files:** `src/app/(app)/winemaking-calculator/page.tsx` (new); `src/app/(app)/winemaking-calculator/CalculatorClient.tsx` (new); optional `CalculatorCard.tsx`; `src/components/AppShell.tsx` (edit — add `WINERY` entry ~line 22-30)
**Approach:** Page is a thin server component (so it can pass the logging server action + initial history down) → `"use client"` `CalculatorClient` island. Render the 8 sections as an inline accordion/tab strip (no Tabs primitive — build a minimal one or use `Collapsible`). For the selected calculator, render its `FieldSpec[]` as `Input type="number"` (unit affix via `iconLeft`/`iconRight`) + native `<select>` for unit pickers (options from Unit 1 tables), compute live on input via the descriptor's `compute`, show result in a `Metric`/`Card` with the formula string + advisory `Badge` when flagged. On a completed calc (debounced / on an explicit "Save to log" or blur — decide in build to avoid logging every keystroke), call the Unit-12 server action with `source: "PAGE"`. Static-ref calcs render their reference content. All styling via tokens. Add the nav entry.
**Tests:** No unit test for the page itself (client UI); covered by engine + log tests + manual QA. (Research found no React test setup — skip a render test.)
**Depends on:** Unit 10, Unit 12
**Patterns to follow:** `src/app/(app)/bulk/page.tsx` (server page → client island), `src/app/styleguide/page.tsx`, `src/components/cost/CostPanel.tsx`, `AppShell.tsx:22-30`.
**Verification:** `npm run dev`, visit `/winemaking-calculator`, confirm each section computes and a completed calc appears in `CalculationLog`; `npm run build` clean.

### Unit 14: Assistant calc tools + system-prompt knowledge + logging

**Goal:** PURE read-only assistant tools exposing the engine; logging happens in the run loop, not the tool (LOCKED #11); system prompt teaches the capability.
**Files:** `src/lib/assistant/tools/calc-so2.ts`, `calc-sugar.ts`, `calc-additions.ts`, `calc-blending.ts`, `calc-fortification.ts`, `calc-convert.ts` (new, ~6 domain tools); `src/lib/assistant/registry.ts` (edit — imports + `ALL_TOOLS`); `src/lib/assistant/run.ts` (edit — post-tool-result logging hook); `src/lib/assistant/prompt.ts` (edit — "Calculate" capability + advisory rule); optionally `test/evals/assistant-calc-tools.golden.ts` + a read-tool structural test (NICE, not CI-gated)
**Approach:** Each tool is `kind: "read"`, PURE — dispatches to the engine and returns `{ result, unit, formula, assumptions, advisory?, danger? }`. It does NOT touch Prisma (contract intact). `inputSchema` is **generated from** the domain's registry `FieldSpec[]` (LOCKED registry rule) with an `operation` enum of that domain's calc ids. In `run.ts`, add a post-tool-result hook: when a resolved tool name matches `calc-*` and the result is non-error, call `logCalculation({ source: "ASSISTANT", userId: user.id, userEmail: user.email, … })` best-effort inside `runAsTenant(user.activeOrganizationId, …)` (LOCKED #8, #11) — swallow failures. Register imports + array entries in `registry.ts`. In `prompt.ts`, add a bullet ("Calculate winemaking figures — SO₂, chaptalization, acid/deacid, blending, fortification, unit conversions") + a rule ("state the formula and assumptions; echo assumed values e.g. '0.8 mg/L molecular'; results are advisory, not a substitute for lab measurement"). The motivating question routes to `calc-so2` → free-SO₂-for-molecular-target (with the <0.2 guard).
**Tests:** Optional golden set (NL prompt → expected tool + operation; read tools are exempt from the D26/H8 CI gate per `assistant-tools.eval.test.ts:23`) + a cheap structural test that each tool's `inputSchema` is valid and `run` returns an object + writes a log row.
**Depends on:** Unit 10, Unit 12, Unit 3 (motivating case)
**Patterns to follow:** `src/lib/assistant/tools/query-brix.ts`, `src/lib/assistant/tools/report-anomalies.ts` (advisory read tool), `src/lib/assistant/registry.ts:27-69`.
**Verification:** Ask the assistant "1000 L tank, pH 3.4, free SO₂ 20 ppm — how much SO₂ to hit 0.8 molecular?"; confirm it calls `calc-so2`, returns the free-SO₂ target + KMBS/solution mass, no confirmation prompt, and a `CalculationLog` row with `source: ASSISTANT` is written; `npm run lint` + `npm run build` clean.

### Unit 15: Calculation history surface (traceability read)

**Goal:** Make the log retrievable — a recent-calculations panel on the page + an assistant tool to query past calculations.
**Files:** `src/app/(app)/winemaking-calculator/HistoryPanel.tsx` (new, or a section inside `CalculatorClient`); `src/lib/assistant/tools/query-calculation-history.ts` (new read tool); `src/lib/assistant/registry.ts` (edit — register it); `src/lib/assistant/prompt.ts` (edit — mention history lookup)
**Approach:** HistoryPanel shows the latest N `CalculationLog` rows for the current user (admins: tenant-wide) via the Unit-12 `queryCalculationHistory`, each row expandable to show inputs + output + calculator + timestamp + source. The `query_calculation_history` assistant tool (`kind: "read"`) wraps the same function so a user can ask "what SO₂ additions has the calculator suggested this week?" or "show my last blend calc." Scoping mirrors `query-brix` (own vs tenant).
**Tests:** Covered by the Unit-12 `queryCalculationHistory` scope test; add a structural test for the new tool's schema/run.
**Depends on:** Unit 12, Unit 13, Unit 14
**Patterns to follow:** `src/lib/assistant/tools/query-audit.ts` (a read tool over a log), `query-brix.ts` scoping.
**Verification:** History panel lists a calc just performed; the assistant answers a "show my recent calculations" question from the log.

## Test Strategy

**Unit tests:** One `test/winemaking-calc-*.test.ts` per engine file (Units 1–10), Vitest, mirroring
`test/trial-math.test.ts`. Each ports the reference doc's worked examples as assertions — these are
the ground truth. The registry test (Unit 10) is a coverage guard: every descriptor computes on its
defaults and the total is 37.

**Tenant isolation:** `test/tenant-isolation.test.ts` + `npm run verify:tenant-isolation` prove the
new `CalculationLog` table is RLS-isolated per tenant (Unit 11). `logCalculation`'s best-effort
failure path is unit-tested (Unit 12). `queryCalculationHistory`'s own-vs-tenant scoping is tested.

**Integration / assistant:** Optional read-tool golden set + structural validity test (Unit 14).
Not CI-gated (read tools are exempt), but cheap regression insurance for tool-selection.

**Manual verification:**
1. `/winemaking-calculator` page: for each of the 8 sections, enter the doc's example inputs and
   confirm the result matches the doc (e.g. KMBS 328.59 g, molecular→free 31.9 ppm).
2. Confirm each completed calc writes a `CalculationLog` row (`npm run db:studio`) with the right
   inputs/output/source and correct tenant.
3. Assistant: ask the motivating question in chat; confirm the tool call + correct answer, no
   confirmation prompt (read-only), and an `ASSISTANT`-source log row.
4. History: the recent-calc panel + `query_calculation_history` return the rows just created.
5. `npm run build`, `npm run lint`, full `npx vitest run`, `npm run verify:tenant-isolation` — no regressions.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Formula porting errors (unit branches, sentinel) | MED | HIGH | Test every calc against the doc's worked examples; the `0.12` sentinel gets an explicit test; registry coverage guard catches wiring gaps. |
| SO₂ Reduction constants (35/0.0014) are wrong/idiosyncratic | MED | LOW | Doc flags it; ship labeled advisory + "validate against source UI"; don't block the plan on it. |
| Confusion between calc engine and existing `ferment/sugar.ts`/`blend` libs (someone "unifies" them) | MED | MED | Scope note + test comments state they're intentionally separate (different approximations for different jobs). |
| 6 assistant tools bloat the prompt / hurt tool selection | LOW | MED | Domain grouping keeps it to 6; if selection is poor in QA, collapse toward fewer tools or sharpen descriptions. |
| Motivating example's "0.08 free molecular" unit ambiguity | MED | LOW | Reference examples use 0.5–0.8 mg/L molecular; confirm intended units at build time (Unit 3) and encode the reference's convention; surface the assumption in output. |
| No Tabs/Select primitive → inconsistent UI | LOW | LOW | Use `Collapsible` + native `<select>` (repo convention); keep it simple; can polish via `/design-review` later. |
| Read tool doing a Prisma (audit) write breaks the "tool layer never writes" convention | MED | MED | Flagged for eng review (Key Decisions). Best-effort audit-only write, no confirmation. If eng review objects, move logging to a run-loop hook that logs after any `calc-*` tool result. |
| `CalculationLog` RLS/tenant checklist mistake → leak or broken table | LOW | HIGH | Follow the Phase-12 checklist verbatim (all 9 steps); prove with `test/tenant-isolation.test.ts` + `npm run verify:tenant-isolation` before shipping. |
| Logging every keystroke floods the table | MED | LOW | Log only on a completed/confirmed calc (blur, explicit action, or debounce) — decided in Unit 13; assistant logs once per tool call naturally. |
| Windows enum/migration friction (`CalculationSource`) | MED | LOW | Isolated `ALTER TYPE`/create migration first; `migrate diff → deploy` not interactive `migrate dev`; stop dev server before generate (per learnings). |
| PII in the log JSON | LOW | MED | Inputs are numeric bench values + unit choices — no PII by construction; note it and keep it that way. |

## Success Criteria

- [ ] `src/lib/winemaking-calc/` engine covers all 34 computational calculators + 3 static refs.
- [ ] Every engine file has a `test/winemaking-calc-*.test.ts` asserting the doc's worked examples.
- [ ] Registry coverage-guard test passes: 37 descriptors, all computables return finite results.
- [ ] `/winemaking-calculator` page live under the Winery nav; each section computes correctly.
- [ ] ~6 read-only assistant tools registered; the motivating question is answered in chat with no
      confirmation prompt.
- [ ] System prompt teaches the calculate capability + advisory framing.
- [ ] `CalculationLog` table built to the Phase-12 checklist; every completed calc (page +
      assistant) writes a scoped row; log failure never blocks the result.
- [ ] History is retrievable: recent-calc panel + `query_calculation_history` tool return rows.
- [ ] `test/tenant-isolation.test.ts` + `npm run verify:tenant-isolation` prove `CalculationLog`
      isolation.
- [ ] `npm run build`, `npm run lint`, full `npx vitest run` green — no regressions.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (Codex+Gemini) | `/council` | Independent 2nd opinion | 1 | RESOLVED | 6 critical + 10 should-fix; all folded into LOCKED revisions (`council-feedback.md`) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | RESOLVED | 2 critical gaps (silent NaN, assistant-log-no-tenant) + E1–E3; fixed in LOCKED |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 4/10 → 8.5/10; 15 decisions applied (states, IA, a11y, search) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Codex + Gemini independently flagged the `0.12` float sentinel and the
  read-tool-writes-audit tension → both fixed. Gemini's domain catches (0.08 SO₂, H₂O₂ danger,
  deacid factor, pH buffering) drove 4 of the LOCKED safety revisions.
- **UNRESOLVED:** 0 — all four genuine decisions answered (pH keep+disclaimer, deacid
  revised+verify-flag, DB-enforced append-only, 2-PR rollout).
- **VERDICT:** COUNCIL + ENG + DESIGN complete, all findings resolved into the plan. Ready to
  implement PR1 (engine + page). Run `/work docs/plans/2026-07-05-040-feat-winemaking-calculator-plan.md`.
