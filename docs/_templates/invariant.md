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
