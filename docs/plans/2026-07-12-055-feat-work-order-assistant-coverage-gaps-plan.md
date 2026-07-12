---
title: Phase 10 slice — close the work-order assistant-coverage gaps
type: feat
status: shipped
date: 2026-07-12
shipped_prs:
  - "#144 (055a): Units 1-2 — BOTTLE NL authoring + packaging dry-goods"
  - "#149: Units 3-10 — equipment-service, group_rack_batch, per-task assignee/priority, commit unify"
branch: feat/wo-assistant-coverage-055
depth: deep
units: 10
depends_on:
  - docs/plans/2026-07-11-053-feat-work-order-builder-tasks-deps-plan.md
  - docs/plans/2026-07-12-054-feat-group-rack-progressive-completion-plan.md
---

## Overview

The work-order feature line is fully shipped, and the assistant already authors + manages + completes + reviews most of it via the rule-based NL engine (`propose_work_order`) + `create_work_order`/`manage_work_order`/`complete_task`/`review_task`. But four shipped capabilities are UI-reachable yet **the assistant can't touch them**: bottling, equipment service, progressive group-rack batch completion, and the Plan-053 planning fields (groups / per-task assignee / priority / deps). This plan closes the ones worth closing so "you can just tell the assistant" holds for the whole work-order surface — finishing the flagship AI wedge, not adding new product surface.

## Problem Frame

The assistant is the product's differentiator. An inconsistency where "add 30 ppm SO2 to T12 as a work order" works but "bottle T6 into 500 cases of Estate Cab" says *unsupported* reads as broken, not as a deliberate boundary — especially now that the bottling WO task actually exists (Plan 053 E15). Same for "service the press." The job: make the assistant's reach match the app's reach for work orders, without a parallel code path (WORKORDER-1: everything routes through the same deterministic cores the UI uses).

**Premise pressure-test (do we need all four?):** No — and the plan says so explicitly. Bottling + equipment authoring are cheap, high-value, and fix a real inconsistency → build. Group-rack batch completion is medium value (natural on the floor by voice) → build a focused tool. **The deep NL planning-fields work (auto-emit sequential groups / WO→WO deps from free text) is where a rule-based parser is brittle and the *visual builder* is the better surface** — the D14 "describe the job → draft into the builder → edit groups/assignee/priority visually" flow already gives the user that control where they can SEE the structure. So this plan wires the cheap, reliable slice of planning fields (per-task assignee + priority) and **consciously declines** NL auto-grouping / NL WO-deps, pointing at the builder instead.

## Review Outcomes (eng + council hardening, 2026-07-12) — READ BEFORE `/work`

This plan was hardened by `/plan-eng-review` + `/council` (Codex gpt-5.4 + Gemini 3.1 Pro). Decisions locked (they override the original unit text where they conflict; the units will be rewritten when this plan resumes):

