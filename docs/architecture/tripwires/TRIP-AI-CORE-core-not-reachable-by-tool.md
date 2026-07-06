---
id: TRIP-AI-CORE
group: assistant
severity: high
enforce: guard
verify: "npm run verify:ai-native"
decision: "council 046 — core→tool link of the core→tool→golden chain"
status: guarded
appliesTo:
  - src/lib/
  - src/lib/assistant/
tags:
  - tripwire
---

# TRIP-AI-CORE — a domain core with no assistant tool

> [!warning] Tripwire — revisit when this fires
> A `*-core.ts` exporting a `*Core` symbol is not import-reachable from any assistant tool under
> `src/lib/assistant/tools/**` — a capability you can build in the app but a winemaker can't *talk* to.

- **Choice / what breaks:** the moat is "talk to it instead of training on nuance". Every un-wired core
  erodes that moat with no alarm. This is the **core→tool** link; [[TRIP-AI-EVAL]] (D26/H8) enforces the
  downstream **tool→golden** link. Together: core → tool → golden.
- **Enforced by:** `npm run verify:ai-native` builds a TS import graph (roots = the assistant tools) and
  fails if a core is unreachable and not on the ratcheting allow-list (`scripts/ai-native-allowlist.mjs`,
  `MAX_ALLOWED` only shrinks). It also auto-generates the coverage table in [[assistant-coverage]].
- **Decision / source:** council review of plan 046 — see [[assistant-coverage]] and [[system-map]].
