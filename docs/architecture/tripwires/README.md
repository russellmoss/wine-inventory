---
tags:
  - index
---

# Tripwire register

The **machine-readable, accountable** face of the tripwires in [[scale-register]] and
[[security-register]]. Those registers list "revisit when X fires" in prose — but a prose
tripwire nobody wired is just a note. This folder makes each one **accountable**: one note
per tripwire, with typed frontmatter declaring HOW it's caught.

Each tripwire declares an `enforce:` kind:

| kind | means | frontmatter | fails the build when… |
|------|-------|-------------|------------------------|
| `guard` | an existing check catches it | `verify:` → an `npm run verify:*` script or a `scripts/…`/`test/…` path | the guard doesn't exist (a live safety hole) |
| `static` | a forbidden code pattern | `forbid:` (regex) + `in:` (path) | the pattern actually appears (the tripwire **fired**) |
| `observe` | a runtime/log signal, not statically checkable | `signal:` (what to watch) | never — printed as a MANUAL WATCH reminder |

## What runs without you

1. **Guard/pattern checker** — `npm run verify:tripwires` (`scripts/verify-tripwire-guards.mjs`)
   asserts every `guard` tripwire's check exists, greps every `static` tripwire's forbidden
   pattern (fails if it's present), and lists the `observe` tripwires as manual watches. Exits
   non-zero on a malformed note, a missing guard, or a fired static pattern. Detection only —
   never edits. Wired into the local `.githooks/post-commit` (non-blocking) and CI.
2. **Live dashboard** — the base below (filter by register, spot the manual-watch-only ones).

> [!tip] Adding a tripwire
> Copy `docs/_templates/tripwire.md`, fill the frontmatter for the `enforce:` kind you need,
> and run `npm run verify:tripwires` to confirm it's green. When you add a tripwire to
> [[scale-register]] / [[security-register]], add a note here too.

## Dashboard

![[tripwires.base]]

## Coverage snapshot

14 tripwires — 5 `guarded` (tenant-isolation ×2, commerce PII, accounting batch, AI eval),
2 `static` (no `runAsSystem` in `src/app`, no `order/upsert` in the commerce lib), and 7
`observe` (ledger-retry, projection-rebuild, cost-latency, offline-sync, neon-coldstart,
commerce-rate, qbo-token). The *why* lives in [[scale-register]] and [[security-register]];
architecture context in [[system-map]].
