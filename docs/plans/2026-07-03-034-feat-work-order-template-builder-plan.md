---
title: Work-Order Template Builder + Global AI Assistant Dock
type: feat
status: phase-1-complete
date: 2026-07-03
branch: feat/work-order-template-builder
depth: deep
units: 13
---

## Overview

Let a tenant build their own named work-order templates by composing the operation blocks the
system already knows how to execute (rack, addition, fining, topping, filtration) plus maintenance,
observation, and a new free-text checklist block. Every block still ties to real vessels, lots, and
inventory and does the real ledger work at run time. Then surface the assistant as a global floating
dock so a user can say "build me a weekly barrel-care template with a rack and an SO₂ addition" and
the assistant sets it up through the same cores.

## Problem Frame

Today the work-order **engine** already supports tenant-authored, versioned, clone-on-customize
templates that compose multiple typed blocks across multiple vessels/lots
(`WorkOrderTemplate` + `WorkOrderTemplateVersion`, `createTemplateCore` / `cloneTemplateCore` /
`updateTemplateSpecCore` in [templates.ts](src/lib/work-orders/templates.ts), the typed vocabulary in
[template-vocabulary.ts](src/lib/work-orders/template-vocabulary.ts)). What's missing is the **UI**:
there is no screen to list, clone, create-from-scratch, reorder, name, edit, or archive templates.
The only template surface is [work-orders/new](src/app/(app)/work-orders/new/NewWorkOrderClient.tsx),
which issues a work order from a template that already exists.

If we do nothing, tenants are stuck with the 12 shipped system templates and cannot express their
own cellar workflow (e.g. "rack + addition on one sheet", "put an addition on every template"). This
is the single biggest gap between the engine's capability and what a winery can actually do.

The AI dock is additive leverage: the assistant already exists (one shared brain across text + voice,
tool-use loop, write-confirmation nonce gate — [registry.ts](src/lib/assistant/registry.ts),
[commit.ts](src/lib/assistant/commit.ts)). Making it globally reachable and teaching it the template
tools turns "compose a template" into a conversation, and lays the tool-boundary groundwork for MCP.

## Requirements

- MUST: A `/work-orders/templates` UI that lists tenant + system templates and supports: create from
  scratch, clone a system (or any) template, edit (→ new immutable version), reorder/rename blocks,
  archive.
- MUST: A template can contain many blocks targeting different vessels/lots (already supported by the
  spec = task list model; the builder must expose it).
- MUST: Compose only from the real, validated vocabulary (rack, addition, fining, topping, filtration,
  observation, maintenance). No free-form operation cells — validation stays in
  `validateTemplateSpec`.
- MUST: A new **free-text checklist/note block** that renders as a checkable line and writes NOTHING
  to the ledger, measurement store, vessel-activity log, or cost roll-up (respects WORKORDER-1/2/3).
- MUST: **Optional "what" defaults** (REVISED in council review — was "structure only"). The builder
  MAY pre-fill the WHAT of a block — material, rate, unit, filter medium, gas — so a template encodes an
  SOP ("Standard SO₂ Add = KMBS, 30 ppm"). It MUST NOT pre-fill the WHERE — vessels/lots stay chosen at
  run time (baked-in vessels go stale). All defaults are overridable at run time. Persisted via the
  existing per-task `defaults` field.
- MUST: **Frozen versioning** — editing creates a new immutable version; already-issued AND drafted work
  orders stay as-run (the WO snaps `templateVersionId` at creation, not just at issue); only future runs
  use the new version (reuse `updateTemplateSpecCore`).
