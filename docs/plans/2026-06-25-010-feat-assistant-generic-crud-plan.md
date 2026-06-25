---
title: Assistant generic CRUD layer (config-driven, audited, confirm-gated)
type: feat
status: completed
date: 2026-06-25
branch: feat/assistant-chat
depth: deep
units: 6
---

## Overview

Let the in-app assistant create, edit, and delete domain records across the database "with
our say so" — not just Brix. Instead of hand-writing ~40 per-entity tools, we add a
config-driven CRUD layer: one **entity registry** describing each allowed model (how to find
a row, which fields are creatable/editable, how it's scoped, and its delete semantics) plus a
handful of **generic tools** (`db_find`, `db_create`, `db_update`, `db_delete`) that operate
over that registry. Every write keeps the Phase 1 guarantees: preview → confirm (signed
single-use token) → audited transactional commit. This builds directly on the Phase 1
assistant (`src/lib/assistant/**`).

## Problem Frame

Today the assistant can only do the specific writes we hand-coded (log/delete Brix, set
yield, adjust inventory). The user wants general CRUD so chat is a real admin surface ("delete
this block", "rename that vineyard", "create a location", "fix this wine's vintage"). Doing
nothing means every new editable entity needs a bespoke tool — slow, and it'll lag behind the
schema. The risk to manage: generic mutation over many tables is powerful and easy to get
wrong (deleting the wrong row, breaking referential integrity, exposing auth/audit tables). So
the design is "generic surface, tightly fenced by per-entity config" — never raw, arbitrary
writes.

## Requirements

- MUST: Create / edit / delete domain records via chat for an allowlisted set of entities.
- MUST: Reject protected entities entirely — **AuditLog** (immutable tamper record) and
  **User/Session/Account/Verification** (auth). Not findable-for-write, not creatable,
  editable, or deletable.
- MUST: Every write is preview-then-confirm (reuse `confirm.ts` signed single-use token +
  the `AssistantConfirmation` nonce burn; commit only via `/api/assistant/confirm`).
- MUST: Every write audited via `writeAudit` (CREATE/UPDATE/DELETE) with a `diff` + human
  summary, inside a transaction — identical to the form paths.
- MUST: Delete handling is relation-aware (the load-bearing safety piece):
  - **Restrict** children → the delete is blocked by the DB; detect first, refuse with counts
    ("can't delete: 23 Brix readings and 6 harvest records reference this block").
  - **Cascade** children → will be deleted; enumerate in the preview ("also deletes 5 blocks,
    4 field notes").
  - **SetNull** children → will be orphaned; note in the preview ("3 blocks will lose their
    variety").
- MUST: Inventory **quantity** changes go through the ledger (existing `moveStock`/
  `adjustStock`), never raw edits to `BottledInventory`/`FinishedGoodInventory`. Deleting a
  whole SKU is allowed (subject to Restrict checks).
- MUST: Destructive ops (delete) and cross-vineyard edits are **admin-only**
  (`adminOnly` gating in `getToolsFor`). Managers stay scoped to `assignedVineyardId` for
  vineyard-scoped entities (blocks, brix, harvest, field notes) via `scope.ts`.
- MUST: The LLM never runs raw SQL and never reaches Prisma for writes except through the
  entity config's allowlisted fields/operations.
- SHOULD: Field-level validation per entity (types, ranges, enums, FK existence) before a
  proposal is signed.
- SHOULD: `db_find` disambiguates (returns candidates) rather than guessing a target.
- NICE: The entity registry is shaped so a future `/sync-mcp` can extend it for new models.

## Scope Boundaries

**In scope:** `src/lib/assistant/entities.ts` (entity registry), relation-introspection
helper, generic tools (`db_find`/`db_create`/`db_update`/`db_delete`), commit wiring, scoping
+ admin gating, field validation, prompt + UI updates, pure-logic tests. Entities:
`WineSku`, `FinishedGood`, `FinishedGoodCategory`, `Vessel`, `Location`, `Variety`,
`Vineyard`, `VineyardDetail`, `VineyardBlock`, `FieldNote`, `BrixLog`, `HarvestRecord`,
`HarvestPick`. `BottlingRun` read-only (find) only.

**Out of scope (explicit follow-ups):** editing/deleting `AuditLog` or `User`/auth via chat
(forbidden by design); raw inventory balance edits; vessel-to-vessel racking (its own Phase 0
action); the MCP server; conversation persistence (separate plan 009 — do not collide; both
touch `src/lib/assistant/` and `prompt.ts`, so coordinate the prompt/registry edits).

## Research Summary

### Codebase Patterns
- **Assistant tool shape** — `src/lib/assistant/registry.ts`: `AssistantTool { name, description,
  kind: "read"|"write", adminOnly?, inputSchema, run(ctx,input) }`; `getToolsFor(user)` filters
  `adminOnly`. Write tools return `{ needsConfirmation, preview, token }`; `run.ts` emits a
  `proposal` event and never commits inline.
- **Confirm protocol** — `src/lib/assistant/confirm.ts` (`signProposal(tool,args,ttl)` /
  `verifyProposal`), `src/lib/assistant/commit.ts` (`COMMITTERS` map; `commitProposal` burns
  the `AssistantConfirmation` nonce in a txn, then runs the committer); commit route
  `src/app/api/assistant/confirm/route.ts`.
- **Scoping** — `src/lib/assistant/scope.ts` (`scopedVineyardWhere`, `findScopedBlocks`),
  `canManagerAccessVineyard` (`src/lib/access.ts:31`), `AppUser.role`/`assignedVineyardId`.
- **Existing actions to reuse as committers** — `deleteBrixLog`, `logBrix`,
  `recordYieldEstimate` (`src/lib/harvest/actions.ts`), `moveStock` (`src/lib/inventory/actions.ts:74`),
  vessels/locations/reference create+update (`src/lib/{vessels,locations,reference}/actions.ts`).
  Where an action exists, the committer calls it (keeps audit/validation identical to forms).
- **Audit** — `src/lib/audit.ts`: `writeAudit(tx, input)`, `diff(before, after)`,
  `summarize(action, entity, {label})`; `AuditAction` enum has `CREATE/UPDATE/DELETE`.
- **onDelete map (from `prisma/schema.prisma`)** — the delete-rule source of truth:
  - Vineyard → VineyardDetail **Cascade**, VineyardBlock **Cascade**, FieldNote **Cascade**;
    but BrixLog/HarvestRecord/VesselComponent/BottlingSource on vineyard are **Restrict**.
  - VineyardBlock → BrixLog **Restrict**, HarvestRecord **Restrict**; variety on block is **SetNull**.
  - HarvestRecord → HarvestPick **Cascade**.
  - Variety → VesselComponent/BottlingSource **Restrict**, VineyardBlock.variety **SetNull**.
  - Location → all inventory/movements/bottling **Restrict**.
  - WineSku → BottlingRun/BottledInventory/StockMovement **Restrict**.
  - Vessel → VesselComponent **Cascade**, BottlingSource **Restrict**.

### Prior Learnings
- Phase 1 design doc (`~/.rstack/projects/wine-inventory/russe-feat-weekly-field-notes-design-*.md`)
  established: writes go through existing actions; reads may query Prisma; confirm tokens are
  single-use + TTL; scoping is the handler's job, never the model's. All carry forward.
- The feedback-fix agent is path-fenced to `src/lib/assistant/**` and `src/app/(app)/assistant/**`
  — adding new server actions (when needed here) is outside its fence, so this work stays human-built.
- No context-ledger entries yet; record CRUD-safety decisions there during /work.

### External Research
None needed — Prisma 6 + existing patterns. Relation metadata is read from our own schema, not
a new library.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Tool surface | 4 generic tools over an entity registry | ~40 per-entity tools | Scales to "anything" without 40 files; one place for `/sync-mcp` to extend |
| Write boundary | Entity-config allowlist of fields/ops; committer calls existing action if one exists, else a fenced transactional prisma write + writeAudit | Generic arbitrary prisma writes | Keeps audit/validation parity; no arbitrary mutation surface |
| Delete safety | 3-way relation handling: Restrict→block+report, Cascade→enumerate, SetNull→note. Introspected per entity config from the known onDelete map | Trust Prisma to error | Restrict deletes would just throw; we must detect + explain before proposing, and enumerate cascades so confirm is informed |
| Protected entities | AuditLog + auth tables are absent from the registry and hard-rejected by every tool | Soft prompt rule | Defense in code, not just the prompt |
| Inventory | Quantity via existing ledger adjust; SKU create/delete via config | Raw balance edits | Avoids ledger/balance drift (user decision) |
| Confirm reuse | Same signed single-use token + nonce + `/confirm` path | New mechanism | One audited commit path; no new attack surface |
| Admin gating | delete + cross-vineyard edit = adminOnly; scoped create/edit allowed for managers within their vineyard | All-CRUD for everyone | Limits blast radius of destructive ops |

## Implementation Units

### Unit 1: Entity-config core + VineyardBlock + db_find + db_delete (vertical slice)

**Goal:** Prove the whole pattern on one scoped entity, including the Restrict-blocked delete
path (a block with Brix readings cannot be deleted).
**Files:**
- `src/lib/assistant/entities.ts` (create) — `EntityConfig` type (model key, displayName,
  `findFields`, `creatable`/`editable` field specs, `scope` descriptor, `relations` list with
  `{ relationModel, kind: "cascade"|"restrict"|"setNull", countWhere }`, `auditLabel(row)`),
  an `ENTITIES` map, and `getEntity(name)` that returns null for protected/unknown names. Add
  the `VineyardBlock` config.
- `src/lib/assistant/relations.ts` (create) — `describeDelete(entity, id)`: counts
  restrict/cascade/setNull children via Prisma `count` per relation; returns
  `{ blocked: boolean, restrict: [{model,count}], cascade: [{model,count}], setNull: [...] }`.
- `src/lib/assistant/tools/db-find.ts` (create) — read tool: given `{ entity, query }`,
  resolve candidate rows (scoped), return a short list for disambiguation.
- `src/lib/assistant/tools/db-delete.ts` (create) — write tool: resolve one row (scoped +
  admin), run `describeDelete`; if `blocked` → throw a clear message with restrict counts; else
  return a proposal whose preview enumerates cascade/setNull effects. Committer deletes the row
  in a txn + `writeAudit` DELETE (or calls an existing delete action when one exists, e.g.
  `deleteBrixLog`).
- `src/lib/assistant/registry.ts` (modify) — register `db_find` (read) + `db_delete`
  (write, adminOnly).
- `src/lib/assistant/commit.ts` (modify) — add the `db_delete` committer.
**Approach:** Model the config so a manager's scope filter and the audit summary are pure
functions of the row. `describeDelete` uses the static relation list (from the onDelete map),
not runtime schema reflection. Reuse `findScopedBlocks` for VineyardBlock resolution.
**Tests:** deferred to Unit 6 (relation classification + allowlist are the unit-testable seams).
**Depends on:** none
**Verification:** manual — "delete Block 7 at Bajo" (empty block) → preview → confirm →
gone + audit row; "delete Block 2 at Bajo" (has Brix) → refused with the Brix/harvest counts.

### Unit 2: Generic db_create + db_update + field validation

**Goal:** Create and edit rows for configured entities, with per-field validation, via the
confirm flow.
**Files:**
- `src/lib/assistant/fields.ts` (create) — field spec + validators (string/int/decimal/enum/
  date/boolean/FK-exists), producing typed values or a helpful error.
- `src/lib/assistant/tools/db-create.ts`, `src/lib/assistant/tools/db-update.ts` (create) —
  validate against the entity's `creatable`/`editable` specs, build a preview (for update,
  show the `diff`), sign a proposal. Committers write in a txn + `writeAudit` (CREATE/UPDATE),
  or call an existing action when present.
- `src/lib/assistant/entities.ts` (modify) — flesh out VineyardBlock creatable/editable.
- `src/lib/assistant/registry.ts` + `commit.ts` (modify) — register + wire committers.
**Approach:** `db_update` resolves one row (scoped), applies only allowlisted fields, computes
a `diff` for the audit + preview. Create enforces required fields + FK existence within scope.
**Tests:** Unit 6 (validation + allowlist).
**Depends on:** Unit 1
**Verification:** manual — "rename Block 2 to North Slope" → diff preview → confirm → updated +
audit; "create a block 'Test' in Bajo with 200 vines" → preview → confirm → created.

### Unit 3: Entity configs for the rest of the domain

**Goal:** Cover the full allowlist with correct scope, fields, and delete rules.
**Files:**
- `src/lib/assistant/entities.ts` (modify) — add `Vineyard`, `VineyardDetail`, `Variety`,
  `Location`, `Vessel`, `WineSku`, `FinishedGood`, `FinishedGoodCategory`, `HarvestRecord`,
  `HarvestPick`, `FieldNote`; `BottlingRun` as find-only. Encode each one's relation list from
  the onDelete map (Section: Research). Mark global (non-vineyard) entities admin-only to edit.
- `src/lib/assistant/tools/db-*.ts` (modify only if needed) — generic, should not need
  per-entity branches.
**Approach:** Inventory: `WineSku`/`FinishedGood` are creatable/deletable here, but quantity
is NOT an editable field — the config points the model to the existing `adjust_inventory` tool
for quantities. Reuse existing create/update actions (vessels/locations/reference) as
committers where they exist.
**Tests:** Unit 6 spot-checks a few configs (protected rejection, a Restrict entity, a Cascade
entity).
**Depends on:** Unit 2
**Verification:** manual — create a Location; delete an unused Variety (ok) vs one used by a
vessel (refused); edit a Vineyard name; delete a Vineyard with only blocks/field-notes
(cascade enumerated) vs one with Brix/harvest (refused).

### Unit 4: Scoping, admin gating, and protected-entity hard rejection

**Goal:** Enforce the safety rules uniformly across all generic tools.
**Files:**
- `src/lib/assistant/tools/db-*.ts` (modify) — every tool: `getEntity` returns null for
  protected/unknown → refuse; apply `scope` (manager → own vineyard, else admin-only);
  `db_delete` and cross-vineyard edits require `ctx.user.role === "admin"`.
- `src/lib/assistant/registry.ts` (modify) — `db_delete` adminOnly; `db_create`/`db_update`
  visible to managers but scoped at the handler.
**Approach:** Centralize the protected-entity check + scope resolution in one helper so no tool
can forget it. Mirror the "scoping is the handler's job, never the model's" rule.
**Tests:** Unit 6 (protected rejection, scope filter).
**Depends on:** Unit 3
**Verification:** manual — a manager cannot delete (adminOnly) and cannot edit another
vineyard's block; any attempt to target `AuditLog`/`User` is refused.

### Unit 5: System prompt, UI labels, refusals

**Goal:** Teach the model the new capabilities + limits; keep the UI clear.
**Files:**
- `src/lib/assistant/prompt.ts` (modify — coordinate with plan 009's prompt edits) — list
  create/edit/delete capability; state confirm-before-write; name protected entities it must
  refuse; tell it to use `db_find` to disambiguate and `adjust_inventory` for quantities.
- `src/app/(app)/assistant/AssistantChat.tsx` (modify) — `TOOL_LABELS` for db_find/create/
  update/delete; ensure the proposal card renders multi-line cascade disclosures readably.
**Approach:** Prompt stays frozen-ish; additions are short. The confirm card already renders
the preview text; verify long restrict/cascade messages wrap.
**Tests:** none (manual).
**Depends on:** Unit 4
**Verification:** manual — model refuses "delete the audit log" / "make me an admin"; uses
db_find when ambiguous; routes quantity asks to adjust_inventory.

### Unit 6: Pure-logic tests

**Goal:** Cover the deterministic safety seams without a DB.
**Files:**
- `test/assistant-entities.test.ts` (create) — `getEntity` returns null for `AuditLog`,
  `User`, `Session`, and unknown names; returns config for allowed ones; configs never list a
  protected model as creatable/editable.
- `test/assistant-fields.test.ts` (create) — validators: type coercion, range/enum rejection,
  required-field enforcement, unknown-field rejection.
- `test/assistant-relations.test.ts` (create) — relation classification + the
  blocked/cascade/setNull decision from a mocked count map (pure function over counts).
**Approach:** Factor the relation decision (`blocked` + grouping) as a pure function over a
counts object so it tests without Prisma; the DB `count` calls live in a thin wrapper.
**Tests:** these ARE the tests.
**Depends on:** Units 1-4
**Verification:** `npm run lint` + Vitest green; no regressions.

## Test Strategy

**Unit tests:** Vitest node env (existing `test/**/*.test.ts` pattern, `server-only` already
stubbed) for entity/field allowlists, protected-entity rejection, and the relation-decision
function.
**Integration tests:** none here; the action/DB harness remains a tracked `TODOS.md`
follow-up. Highest-risk paths (delete, cascade) are mitigated by: Restrict detection before
attempting, confirm-before-write, single-use tokens, admin gating, and per-field allowlists —
plus manual QA.
**Manual verification:** the per-unit checks above, end-to-end, with special attention to a
Restrict-blocked delete, a Cascade-enumerated delete, and a protected-entity refusal.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Generic delete removes the wrong / too much data | MED | HIGH | db_find disambiguation + confirm preview enumerating cascade/restrict/setNull; admin-only; single-use token |
| Restrict delete attempted → raw DB error to user | MED | MED | `describeDelete` detects restrict children first and refuses with counts; never attempts a blocked delete |
| Protected table reached (audit/auth) | LOW | HIGH | Absent from registry + hard reject in every tool + a unit test |
| Inventory edited raw → ledger drift | LOW | MED | Quantity not an editable field; config routes to `adjust_inventory` |
| Manager escalates scope via generic edit | LOW | HIGH | Centralized scope helper; cross-vineyard + delete are admin-only |
| Collision with plan 009 (shared prompt.ts / assistant dir) | MED | LOW | Coordinate edits; both are additive; rebase before merge |
| Entity config drifts from schema over time | MED | MED | `/sync-mcp` follow-up; relation list documented against the onDelete map |

## Success Criteria

- [ ] Create / edit / delete work via chat for the allowlisted domain entities, each
      preview→confirm→audited.
- [ ] Deleting a Restrict-protected row (block with Brix, location with inventory, variety in
      use, in-use wine SKU) is **refused with counts**, never a raw error.
- [ ] Deleting a Cascade parent (e.g. a vineyard with only blocks/field-notes, a harvest
      record with picks) shows what else will be removed before confirm.
- [ ] `AuditLog` and `User`/auth are unreachable for create/edit/delete (refused + unit-tested).
- [ ] Inventory quantity still flows through the ledger; no raw balance edits.
- [ ] Delete + cross-vineyard edits are admin-only; managers stay scoped.
- [ ] New pure-logic tests pass; `npm run lint` clean; no regressions in the 232 existing tests.
