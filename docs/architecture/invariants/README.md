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
> Drop a new `.md` here with the same frontmatter shape (copy any existing one). Set `verify:`
> to the guard that proves it — `npm run verify:xyz` or a `scripts/foo.ts` path. Run
> `npm run verify:invariants` to confirm it's covered. That's it — the base and the hook pick
> it up automatically.

## Dashboard

![[invariants.base]]

## Coverage snapshot

18 invariants across ledger (DB + pure + correction), tenancy, cost, and compliance — all
guarded (100%). The narrative and the *why* live in [[INVARIANTS]]; architecture context in
[[system-map]], [[security-register]], [[scale-register]].
