---
title: Work-order template authoring by assistant + global assistant dock (Phase 9 / plan-034 Phase 2)
type: feat
status: completed
date: 2026-07-04
branch: feat/wo-assistant-phase2
depth: standard
units: 7
supersedes: "docs/plans/2026-07-03-034-feat-work-order-template-builder-plan.md (Phase 2, Units 10–13)"
---

## Overview

Ship the fast-follow to the work-order template builder: a **global assistant dock** (chat on every authed
page) plus **assistant tools that create/edit work-order TEMPLATES by chat**. A winemaker types "make a
weekly barrel-care template: rack, then add 30 ppm SO₂, then a checklist to top up" and the assistant composes
a valid template spec and shows a one-tap confirm. This is the first concrete step toward the flagship
NL/voice *work-order authoring* wedge — same D10 draft→confirm seam, same tool registry — but scoped to
authoring templates (the reusable WHAT), not executing live work orders.

## Problem Frame

Templates today are built through a form UI (Phase 1, shipped). That's fine for power users but it's the exact
retraining friction the product's wedge is meant to erase ("natural language instead of crew retraining",
STRATEGY §The wedge). Letting the assistant author templates: (a) proves the tool-authoring pattern on a
low-blast-radius surface (templates carry no vessels/lots/cost, no ledger writes), (b) puts the assistant one
tap from the work the manager actually does, and (c) exercises the D10/D20 seam that the later live-WO parser
reuses. Doing nothing leaves the AI wedge as a demo, not a workflow.

**Product note:** the value is only real if the assistant authors *valid, current* templates. The single
biggest failure mode is drift — the assistant's block/material knowledge going stale as the vocabulary grows
(it already rotted 3× via plans 035/036). The governing decision below (derive from the live model) is the
whole game.

## Requirements

- MUST: A global, collapsible assistant dock available on every authed route **except `/assistant`** (which
  is the full-page chat), reusing the existing `AssistantChat` — no second chat brain.
- MUST: Assistant tools to **list / get** templates (read) and **create / clone / update-spec / archive**
  templates (write, D10 confirm-nonce).
- MUST: Tool block/material knowledge **derives from the live model at call time** — `taskType` enum from
  `TASK_VOCABULARY` (NOTE/CRUSH/PRESS + future blocks flow in free); material references resolve to a real
  `CellarMaterial` via `materialDisplayName` + family vocab, **scoped to `isDoseableCategory` / `materialScopeForTask`**
  (WORKORDER-3). Never invent a material/family; unresolved → flag on the proposal.
- MUST: Reuse existing template cores (`createTemplateCore`, `updateTemplateSpecCore` = edit-as-new-version,
  `cloneTemplateCore`, `archiveTemplateCore`) and the assistant `registry`/`confirm`/`commit` seam. No new
  write engine, no schema change.
- MUST: Extend the **D26/H8 eval harness** — the coverage guard in `test/evals/assistant-tools.eval.test.ts`
  **fails CI** if a new write tool has no golden case. All 4 write tools get golden cases.
- MUST: Templates carry no cost — no currency surface here. If any cost is ever shown, it renders via
  `useCurrency`/`formatMoney`, never `$` (guardrail, not expected to fire).
- SHOULD: Dock is accessible (focus management, Escape, `prefers-reduced-motion`) and mobile-friendly.
- SHOULD: Keep each tool a clean typed unit so a later MCP server (D20/H6) re-exposes it unchanged — design
  the boundary, **do not build the server**.
- NICE: `TOOL_LABELS` entries so the dock shows friendly "Building a template…" status lines.

## Scope Boundaries

**In scope:** the global dock; 2 read + 4 write template tools + their committers + registry wiring; a pure
assistant template-context/material-resolution helper; eval golden cases + coverage; unit tests; the
read-helper additions the tools need.

**Out of scope:**
- **Live work-order authoring/execution by NL** (the flagship parser — resolve vessels, compute dose totals,
  compliance-validate, cost diff). That's a later, larger plan; this only authors templates.
