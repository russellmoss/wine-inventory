---
id: 
group: 
severity: critical
enforcedBy: app-code
verify: "npm run verify:"
decision: 
status: guarded
appliesTo:
  - src/lib/
tags:
  - invariant
---
<!--
  GUARD-SEQUENCING RULE (delete this comment in the real note):
  - GUARDED invariant (default, guard already exists): keep `verify:` + `status: guarded` above.
  - PLANNED/DEFERRED invariant (governance-first, declared ahead of its guard): DELETE the
    `verify:` line from the frontmatter and set `status: planned` (or `deferred`). The checker
    (scripts/verify-invariant-guards.mjs) skips any note with no `verify:`, so the CI gate stays
    green; add `verify:` back only when you flip to `status: guarded`.
  - Save as LF, not CRLF — a CRLF file's frontmatter is silently skipped by the checker.
-->

# {{title}}

> [!danger] Invariant (severity, enforcedBy)
> <One sentence: the thing that must ALWAYS be true, and the concrete failure that happens if it isn't.>

**Guarded by:** `npm run verify:`
**Decision:**  — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; `npm run verify:invariants` asserts the guard exists; the `appliesTo`
paths drive the auto-context hook (`.claude/hooks/inject-brain-context.mjs`) that
surfaces this rule before any edit to the governed code.