- **SEQUENCING — PACKAGING FIRST, THEN THIS PLAN.** The council/bottling decision surfaced a real feature: bottling must consume **packaging dry goods** (bottles, corks, capsules/screw caps, labels, case boxes) — planned quantities picked from expendables at WO authoring, actual-consumed / remaining-restock at completion, capitalized into bottled-goods COGS (the `writeBottlingCostSnapshot` "dry goods later" TODO). That ships as its **own plan FIRST** (reuses the `PACKAGING` material kind + the Phase-8 reserve→deplete lifecycle). **Units 1, 2 (BOTTLE NL authoring) are BLOCKED until that lands** — then the assistant learns the complete bottling task (incl. packaging quantities) in one pass. Units 3-8 (equipment, group-rack, assignee/priority) are NOT blocked and can ship first as a smaller PR if desired.
- **D1 undo governance → LOOSEN:** executor self-undo of their own last group-rack batch while the task is `IN_PROGRESS` (no admin needed). Requires loosening the shipped 054 core `rejectGroupRackBatchCore` with a "same executor + still IN_PROGRESS" guard (admin still required to reverse a settled/PENDING_APPROVAL task). Small 054-core change folded into Unit 5.
- **D2 bottling depth → CAPTURE MORE:** author the BOTTLE task with the resolved source vessel(s) + an optional estimated case/bottle count (editable on the proposal card); defer only actual yield, TTB-measured ABV, exact destination lots to execute. (Kills Codex's "dead `vessel?` field" critique.) Packaging BoM comes with the packaging plan above.
- **D3 sequential grouping → PARTIALLY REOPEN:** parse simple same-WO ordering ("X and then Y", "followed by") into sequential `groupSeq`. STILL decline cross-order WO→WO dependency authoring (builder-only). Adds one unit; update the WON'T list below.
- **D4 batch commit → ALL-OR-NOTHING:** if any signed member of a `group_rack_batch complete` is no longer pending at confirm, reject the whole batch with a clear message and re-propose against the current pending set. No silent partial ledger writes.
- **Equipment attach (C1/C2/C3) — reconcile the contradiction:** route the assistant commit through `createWorkOrderFromBuildsAction` as the ONE deterministic path; equipment attaches INSIDE that action (not a post-create side effect); `equipmentIds` is read VERBATIM from the already-signed `taskBuilds[]` (never a new top-level field). Unit 4 must produce a commit-outcome **compatibility table** (ready / not-ready / draft-created / issue-failed / stale / nonce-replay / validation-error) proving semantics-preservation before the swap, and a contract test that a signed BOTTLE token commits through the new path. The "minimal attach-in-committer" fallback stays only if it preserves one-tx + the same signed input.
- **Clean folds (no decision needed):** reuse the signed choice-token picker for ambiguous ASSIGNEE (U7), not just equipment; commit-time revalidation of every signed id (equipment/member/assignee can go stale between propose+confirm); phase-order the shared-type work (`TaskBuild` + `CreateTaskInput` + `instantiateTaskBuilds` + constructors) BEFORE resolver branches (U2/U7/U8); a switch/exhaustiveness pass so every union/switch/tool-schema/signer-verifier fails closed at compile time (U9); tamper/replay/stale test cases (U9/U10 — modified/omitted equipmentIds post-sign, replayed nonce, expired freshness, stale subset, duplicate commandId, ambiguous-choice misuse); "all remaining" = proposal-time (sign concrete ids, re-check at commit); strict barrel-range validation vs pending+valid members with a clear confirm-card error; explicit empty-state for "complete the rest" on a 100%-done WO; merge-don't-replace when an utterance sets only assignee (don't wipe an existing priority); confirm `commandId` idempotency is stated in the completion contract (054 built it); confirm EQUIPMENT_SERVICE status flip stays at COMPLETION, not authoring (E16 already does).

Full detail: `council-feedback.md` (project root).

## Requirements

- MUST: the assistant can AUTHOR a bottling work-order task from NL ("make a WO to bottle T6 into the 2024 Estate Cab") — authoring only; source vessels / bottle count / measured ABV / destination stay run-time (execute sub-form), exactly like CRUSH/PRESS.
- MUST: the assistant can AUTHOR an equipment-service task from NL ("service the basket press", "clean and service pump P2, set it back to available"), resolving the equipment by name against the `EquipmentAsset` registry and attaching it to the task; ambiguous names return a choice picker (like materials do).
- MUST: the assistant can COMPLETE a progressive group-rack batch and UNDO the last batch via a new tool — "complete the barrel-down for B101–B104 on WO 210", "finish the rest of WO 210", "undo the last batch on WO 210".
- MUST: the assistant can set per-task ASSIGNEE (by name/email → resolved User id) and PRIORITY from NL where the user says them.
- MUST: every new/changed assistant WRITE surface has golden coverage (D26/H8 gate); `assistant-coverage.md` regenerated via `gen:assistant-coverage`.
- MUST: WORKORDER-1 holds — assistant paths route through the SAME cores (`instantiateTaskBuilds`/`createWorkOrderCore`, `runBottlingTx` via the execute BOTTLE dispatch, `completeGroupRackBatchCore`/`rejectGroupRackBatchCore`, `attachTaskEquipmentCore`); no parallel path, no model-originated ledger write. The readiness engine stays the one warning/cost/capacity system.
- SHOULD: the `propose_work_order` tool description stops claiming bottling/equipment are unsupported once they are.
- NICE: NL sequential-group ordering ("do X, then Y") emitting `groupSeq`.
- WON'T (consciously declined this plan): NL auto-authoring of WO→WO cross-order dependencies, and reliable NL sequential-group inference from prose — the visual builder (+ D14 draft-into-builder) is the right surface; rationale in Key Decisions.

## Scope Boundaries