- **MCP server exposure** (design the boundary; don't build it).
- **Fine-grained block-edit tools** (add_block/remove_block/reorder) — see Key Decisions (coarse-only).
- Any change to template cores, the template schema, or the vocabulary.
- Voice changes (the dock inherits whatever `voiceEnabled` the page uses; no new voice work).

## Research Summary

### Codebase Patterns
- **Assistant tool seam (reuse verbatim):** `AssistantTool` type + `ALL_TOOLS` + `getToolsFor(user)` in
  [registry.ts](src/lib/assistant/registry.ts:17); tool-use loop + proposal emit in
  [run.ts](src/lib/assistant/run.ts:82); NDJSON route [route.ts](src/app/api/assistant/route.ts:59);
  `signProposal`/`verifyProposal` (HMAC, 5-min TTL, UUID nonce) in [confirm.ts](src/lib/assistant/confirm.ts:29);
  `COMMITTERS` + `commitProposal` (burns nonce → exactly-once via `AssistantConfirmation` P2002) in
  [commit.ts](src/lib/assistant/commit.ts:28). Canonical example: [rack-wine.ts](src/lib/assistant/tools/rack-wine.ts:36)
  (`run()` resolves + builds preview + `signProposal`; committer calls the core).
- **Template engine (reuse verbatim):** [templates.ts](src/lib/work-orders/templates.ts:39) —
  `createTemplateCore`, `updateTemplateSpecCore` (new immutable version; rejects system; P2002 concurrent-edit
  surfaced), `cloneTemplateCore`, `archiveTemplateCore`/`unarchiveTemplateCore`, `createWorkOrderFromTemplateCore`.
  Vocab + validation [template-vocabulary.ts](src/lib/work-orders/template-vocabulary.ts:61): `TASK_VOCABULARY`
  (RACK/ADDITION/FINING/TOPPING/FILTRATION/CRUSH/PRESS/BRIX/PANEL/…/NOTE), `TemplateSpec`, `validateTemplateSpec`,
  `canonicalizeTemplateSpec`, `instantiateTasksFromSpec`. Existing admin actions in
  [work-orders/actions.ts](src/lib/work-orders/actions.ts:51).
- **Material resolution (mirror MaterialFilterPicker):** `materialDisplayName` [materials-shared.ts](src/lib/cellar/materials-shared.ts:51);
  `isDoseableCategory`/`materialScopeForTask`/`categoryOf`/`coerceFamily`/`familyLabel`/`BUILTIN_FAMILIES`
  [material-taxonomy.ts](src/lib/cellar/material-taxonomy.ts); `listMaterials`
  [materials.ts](src/lib/cellar/materials.ts:84); `rankMaterials` [material-search.ts](src/lib/inventory/material-search.ts:32);
  picker [MaterialFilterPicker.tsx](src/components/work-orders/MaterialFilterPicker.tsx:34).
- **Eval harness (hard gate):** [assistant-tools.eval.test.ts](test/evals/assistant-tools.eval.test.ts:55)
  structural eval validates every golden case against the REAL registry + a **coverage guard** that fails when a
  write tool has no golden case; LLM-in-loop under `ASSISTANT_EVAL=1` (`npm run eval:assistant`). Golden file
  `test/evals/assistant-write-tools.golden.ts`.
- **Dock mount:** no dock today — `AssistantChat` is only the full page [assistant/page.tsx]. Mount a new dock in
  [AppShell.tsx](src/components/AppShell.tsx:1) (already receives `user` + is client). `prefers-reduced-motion`
  hook already exists (`usePrefersReducedMotion` via `useSyncExternalStore`) in
  [Collapsible.tsx](src/components/ui/Collapsible.tsx) — reuse it, don't reinvent.

### Prior Learnings
- rstack learnings + context-ledger are **empty** for this topic; authority is `docs/api-strategy.md` (D20/H6),
  `docs/architecture/scale-register.md` + `TRIP-AI-EVAL.md` (D26/H8), and plan-034.
- **D10** (draft→confirm): write tools NEVER mutate on first call; already enforced by the confirm/commit seam.
  New write tools plug into it.
- **D26/H8** is a live CI gate — 4 new write tools without golden cases = red build. Non-negotiable.
- **Drift** has bitten 3×: derive block + material knowledge from the live model, never a hardcoded snapshot.
- Memory: [[phase9-1-work-orders-enhancements-shipped]], [[demo-winery-testing-convention]] (test in
  `org_demo_winery` via `runAsTenant`), [[assistant-feedback-loop-live]] (assistant tools are path-fenced;
  keep new tool files under `src/lib/assistant/`).

### External Research
None — all patterns are in-repo.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| **Edit-persistence model (the open decision)** | **Draft-in-conversation, persist once per confirmed change as a new version.** The model composes the full spec across chat turns (draft lives in the conversation, not a DB row); a single `update_template_spec`/`create_template` write call → one confirm → one new immutable version. | Version-per-turn with fine-grained add/remove/reorder tools; a persisted draft row | Coarse writes avoid version spam + confirmation fatigue, and map 1:1 onto `updateTemplateSpecCore` (which already = edit-as-new-version). No draft table needed. |
| Tool granularity | **Coarse: one tool per lifecycle verb** (create/clone/update-spec/archive), each taking a full spec. | Per-block mutation tools | Matches the persistence decision; keeps the MCP surface small + typed. |
| Dual-mount / shared history | **Dock is hidden on `/assistant`** so the dock and full page are never mounted together. | Reconcile two live `AssistantChat` instances against one `conversationId` | Sidesteps the reconciliation problem entirely for v1; history is already server-persisted by `conversationId`, so opening the page later still shows the thread. |
| Material resolution site | **In `run()` at propose time**, not in the static JSON schema. The model passes a material by NAME; the tool resolves name→`materialId` via `listMaterials` + `rankMaterials` scoped to `isDoseableCategory`, stores the resolved id in the signed token; the committer is deterministic. | Bake material list into the tool's inputSchema | Registry is module-level + tenant-independent; materials are per-tenant + dynamic. Resolving in `run()` (tenant ctx available) is the live-derive pattern and keeps commit deterministic. |
| `taskType` enum | **Derived from `Object.keys(TASK_VOCABULARY)`** at module load (tenant-independent) so the schema always lists current blocks. | Hardcode the enum | Anti-drift: future blocks (Phase-20 vineyard) appear automatically. |
| Write-tool access | **`adminOnly: true`** on the 4 write tools (mirrors the existing admin-gated template actions). Reads are non-admin. | Let any user author templates | Template management is an admin action today; keep parity. |
| Unresolved material / invalid spec | **Flag on the proposal, refuse to persist** (validate via `validateTemplateSpec` in `run()`; unresolved material → clear message listing what to add). | Auto-create the material / silently drop | Never invent domain data; the winemaker fixes it in setup then retries. |

## Implementation Units

### Unit 1: Template read helpers for the assistant

**Goal:** The read functions the list/get tools need, tenant-scoped with an explicit `tenantId` backstop.
**Files:** `src/lib/work-orders/data.ts`.
**Approach:** Confirm what Phase 1 already exposes (`getTemplateWithCurrentSpec`, `listWorkOrderTemplates`,
`listTemplatesWithSpec`). Add only what's missing: a detail read returning code/name/description/category/isSystem/
archivedAt + current spec (+ version count/lineage if cheap), and an `includeArchived` + task-count option on
the list read. Filter by tenant in the Prisma `where` as a backstop even though RLS + the extension scope it.
**Tests:** covered via Unit 6 (tool dispatch) + existing template tests; add a direct read test only if a new
helper has non-trivial shaping.
**Depends on:** none
**Patterns to follow:** existing reads in [data.ts](src/lib/work-orders/data.ts:87); tenant-explicit signature.
**Verification:** `npx tsc --noEmit`; the read tools (Unit 3) return real rows for `org_demo_winery`.

### Unit 2: Assistant template-context + material resolution (pure)

**Goal:** Pure, unit-tested helpers that (a) summarize the live block vocabulary for tool descriptions, (b)
resolve a material reference (name/brand/generic/family) → `{materialId, label}` or an unresolved flag, scoped
to doseable categories, and (c) render a human preview of a `TemplateSpec`.
**Files:** `src/lib/assistant/template-context.ts` (new), `test/assistant-template-context.test.ts` (new).
**Approach:** Derive the taskType list + each type's fields/options from `TASK_VOCABULARY`. Material resolution
takes an injected material list (so it's pure/testable) + a scope (`materialScopeForTask`/`isDoseableCategory`)
and runs `rankMaterials` over `materialDisplayName`; returns the top confident match or `{unresolved, tried}`.
Preview builds a readable "Rack → Add SO₂ 30 ppm → Note: top up" string from a spec.
**Tests:** resolves brand + generic + family; refuses a cleaning/packaging material for an ADDITION scope
(WORKORDER-3); unresolved → flagged; preview renders CRUSH/PRESS/NOTE; taskType summary includes CRUSH/PRESS/NOTE.
**Depends on:** none
**Execution note:** test-first for the resolution + scope logic.
**Patterns to follow:** [MaterialFilterPicker.tsx](src/components/work-orders/MaterialFilterPicker.tsx:54) scope +
`rankMaterials` usage; `isDoseableCategory` authority.
**Verification:** `npx vitest run assistant-template-context` green.

### Unit 3: Read tools — `list_templates`, `get_template`

**Goal:** Two read tools registered in the assistant so the model can see existing templates before editing.
**Files:** `src/lib/assistant/tools/templates-read.ts` (new), `src/lib/assistant/registry.ts` (register),
`src/app/(app)/assistant/AssistantChat.tsx` (`TOOL_LABELS`).
**Approach:** `kind: "read"` tools whose `run()` calls the Unit 1 helpers (tenant via `runAsTenant`/ctx). Return
compact JSON (id, code, name, category, task summary). No confirm.
**Tests:** Unit 6.
**Depends on:** Unit 1
**Patterns to follow:** a read tool in [tools/](src/lib/assistant/tools) + [registry.ts](src/lib/assistant/registry.ts:48).
**Verification:** dispatch returns Demo Winery templates; `getToolsFor` includes them.

### Unit 4: Write tools — `create_template`, `clone_template`, `update_template_spec`, `archive_template`

**Goal:** Four coarse, confirm-gated write tools that author templates via the existing cores.
**Files:** `src/lib/assistant/tools/templates-write.ts` (new; a `templateWriteTool()` DRY helper),
`src/lib/assistant/registry.ts` (register, `adminOnly: true`), `src/lib/assistant/commit.ts` (4 committers),
`src/app/(app)/assistant/AssistantChat.tsx` (`TOOL_LABELS`).
**Approach:** `inputSchema` describes a `TemplateSpec` with `taskType` enum derived from `TASK_VOCABULARY`
(Unit 2) + per-task `title`/`instructions`/`defaults`. `run()`: `validateTemplateSpec`; resolve any material
defaults name→id (Unit 2) scoped by the task's `materialScopeForTask` — unresolved → return a plain-text flag,
NOT a proposal; build a preview; `signProposal(tool, { ...resolvedSpec })`. Committers call the matching core
(`createTemplateCore`/`cloneTemplateCore`/`updateTemplateSpecCore`/`archiveTemplateCore`) with the resolved
args. Coarse = one new version per confirmed write (the persistence decision).
**Tests:** Unit 5 (eval) + Unit 6 (dispatch/nonce/scope).
**Depends on:** Unit 1, Unit 2
**Patterns to follow:** [rack-wine.ts](src/lib/assistant/tools/rack-wine.ts:36) (run→signProposal; committer→core);
[commit.ts](src/lib/assistant/commit.ts:28) registration.
**Verification:** a proposal round-trips (propose → confirm → new version); replaying a burned token → "already
confirmed"; a cleaning material in an ADDITION default → refused with a clear message.

### Unit 5: Eval coverage for the write tools (D26/H8 hard gate)

**Goal:** Keep CI green — every new write tool has a golden case; structural eval + coverage guard pass.
**Files:** `test/evals/assistant-write-tools.golden.ts` (add 4 cases).
**Approach:** Add one golden utterance per write tool (create/clone/update/archive) with the expected tool +
required args, matching the real schemas. Ensure the structural eval + the D26 coverage assertion pass. Note
`npm run eval:assistant` (LLM-in-loop) is opt-in and should be run before landing but isn't a blocking CI gate.
**Tests:** the eval file IS the test.
**Depends on:** Unit 4
**Patterns to follow:** existing entries in [assistant-write-tools.golden.ts](test/evals/assistant-write-tools.golden.ts)
+ the guard in [assistant-tools.eval.test.ts](test/evals/assistant-tools.eval.test.ts:76).
**Verification:** `npx vitest run assistant-tools.eval` green (coverage guard passes); optionally `npm run eval:assistant`.

### Unit 6: Template-tool unit tests

**Goal:** Lock dispatch, tenant scoping, exactly-once confirm, material scoping, and spec validation.
**Files:** `test/assistant-template-tools.test.ts` (new).
**Approach:** In `org_demo_winery` via `runAsTenant`: create/update/clone/archive round-trips (assert a new
version per update); nonce replay → rejected; an ADDITION default with a cleaning material → refused
(WORKORDER-3); an invalid `taskType` / bad field → `validateTemplateSpec` rejection; material rendered via
`materialDisplayName`.
**Tests:** this unit is tests.
**Depends on:** Unit 4
**Patterns to follow:** [work-order-templates.test.ts](test/work-order-templates.test.ts:1); `runAsTenant` harness
in `scripts/verify-work-orders.ts`.
**Verification:** `npx vitest run assistant-template-tools` green.

### Unit 7: Global assistant dock (+ a11y, reduced-motion, mobile)

**Goal:** A collapsible dock that brings `AssistantChat` to every authed page except `/assistant`.
**Files:** `src/components/assistant/AssistantDock.tsx` (new), `src/components/AppShell.tsx` (mount), possibly
`src/app/globals.css` (only if a reduced-motion global is needed beyond the existing hook).
**Approach:** Collapsed = accent FAB (lower-right, z-index 60, above modals/below the 1000 VoiceOverlay);
expanded = panel (~380px desktop, near-full-width < 768px) rendering `AssistantChat`. Persist collapsed in
`localStorage`; **lazy-init** (don't fetch history until first open); hide when `pathname === "/assistant"`.
A11y: focus moves into the panel on open, Escape closes, focus returns to the FAB; reuse the existing
`usePrefersReducedMotion` hook (from `Collapsible`) to drop the open/close transition. Tokens only (no hardcoded
colors), per DESIGN.md.
**Tests:** light render/interaction test if the `components/ui` convention has one; otherwise manual (dock opens,
hidden on `/assistant`, survives reload collapsed).
**Depends on:** none (independent of the tools; can build in parallel)
**Patterns to follow:** [AssistantChat.tsx](src/app/(app)/assistant/AssistantChat.tsx); `Button`/`Card` +
`usePrefersReducedMotion` in [Collapsible.tsx](src/components/ui/Collapsible.tsx); mount alongside existing
AppShell chrome.
**Verification:** `next build` clean; manual — FAB on `/bulk`, opens chat, can author a template end-to-end,
absent on `/assistant`.

## Test Strategy

**Unit/pure:** `assistant-template-context` (resolution + scope + preview) and `assistant-template-tools`
(dispatch/tenant/nonce/validation) are the core nets. **Eval:** the D26/H8 structural eval + coverage guard is a
hard CI gate — Unit 5 keeps it green; run `npm run eval:assistant` (LLM-in-loop) before landing to confirm the
model actually selects the right template tool. **Manual (Demo Winery):** open the dock on a non-assistant page,
say "make a weekly barrel-care template: rack T-something, add 30 ppm SO₂, add a checklist note to top up" →
confirm → the new template appears under `/work-orders/templates`; try to add a cleaning agent as a dose → refused.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New write tools ship without eval coverage → red CI | HIGH (guard is active) | MED | Unit 5 is mandatory; verify `assistant-tools.eval` before push. |
| Model authors a stale/invalid spec (drift) | MED | HIGH | taskType enum + material resolution derive from the live model (Units 2/4); `validateTemplateSpec` refuses invalid specs. |
| A cleaning/packaging material authored as a dose (WORKORDER-3) | LOW | HIGH | `run()` scopes resolution to `isDoseableCategory`/`materialScopeForTask`; Unit 6 asserts refusal. |
| Dock + page double-mount desyncs history | LOW | MED | Dock hidden on `/assistant`; history server-persisted by `conversationId`. |
| Confirmation fatigue / version spam | MED | MED | Coarse tools — one confirmed write = one new version. |
| Admin-gating mismatch (non-admin authors templates) | LOW | MED | Write tools `adminOnly: true`, matching existing template actions; `getToolsFor` filters. |

## Success Criteria

- [ ] Global dock on every authed page except `/assistant`; collapsible, lazy history, survives reload, a11y +
      reduced-motion honored.
- [ ] `list_templates` / `get_template` read tools return current templates; 4 write tools create/clone/update/
      archive via the existing cores through the D10 confirm-nonce (exactly-once).
- [ ] Block + material knowledge derives from the live model; unresolved material or invalid spec is flagged,
      never invented or silently dropped; cleaning/packaging never authored as a dose.
- [ ] D26/H8 structural eval + coverage guard green (4 golden cases added); `assistant-template-context` +
      `assistant-template-tools` tests green; no regressions.
- [ ] `next build` + tsc + eslint clean; tokens only (DESIGN.md); tool boundary stays MCP-portable (no server built).
