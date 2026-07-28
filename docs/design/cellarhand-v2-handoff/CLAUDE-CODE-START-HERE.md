# Claude Code — start here

You are implementing **Direction A at Scale (v2)** in the existing `Wine-inventory` / Cellarhand repository.

## Read in this order

1. `README-HANDOFF.md` — scope, cautions, open decisions
2. `11-implementation-sequence.md` — what to build, in what order, and where the domain gate is
3. `08-data-dependency-matrix.md` — what needs a migration and what does not
4. `05-design-system-v2.md` — the tokens and components you are building against
5. Then the screen, interaction, responsive, a11y and content specs as you reach each phase

## The five rules that govern this work

1. **Evolve the existing application.** Do not create a parallel UI framework. The prototype is a behavioural and visual reference; its markup is single-file and inline-styled by design and must not be copied.
2. **Do not invent backend capabilities.** Everything below the domain gate in phase 11 is blocked on an approved RFC and a migration. Class D items in the matrix are not "hard"; they are *not yet allowed*.
3. **Never claim a guarantee the system cannot honour.** No "queued", "synced", "will retry", "saved locally" until a durable outbox exists and drains. The current `"Offline — will retry"` string must be deleted in phase 3.
4. **Correct, never undo.** The ledger amends; it does not reverse. Every piece of copy uses "Correct".
5. **Reconcile every RFC with the real schema, RLS, invariants and ledger architecture before writing a migration.** The RFCs describe user-visible and domain requirements. They are not authoritative about database structure.

## Start with this slice

**Phase 0 + Phase 1**, in two commits.

Phase 1 is the highest-value change in the package and needs no database work:

- `Button` heights 34/42/50 → 44/48/56 plus a new 68px `xl`
- A real focus-visible ring (there is none today)
- The six-value status ramp and `StatusChip`; `Badge tone="gold"` → `tone="wine"` and out of status use
- `ConfirmButton` loses its 4-second auto-disarm and names its object
- Skip link, `aria-current`, `aria-expanded` in `AppShell`
- Errors on the execute screen become `role="alert"`

That single phase closes six audit findings (V1, V2, V4, part of S8, §7.3, §7.4) and moves 293 undersized touch targets above the minimum.

Take full-page visual-regression snapshots before and after — it re-baselines the vertical rhythm of every screen.

## What is already right and must not be broken

- `AssistantDock` — geometry, drag/resize, expand-to-centre, `Esc` precedence, voice orb, FAB. Only the *outcome* of "Review & create" changes.
- `Tabs` — `role="tablist"`, roving tabindex, panels stay mounted.
- The cellar action forms in `src/components/cellar/forms/` — the live `rate × volume = total` `aria-live` readout is the model for `NumericUnitInput`.
- `LotOperation.commandId` / `WorkOrderTaskAttempt.commandId` idempotency — reuse, don't rebuild.
- `LotOperation.batchId` group fan-out with member-level exceptions — this is exactly what keg close-out needs.
- The compliance screen's copy, including *"Nothing is ever auto-submitted."*
- The `/work-orders` empty state.
- The `AuditLog` model and its retention.

## Verify against

`12-acceptance-criteria.md`. Every criterion is written to become a unit, integration, Playwright or visual-regression test. `AC-F1` through `AC-F10` are the phase-1 gate.
