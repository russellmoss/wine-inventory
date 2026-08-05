---
id: REDIRECT-1
group: auth
severity: high
enforcedBy: app-code
verify: "npm run verify:redirect-passthrough"
decision: "Code-health review 2026-08-05 (finding 2)"
status: guarded
appliesTo:
  - src/lib/dal.ts
  - src/lib/weather/
  - src/lib/spray/
  - src/lib/harvest/
tags:
  - invariant
---

# REDIRECT-1 — a redirect is control flow, not an error

> [!warning] Invariant (high, app-code)
> The `require*` gates in `src/lib/dal.ts` signal by CALLING Next's `redirect()`, which throws an internal `NEXT_REDIRECT` error the framework is meant to catch. Any `catch` that wraps a gate must therefore lead with `unstable_rethrow(e)` (or the gate must sit above the `try`). A catch-all that converts the throw into a returned value strands the user on the page with the raw digest string as their error message instead of bouncing them to `/login`.

**Guarded by:** `npm run verify:redirect-passthrough`
**Decision:** Code-health review 2026-08-05 (finding 2) — see [[INVARIANTS]].
**Applies to:** `src/lib/dal.ts`, `src/lib/weather/`, `src/lib/spray/`, `src/lib/harvest/`

The gates do not return an `AccessDecision` — `requireReadyUser` / `requireAdmin` / `requireSession` /
`requireDeveloper` / `requireActiveTenant` all `redirect()` and never come back. This is exactly the
shape that made the bug invisible: the code reads like a normal `await`, and the surrounding
`catch (e) { return { ok: false, error: e.message } }` looks like ordinary defensive hygiene.

It shipped on 21 actions (7 weather try/catch blocks, the `withTenant` wrappers in `spray/actions.ts`
and `harvest/planned-harvest-actions.ts`), where an expired session rendered the literal string
`NEXT_REDIRECT;replace;/login;307;` in the UI. `getCurrentUser()` also reads `headers()`, whose
request-time bailout throws the same way, so the same catch could swallow a dynamic-rendering signal.

Note this is the OPPOSITE polarity from the rule in `src/lib/action-result.ts`: there, an *expected*
`ActionError` must be caught and returned as data because production redacts thrown errors. Both rules
coexist — catch YOUR errors, rethrow the FRAMEWORK's. `unstable_rethrow` is precisely that partition,
which is why it belongs at the top of the catch rather than as a hand-rolled digest sniff.

The canonical alternative — hoisting the gate above the `try` — is also accepted by the guard, and is
preferable when a wrapper has exactly one gate and nothing else can redirect.