**In scope:** NL authoring for BOTTLE + EQUIPMENT_SERVICE; a `resolveEquipment` name→id helper + equipment attach on the NL commit path; a new `group_rack_batch` assistant tool (complete-subset + undo-last); per-task assignee (email→userId) + priority on the NL path; golden + eval + `assistant-coverage.md` coverage; keep every gate green.

**Out of scope:** no schema change, no new Prisma enums (all cores + vocab already exist); no new work-order *features* (this is assistant wiring over shipped cores); NL WO→WO dependency authoring + NL sequential-group inference (declined — see Key Decisions); voice-specific UI; the facility/floor-cleaning lane (Phase 9.5, separately declined).

## Research Summary

### Codebase Patterns

- **"Add a task kind" recipe** (verified in `nl-proposal.ts` + `nl-resolve.ts` + `propose-work-order.ts`): (1) add the `{kind:"X"; …}` variant to `NlWorkOrderIntent` (`nl-proposal.ts:12-35`); (2) add `"X"` to `SUPPORTED` (`nl-proposal.ts:138-142`); (3) add a validate/normalize block in `canonicalizeRawIntents` (`nl-proposal.ts:219-433`); (4) add a resolver branch in `resolveDraftToTaskBuilds` (`nl-resolve.ts:323-624`) that `taskBuilds.push({ taskType, title, values, taskKey })`; (5) add the kind + any fields to the `propose_work_order` tool enum/schema (`propose-work-order.ts:127-132`, description at `:110`). The committer (`commitProposeWorkOrder`, `propose-work-order.ts:212-245`) is kind-agnostic — no change. `sanitizeTaskPayload` keeps run-time payload keys for governed built-ins, so a BOTTLE/GROUP_RACK-style branch can emit extra `values` freely.
- **CRUSH/PRESS = the "author now, fill run-time at execute" model** (`nl-resolve.ts:545-603`): they set only template process-defaults + pinned refs; picks/fractions/volumes are floor-entered. BOTTLE follows this exactly — emit `{skuName?, skuVintage?, note?}`, leave vessels/count/ABV/dest for `BottlingTaskForm`.
- **Vocab already defines both targets:** `BOTTLE` (`template-vocabulary.ts:280-286`, `opType:"BOTTLE"`, dispatch → `runBottlingTx` at `execute.ts:247-265`) and `EQUIPMENT_SERVICE` (`template-vocabulary.ts:241-248`, `kind:MAINTENANCE`, `activityType:"EQUIPMENT_SERVICE"`, `fields:{setStatus,note}`). Equipment rides `TaskBuild.equipmentIds` (`template-vocabulary.ts:417-419`), attached by `attachTaskEquipmentCore` (`equipment.ts:77`) — but only `createWorkOrderFromBuildsAction` (`actions.ts:210-218`) attaches today; the NL committer does NOT.
- **New-tool pattern = `manage_work_order`** (`manage-work-order.ts`): a discriminated `kind:"write"` tool with an `action` enum, per-action `signProposal`, and a committer that branches per action (`commit.ts` COMMITTERS map). Register in `registry.ts` ALL_TOOLS + `commit.ts` COMMITTERS. This is the model for `group_rack_batch` (action: complete|undo).
- **Group-rack completion is a separate core, not `complete_task`:** `completeTaskCore` treats a group-rack task one-shot (terminal guard `execute.ts:309-311`). Progressive batch = `completeGroupRackBatchCore` (`execute.ts:486`, input `GroupRackBatchInput`) + action `completeGroupRackBatchAction` (`actions.ts:356`); undo-last = `rejectGroupRackBatchCore` (`approval.ts:350`, admin) + `rejectGroupRackBatchAction` (`actions.ts:367`). Pending members come from `deriveGroupRackProgress(planned, attempts)` (`group-rack-progress.ts:72` → `pendingVesselIds`, `members[].code`). Member-range NL ("B101–B104") mirrors `resolveGroupMembers` + `normVesselCode` (`scope.ts:121`); the core already rejects non-pending selections.
- **Entity resolution:** `scope.ts` has `resolveVessel`/`resolveLotTarget`/`resolveWorkOrderTask`; there is NO `resolveEquipment` — add one mirroring the material fuzzy-match + choice-token pattern in `propose-work-order.ts:44-98` (`materialChoiceIfNeeded`), backed by `listEquipment(tenantId,{activeOnly:true})` (`equipment.ts:88`).
- **Planning fields are dropped on the NL path** (`nl-resolve.ts` never sets `groupSeq`/`assigneeId`; `instantiateTaskBuilds` defaults them to `0`/`null` at `template-vocabulary.ts:437-453`). Per-task assignee needs a NEW email→userId lookup in resolve (`assigneeId` must be a resolved id per the `TaskBuild` contract, and `assigneeId`/`assigneeEmail`/`groupSeq` are RESERVED_PAYLOAD_KEYS so they must ride as first-class columns, not in `values`). Per-task priority needs `TaskBuild` + `instantiateTaskBuilds` mapping (the `CreateTaskInput.priority` column already persists at `lifecycle.ts:142-147`).

