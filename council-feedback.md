# Council Feedback — Living Registers (Capability-Parity + AI-Nativeness guard)
**Date**: 2026-07-06
**Plan**: docs/plans/2026-07-06-046-feat-parity-ai-native-registers-plan.md
**Reviewers**: Codex gpt-5.4 (engineering soundness), Gemini 3.1 Pro (product/strategy)

## Headline: strong cross-model consensus against two accepted decisions

1. **The AI-native guard measures the wrong thing.** Both reviewers independently reject
   "coverage-doc-anchored." It proves a developer typed a symbol name into a markdown table, not that
   a core is reachable by an assistant tool — it relocates drift into prose. Fix (adopted): code is the
   source of truth via a TS-compiler-API import graph from `assistant/tools/*` through wrappers to
   `*Core`; auto-generate `assistant-coverage.md`.
2. **An 8-note parity pilot is worse than useless** (Gemini). Fix (adopted): ingest all ~1000 corpus
   articles as `status: gap` stubs so the dashboard is honest day one.
3. **The seeded allow-list is a debt-freezer** unless it ratchets. Fix (adopted): CI asserts length ≤
   a hardcoded max that can only shrink; per-entry owner+reason.

## Decisions taken (user-confirmed)
- AI-native detection → AST import-graph + auto-generated coverage doc (was coverage-doc-anchored).
- Parity register → corpus-complete ingestion (~1000 gap stubs), not an 8-note pilot.
- Allow-list → ratcheting max-count + per-entry metadata.
- Unit 9 (PreToolUse parity injection) → dropped; keep PreToolUse for invariants only.
- Folded: evidence as repo-contained path:line + warn-not-fail on non-covered link-rot; post-commit
  always exits 0; CLI thin wrapper over pure run(); adversarial parser fixtures; .gitattributes LF.

See the plan file's revised Key Decisions / Units / Risks for the applied form.

---
## Raw Response — Codex (gpt-5.4)

CRITICAL
- verify:ai-native is not measuring core→tool reachability. It can go green while no assistant tool
  reaches a core, as long as assistant-coverage.md says it does. Documentation-consistency gate, not
  enforcement. Fix: code is source of truth — parse registry.ts / compute an import graph.
- Regex export enumeration too brittle: misses multiline, async, aliased/re-exports, barrels, defaults;
  false-positives on comments/strings. Fix: TS compiler API / ts-morph.
- Markdown table unfit for a hard gate. Fix: structured machine source; render/generate the table.
- Seeded allowlist is a debt freezer; needs reason/owner/issue/expiresAt + CI failing expired.
- "0 critical gaps" is wrong until the guard is reachability-based.

SHOULD FIX
- verify:parity evidence too weak (any existing file passes); require repo-contained file path:line.
- Reject ../ escapes. CRLF must not be a semantic failure (.gitattributes + normalize). post-commit
  always exit 0. CLI = thin wrapper over run(). Run pure-Node guards early in CI. Adversarial fixtures.

DESIGN QUESTIONS
- Why is the doc authoritative if the invariant is tool reachability?
- What counts as a "core" (naming convention vs semantic contract)?
- How do wrappers declare coverage (a covers:[] field on each tool)?
- Why does TRIP-AI-CORE exist as a separate note (duplicate state)?

## Raw Response — Gemini (3.1 Pro)

CRITICAL
1. AI-Native guard measures bureaucratic completeness, not capability. Simpler: AST finds *Core exports
   + assistant/tools imports, fails if a *Core isn't imported by a tool; AUTO-GENERATE the doc.
2. The Parity Pilot is a disguised Jira board; 8 of ~1000 is false coverage and the sweep never lands.
   Fix: LLM-batch all articles into gap stubs IN THIS PR; dashboard must scream the real ratio.

SHOULD FIX
3. Allow-list is an institutionalized blind spot without a ratchet (max-count that only shrinks).
4. Goals-in-CI is theater UNLESS automated; your importers are your true parity register; an automated
   AST core→tool gate is a cheap ruthless moat enforcer given the vault/hook machinery already exists.

DESIGN QUESTIONS
- evidence link-rot breaking CI on refactors (not capability loss).
- Don't pollute PreToolUse with strategy teardowns; keep it for invariants.

VERDICT: BUILD SIMPLER — automated AST core→tool check that auto-generates the coverage doc and
ratchets a max-allowlist count.
