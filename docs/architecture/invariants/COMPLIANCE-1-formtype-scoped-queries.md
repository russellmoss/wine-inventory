---
id: COMPLIANCE-1
group: compliance
severity: critical
enforcedBy: app-code
verify: "npm run verify:excise"
decision: "plan-026"
status: guarded
appliesTo:
  - src/lib/compliance/
tags:
  - invariant
---

# COMPLIANCE-1 — formtype scoped queries

> [!danger] Invariant (critical, app-code)
> Every compliance_report query is formType-scoped via form-type.ts (OPS_FORM/EXCISE_FORM/formScope); one table backs both the 5120.17 and the 5000.24, so an unscoped query would cross the two forms' filing chains.

**Guarded by:** `npm run verify:excise`
**Decision:** plan-026 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/compliance/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]]; the guard status is asserted by `npm run verify:invariants`; the
`applies-to` paths drive the auto-context hook that surfaces this rule before any
edit to the governed code.
