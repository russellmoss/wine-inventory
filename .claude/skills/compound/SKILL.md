---
name: compound
description: >
  End-of-session ritual that turns a working session into durable, correctly-routed artifacts, so
  nothing decided, corrected, fixed, or learned evaporates in chat. Reflects on the session (starting
  from friction), extracts each durable capture, routes it to its real home in THIS repo (NOW.md,
  auto-memory, CLAUDE.md/AGENTS.md, TODOS.md/ROADMAP.md, the docs/architecture registers, the
  context-ledger), adversarially tests each keep AND drop, applies the low-risk ones, and runs a
  memory-hygiene pass. Trigger when the user says "compound this", "compound the session", "wrap up",
  "close the loop", "end of session", "capture what we learned", "update memory/CLAUDE.md with the
  latest", or runs it as a closing step.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

# /compound — end-of-session capture ritual

A session is wasted leverage if what it produced lives only in this chat. Decisions, corrections,
hard-won fixes, and new project facts should land somewhere a future session will find them. This
skill is the harness for that: **reflect → extract → route → adversarially test → apply → tidy.** It
is the same compounding muscle the repo already runs (the `NOW.md` spine, auto-memory, the
brain-refresh loop in `/ship`), pulled into one deliberate closing pass. For reflection with no writes,
use `/retro` instead — this skill is the one that persists the session's value.

## When to run it

Make it a **default closing step**, but it is not mandatory every session — it **self-aborts when the
session produced nothing durable** (pure execution against an existing plan, nothing learned). Best at
natural boundaries: a work unit finished, before `/ship`, when the objective is about to change, or when
the user asks. If Phase 1 turns up no real captures, say so plainly and stop — never manufacture them.

## Phase 1 — Reflect (extract, don't vent)

Start from the **friction**, systematically. First, list every exchange this session that took more than
one round-trip to land — every time the user questioned, corrected, redirected, re-explained, or a fix
took multiple attempts. Each non-one-shot is evidence that some default, instruction, skill, or missing
context was wrong the first time. (A requirement the user simply hadn't stated yet is not friction — that
is normal scope arriving; friction is when something was wrong *given what was already known*.) For each,
ask: **what single rule, fact, or skill change would have made it one-shot next time?** — that answer is
the capture. One-shotted work rarely teaches; the friction is where the leverage is.

Then walk the session and pull out candidate captures — concrete events, not feelings. Name the event
each came from. Look for:

- **Corrections & confirmed approaches** — anything the user pushed back on, redirected, or explicitly
  endorsed ("don't do X", "always Y", "yes, that's right"). Highest-value; the friction sweep above
  already surfaces most of them.
- **Decisions** — a choice made and the *why*, especially ones that settled a fork.
- **New project facts** — state not derivable from code or git: what exists, what's in flight, ownership,
  status, follow-up tickets.
- **Hard-won fixes / gotchas** — a bug that took real investigation or non-obvious knowledge to resolve.
- **Reference pointers** — URLs, dashboards, PRs, docs worth finding again.
- **Recurring friction / tooling gap** — something that slowed this session and would slow the next.

## Phase 2 — Route each candidate (this repo's homes)

Match every candidate to exactly one home. **The right home is decided by audience and lifespan:**
auto-memory is *agent-facing* — loaded into every session, so keep it terse and reserve it for what a
future Claude needs to do the work. In-repo docs are *teammate-visible and versioned*.

