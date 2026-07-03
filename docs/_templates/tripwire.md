---
id: 
group: scale
severity: high
enforce: guard
verify: "npm run verify:"
forbid: ""
in: ""
signal: ""
decision: 
status: guarded
appliesTo:
  - src/lib/
tags:
  - tripwire
---

# {{title}}

> [!warning] Tripwire — revisit when this fires
> <The observable signal that means "revisit now": a metric, an error, or a forbidden code pattern.>

- **Choice / what breaks at scale:** …
- **Enforced by:** `<guard | static grep | manual observation>`
- **Decision / source:**  — see [[scale-register]] / [[security-register]] and [[system-map]].

<!--
FRONTMATTER by `enforce:` kind (only one applies) — asserted by `npm run verify:tripwires`:
  enforce: guard   → set `verify:` to an existing guard  ("npm run verify:xyz" OR a "scripts/…"/"test/…" path).
  enforce: static  → set `forbid:` (a regex that must NOT appear) + `in:` (a path to scan). The check FAILS if it appears.
  enforce: observe → set `signal:` (a human-readable runtime/log signal). Printed as a MANUAL WATCH; never fails the build.
Set `status:` to match: guarded | static | observe (drives the dashboard icon).
-->
