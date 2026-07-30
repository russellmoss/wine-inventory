---
id: PROV-2
group: provenance
severity: medium
enforcedBy: app-code
decision: "RFC-003 §3.4"
status: planned
appliesTo:
  - src/components/
  - src/app/
tags:
  - invariant
---

# PROV-2 — every derived figure on screen is badged, accessibly

> [!note] Invariant (medium, app-code) — PLANNED, not yet in force
> Every derived quantity rendered in the UI carries a `ProvenanceBadge` reading **≈ estimated**,
> with an `aria-describedby` naming the derivation (*"30 L ÷ 21 barrels, keg K-3, 27 July"*).
> A number nobody read is **never** badged as measured.

**Guarded by:** _planned_ — intended guard is a component/a11y assertion inside the existing axe
gate rather than a standalone `verify:` script, since the surfaces are React components.

**Status:** `planned` until RFC-003's badge ships. Note this is the one invariant in the set whose
natural guard is **not** a `verify:*` script — when it flips to `guarded` it should point at the
axe/component gate, or stay `planned` and be enforced by review if no machine check is practical.
Do not invent a script that does not really check it; an unguarded-but-honest note beats a green
check that proves nothing.

**Decision:** RFC-003 §3.4 — see [[INVARIANTS]] and [[PROV-1-derived-ops-explain-themselves]].
**Applies to:** `src/components/`, `src/app/`

Mandatory surfaces (RFC-003 §3.4): barrel history rows; barrel current volume; the keg close-out
card; group volume rollups; lineage node volumes where any input was derived; and any export or
report column containing a derived figure.
