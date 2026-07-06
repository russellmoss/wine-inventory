---
id: 
group: cellar-ops
incumbent: both
capability: 
status: gap
ourApproach: 
aiNativeEdge: 
evidence: 
tags:
  - parity
---
<!--
  CAPABILITY-PARITY NOTE (delete this comment in the real note):
  One note = one incumbent capability (from vintrace-docs / innovint-docs). The register is the
  LIVING version of analysis/incumbent-teardown/ — "what do the incumbents do, do we cover it, and
  is our AI-native version better?" — queryable at every /plan and /ship via parity.base.

  FRONTMATTER (asserted by `npm run verify:parity`):
    id          — PARITY-<n>, or PARITY-VT-<slug> (vintrace) / PARITY-IV-<slug> (innovint) for
                  corpus-generated stubs. Unique.
    group       — domain bucket (cellar-ops, bottling, compliance, cost, grow, …). Drives base grouping.
    incumbent   — vintrace | innovint | both.
    capability  — short human label (usually the incumbent article title).
    status      — covered | partial | gap | deliberately-omitted.
    ourApproach — how WE do it (op + core, e.g. "RACK / transferWineCore"), or empty for a gap.
    aiNativeEdge— the assistant utterance that does it ("rack tank 1 into barrel 14"), or "parity only".
    evidence    — REQUIRED to resolve when status: covered. A concrete repo-relative file path or
                  path:line INSIDE the repo (e.g. src/lib/vessels/rack-core.ts:42). NOT a wikilink.
                  For gap/partial/omitted it may be a corpus link (vintrace-docs/…); a dead link there
                  is a warning, never a hard fail (refactors/hotfixes must not be blocked).
  Save as LF, not CRLF — a CRLF file's frontmatter is silently skipped by the checker.
-->

# {{title}}

> [!info] Parity — <one line: what the incumbent does, and our stance (covered / gap / deliberately-omitted and why).>

- **Incumbent:** vintrace | innovint | both
- **Our approach:** <op + core, or "—" for a gap>
- **AI-native edge:** <assistant utterance, or "parity only">
- **Evidence:** `src/lib/…` (required for covered)
- **Source:** [[assistant-coverage]] / [[system-map]] — corpus article: `vintrace-docs/…`

This note is the machine-readable face of one competitor capability. `npm run verify:parity` asserts
that any `status: covered` claim points at real evidence; `parity.base` rolls the register up by status
so the gap list is visible at a glance.
