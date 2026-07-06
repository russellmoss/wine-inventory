# Architecture Decisions (ADRs)

> The **"why"** behind big technical choices. When a future SWE team inherits this codebase,
> this folder is the most valuable thing you can hand them — code shows *what*, these show *why*.
>
> You already capture decisions in the **context-ledger** (via `/decision`). This folder is the
> human-browsable mirror: one file per decision, so Obsidian's backlinks and graph connect each
> decision to the [[system-map]], the [[scale-register]], and the plan that triggered it.

## How to add one
Tell Claude: *"Write an ADR for <decision> in docs/architecture/decisions/."* Or copy the
template below into a new file named `NNNN-short-title.md`.

## Template
```markdown
# ADR NNNN — <title>

- **Date:** YYYY-MM-DD
- **Status:** proposed | accepted | superseded by [[NNNN-...]]

## Context
What situation forced a decision? Link the [[plan]] or phase.

## Decision
What we chose.

## Why (and what we rejected)
The reasoning, and the alternatives we turned down.

## Consequences / at scale
What this makes easy, what it makes hard, and any entry added to [[scale-register]].
```

## Index
<!-- Add a line per ADR as you create them. -->
- [[0001-vineyard-block-wo-target-seam]] — the minimal vineyard-block WO target (plan 039); Phase 20 extends it.
- [[0002-identity-vs-naming-split]] — `id` is identity; `code`/`displayName` are a mutable label; no opaque slug (FIX_RUNBOOK Phase 0/1; NAMING-1/2).
- [[0003-two-track-migration-seed-not-replay]] — seed current balances into the fold, archive legacy history read-only (never replay); the regression tripwire (FIX_RUNBOOK Phase 0/3; MIGRATE-1).