- MUST: **Template authoring gated to winemaker/admin roles** (REVISED in council review — was "all
  users"). Cellar hands must not be able to alter shared SOPs. ALL users can still issue and run work
  orders from templates. Templates are tenant-isolated by the existing RLS on the template tables.
- MUST: A **global floating assistant dock** in the lower-right, present on every authenticated route,
  reusing the existing `AssistantChat` (same brain, history, voice, nonce confirmation). The
  standalone `/assistant` page keeps working.
- MUST: Template-authoring **tools** on the assistant that call the same cores through the existing
  confirm-nonce write gate.
- SHOULD: Reduced-motion + mobile-safe dock behavior (collapse to a button; never cover the mobile
  top-bar menu).
- SHOULD: Keep the assistant tool boundary clean and typed so it can later be exposed over MCP.
- NICE: Version-history view on the template detail page.

## Scope Boundaries

**Phasing (decided in eng review, 2026-07-03):** ship in two PRs.
- **Phase 1 (this PR) — Units 1–9:** the template builder UI + the `NOTE` checklist block (engine +
  all run-time surfaces) + thin server actions + read helper + archive core + nav. Fully usable
  without any AI.
- **Phase 2 (fast-follow PR) — Units 10–13:** the global assistant dock + the assistant template
  tools + their tests. The dock is reusable beyond templates, so it earns its own PR. Open decision
  carried to Phase 2: **assistant edit-persistence model** — persist each confirmed change as a new
  version (version-per-turn) vs. build a draft in-conversation and persist once at the end. Resolve
  when planning Phase 2 (affects Unit 12 tool design and the "shared history across two mounted
  `AssistantChat` instances" behavior).

> **Phase-2 refresh (2026-07-04) — account for drift before building.** Since Phase 1 shipped, the
> world under Unit 12 changed and the assistant MUST reflect it or it will author invalid/stale
> templates: (1) **the block vocabulary grew** — plan 035 added `CRUSH` (de-stem/crush) and `PRESS`
> (press/saignée) to `TASK_VOCABULARY` (alongside `NOTE`); (2) **the material model changed** — the
> material-taxonomy work made the main category *derive from `kind`* and added a customizable
> `subcategory` column + new `SUGAR`/`PACKAGING` kinds + the `MaterialFilterPicker`. The durable fix is
> the new Key Decision below: **the assistant's block + material knowledge DERIVES from the live model at
> tool-registration time, never a hardcoded snapshot** — so future vocabulary (e.g. Phase-20 vineyard
> blocks) flows in without another re-plan. Units 12 + 13 are revised accordingly; Units 10–11 (dock UI)
> are unaffected.

**In scope:**
- Template builder UI (list / detail / editor), thin server actions over the existing cores, one new
  read helper, an archive core, the new checklist block type (enum + vocabulary + execution + guard +
  all run-time render surfaces), and — in Phase 2 — the global assistant dock and the assistant
  template tools + their first tests.

**Out of scope:**
- MCP server exposure of the tools (design the boundary for it; do not build it).
- Baking in default **vessels/lots** (the WHERE) — only the WHAT (material/rate/unit/medium/gas) gets
  optional defaults; vessels/lots stay run-time.
- Recurring-template auto-generation (the `recurringCadence` field exists but generation is a separate
  deferred phase — leave the field editable-or-hidden, do not wire generation).
- Any change to how work orders are issued/executed from a template beyond supporting the new NOTE
  block (the new-WO flow already snaps a version and instantiates tasks).

## Research Summary

### Codebase Patterns

**Template engine (reuse verbatim):**
- Cores: `createTemplateCore`, `updateTemplateSpecCore` (edit = new immutable version; system templates
  locked), `cloneTemplateCore`, `createWorkOrderFromTemplateCore` — [templates.ts:25-147](src/lib/work-orders/templates.ts).
- Vocabulary + validation (pure, unit-tested): `TASK_VOCABULARY`, `TemplateSpec = { tasks: TemplateTaskSpec[] }`,
  `validateTemplateSpec`, `instantiateTasksFromSpec`, `instantiateTaskBuilds` —
  [template-vocabulary.ts:61-259](src/lib/work-orders/template-vocabulary.ts).
- Existing read helpers in [data.ts](src/lib/work-orders/data.ts): `listWorkOrderTemplates`,
  `getTemplateWithCurrentSpec`, `listTemplatesWithSpec`. **Missing:** a detail read with version
  lineage + archive state, and an archive core.
- System templates ship as data — [system-templates.ts](src/lib/work-orders/system-templates.ts) (12
  templates, `isSystem: true`).

**Server actions:** the `action()` wrapper resolves auth + tenant and calls the core inside
`runAsTenant` — [actions.ts:47-58](src/lib/actions.ts); work-order examples + `revalidateWorkOrders`
in [work-orders/actions.ts:34-65](src/lib/work-orders/actions.ts). Cores throw `ActionError`; catch
client-side and surface `e.message`.

**List/detail + Open|Archive toggle:** [work-orders/page.tsx](src/app/(app)/work-orders/page.tsx) +
[WorkOrdersTabs.tsx](src/app/(app)/work-orders/WorkOrdersTabs.tsx) branch on `searchParams.view`;
card list in [WorkOrdersClient.tsx:27-44](src/app/(app)/work-orders/WorkOrdersClient.tsx).

**Field rendering / pickers:** `renderField` in
[NewWorkOrderClient.tsx:47-121](src/app/(app)/work-orders/new/NewWorkOrderClient.tsx) drives fields
off `TASK_VOCABULARY`. The **builder is structural**, so it needs the block-type picker + block-list
UI, not the value inputs — the vocabulary's `fields` are shown read-only as documentation of what the
operator will fill in at run time.

**Assistant:** tool registry `ALL_TOOLS` + `AssistantTool` type (`{name, description, kind:
"read"|"write", adminOnly?, inputSchema, run}`) — [registry.ts:17-75](src/lib/assistant/registry.ts).
Write flow: a write tool returns `{ needsConfirmation, preview, token }` via
`signProposal()` ([confirm.ts:28-73](src/lib/assistant/confirm.ts)); confirmation burns a
single-use nonce (`AssistantConfirmation`, unique constraint = exactly-once) then runs the tool's
`Committer` — [commit.ts:28-62](src/lib/assistant/commit.ts); route
[api/assistant/confirm](src/app/api/assistant/confirm/route.ts). Tools receive `ToolContext = { user:
AppUser }` with `activeOrganizationId`; writes go through `runInTenantTx()`. Loop model is
`claude-opus-4-8`, 8-turn cap — [run.ts](src/lib/assistant/run.ts). `TOOL_LABELS` for UI status live
in [AssistantChat.tsx:45-61](src/app/(app)/assistant/AssistantChat.tsx).

**Chat component:** `AssistantChat({ userLabel, voiceEnabled })` is self-contained — local state +
`fetch`, no context/providers — so it drops cleanly into a dock. History is persisted server-side by
`conversationId`, so a dock instance and the `/assistant` page instance share the same store.

**App shell / design:** authenticated routes are wrapped by
[(app)/layout.tsx](src/app/(app)/layout.tsx) → client [AppShell.tsx](src/components/AppShell.tsx)
(mount the dock inside AppShell). Breakpoint 768px; mobile top bar at z-index 30, drawer/modal at 50,
VoiceOverlay at 1000 — put the dock at **z-index 60**. Reuse `Card` / `Button` / `Input` / `Textarea`
/ `Badge` / `Modal` / `Eyebrow` ([src/components/ui/](src/components/ui)) and the `ProposalCard`
confirmation pattern from [VoiceOverlay.tsx](src/app/(app)/assistant/voice/VoiceOverlay.tsx). Tokens
in [src/styles/tokens/](src/styles/tokens). Note: there is currently **no**
`prefers-reduced-motion` handling anywhere — add it for the dock.

**Tests + migration:** Vitest, `test/work-order-templates.test.ts` covers `validateTemplateSpec` /
`instantiateTasksFromSpec`. E2E guard `npm run verify:work-orders` +
`npm run verify:work-orders-enhancements` run against the **Demo Winery** tenant
(`org_demo_winery`, `runAsTenant`). Enum change follows the **Windows enum rule**: an isolated
`ALTER TYPE … ADD VALUE` migration committed/deployed on its own before any code references the value
(pattern: [prisma/migrations/20260703010000_work_order_enums](prisma/migrations)). Migrations use
`migrate diff → deploy` on Windows (see memory [[prisma-neon-migrations-windows]]); stop the dev
server before `db:generate`.

### Prior Learnings

- `LEARNINGS: 0` in the rstack store for this project. Relevant auto-memory:
  [[phase9-1-work-orders-enhancements-shipped]] (the MAINTENANCE lane + WORKORDER-3 overhead rule and
  the `Textarea` component), [[prisma-neon-migrations-windows]] (enum + migrate-diff/deploy flow),
  [[demo-winery-testing-convention]] (all test data in Demo Winery), [[raw-sql-tenant-scoping]]
  (use `runInTenantRawTx` if any raw SQL is added — not expected here).

### External Research

None required — no new libraries. The assistant already uses `@anthropic-ai/sdk`; the dock and tools
reuse existing infra.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|-------------------------|-----------|
| Free-text checklist block | New `WorkOrderTaskKind = NOTE` — a checkable line, completes straight to DONE, writes nothing | Reuse `OBSERVATION` | OBSERVATION routes to `completeObservationTaskCore` and writes a measurement row; a checklist item must write nothing. A dedicated inert kind keeps WORKORDER-1/2/3 clean and is greppable in the guard. |
| Builder value inputs | **Optional "what" defaults** (material/rate/unit/medium/gas); vessels/lots stay run-time (REVISED by council 2026-07-03) | Structure-only (original); allow ALL defaults incl. vessels | A template must encode an SOP to prevent cellar errors (Gemini). The engine already supports `defaults`; baking the WHAT is high value, baking the WHERE (vessels) goes stale. Overridable at run time. |
| Template authoring roles | **Winemaker/admin only** (REVISED by council 2026-07-03); all users still issue/run WOs | All users author (original) | Cellar hands editing shared SOPs → fragmented/corrupted procedures (Gemini). Add an RBAC gate on the authoring actions. |
| Versioning on edit | Reuse `updateTemplateSpecCore` (new immutable version each save) | In-place spec mutation | Decision 6 + existing invariant: issued work orders snap a `templateVersionId` and must stay as-run. |
| Assistant tool granularity | Coarse tools: `list_templates`, `get_template` (read); `create_template`, `clone_template`, `update_template_spec`, `archive_template` (write). Block add/remove/reorder is the model composing a full new spec and calling `update_template_spec`. | Fine-grained `add_block`/`remove_block`/`reorder_blocks` write tools | Each persisted edit is a new immutable version + one confirm-nonce prompt. Fine-grained writes would spawn a version + a confirmation per block (version spam, confirmation fatigue). Coarse tools = one version, one confirm per user intent. |
| Assistant block + material knowledge (refresh 2026-07-04) | **DERIVE from the live model at tool-registration time**: the block catalog the assistant sees is generated from `TASK_VOCABULARY` (block key → label + typed `fields` + `fieldOptions` + `hint`), and material lookup goes through a taxonomy-aware read (kind-derived category + `subcategory` + fuzzy, mirroring `MaterialFilterPicker`). | Hardcode the block list + a flat material list in the tool schema/description (a snapshot of the vocabulary at authoring time) | A snapshot silently rots the moment the vocabulary or material model changes (exactly what plan 035 + the taxonomy work just did). Deriving means CRUSH/PRESS/NOTE — and every future block (Phase-20 vineyard) — appear automatically, and material defaults resolve against the real catalog. One source of truth, no re-plan per addition. |
| Template writes via assistant | Keep on the confirm-nonce gate, `adminOnly: false` | Skip confirmation (not destructive) | All users may author (decision 5), but confirmation shows a preview of the block list and matches the existing write-tool pattern + UX rule 6 (confirm the consequential). |
| Dock mount | Inside `AppShell`, hidden on the `/assistant` route | Portal to `document.body`; render everywhere | Mounting in AppShell inherits the shell's client context and layout; hiding on `/assistant` avoids a chat-inside-a-chat. |
| MCP | Design the tool boundary to be MCP-portable; do not build the server | Build MCP now | Out of scope; the typed tool + committer split is already the right seam. |

## Implementation Units

### Unit 1: `NOTE` task-kind enum migration (isolated)

**Goal:** Add the `NOTE` value to `WorkOrderTaskKind` in its own migration so nothing references it in
the same transaction (Windows enum rule).
**Files:** `prisma/migrations/<ts>_add_note_task_kind/migration.sql` (create), `prisma/schema.prisma`
(add `NOTE` to the `WorkOrderTaskKind` enum only).
**Approach:** Hand-author `ALTER TYPE "WorkOrderTaskKind" ADD VALUE 'NOTE';`. No column/table/default
changes in this migration. Follow the `migrate diff → deploy` flow; regenerate the client with the
dev server stopped.
**Tests:** none (schema only); `npm run db:generate` succeeds and the enum type includes `NOTE`.
**Depends on:** none
**Execution note:** Land + deploy this migration before any code that uses `NOTE` (own commit).
**Patterns to follow:** `prisma/migrations/20260703010000_work_order_enums/migration.sql`.
**Verification:** `npx prisma validate` clean; `WorkOrderTaskKind` in generated client includes `NOTE`.

### Unit 2: `NOTE` block — vocabulary, inert execution, AND all run-time surfaces

**Goal:** Teach the vocabulary, the task-completion path, AND every run-time UI surface about a
checklist/note block that does no inventory work. (Expanded in eng review: a `NOTE` block that can't
be rendered/issued/printed is a broken feature — finding #1, the one critical gap.)
**Files:** [template-vocabulary.ts](src/lib/work-orders/template-vocabulary.ts) (add a `NOTE` entry to
`TASK_VOCABULARY`: `kind: "NOTE"`, `label: "Checklist item / note"`, `fields: { note: "text" }`, no
vessel/lot/material; `canonicalColumns` already returns nulls for it); completion dispatch in
[work-orders/execute.ts](src/lib/work-orders/execute.ts) and/or
[observations.ts](src/lib/work-orders/observations.ts)/[maintenance.ts](src/lib/work-orders/maintenance.ts)
(a `NOTE` branch that marks the task DONE with an optional `completionNote`, no approval gate, no
ledger/measurement/activity/cost write); `CreateTaskInput`/kind typing in
[lifecycle.ts](src/lib/work-orders/lifecycle.ts) if needed; **and the four run-time surfaces**:
`renderField`/task rendering in
[NewWorkOrderClient.tsx](src/app/(app)/work-orders/new/NewWorkOrderClient.tsx),
[ExecuteClient.tsx](src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx),
[WorkOrderDetailClient.tsx](src/app/(app)/work-orders/[id]/WorkOrderDetailClient.tsx), and
[PrintClient.tsx](src/app/(app)/work-orders/[id]/print/PrintClient.tsx) — each renders a `NOTE` task as
a checkable line with no vessel/lot/material pickers.
**Approach:** Mirror the OBSERVATION no-approval completion path but skip the measurement write —
completing a `NOTE` task is a pure state transition to DONE. Title carries the checklist item text;
`note` is optional detail. `validateTemplateSpec` accepts it with zero required fields. **Reject/undo
(finding, test gap):** a `NOTE` has no ledger op, so it must be EXCLUDED from the approval/review queue
and from `reverseOperationCore` dispatch; "undo" of a NOTE task is a plain state flip back to PENDING
(or is simply not offered). Make this explicit so the review queue and universal-undo don't choke on a
NOTE. **Exhaustiveness (Codex CRITICAL):** add `assertNever` to EVERY `WorkOrderTaskKind` switch —
including the `TemplateSpec`→`WorkOrderTask` instantiation path and any lookup-map/dispatcher, not just
the four renderers — so a missing `NOTE` case is a compile error, not a silent fallback. Add a totality
test enumerating kind consumers. **All-checklist work orders (council, folded):** a WO/template whose
tasks are ALL `NOTE` is valid (e.g. "morning glycol checks") — ensure the WO lifecycle can complete/close
it (completion driven by all tasks reaching DONE, not by any ledger posting existing).
**Tests:** extend `test/work-order-templates.test.ts`: `validateTemplateSpec` accepts a `NOTE` task;
`instantiateTasksFromSpec`/`instantiateTaskBuilds` map it to `kind: "NOTE"` with null canonical
columns; a NOTE task is not enqueued for approval and reject/undo is a clean state flip (not a
reverseOperationCore call).
**Depends on:** Unit 1
**Patterns to follow:** OBSERVATION handling in
[template-vocabulary.ts:103-114](src/lib/work-orders/template-vocabulary.ts) and the no-approval
completion in [observations.ts](src/lib/work-orders/observations.ts); run-time rendering in
[NewWorkOrderClient.tsx:47-121](src/app/(app)/work-orders/new/NewWorkOrderClient.tsx).
**Verification:** `npm test -- work-order-templates`; a `NOTE` task round-trips through instantiate AND
a WO containing a NOTE block can be issued, executed to DONE, shown in detail, and printed.

### Unit 3: Guard — a NOTE task writes nothing

**Goal:** Prove the checklist block never touches the ledger, measurement store, vessel-activity log,
or cost roll-up.
**Files:** [scripts/verify-work-orders-enhancements.ts](scripts/verify-work-orders-enhancements.ts)
(extend), possibly a note in the WORKORDER-3 invariant doc
[docs/architecture/invariants/](docs/architecture/invariants).
**Approach:** In the Demo Winery e2e, create + issue a WO containing a `NOTE` task, complete it, and
assert zero new `LotOperation`, measurement, `VesselActivityEvent`, `VesselActivitySupplyUse`,
`SupplyConsumption`, and `CostLine` rows attributable to it, and that it reaches DONE without an
approval step.
**Tests:** the script itself is the test.
**Depends on:** Unit 2
**Patterns to follow:** existing assertions in `verify:work-orders-enhancements` for the maintenance
lane (WORKORDER-3).
**Verification:** `npm run verify:work-orders-enhancements` green (run `npm run seed:demo-tenant`
first).

### Unit 4: Read helper + archive core for templates

**Goal:** Fill the two read/write gaps the builder needs.
**Files:** [data.ts](src/lib/work-orders/data.ts) (add `getTemplateDetail(tenantId, templateId)`
returning code/name/description/category/isSystem/clonedFromId/currentVersion/archivedAt + version
lineage; and make `listWorkOrderTemplates` return `archivedAt` + a task count and accept an
`includeArchived`/view flag), [templates.ts](src/lib/work-orders/templates.ts) (add
`archiveTemplateCore` / `unarchiveTemplateCore` setting `archivedAt`; reject on `isSystem`).
**Approach:** Reuse `runAsTenant` + Prisma includes; `getTemplateDetail` includes `versions`
ordered desc. **Compose, don't copy (eng review):** build `getTemplateDetail` on top of the existing
`getTemplateWithCurrentSpec` select rather than duplicating it. **Explicit tenantId (Codex):** thread
`tenantId` through these helpers and keep the tenant filter in the Prisma `where` as a backstop even
though RLS also enforces it (repo K12 — never rely on ambient ALS from a cached fn/RSC). Archive is a
soft-delete flag already present on the model; list queries filter `archivedAt IS NULL` unless archived
view. The list uses the lighter `listWorkOrderTemplates` (no full specs) plus a cheap block count — do
NOT load every spec just to count blocks.
**Tests:** unit-test `archiveTemplateCore` rejects system templates; `getTemplateDetail` returns
version lineage (in the e2e/verify harness under Demo Winery).
**Depends on:** none (independent of the NOTE units)
**Patterns to follow:** existing `getTemplateWithCurrentSpec` / `listTemplatesWithSpec` in
[data.ts](src/lib/work-orders/data.ts); `updateTemplateSpecCore`'s `isSystem` guard in
[templates.ts:62](src/lib/work-orders/templates.ts).
**Verification:** helper returns expected shape in a `runAsTenant("org_demo_winery", …)` harness.

### Unit 5: Server actions for template authoring

**Goal:** Thin, auth+tenant-scoped actions over the cores for the UI.
**Files:** [work-orders/actions.ts](src/lib/work-orders/actions.ts) (add `createTemplateAction`,
`updateTemplateSpecAction`, `cloneTemplateAction`, `archiveTemplateAction`,
`unarchiveTemplateAction`).
**Approach:** Wrap each core in the `action()` helper. **RBAC gate (council):** the create/update/clone/
archive/unarchive actions require a winemaker/admin role (reuse the app's existing role check); throw a
403-style `ActionError` otherwise. Read actions + issuing WOs stay open to all users. **Untrusted spec
(Codex CRITICAL):** the action accepts the spec as `unknown` and passes it to the core, which already
calls `validateTemplateSpec` server-side — harden that to **canonicalize** (strip unknown keys, return a
normalized `TemplateSpec`) and persist ONLY the sanitized object; never trust the client shape.
`revalidatePath("/work-orders/templates")` + the **detail path + version history** and
`revalidateWorkOrders()` so `/work-orders` and `/work-orders/new` pickers refresh (Codex: revalidation
was under-scoped). **Code generation (finding #2 + Codex):** users never type a `code` — auto-generate a
collision-resistant code server-side in a **bounded** retry loop (fresh candidate each attempt, cap
attempts, typed conflict after the cap; never reuse a candidate after P2002). **Concurrent-save
(finding #3 + Codex):** move `updateTemplateSpecCore`'s `currentVersion` read INSIDE `runInTenantTx`
(so the read and the `version+1` insert share one snapshot), and catch the P2002 to surface a friendly
"this template changed since you opened it — reload and reapply."
**Tests:** covered via the cores' tests + the e2e harness; assert `updateTemplateSpecAction` bumps
version to 2 on second save.
**Depends on:** Unit 4
**Patterns to follow:** `createWorkOrderFromTemplateAction` in
[work-orders/actions.ts:34-65](src/lib/work-orders/actions.ts); `action()` in
[actions.ts:47-58](src/lib/actions.ts).
**Verification:** actions callable from a client component; round-trip create→edit→clone→archive works
against Demo Winery.

### Unit 6: Templates list page + Open|Archive tabs

**Goal:** `/work-orders/templates` lists tenant + system templates with an active/archived toggle.
**Files:** `src/app/(app)/work-orders/templates/page.tsx` (server: fetch list by view),
`src/app/(app)/work-orders/templates/TemplatesTabs.tsx`,
`src/app/(app)/work-orders/templates/TemplatesClient.tsx`.
**Approach:** Mirror the work-orders list + `WorkOrdersTabs` `searchParams.view` branch. Cards show
name, system/custom badge, block count (NOT the internal `code`); system templates get a "Clone to
customize" affordance and a clear visual separation from custom ones. "New template" button routes to the
editor in create mode. **Empty state (Gemini):** since 12 system templates always exist, the list is never
truly empty, but when the tenant has no CUSTOM templates show a high-visibility CTA: "Clone a system
template or build from scratch." **Known limitation to note in-UI/docs (Gemini):** a cloned template does
NOT receive future system-template updates (Phase-1 limitation; revisit later).
**Tests:** none (thin view) — covered by manual verification + the design review.
**Depends on:** Unit 4
**Patterns to follow:** [work-orders/page.tsx](src/app/(app)/work-orders/page.tsx),
[WorkOrdersTabs.tsx](src/app/(app)/work-orders/WorkOrdersTabs.tsx),
[WorkOrdersClient.tsx:27-44](src/app/(app)/work-orders/WorkOrdersClient.tsx); `Card`/`Badge`/`Button`.
**Verification:** page renders both system + custom templates; tabs switch active/archived.

### Unit 7: Template detail page (read-only spec + version history)

**Goal:** View a template's current blocks, lineage, and actions.
**Files:** `src/app/(app)/work-orders/templates/[templateId]/page.tsx` (server),
`src/app/(app)/work-orders/templates/[templateId]/TemplateDetailClient.tsx`.
**Approach:** `getTemplateDetail` → render the block list read-only (each block's vocabulary label +
the fields the operator will fill at run time, shown as documentation), version history, and buttons:
Edit (custom only), Clone (any), Archive/Unarchive (custom only). System templates show Clone only.
**Tests:** none (view).
**Depends on:** Units 4, 5
**Patterns to follow:** detail rendering in
[WorkOrderDetailClient.tsx](src/app/(app)/work-orders/[id]/WorkOrderDetailClient.tsx); `Eyebrow`,
`Card`, `Badge`.
**Verification:** detail shows current spec + versions; buttons gated by `isSystem`.

### Unit 8: Spec builder/editor (the core UI)

**Goal:** Compose a template: add/remove/reorder blocks, name/describe, add checklist blocks, save.
**Files:** `src/app/(app)/work-orders/templates/[templateId]/edit/page.tsx` (server, edit mode),
`src/app/(app)/work-orders/templates/new/page.tsx` (server, create mode),
`src/app/(app)/work-orders/templates/TemplateEditorClient.tsx` (shared client editor).
**Approach:** Client editor holds a working `TemplateSpec` (blocks = `tasks[]`). "+ Add block" opens a
picker over `TASK_VOCABULARY` keys (grouped: operations / maintenance / observation / checklist). Each
block row: title (Input), instructions (Textarea), remove; reorder via ↑/↓ (drag-and-drop optional).
Checklist blocks (`NOTE`) show a title/text field only. **Optional "what" defaults (REVISED by council):**
each block also exposes value inputs for the WHAT of its vocabulary fields — material, rate, unit, filter
medium, gas — written into the block's `defaults`. It does **NOT** expose vessel/lot inputs (the WHERE
stays run-time). Reuse the exact field renderers from
[NewWorkOrderClient.tsx](src/app/(app)/work-orders/new/NewWorkOrderClient.tsx) but filtered to non-vessel
fields, and mark every default optional (empty = ask at run time). Template-level: name, description,
category (NO `code` field — auto-generated server-side per finding #2). **Constraints (Gemini):** name
required; cap blocks (~25) with a friendly message; `validateTemplateSpec` already requires ≥1 task;
duplicate names allowed (the auto-`code` is the unique key) but warn on an exact-name collision. Save calls
`createTemplateAction` (new) or `updateTemplateSpecAction` (edit → new version); clone entry point calls
`cloneTemplateAction` then routes into edit. Validate client-side with `validateTemplateSpec` before submit
(server re-validates + canonicalizes) and surface `ActionError` messages. Reuse DESIGN.md tokens and UI
components; sentence-case labels; use domain language (UX rule 5).
**Tests:** the pure `validateTemplateSpec` path is already unit-tested; add a test that a builder-shaped
spec (multiple blocks incl. `NOTE`, no defaults) validates and instantiates.
**Depends on:** Units 2, 5
**Patterns to follow:** block-list rendering in
[NewWorkOrderClient.tsx:240-253](src/app/(app)/work-orders/new/NewWorkOrderClient.tsx) (adapted to
structural editing); `Modal` for the add-block picker.
**Verification:** create-from-scratch, clone-then-edit, reorder, add checklist, edit→v2 all persist and
appear in the new-WO template picker.

### Unit 9: Navigation + cross-links

**Goal:** Make the builder discoverable.
**Files:** [AppShell.tsx](src/components/AppShell.tsx) (nav item, or a sub-link under Work Orders),
[work-orders/page.tsx](src/app/(app)/work-orders/page.tsx) and
[new/page.tsx](src/app/(app)/work-orders/new/page.tsx) ("Manage templates" link).
**Approach:** (design review) NESTED under Work Orders — a "Templates" tab/link within the Work Orders
area, NOT a new top-level sidebar item (templates are a sub-concept of work orders; ux-principle "actions
live on the thing they act on"). Plus a "Manage templates" / "Don't see what you need? Build a template"
link from the new-WO template picker.
**Tests:** none.
**Depends on:** Unit 6
**Patterns to follow:** existing nav items in [AppShell.tsx](src/components/AppShell.tsx).
**Verification:** template builder reachable in ≤2 clicks from anywhere (UX rule 3).

## Design Specifications (design review, 2026-07-03) — applies to Units 6–9

Text review against DESIGN.md + docs/architecture/ux-principles.md (design binary unavailable, no
mockups). All screens use design tokens + existing components only (`Card`/`Button`/`Input`/`Textarea`/
`Badge`/`Modal`/`Eyebrow`).

**Scope note:** authoring is a winemaker/admin **desk task**, so the *builder* (Units 6–8) is
**desktop/tablet-first**; the *run-time* surfaces (new-WO, execute, print — Unit 2) stay **mobile/
floor-first**. Both keyboard-accessible.

**Information architecture (Pass 1):**
- List card hierarchy: template **name** (primary) → **system/custom** `Badge` (secondary) → block count
  + category (tertiary, muted). System and custom visually separated.
- Flow: list → detail (read-only spec + version history) → editor. Every screen has a back/breadcrumb
  path (ux-principle #2, no dead-ends).

**Interaction states (Pass 2) — specify what the USER sees:**

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Templates list | skeleton rows | custom tab: CTA "Clone a system template or build from scratch"; archived tab: "No archived templates" | inline banner, retry | n/a | system always present |
| Editor | — | new template starts with 0 blocks + "Add your first block" prompt | inline field-level validation (via `validateTemplateSpec`) + a friendly server-error banner (incl. the concurrent-edit "reload" message) | toast + land on detail | draft not persisted until Save |
| Detail | skeleton | n/a (always ≥1 version) | not-found → back to list | — | archived → `Badge` + Unarchive |

**User journey (Pass 3):** after Save, land on the **template detail** with a primary
**"Create a work order from this"** action (closes the loop to the real job, ux-principle #2/#3).
Post-clone lands in the editor. Unsaved-changes guard on navigate-away in the editor.

**AI-slop guard (Pass 4):** the "+ Add block" picker is a **grouped labeled list** inside a `Modal`
(operations / maintenance / observation / checklist) — NOT an icon-in-circle card grid.

**Reorder + optional defaults (Pass 7):** reorder via **↑/↓ buttons** (keyboard-operable; drag-and-drop
is a later nicety, not v1). Each optional "what" default field renders with a **"Ask at run time"**
placeholder and is clearly optional, so "leave blank = operator fills in when running" is obvious.

**Responsive & a11y (Pass 6):** builder desktop/tablet-first; block rows stack cleanly on tablet.
Modal block-picker traps focus + closes on Escape (reuse `Modal`). Reorder buttons are real focusable
`Button`s with aria-labels. 44px min touch targets. Run-time NOTE rendering (Unit 2) is mobile-first.

---
## PHASE 2 — fast-follow PR (Units 10–13)

Deferred from this PR per the eng-review scope decision. Build after Phase 1 lands. Open decision to
resolve first: the **assistant edit-persistence model** (version-per-turn vs. draft-then-persist), which
drives Unit 12's tool granularity and how two mounted `AssistantChat` instances share history.

---

### Unit 10: Global assistant dock component

**Goal:** A collapsible lower-right dock that reuses `AssistantChat` on every authenticated route.
**Files:** `src/components/assistant/AssistantDock.tsx` (client), mount in
[AppShell.tsx](src/components/AppShell.tsx); pass `voiceEnabled` from
[(app)/layout.tsx](src/app/(app)/layout.tsx) down through `AppShell` (server-evaluated `voiceEnabled()`
gate, same as the `/assistant` page).
**Approach:** Collapsed = an accent FAB (`Button`) lower-right; expanded = a panel (~380px desktop;
near-full-width bottom sheet on mobile <768px) containing `<AssistantChat userLabel voiceEnabled />`.
z-index 60 (above modals, below VoiceOverlay). Persist open/closed in `localStorage`. **Hide the dock
on the `/assistant` route** to avoid a chat-in-a-chat. On mobile, position so it never covers the top-bar
menu button. **Lazy-init (eng review):** do not fetch conversation history until the dock is first
opened (it mounts app-wide via the layout). Verify the dock + `/assistant`-page `AssistantChat`
instances reconcile server-persisted history on open per the Phase-2 persistence decision.
**Tests:** none (interaction) — verified in QA/design review.
**Depends on:** none (independent of the builder units)
**Patterns to follow:** overlay/portal + token usage in
[Modal.tsx](src/components/ui/Modal.tsx) and [VoiceOverlay.tsx](src/app/(app)/assistant/voice/VoiceOverlay.tsx);
`Card`/`Button`.
**Verification:** dock appears on all routes except `/assistant`, opens/closes, chat + Talk work,
state persists across navigation.

### Unit 11: Dock accessibility + reduced-motion + mobile polish

**Goal:** Make the dock respectful and non-intrusive.
**Files:** `src/components/assistant/AssistantDock.tsx`, a small CSS block (dock styles /
`@media (prefers-reduced-motion: reduce)`) in [globals.css](src/app/globals.css) or a scoped module.
**Approach:** Focus management (focus the input on open, return focus on close), Escape to collapse,
`aria-expanded`/labels, trap-free but keyboard-navigable. Add the project's first
`prefers-reduced-motion` guard (disable the open/close transition when set). Ensure the FAB and panel
don't overlap critical controls at 768px and below.
**Tests:** none (a11y verified in design review).
**Depends on:** Unit 10
**Patterns to follow:** Escape handling in [Modal.tsx](src/components/ui/Modal.tsx); motion tokens
`--duration-normal` / `--ease-out`.
**Verification:** keyboard-only open/close works; reduced-motion disables animation; no overlap on
mobile.

### Unit 12: Assistant template tools

**Goal:** Teach the assistant to list, read, create, clone, edit, and archive templates through the
existing confirm-nonce gate.
**Files:** `src/lib/assistant/tools/template-list.ts` (read `list_templates`),
`src/lib/assistant/tools/template-get.ts` (read `get_template`),
`src/lib/assistant/tools/template-create.ts` (write `create_template` + committer),
`src/lib/assistant/tools/template-clone.ts` (write `clone_template` + committer),
`src/lib/assistant/tools/template-update.ts` (write `update_template_spec` + committer),
`src/lib/assistant/tools/template-archive.ts` (write `archive_template` + committer); register in
[registry.ts](src/lib/assistant/registry.ts) + [commit.ts](src/lib/assistant/commit.ts); add
`TOOL_LABELS` in [AssistantChat.tsx:45-61](src/app/(app)/assistant/AssistantChat.tsx).
**Approach:** Read tools query via the new `data.ts` helpers scoped to `ctx.user.activeOrganizationId`.
Write tools validate the incoming spec with `validateTemplateSpec`, build a human preview (the block
list), `signProposal(...)`, and return `{ needsConfirmation, preview, token }`; committers call the
same cores inside `runInTenantTx`. `adminOnly: false`. Block add/remove/reorder are handled by the
model calling `get_template` then `update_template_spec` with the full new spec (coarse-grained
decision). Keep each tool file a clean typed unit (MCP-portable seam; add a one-line comment noting the
MCP intent, do not build MCP). **DRY (eng review):** the six write tools share the
preview+`signProposal`+committer shape — factor a small `templateWriteTool()` helper so they don't
copy the confirm boilerplate.

**Vocabulary + material knowledge is DERIVED, not hardcoded (refresh 2026-07-04 — see the Key Decision).**
The `create_template`/`update_template_spec` input schema + the block guidance the model sees are
**generated from `TASK_VOCABULARY`** (one entry per block key with its `label`, typed `fields`,
`fieldOptions`, and `hint`) — do NOT enumerate a fixed block list in prose. This makes the current
catalog available automatically, including the transform blocks:
- **`CRUSH` (de-stem/crush) + `PRESS` (press/saignée)** — plan 035. CRITICAL: templates may set only the
  process **"what" defaults** these blocks expose (`destemmed`/`crusherOn`/`crushedPct`/`mustTempC`/
  `pressCycle` for crush; `op`/`pressCycle` for press). The assistant must **never bake in picks,
  fractions, vessels, or measured volumes** — those are captured at run time on the execute screen. The
  vocabulary already omits them from the block's `fields`, so deriving the schema enforces this
  structurally; add an explicit line in the tool description so the model doesn't invent them.
- **`NOTE` checklist block** — a title-carrying to-do that writes nothing (Phase 1).
- **Material defaults** on `ADDITION`/`FINING` blocks: resolve `materialId` through a **taxonomy-aware
  read** (main category derived from `kind` + the customizable `subcategory` + fuzzy match, mirroring
  `MaterialFilterPicker`), and know the new `SUGAR`/`PACKAGING` kinds — so the assistant picks a real,
  correctly-scoped material instead of guessing off a flat list. Prefer reusing the existing material
  read behind the picker; only add a small `find_material` read tool if the model needs lookup-by-name.
**Tests:** Unit 12 test file (see Unit 13).
**Depends on:** Units 4, 5 (cores/helpers) — can run in parallel with the UI units.
**Patterns to follow:** `log_brix` / `save_field_report` write-tool + committer pattern
([commit.ts:28-62](src/lib/assistant/commit.ts)); read-tool scoping in
[tools/query-brix.ts](src/lib/assistant/tools/query-brix.ts).
**Verification:** in the dock, "clone the barrel-top template and add a Brix reading" produces a
proposal card; confirming creates the template; declining does nothing.

### Unit 13: Assistant tool tests (first assistant test coverage)

**Goal:** Establish assistant tests and cover template tool dispatch + exactly-once confirmation.
**Files:** `test/assistant-template-tools.test.ts` (+ any small test helper for `ToolContext`).
**Approach:** Under `runAsTenant("org_demo_winery", …)`: assert `create_template` returns
`needsConfirmation` + a valid signed token and writes nothing before confirmation; the committer
persists exactly one template; replaying the same nonce is rejected (exactly-once); `update_template_spec`
bumps the version; `list_templates`/`get_template` are tenant-scoped. Validate that an invalid spec is
rejected with an `ActionError` message.
**Drift-coverage (refresh 2026-07-04):** (a) the derived block catalog the tool exposes **contains
`CRUSH`, `PRESS`, and `NOTE`** (guards against a hardcoded snapshot regressing); (b) a `create_template`
with a well-formed **CRUSH block carrying only "what" defaults succeeds**, while a spec that tries to bake
in `picks`/`fractions`/`destVesselId`/`outputVolumeL` is **rejected or stripped** (those keys aren't in the
block's vocabulary `fields`); (c) a material default resolves through the taxonomy-aware read (by
`subcategory`/`kind`, incl. a `SUGAR` or `PACKAGING` material).
**Tests:** this unit is the tests.
**Depends on:** Unit 12
**Patterns to follow:** tenant-scoped harness in
[scripts/verify-work-orders.ts](scripts/verify-work-orders.ts); nonce burn in
[commit.ts:45-62](src/lib/assistant/commit.ts).
**Verification:** `npm test -- assistant-template-tools` green.

## Test Strategy

**Unit tests (Vitest):** extend `test/work-order-templates.test.ts` for the `NOTE` block
(validate + instantiate, null canonical columns); new `test/assistant-template-tools.test.ts` for tool
dispatch, tenant scoping, and exactly-once confirmation.

**Integration / e2e guards (Demo Winery, `runAsTenant`):** extend
`npm run verify:work-orders-enhancements` to prove a `NOTE` task writes zero ledger/measurement/
activity/cost rows and needs no approval; keep `npm run verify:work-orders` green.

**Manual verification (QA + design review):**
1. `/work-orders/templates` lists system + custom; clone a system template; it becomes editable custom.
2. Create from scratch: add Rack + Addition + a checklist block targeting two different vessels; name
   + save; it appears in `/work-orders/new`.
3. Issue a work order from the custom template; confirm each operation block does the real ledger work
   and the checklist block is a checkable line that writes nothing.
4. Edit the template; confirm a new version is created and a previously-issued work order is unchanged.
5. Dock: open on several routes, chat, Talk (if voice enabled), confirm a write; verify it's hidden on
   `/assistant`, collapses on mobile without covering the menu, and respects reduced-motion.
6. Ask the dock to "build a weekly barrel-care template with a rack and an SO₂ addition"; confirm the
   proposal card, confirm, and see the template in the builder.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `NOTE` block accidentally routes through a side-effecting path | LOW | HIGH | Dedicated inert kind + Unit 3 guard asserts zero writes; WORKORDER-3-style assertion. |
| Enum migration bites the "same-tx" Postgres gotcha | MED | MED | Isolated `ALTER TYPE … ADD VALUE` migration deployed on its own before any reference (Unit 1). |
| Dock overlaps critical mobile controls / feels intrusive | MED | MED | Collapse to a FAB on mobile, hide on `/assistant`, z-index 60, reduced-motion; verified in design review (Unit 11). |
| Two `AssistantChat` instances (dock + page) confuse history | LOW | MED | Hide dock on `/assistant`; history is server-persisted by `conversationId` so instances stay consistent. |
| Fine-grained NL edits create version spam | LOW | MED | Coarse tools: model composes the full spec and calls `update_template_spec` once per intent. |
| Builder lets a user shoot themselves in the foot with a huge/empty template | LOW | LOW | `validateTemplateSpec` requires ≥1 task; client validation before save. |
| Scope creep across A+B+C in one PR | MED | MED | Units are independently shippable; A is usable without B/C. If reviews push back, split B+C into a fast-follow plan. |

## Success Criteria

- [ ] A tenant can create, clone, edit (→ new version), reorder, name, and archive templates at
      `/work-orders/templates`, composing multiple blocks across multiple vessels/lots.
- [ ] Templates compose only validated vocabulary blocks plus the new inert `NOTE` checklist block;
      no default field values are baked in.
- [ ] Issuing + executing a custom template does the real ledger/inventory work; the checklist block
      writes nothing (guard proves it).
- [ ] Editing a template does not alter already-issued work orders.
- [ ] All tenant users can author; templates are tenant-isolated.
- [ ] A global assistant dock is present on every authenticated route (except `/assistant`), reuses the
      one shared brain + voice + confirm-nonce gate, is mobile- and reduced-motion-safe.
- [ ] The assistant can list/read/create/clone/edit/archive templates via confirmed tool calls; the
      tool boundary is clean/typed for future MCP exposure.
- [ ] `npm run verify:work-orders`, `npm run verify:work-orders-enhancements`, and the new unit tests
      pass; no regressions in the existing suite or `npm run build`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (Codex + Gemini) | `/council` | Cross-LLM adversarial | 1 | REVISED | 3 product decisions reversed/confirmed + engineering folds (council-feedback.md) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (SCOPE_REDUCED) | 6 issues folded, 0 critical gaps remaining |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 6.5/10 → 9/10; states + journey + a11y specs folded; nav nested under Work Orders |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**ENG REVIEW (2026-07-03):** Scope reduced to 2 PRs — Phase 1 (builder, Units 1-9) now, Phase 2
(dock + assistant tools, Units 10-13) fast-follow. 6 findings folded into the plan: (1 critical, now
resolved) NOTE block must render across new-WO/execute/detail/print; (2) auto-generate template `code`
server-side, hide from UI; (3) friendly concurrent-save error; (4) NOTE reject/undo = plain state flip,
excluded from approval + reverseOperationCore; (5) compose getTemplateDetail, don't copy; (6) DRY the
6 assistant write tools + lazy-init the dock. One open decision carried to Phase 2: assistant
edit-persistence model (version-per-turn vs draft-then-persist).

**COUNCIL REVIEW (2026-07-03, Codex gpt-5.4-mini fallback + Gemini 3.1 Pro):** 3 product decisions
resolved by the user — (1) templates MAY now bake optional "what" defaults (material/rate/unit/medium/gas),
reversing the structure-only call; (2) template authoring gated to winemaker/admin (all users still
issue/run), reversing the all-users call; (3) `NOTE` stays an inline task kind. Engineering folds:
canonicalize the untrusted client `spec` server-side, bounded livelock-proof auto-`code`, move the
version read inside the tx, `assertNever` exhaustiveness on the NOTE kind, explicit `tenantId` in queries,
wider revalidation, builder caps + empty state, all-checklist WOs complete on all-DONE. Full detail:
`council-feedback.md`.

**DESIGN REVIEW (2026-07-03, text-only — no design binary):** 6.5/10 → 9/10. Folded interaction-states
table, post-save "create a work order from this" landing (no dead-end), grouped-list block picker (no
slop), desktop/tablet-first builder vs mobile-first run-time surfaces, keyboard reorder + Modal focus
trap, "Ask at run time" placeholders for optional defaults, unsaved-changes guard. Decision: Templates
nav is NESTED under Work Orders. See "Design Specifications" section.

**VERDICT:** ENG + COUNCIL + DESIGN all CLEARED for Phase 1. Ready to implement (`/work`).