### Prior Learnings

- Build in MAIN checkout, feature branch → PR to protected main; run `npx next build` before finishing any client-component PR (`check` CI skips it). `review` bot flaking max-turns is benign/non-required. Full `npx vitest run` before pushing (TASK_COVERAGE/eval gates only fully run there). `assistant-coverage.md` is GENERATED — regen with `gen:assistant-coverage`, never hand-edit.
- D14 already shipped the "assistant drafts into the builder, user edits visually" accelerator — the escape hatch that makes declining NL auto-grouping safe (the user still gets groups/assignee/priority, just in the builder).

### External Research

None — internal assistant/NL wiring over shipped cores.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Bottling + equipment via NL | **Extend `propose_work_order`** (new intents/resolver branches + tool enum), not new tools | Dedicated `bottle`/`service_equipment` tools | Authoring already lives in one tool; adding kinds is the established recipe, the committer is generic, and `propose_work_order` already has golden coverage. New tools would fragment authoring + need their own goldens for no benefit. |
| Group-rack batch completion | **New discriminated `group_rack_batch` tool** (action: complete \| undo) | Extend `complete_task` | `complete_task` has one committer → `completeTaskCore` (one-shot, terminal guard). Batch completion + admin undo are different cores/actions; branching one committer across three verbs is messier than a focused tool modeled on `manage_work_order`. |
| Equipment attach on NL commit | **Carry `equipmentIds` through `commitProposeWorkOrder` + call `attachTaskEquipmentCore`** | Leave equipment attach builder-only | Without it, an NL-authored equipment-service task has nothing to service. Mirror what `createWorkOrderFromBuildsAction` already does. |
| NL planning fields | **Wire per-task assignee + priority ONLY; DECLINE NL sequential-groups + NL WO→WO deps** | Full deep parser (groups/deps/location/scheduling from prose) | Assignee + priority are single-value, reliably parseable ("assign to Russell, high priority"). Sequential groups ("do X before Y") and cross-order deps are structurally ambiguous for a rule-based parser and are exactly what the *visual builder* + D14 draft-into-builder already do well (you SEE the group lanes). Building brittle prose-grouping is negative ROI. Declined with a pointer to the builder. |
| Ambiguous equipment / SKU | **Choice-token picker** (reuse `materialChoiceIfNeeded` pattern) | Free-text guess | Never let the model invent an equipment id or SKU; ambiguity → signed resume/choice token, same as materials. |

## Implementation Units

> Phased: **Phase 1** (Units 1-4) bottling + equipment authoring — cheap, high-value. **Phase 2** (Units 5-6) group-rack batch tool. **Phase 3** (Units 7-8) per-task assignee + priority via NL. **Cross-cutting** (Units 9-10) goldens/coverage + gates. Each phase is independently shippable as its own PR.

### Unit 1: BOTTLE NL intent + canonicalizer
**Goal:** The NL engine accepts a structured/utterance BOTTLE intent.
**Files:** `src/lib/work-orders/nl-proposal.ts`.
**Approach:** Add `{ kind:"BOTTLE"; vessel?; skuName?; skuVintage?; note? }` to `NlWorkOrderIntent`; add `"BOTTLE"` to `SUPPORTED`; add a `canonicalizeRawIntents` block (aliases skuName/wine/sku, skuVintage/vintage; all optional — authoring only). Optionally a `parseWorkOrderUtteranceForEval` regex ("bottle …"). Do NOT capture vessels/count/ABV (run-time).
**Tests:** unit — a raw `{kind:"BOTTLE", skuName, skuVintage}` canonicalizes; missing sku is allowed (defaults at execute); utterance "bottle T6 into the 2024 Estate" parses to a BOTTLE intent.
**Depends on:** none.
**Verification:** `npx vitest run test/work-order-nl-proposal.test.ts`.

