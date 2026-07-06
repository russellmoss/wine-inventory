# ADR 0002 — Identity vs. naming: `id` is identity, `code`/`displayName` are a mutable label

- **Date:** 2026-07-06
- **Status:** accepted

## Context

The incumbent teardown (`analysis/incumbent-teardown/SYNTHESIS.md` §B.1, §2; adjudicated in
`fix-council-feedback.md` §3.4/§3.7; `FIX_RUNBOOK.md` Decision 2 + Phase 1) found the #1 self-inflicted gap:
`INVARIANTS.md` pinned the lot **`code` immutable as identity**. That is worse UX than both incumbents (a
winery cannot rename a lot or adopt its incumbent's codes) and it blocks the migration thesis ("the easiest
system to migrate to" — you must be able to adopt the winery's familiar codes verbatim). See [[INVARIANTS]]
§ Identity & provenance and [[system-map]].

## Decision

Split identity from naming:
- **Identity is the surrogate `id`** — the ONLY opaque identity. `id` and the point-in-time
  `lotCode`/`vesselCode` **line snapshots** on each `LotOperationLine` are immutable. Origin
  (`vineyard`/`block`/`variety`) and `vintageYear` provenance remain immutable.
- **`code`** is a **mutable, unique-per-tenant** human label; **`displayName`** is a **mutable, NON-unique**
  free-text label. Together they are the mutable presentation layer. Nothing in lineage/cost/ledger joins on
  `code`.
- A rename is an **append-only `LotCodeEvent`**, never a snapshot rewrite (NAMING-2). User-facing lookup by
  `code` resolves to `id` first, then reads history by `id`.
- A `code` collision is a label error the system **offers** to auto-disambiguate (never silently applies);
  silent auto-disambiguation is reserved for newly generated post-go-live codes only.

Formalized as invariants **NAMING-1** and **NAMING-2** ([[NAMING-1-identity-is-id]],
[[NAMING-2-honest-rename]]), planned in Phase 0, verify-guarded (`verify:naming`) in Phase 1
(ROADMAP Phase 12.5).

## Why (and what we rejected)

- **Rejected: keep `code` immutable as identity** (the status quo). It is the incumbent-worse behavior the
  whole teardown flags; it makes rename impossible and forces migration to discard the winery's codes.
- **Rejected: make `code` an opaque system slug (`LOT-8492`)** (Gemini's alternative, rejected permanently —
  `FIX_RUNBOOK.md` Decision 2). That throws away the migration-familiarity win (adopt the winery's *familiar
  human code* verbatim). Cellarhand already has an opaque stable key — the surrogate `id` — so a second
  opaque slug is redundant and would hide the codes winemakers recognize.
- **Chosen: human `code` + surrogate `id`**, because it delivers both durable identity (join/lineage on `id`)
  and migration familiarity (adopt incumbent codes) without a redundant slug.

## Consequences / at scale

- Phase 12.5 (FIX Phase 1) builds `Lot.displayName`, a versioned tokenized `NamingTemplate`, `LotCodeEvent`,
  and a `LotIdentifier` external-reference table (NOT three scalar columns), plus cross-identifier search.
- Phase 13 migration adopts incumbent codes verbatim via `LotIdentifier` (idempotent re-import key); a
  per-tenant `code` collision is a preflight block with operator resolution, never a silent suffix.
- The guard `verify:naming` must assert: line snapshots never rewritten on rename; no lineage/cost/ledger
  query joins on `code`; `displayName` non-unique accepted; cross-identifier search resolves by any known id.
- Full context: [[INVARIANTS]], `FIX_RUNBOOK.md` (Phase 0/1), `analysis/incumbent-teardown/SYNTHESIS.md` §B.1.
