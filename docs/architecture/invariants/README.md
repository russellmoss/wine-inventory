---
tags:
  - index
---

# Invariant register

The **machine-readable** face of [[INVARIANTS]]. One note per invariant, with typed
frontmatter (`severity`, `enforcedBy`, `verify`, `appliesTo`, `status`). This folder powers
three things that run without you:

1. **Live dashboard** — the base below (filter, group, spot gaps at a glance).
2. **Guard checker** — `npm run verify:invariants` asserts every invariant's `verify:` guard
   actually exists, and flags `verify:*` scripts that no invariant claims. Exits non-zero on a
   gap, so CI / the local commit hook surface safety holes. Detection only.
3. **Auto-context hook** — `.claude/hooks/inject-brain-context.mjs` reads each invariant's
   `appliesTo` paths and injects the matching rules into the agent's context *before* it edits
   the governed code (`src/lib/{ledger,tenant,cost,compliance}`, `prisma/schema.prisma`, …).

> [!tip] Adding an invariant
> Drop a new `.md` here with the same frontmatter shape (copy any existing one — mind the LF
> line endings; a CRLF file's frontmatter is silently skipped by the checker). If the guard
> already exists, set `verify:` to it (`npm run verify:xyz` or a `scripts/foo.ts` path) and
> `status: guarded`, then run `npm run verify:invariants` to confirm it's covered. If you are
> declaring an invariant *ahead of* its guard (governance-first), set `status: planned` (or
> `deferred`) and **omit the `verify:` field entirely** — the checker skips notes with no
> `verify:`, so the gate stays green; add `verify:` only when you flip to `status: guarded`.

## Dashboard

![[invariants.base]]

## Coverage snapshot

**29 invariant notes: 21 guarded, 7 planned, 1 deferred.** The 21 guarded ones (ledger DB +
pure + correction, tenancy, cost, compliance, work-orders) are asserted by
`npm run verify:invariants` (100% of *guarded* notes have a live guard). The **7 planned**
(NAMING-1/2, BOND-1, TAXCLASS-1, TAXPAID-1, AMEND-1, MIGRATE-1) and **1 deferred** (CBMA-1)
were added in Phase 0 from the incumbent teardown; they **intentionally omit `verify:`** and
so are skipped by the checker until their enforcing guard ships (NAMING → Phase 1,
BOND/TAXCLASS/TAXPAID/AMEND → Phase 2, MIGRATE-1 → Phase 3), at which point each flips to
`status: guarded`. Do **not** re-add a `verify:` field to a planned/deferred note before its
guard exists — that would red the CI gate.

The narrative and the *why* live in [[INVARIANTS]]; architecture context in
[[system-map]], [[security-register]], [[scale-register]].