| Capture | Home |
|---|---|
| What is in flight *right now* / today's objective / a tangent | **`NOW.md`** (the working-set spine — keep it under a screen) |
| Cross-session project fact, in-flight technical state, operational gotcha/ID, a preference/correction about how I should work on THIS repo | **Auto-memory** — a file in `memory/` + a one-line pointer in `MEMORY.md` |
| A repo-wide behavioral rule / house convention that should bind *every* session | **`CLAUDE.md`** (or `AGENTS.md` for codebase-specific mechanics) — terse, correct section |
| A parked idea / out-of-scope follow-up not being done now | **`TODOS.md`** |
| A long-horizon roadmap item, phase, or backlog entry | **`ROADMAP.md`** |
| A meaningful architecture / security / scale / UX decision | The matching register in **`docs/architecture/`** (`scale-register.md`, `security-register.md`, `ux-principles.md`, `system-map.md`) + an ADR under `docs/architecture/decisions/` for big ones |
| A hard invariant ("this must always hold") | **`INVARIANTS.md`** + a typed note under `docs/architecture/invariants/`, then `npm run verify:invariants` |
| A hard-won fix / non-obvious pattern | Auto-memory (a `feedback`/`project` note) — this repo has **no** `docs/solutions/` |
| A settled cross-LLM/architectural decision worth querying later | The **context-ledger** via `/decision` |
| A recurring procedure that keeps coming back | A new or updated **skill** under `.claude/skills/` |
| An "automatic behavior" rule ("whenever X, do Y" — the harness runs it, not me) | A **hook** in `.claude/settings.json` (via the `update-config` skill), NOT memory |

**Recurring-violation rules get a mechanism, not relocated prose.** If a rule was already in context (a
memory note, CLAUDE.md, or the owning skill) at the moment it got violated, moving its prose to another
always-on tier will not fix it — the lever is a deterministic gate: a `verify:*` guard, a forced step in
a skill's procedure, a required output field, or a settings.json hook. Route the capture to the
mechanism, not to more prose. (This repo already lives this: `verify:invariants`, `verify:ai-native`,
the TRIP-* tripwire gates, the brain-context PreToolUse hook.)

**SSOT.** When a fact could live in two homes, keep the canonical copy in one and at most a thin pointer
in the other — never two full copies. Don't duplicate into memory what a skill's own `SKILL.md`, an
ADR, or `INVARIANTS.md` already owns.

## Phase 3 — Filter before filing

Drop a candidate if: the repo / git history / an existing CLAUDE.md / AGENTS.md already records it; it
only mattered to this conversation (ephemeral); it duplicates an existing memory or rule (update that one
instead — don't add a second); or it's really "remember this code/fix" — in that case ask what was
**non-obvious** about it and capture *that*, not the file. For each survivor, find the existing home to
update before creating a new file.

## Phase 4 — Adversarial pass (steelman keeps AND drops)

This is its own round, not a sub-step of filtering — a capture filed wrong compounds the error in every
future session that reads it as truth, and a capture wrongly dropped is leverage silently lost.

For each **survivor**:
- **Steelman the opposite.** What's the strongest case this rule/fact is wrong, overfit, or harmful?
  Does it contradict a standing CLAUDE.md rule or another memory? A "lesson" that fights a standing rule
  is usually mis-framed — find the framing that reconciles them.
- **One episode ≠ a law.** Generalizable, or am I hardening one session's accident into a standing rule?
  Multiple corrections on the same task is *one* episode. Thin support → scope it tightly or mark it
  provisional.
- **Calibrate certainty.** Every claim actually verified, or am I about to file an inference as fact?
  Downgrade unconfirmed claims to "suspected/unverified" with the check that would settle them. (A memory
  asserting code behavior I never ran is the classic overclaim — this repo has been bitten by it.)
- **Right home, right cost, date-stamp the perishable.** Does an always-loaded memory earn its
  per-session context, or belong somewhere fetched on demand? Version/date-sensitive (a tool, an API, a
  PR state)? Then stamp it so a future reader re-verifies.

Then **challenge the drops.** For any candidate dropped in Phase 3 for a *judgment* reason — especially
"already recorded elsewhere" — steelman keeping it. Highest-value check: when the drop reason is "X
records this already," verify a real consumer actually reads X. (Hard-filter drops — the repo literally
contains it, or purely ephemeral — are exempt.)

Revise each capture in place from what this pass finds, drop any survivor whose adversary wins, resurrect
any drop whose steelman wins. Only post-adversarial captures proceed.

## Phase 5 — Apply, then report

