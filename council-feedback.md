# Council Feedback — Work-Order Template Builder (Plan 034, Phase 1)
**Date**: 2026-07-03
**Reviewers**: Codex (types + data layer; ran on gpt-5.4-mini fallback — primary failed), Gemini 3.1 Pro (product logic + UX)
**Plan**: docs/plans/2026-07-03-034-feat-work-order-template-builder-plan.md

## Critical Issues

### Product (Gemini)
1. **"No baked-in defaults" defeats the purpose of an SOP template (Decision #4, Unit 8).** The point of a
   work-order template in an ERP is to *prevent cellar errors* by encoding the standard: material = KMBS,
   rate = 30, unit = ppm. Forcing the operator to re-enter material + rate every run means the template
   prevents nothing. Gemini's fix: allow baking in **material, rate, unit** (the "what") while leaving
   vessels/lots to run time (the "where"). The data model already supports this (`defaults`), so excluding
   it is *more* work for a *worse* product. → **Reverses a locked decision — user call.**
2. **Multi-vessel multiplicity is muddled (Decision #1, Unit 8).** A structure-only builder has no vessel
   inputs, so "a template targets multiple vessels" can't mean the template names vessels. The existing
   run-time already handles this: the new-WO form's `VesselMultiSelect` fans one block out to N vessels at
   submit. Fix: template = a single ordered flow of blocks; at run time pick N vessels and multiplex.
   (Wording/clarity fix — already matches existing behavior. Folding.)
3. **Frozen versioning vs. in-flight drafts (Decision #6, Unit 5).** Confirm `templateVersionId` is snapped
   at WO *creation* (including DRAFT), not only at issue, so editing a template never mutates an open draft.
   (`createWorkOrderFromTemplateCore` snaps `version.id` at creation → already handled; add a verification.)

### Engineering (Codex)
1. **Client-shaped `spec` is not a trust boundary (Units 5, 8).** Accept `unknown` at the action boundary;
   validate + **canonicalize** on the server (reject/strip unknown keys), persist only the sanitized object.
   `validateTemplateSpec` currently reports errors but doesn't strip extra keys or return a normalized spec.
   (The cores DO call `validateTemplateSpec` server-side, so malformed specs are rejected — but canonicalize.)
2. **Auto-generated `code` retry loop is race/livelock-prone (Unit 5).** Bounded retry, fresh candidate each
   attempt, typed conflict after the cap. Never reuse the same candidate after a P2002.

## Design Questions
1. **Baked-in defaults** — allow optional material/rate/unit defaults in templates, or keep structure-only?
2. **Who can author templates** — all users (current Decision #5) or restrict to winemaker/admin?
3. **`NOTE` as an enum kind vs. a separate checklist store** — enum anti-pattern vs. one interleaved list.
4. **All-checklist work orders** — allow (completes when all boxes checked) or require ≥1 real operation?

## Suggested Improvements (folding into the plan)
- **Exhaustiveness (Codex):** `assertNever` on every `WorkOrderTaskKind` switch incl. the
  TemplateSpec→WorkOrderTask instantiation path (not just UI renderers) + a totality test.
- **Explicit tenantId in `where` (Codex):** keep the tenant filter in Prisma queries even with RLS (repo K12).
- **`updateTemplateSpecCore` reads `currentVersion` outside the tx (Codex):** move inside `runInTenantTx`
  (or retry once) so the version read and the insert share one snapshot.
- **Revalidation under-scoped (Codex):** also revalidate the detail path, version history, and the
  `/work-orders/new` picker.
- **Builder constraints (Gemini):** max blocks cap, name required, duplicate-name handling, min ≥1 task.
- **Empty state (Gemini):** custom-tab CTA "Clone a system template or build from scratch."
- **System-clone lineage (Gemini):** document that clones don't get future system-template updates (Phase-1
  limitation); clear system-vs-custom separation.
- **Migration gate (Codex):** enum migration live before Unit 2 code merges.

## Recommendations (my synthesis)
- **Q1 defaults:** ADOPT Gemini — allow *optional* defaults for the "what" (material/rate/unit/medium/gas),
  vessels/lots stay run-time. Strongest finding; reverses Decision #4.
- **Q2 permissions:** restrict *template authoring* to winemaker/admin; *all users* still issue/run WOs.
- **Q3 NOTE store:** KEEP `NOTE` as a task kind — ledger/cost/compliance read ledger tables, not
  `WorkOrderTask.kind`, so no query tax; interleaving needs one ordered list. Guard only approval queue + undo.
- **Q4 all-checklist WO:** ALLOW; ensure the WO lifecycle can complete a WO whose tasks are all `NOTE`.

---
## Raw Response — Codex (gpt-5.4-mini fallback)

CRITICAL
- Units 5 & 8: server-action boundary trusts a client-shaped `spec: TemplateSpec`. Not a trust boundary.
  Accept `unknown`, validate + canonicalize on the server, persist sanitized only.
- Unit 5 + @@unique([tenantId, code]): auto-generated `code` retry loop race-prone unless bounded and
  regenerates a fresh candidate each retry. Cap attempts, typed conflict, never reuse candidate after P2002.

SHOULD FIX
- Unit 2: NOTE is not just a type-union change. TS won't catch default branches, lookup maps, or
  stringly-typed dispatchers routing NOTE through a fallback — incl. TemplateSpec→WorkOrderTask instantiation.
  Add assertNever + a totality test.
- Unit 4: getTemplateDetail/listWorkOrderTemplates need explicit tenant predicates, not only ambient RLS.
- Unit 5: updateTemplateSpecCore reads currentVersion outside the tx then inserts version+1 inside. Brittle
  stale-read window. Read/lock inside the tx or retry once.
- Unit 5: revalidation under-scoped — won't refresh detail, version history, or the pickers.

DESIGN QUESTIONS
- Unit 1: define the gate proving the migration is live before any NOTE-bearing seed/fixture/client hits it.
- Unit 8: define the canonical server-side shape of `spec`; make validateTemplateSpec return a normalized spec.

---
## Raw Response — Gemini 3.1 Pro

CRITICAL
1. "No baked-in defaults" fallacy (Decision #4, Unit 8): templates must enforce SOPs — pre-select material
   (KMBS), rate (30), unit (ppm). Fix: bake material/rate/unit/gas, leave source/dest tanks to run time.
2. Multi-vessel multiplicity confusion (Decision #1, Unit 8): winemakers build ONE block and batch-apply to
   N vessels at run time. Fix: template = single linear flow; run time selects N vessels and multiplexes.
3. Versioning mutates in-flight drafts (Decision #6, Unit 5): need template_version_id snapped at draft
   creation; warn if a newer version exists.

SHOULD FIX
1. NOTE enum is a reporting nightmare (Units 1-3): every reporting/compliance/cost query needs
   WHERE kind != 'NOTE'. Fix: checklist_items JSONB column or a separate WorkOrderChecklist table.
2. All-Note template state machine trap (Units 3, 8): how does a checklist-only WO reach Completed if state
   relies on ledger postings? Require ≥1 operation, or treat pure checklists as a different feature.
3. Missing builder constraints (Unit 8): duplicate names, max blocks, empty. Add unique (tenant, name,
   not-archived), max block limit (~15), min 1 operation.

DESIGN QUESTIONS
1. "All users can author" (Decision #5): cellar hands should rarely edit SOPs. Restrict to Winemaker/Admin.
2. System vs custom clone lineage: clones orphan from future system updates. Document; separate in UI.
3. Empty state (Unit 6): custom tab empty initially — CTA "Clone a System Template or Build from Scratch."