### Unit 2: BOTTLE resolver branch (author-only)
**Goal:** A BOTTLE intent resolves to a `TaskBuild{ taskType:"BOTTLE" }` with SKU defaults only.
**Files:** `src/lib/work-orders/nl-resolve.ts`.
**Approach:** Add an `intent.kind === "BOTTLE"` branch in `resolveDraftToTaskBuilds` mirroring CRUSH: push `{ taskType:"BOTTLE", title:"Bottling", values:{ skuName?, skuVintage?, note? }, taskKey }` + a `ProposedTask` whose summary says "vessels, bottle count, ABV and destination entered on the floor." Readiness stays delegated to the shared engine.
**Tests:** covered by the Unit 9 e2e (author a BOTTLE WO via NL, assert one BOTTLE task, no ledger op at authoring, execute writes via runBottlingTx). **Eng-review add:** assert a BOTTLE-only NL proposal reaches `status: "ready"` and mints a commit token — BOTTLE is `TASK_COVERAGE: "runtime"`, so authoring must NOT block on missing vessels/count/ABV (those are floor inputs). A regression here would silently make bottling non-authorable.
**Depends on:** Unit 1.
**Verification:** `npx tsc --noEmit`; Unit 9 e2e.

### Unit 3: `resolveEquipment` helper + EQUIPMENT_SERVICE intent/resolver
**Goal:** NL authors an equipment-service task with the equipment resolved by name.
**Files:** `src/lib/assistant/scope.ts` (or a new `src/lib/equipment/resolve.ts`), `src/lib/work-orders/nl-proposal.ts`, `src/lib/work-orders/nl-resolve.ts`.
**Approach:** Add `resolveEquipment(text)` fuzzy-matching `listEquipment(tenantId,{activeOnly:true})` on name (norm() pattern), returning one/none/many. Add `{ kind:"EQUIPMENT_SERVICE"; equipment; setStatus?; note? }` intent + `SUPPORTED` + canonicalizer block (validate `setStatus` against EQUIPMENT_STATUSES). Resolver branch pushes `{ taskType:"EQUIPMENT_SERVICE", values:{ setStatus?, note? }, equipmentIds:[resolvedId], taskKey }`. Ambiguous equipment → choice token (extend `materialChoiceIfNeeded` or a sibling in `propose-work-order.ts`).
**Tests:** unit — resolveEquipment exact/fuzzy/ambiguous; canonicalizer validates setStatus. e2e in Unit 9.
**Depends on:** none (parallel to 1-2).
**Verification:** `npx tsc --noEmit`; targeted vitest.