Apply on best judgment and report — the user corrects after.

**Apply directly** (low-risk, this repo, easy to revert): auto-memory adds/edits, `NOW.md`, `TODOS.md`,
`ROADMAP.md` appends, and appends to the `docs/architecture` registers.

**Draft and confirm first** (load-bearing or hard-to-reverse): behavioral-rule changes to
**`CLAUDE.md` / `AGENTS.md`** (they bind every future session), a new **`INVARIANTS.md`** entry, a
**context-ledger decision** (route it through `/decision`), a **new skill or hook**, and **any deletion**.
Show the exact text/diff and get an explicit yes.

Integrate, don't just append. A capture is an edit for coherence: read the target section whole, merge
with the related rule, dedup, tighten a verbose neighbor, or convert a now-restated block into a pointer.
The new fact should leave the surrounding context *cleaner*, not just longer. Match each home's house
style — memory frontmatter (`name` / `description` / `metadata.type` of `user|feedback|project|reference`;
body with **Why:** / **How to apply:** for feedback/project; `[[links]]`; a one-line `MEMORY.md`
pointer), and CLAUDE.md's terse, non-redundant voice.

Do **not** `git commit` here — in-repo doc/skill changes land through the normal `/ship` flow. Memory
lives outside the repo and is not committed at all.

## Phase 6 — Memory-hygiene pass

While in the memory files:

- **Verify every "done/shipped/merged" claim against the live system before trusting or deleting it** — a
  status note's own claim is often stale. Confirm PR/branch state with `gh pr view <n> --json state,mergedAt`
  (or `gh pr list`). *(Scar this repo has hit: notes claimed shipped while their PRs were still open — only
  live verification caught it.)*
- **Promote mis-tiered knowledge.** A memory entry that is really a *workflow rule* → CLAUDE.md; a
  *codebase-specific mechanic* → AGENTS.md; a *hard invariant* → INVARIANTS.md + the invariants register.
  Memory is the least-visible tier — reserve it for transient status + operational context.
- **Kill drifting counts/inventories in prose.** A line asserting a count or enumerating a growing set
  ("all 9 X", "the 3 Y are…") is guaranteed to rot. State the convention instead, or make it queryable.
- **Flag stale/superseded entries** from this session — propose updating or deleting them (deletion is a
  Phase-5 confirm item).
- **Absolute dates only** — convert any relative date.
- **Link integrity** — `[[links]]` in memory and cross-file references in skills should resolve. Flag
  danglers: create the target or fix the reference.

## Phase 7 — Meta pass (improve how we work)

Phases 1–6 capture what we learned about the *work*. This asks the second-order question: what did the
session reveal about *how we work* — a skill missing/miswired/drifted, a class-of-bug (not just the
instance) that wants a standing `verify:*` check, a gap in this ritual itself, or a technique that proved
out and should become standard? Same anti-manufacturing bar: capture a meta-lesson only if it's concrete
enough to change a future skill or process. Route it through the same discipline (a how-we-work rule →
CLAUDE.md/AGENTS.md; a fix-to-a-skill → edit the skill; a standing check → the owning `verify:*` or a
hook). If the session taught nothing about how we work, say so and skip.

## Output — the ledger

End with a compact ledger: what was captured, where it went, and why — one line each — plus anything
**deliberately not captured** and the reason, and any **draft-and-confirm** items still awaiting the
user's yes. The point is that the user can see the loop closed at a glance.

## Guardrails

- **Never manufacture captures.** No durable learnings → say so and stop.
- **Never auto-write a load-bearing or destructive change** (CLAUDE.md/AGENTS.md rules, new invariants,
  context-ledger decisions, new skills/hooks, deletions) — draft and confirm.
- **SSOT** — update the existing home, don't add a second copy; prefer a pointer over a duplicate.
- **Mechanism over prose** for anything that has already been violated once.
- **Verify "shipped" against `gh` before deleting a status note** — the note's own claim is not proof.
- **No `git commit`** — leave in-repo changes for `/ship`.
