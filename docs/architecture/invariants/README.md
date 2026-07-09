---
tags:
  - index
---

# Invariant register

The **machine-readable** face of [[INVARIANTS]]. One note per invariant, with typed
frontmatter (`severity`, `enforcedBy`, `verify`, `appliesTo`, `status`). This folder powers
three things that run without you:

1. **Live dashboard** - the base below (filter, group, spot gaps at a glance).
2. **Guard checker** - `npm run verify:invariants` asserts every guarded invariant's
   `verify:` guard actually exists, and flags `verify:*` scripts that no invariant claims.
   Exits non-zero on a gap, so CI / the local commit hook surface safety holes. Detection only.
3. **Auto-context hook** - `.claude/hooks/inject-brain-context.mjs` reads each invariant's
   `appliesTo` paths and injects the matching rules into the agent's context before it edits
   governed code (`src/lib/{ledger,tenant,cost,compliance}`, `prisma/schema.prisma`, etc.).

> [!tip] Adding an invariant
> Drop a new `.md` here with the same frontmatter shape (copy any existing one - mind the LF
> line endings; a CRLF file's frontmatter is silently skipped by the checker). If the guard
> already exists, set `verify:` to it (`npm run verify:xyz` or a `scripts/foo.ts` path) and
> `status: guarded`, then run `npm run verify:invariants` to confirm it's covered. If you are
> declaring an invariant ahead of its guard (governance-first), set `status: planned` (or
> `deferred`) and omit the `verify:` field entirely - the checker skips notes with no
> `verify:`, so the gate stays green; add `verify:` only when you flip to `status: guarded`.

## Dashboard

![[invariants.base]]

## Coverage snapshot

**29 invariant notes: 28 guarded, 0 planned, 1 deferred.** The 28 guarded ones (ledger DB +
pure + correction, tenancy, cost, compliance, work-orders, naming NAMING-1/2, bond +
tax-class BOND-1/TAXCLASS-1/TAXPAID-1/AMEND-1, and migration MIGRATE-1) are asserted by
`npm run verify:invariants` (100% of guarded notes have a live guard) and their frontmatter
well-formedness by `npm run verify:invariant-frontmatter`. NAMING-1/2 flipped to `guarded`
in **Phase 1** (guard `npm run verify:naming`); BOND-1/TAXCLASS-1/TAXPAID-1/AMEND-1 flipped
in **Phase 2** (guards `verify:bond` / `verify:taxclass` / `verify:taxpaid` / `verify:ttb`);
MIGRATE-1 flipped in **Phase 3** (guard `verify:migration`). The **1 deferred** note (CBMA-1)
still intentionally omits `verify:` and is skipped by the checker until its enforcing guard
ships, at which point it flips to `status: guarded`.

The narrative and the why live in [[INVARIANTS]]; architecture context in
[[system-map]], [[security-register]], [[scale-register]].