### Unit 4: Unify the NL commit onto `createWorkOrderFromBuildsAction` + tool schema/description
**Goal:** An NL-authored equipment-service task actually attaches its equipment (and any deps), via ONE shared create path with the visual builder; the tool advertises bottling + equipment.
**Files:** `src/lib/assistant/tools/propose-work-order.ts` (`commitProposeWorkOrder`), possibly `src/lib/work-orders/actions.ts` (confirm `createWorkOrderFromBuildsAction` accepts the fields the NL commit needs).
**Approach (ENG-REVIEW DECISION — chosen "DRY" option):** Route `commitProposeWorkOrder` through **`createWorkOrderFromBuildsAction`** (the builder's action) instead of the bespoke `createWorkOrderAction` + `issueWorkOrderAction` pair, so equipment attach (`attachTaskEquipmentCore`) + WO→WO deps are handled by the one code path the builder already uses. `equipmentIds` rides inside the already-signed `taskBuilds[]` (a `TaskBuild` field — never a new top-level commit-args field; see Risks). CARE (bigger blast radius, flagged in review): (1) the readiness gate re-runs inside `createWorkOrderFromBuildsAction` — that's acceptable (idempotent, defense-in-depth) but confirm it doesn't double-warn or reject a proposal the NL path already passed; (2) preserve the NL commit's existing "draft created, not issued" recovery + freshness/nonce semantics — if the builder action's error shape differs, adapt the committer's catch; (3) map the NL commit args (title, assigneeEmail, dueAt, taskBuilds, dependsOnWorkOrderIds) onto the builder action's input. Add `BOTTLE` + `EQUIPMENT_SERVICE` to the tool's `tasks[].kind` enum + fields (`skuName`, `skuVintage`, `equipment`, `setStatus`); update the description (`propose-work-order.ts:110`) to stop saying bottling/equipment are unsupported.
**Tests:** e2e Unit 9 asserts the attached equipment row + (for equipment-service) status flip on completion; a regression assert that a plain NL WO (rack/addition) still creates+issues + still returns the "draft created, not issued" path when issue fails.
**Depends on:** Units 2, 3.
**Execution note:** highest-blast-radius unit — it changes the assistant commit path. Land it with the full assistant e2e (Unit 10) green before moving on. If the builder-action migration proves riskier than expected during `/work`, fall back to the "minimal" attach-in-committer approach (read `taskBuilds[].equipmentIds` + `attachTaskEquipmentCore`) and log a follow-up to unify later.
**Verification:** `npx tsc --noEmit`; `npm run eval:assistant`; the plain-WO regression + equipment e2e.

### Unit 5: `group_rack_batch` assistant tool (complete-subset + undo-last)
**Goal:** The assistant completes a member subset of a group-rack task, or undoes the last batch.
**Files:** `src/lib/assistant/tools/group-rack-batch.ts` (new), `src/lib/assistant/registry.ts`, `src/lib/assistant/commit.ts`.
**Approach:** Discriminated `kind:"write"` tool (undo admin-gated) modeled on `manage-work-order.ts`. `action:"complete"` → resolve the WO/task (`resolveWorkOrderTask`), confirm group-rack, expand the member ref (range/list, or "all remaining") intersected with `deriveGroupRackProgress().pendingVesselIds`, sign `{action, taskId, memberVesselIds, commandId}`. `action:"undo"` → sign `{action, taskId, reason?}`. Register in ALL_TOOLS + COMMITTERS; committer branches to `completeGroupRackBatchAction` / `rejectGroupRackBatchAction`. **Eng-review adds:** (a) the committer re-derives pending members at confirm time and lets `completeGroupRackBatchCore` reject a now-stale selection (defense-in-depth — the pending set can shift between propose and confirm); (b) `undo` is admin-only — `rejectGroupRackBatchCore` already enforces `canApprove`, so the tool must surface "admin only" gracefully for a non-admin rather than a raw FORBIDDEN.
**Tests:** unit for the member-range expander (intersect with pending; "all remaining"); e2e in Unit 9.
**Depends on:** none (parallel; different files from 1-4).
**Verification:** `npx tsc --noEmit`; `npm run eval:assistant`.

### Unit 6: Member-ref NL parsing for group_rack_batch
**Goal:** "B101–B104", "B101, B103 and B105", "the rest", "all remaining" resolve to pending member vessel ids.
**Files:** `src/lib/assistant/tools/group-rack-batch.ts` (or a shared helper), reuse `scope.ts` normalizers + `resolveGroupMembers`.
**Approach:** A pure expander: range (`B101-B104`), comma/and list, saved-group name, and "rest/remaining/all" → intersect with `pendingVesselIds` from the progress projection. Unknown/ already-done members → a clear message (the core also rejects non-pending).
**Tests:** unit — range, list, "all remaining", a member already done (dropped), an unknown code (error).
**Depends on:** Unit 5.
**Verification:** targeted vitest.

### Unit 7: Per-task assignee via NL (email/name → userId)
**Goal:** "assign the racking to Russell" sets the task's `assigneeId`.
**Files:** `src/lib/work-orders/nl-proposal.ts` (intent field), `src/lib/work-orders/nl-resolve.ts` (resolve + set on TaskBuild), a user-lookup helper (org members by name/email).
**Approach:** Add an optional `assignee?` per-intent field; in resolve, look up the org member (name/email → User id via the same source `listOrgMembers` uses) and set `taskBuilds.push({ …, assigneeId })`. `instantiateTaskBuilds` already forwards it. Ambiguous name → choice token or leave order-level. Never put assignee in `values` (reserved key).
**Tests:** unit — name resolves to id and lands on the task; ambiguous/unknown name does not crash (falls back). e2e in Unit 9.
**Depends on:** none (parallel).
**Verification:** `npx tsc --noEmit`; Unit 9.

### Unit 8: Per-task priority via NL
**Goal:** "high priority" / "urgent" sets the task (or order) priority.
**Files:** `src/lib/work-orders/nl-proposal.ts`, `src/lib/work-orders/nl-resolve.ts`, `src/lib/work-orders/template-vocabulary.ts` (`TaskBuild.priority` + `instantiateTaskBuilds` mapping to `CreateTaskInput.priority`).
**Approach:** Add optional `priority?` intent field (validate via `normalizeWorkOrderPriority`), add `priority` to `TaskBuild` + map it in `instantiateTaskBuilds` onto `CreateTaskInput` (column already persists). Set it in the resolver where stated.
**Tests:** unit — "urgent" normalizes + lands on the task; unknown priority ignored.
**Depends on:** none (parallel).
**Verification:** `npx tsc --noEmit`; Unit 9.

### Unit 9: Golden coverage + assistant-coverage doc
**Goal:** Every new/changed assistant write surface is covered; the coverage doc is current.
**Files:** `test/evals/assistant-write-tools.golden.ts`, `docs/architecture/assistant-coverage.md` (generated).
**Approach:** Add golden cases: `propose_work_order` bottling ("WO to bottle T6 into the 2024 Estate Cab"), equipment-service ("service the basket press, set it to maintenance"), per-task assignee + priority; `group_rack_batch` complete ("complete B101–B104 on WO 210") + undo ("undo the last batch on WO 210"). Run `npm run gen:assistant-coverage` and commit the regenerated doc. Confirm the D26 guard passes (the new `group_rack_batch` tool needs ≥1 golden).
**Tests:** `npm run eval:assistant` structural layer green; D26 coverage guard green.
**Depends on:** Units 4, 5-8.
**Verification:** `npx vitest run test/evals/assistant-tools.eval.test.ts`.

### Unit 10: End-to-end verify + gates
**Goal:** Prove the assistant paths write through the shared cores against live Neon; keep every gate green.
**Files:** extend `scripts/verify-work-order-nl.ts` (or a new `scripts/verify-wo-assistant-coverage.ts`).
**Approach:** Demo Winery e2e: author a BOTTLE WO via the NL proposal + commit → assert one BOTTLE task, NO ledger op at authoring, then complete it via the execute BOTTLE path → real BOTTLE op + finished goods (reuse the E15 assertions). Author an EQUIPMENT_SERVICE WO via NL → assert the equipment is attached; complete → status flips, no ledger op. Drive `group_rack_batch` complete + undo through the committers → assert the same DB effects as `verify:group-rack-progressive`. Assert per-task assignee + priority persist. Scrub QA fixtures.
**Tests:** the e2e assertions above.
**Depends on:** Units 1-8.
**Verification:** the new/extended verify script; then the full gate suite.

## Test Strategy

**Unit (vitest, node):** NL canonicalizer per new kind (Unit 1, 3); resolveEquipment + member-range expander (Unit 3, 6); assignee/priority mapping (Unit 7, 8).
**Golden/eval:** new `ASSISTANT_WRITE_GOLDEN` cases + D26 coverage guard (Unit 9); `npm run eval:assistant` structural (and gated LLM eval before ship).
**Integration/e2e (live Neon, Demo Winery):** author-via-NL + complete-via-core for bottling/equipment/group-rack-batch (Unit 10).
**Full gate suite before each PR:** `npx tsc --noEmit`, `npx eslint`, `npx next build` (if any client component touched — likely none here, assistant/NL is server-side), full `npx vitest run`, `npm run eval:assistant`, `verify:work-orders`, `verify:work-orders-transform`, `verify:group-rack-progressive`, `verify:work-orders-enhancements`, `verify:work-order-nl`, `verify:naming`, `verify:invariants`, `verify:ai-native` (+ `gen:assistant-coverage` committed).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Rule-based parser mis-parses bottling/equipment/assignee phrasing | MED | LOW | Authoring is confirm-gated (the user sees the proposal card before commit); ambiguity → choice token; goldens + gated LLM eval catch selection regressions. |
| `group_rack_batch` member-range mis-selects barrels | MED | MED | Intersect with `pendingVesselIds`; the core rejects non-pending; confirm card shows exactly which barrels; undo-last is available. |
| D26 coverage guard fails on the new tool | LOW | MED | Unit 9 adds the golden as part of the same PR; run full `vitest` before push (learned in 054). |
| Scope creep into the declined NL-groups/deps work | MED | MED | Explicitly WON'T-scoped; assignee+priority only; groups/deps stay in the builder (D14 draft-into-builder is the escape hatch). |
| verify:ai-native trips | LOW | LOW | Research confirms no new `*-core.ts`; cores already reachable. Regenerate + commit `assistant-coverage.md`. |
| Equipment attach on NL commit diverges from builder path | LOW | MED | Reuse `attachTaskEquipmentCore` (or route NL commit through `createWorkOrderFromBuildsAction`); e2e asserts the row + status flip. |
| Signed-payload integrity for equipment | MED | HIGH | `equipmentIds` MUST ride inside the already-signed `taskBuilds[]` (it's a `TaskBuild` field), never a new top-level commit-args field — else a client could attach arbitrary equipment post-signature. The committer reads `taskBuilds[].equipmentIds` and attaches after create. |

## Success Criteria

- [x] "Make a WO to bottle T6 into the 2024 Estate Cab" → assistant proposes a BOTTLE task; confirming creates+issues it; completing it on the floor writes the real BOTTLE op + finished goods (no authoring-time ledger write). _(055a, #144)_
- [x] "Service the basket press and set it to maintenance" → assistant proposes an EQUIPMENT_SERVICE task with the press attached; completing flips its status; no ledger/cost. _(#149)_
- [x] "Complete B101–B104 on WO 210" and "undo the last batch on WO 210" work via the new `group_rack_batch` tool through the shared batch cores. _(#149)_
- [x] "Assign the racking to Russell, high priority" sets the task's assignee + priority. _(#149)_
- [x] Declined: NL sequential-groups + NL WO→WO deps are documented as builder-only; D3 ships only the simple "X then Y" → `groupSeq` passthrough. _(#149)_
- [x] Goldens added for every new/changed write surface; `assistant-coverage.md` regenerated; D26 guard + `eval:assistant` green. _(#149)_
- [x] e2e proves the shared-core paths (`verify:work-order-nl`, 46 assertions vs live Neon); full gate suite green; no schema change. _(#149)_

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Grounded; the pressure-test (decline deep NL-groups/deps, point at the builder) is the key product call. |
| Scope Boundaries | HIGH | Clear in/out; the WON'T list is explicit with rationale. |
| Implementation Units | HIGH | Two research passes confirmed the exact recipes (add-a-kind, new-tool, planning-field flow) with file:line. |
| Test Strategy | HIGH | Reuses the golden gate + existing e2e harnesses (E15 bottling, verify:group-rack-progressive). |
| Risk Assessment | MEDIUM-HIGH | Main uncertainty is rule-based NL phrasing robustness — mitigated by confirm-gating + choice tokens + goldens, but real-world phrasing variety is the wildcard. |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Council (cross-LLM) | `/council` | Independent 2nd opinion | 1 | ISSUES ADDRESSED | Codex 6 CRITICAL + Gemini 3 CRITICAL; 4 decisions taken (self-undo, capture-bottling-source+estimate, simple-then-groups, all-or-nothing) + ~10 folds; surfaced the packaging-dry-goods feature → sequenced FIRST as its own plan. See council-feedback.md + Review Outcomes above. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 issues, 0 critical gaps; 3 folded, 1 decision (equipment attach → unify on `createWorkOrderFromBuildsAction`) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | DEFERRED | Deferred until this plan resumes — it's paused behind the packaging plan, and its bottling units will be reworked once packaging lands. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**ENG:** CLEAR. **COUNCIL:** issues addressed (see Review Outcomes). **CROSS-MODEL:** Codex (commit-path/integrity) + Gemini (floor UX) converged on the group-rack-undo governance + bottling-authoring-depth as the two biggest gaps — both resolved.
**VERDICT:** SHIPPED. The sequencing played out as planned: the packaging dry-goods bottling feature landed first (plan 056, #135/#136/#138), then Units 1-2 (BOTTLE NL authoring + packaging) shipped as **055a (#144)**, then Units 3-10 (equipment-service, `group_rack_batch` complete/undo, per-task assignee/priority, and the commit unify onto `createWorkOrderFromBuildsAction`) shipped as **#149**. All success criteria met; full gate suite green (incl. `verify:work-order-nl` at 46 assertions vs live Neon); no schema change. The assistant's reach now matches the app's across the whole work-order surface.
