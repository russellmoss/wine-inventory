---
title: Break Mode — developer bug capture via Sentry Replay (link + on-demand hunt)
type: feat
status: draft
date: 2026-07-19
branch: claude/break-mode-bug-capture
depth: deep
units: 11
---

## Overview

Make reported bugs reproducible by linking every report to a rewindable session and, for
developer-role testers, adding a deliberate "Break Mode" that records a high-fidelity, privacy-
scoped hunt on demand. We reuse the Sentry Session Replay already shipped (rrweb DOM + console +
network, with masking + a body allowlist + a seekable viewer) instead of building a capture
engine, and we write a durable, machine-readable trail into the ticket so `/bug-triage`'s fix
agent can "see what the reporter saw." Approved design doc:
`~/.rstack/projects/wine-inventory/russe-claude-enhanced-bug-reporting-network-cc8b6f-design-20260719-142556.md`.

## Problem Frame

A non-technical `developer` user (Mike, `mike@bhutanwine.com`) files bugs that are too thin to
reproduce: no network activity, no trail of what he did before hitting "report a bug." Today a
report carries a screenshot + a redacted console ring buffer + `pageUrl`/`userAgent`
([FeedbackForm.tsx:52-67](src/app/(app)/help/feedback/FeedbackForm.tsx)). The team already pays
for this gap with a whole clarification-DM loop (Plan 079). If we do nothing, every thin report
costs a round-trip and the `/bug-triage` AI can't reproduce what it can't see.

Frame check: the bottleneck is partly telemetry, partly narrative. Network traces reproduce
mechanics but not intent, so this plan pairs richer capture with a "what were you doing /
expected / actual" prompt and keeps leaning on the clarification loop for the rest.

## Requirements

- MUST: Link a report to its Sentry replay (`replayId` + a deep-link `replayUrl`) whenever a
  replay exists; surface it in the developer workspace.
- MUST: A dev-only "Break Mode" toggle that records an on-demand replay hunt and bundles a
  durable interaction + network-metadata trail into the ticket.
- MUST: High-fidelity capture (DOM detail + network request/response BODIES) only in SANDBOX
  tenants (`DEVELOPER_HOME_ORG_ID = org_demo_winery`). Real tenants (Bhutan Wine Co.) stay
  metadata-only + masked (`maskAllText`, `blockAllMedia`). Test-enforced.
- MUST: Stay within the Sentry free-plan replay quota — a replay is billed only on `flush()`, so
  spend is ~one replay per filed report/hunt, not per session.
- MUST: The break-mode indicator reflects ACTUAL recording state (degrade to "quota exhausted" +
  first-party-trail fallback rather than a false 🔴).
- SHOULD: A structured narrative prompt (doing / expected / actual) on the report form.
- SHOULD: `/bug-triage` fix agent reads the `debugContext` trail directly.
- NICE: The fix agent optionally fetches raw rrweb via the project-scoped recording-segments API.
- NICE: Quota-drop monitor (alert when Sentry starts rate-limiting/filtering replays).

## Scope Boundaries

**In scope:**
- The `FeedbackForm` report path (help page + assistant-widget `FeedbackTicketModal`, both render
  `FeedbackForm`).
- Sentry replay init config, a client capture layer, the `debugContext` schema, the `/developer`
  surface, and the `/bug-triage` consumption.

**Out of scope:**
- The assistant `file_feedback` tool path (LLM-composed, server-committed, no client console/
  screenshot today — linking a replay there is a separate follow-up; note it, don't build it).
- Building any first-party network *body* capture (Sentry owns bodies via `networkDetailAllowUrls`).
- The in-app tenant switcher ("god mode") — not built; tenant is fixed per login session, which is
  what makes init-time fidelity resolution safe.
- Paid-plan features / raising sampling org-wide.

## Research Summary

### Codebase Patterns
- **Sentry init** — [instrumentation-client.ts:7-25](src/instrumentation-client.ts): single
  `Sentry.init` with `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`,
  `integrations: [Sentry.replayIntegration()]`. Runs once at bundle load, BEFORE React/auth →
  it does not know the logged-in user/tenant. `installConsoleCapture()` runs right after (line 29).
- **Console ring buffer** — [console-buffer.ts](src/lib/observability/console-buffer.ts): a pure,
  unit-tested FIFO core (`createConsoleBuffer`) + a browser singleton installer patching
  `console.*` + `window` error/rejection; `redactString` scrubs email/JWT/Bearer/keys at capture;
  `drainConsoleBuffer()` (non-destructive) / `clearConsoleBuffer()`. THIS is the pattern to mirror
  for the interaction/network-metadata trail.
- **debugContext shape + clamp** — [debug-context.ts](src/lib/feedback/debug-context.ts):
  `DEBUG_CONTEXT_SCHEMA_VERSION = 2`; `clampDebugContext` keeps `schemaVersion`/`source` + bounded
  console arrays, drops everything else, tolerates legacy rows. New fields MUST be added to the
  clamp allowlist or they get stripped server-side.
- **Submit path** — [FeedbackForm.tsx:43-90](src/app/(app)/help/feedback/FeedbackForm.tsx):
  drains console → POSTs `debugContext` to `/api/feedback/tickets` → uploads attachments →
  `clearConsoleBuffer()`.
- **Ticket create core** — `src/lib/feedback/tickets.ts` `createFeedbackTicket` re-clamps via
  `clampDebugContext` inside `runInTenantTx`. HTTP: `src/app/api/feedback/tickets/route.ts`.
- **Client role/tenant** — [AppShell.tsx:289](src/components/AppShell.tsx) already computes
  `isDeveloper = user.role === "developer"` and mounts `<AssistantDock>` (line 416). The layout
  ([layout.tsx:16](src/app/(app)/layout.tsx)) resolves
  `effectiveTenantId = user.supportOrganizationId ?? user.activeOrganizationId`. Sandbox check =
  `effectiveTenantId === DEVELOPER_HOME_ORG_ID` ([access.ts:28](src/lib/access.ts)).
- **Developer workspace** — `src/app/(app)/developer/DeveloperItemDetail.tsx` renders ticket detail
  incl. `debugContext`.

### Prior Learnings
- Plan 079 clarification loop ([[plan079-bug-report-clarification-loop]]): the DM backstop for thin
  reports — Break Mode reduces how often it fires, does not replace it.
- Server-action errors are redacted in prod ([[server-action-actionerror-redacted-in-prod]]) — the
  replay-link + trail must not depend on a thrown error surfacing.
- Build in the MAIN checkout ([[build-in-main-checkout-not-worktrees]]); worktrees lack `.env`, so
  any `verify:*`/DB read-back runs from main. Demo Winery only for fixtures.

### External Research (verified against live Sentry docs + the user's org, 2026-07-19)
- SDK surface confirmed: `Sentry.getReplay()`, `.getReplayId()`, `.start()`, `.startBuffering()`,
  `.flush()` (async — must be awaited); `replayIntegration({ maskAllText, blockAllMedia,
  networkDetailAllowUrls, networkRequestHeaders, networkResponseHeaders })` are INIT-TIME options.
- A replay is billed only on upload (`flush`/error) — buffering is free.
- Replays API: org-scoped list/retrieve for metadata; recording-segments is **project-scoped**:
  `GET /api/0/projects/{org-slug}/{project-slug}/replays/{replay_id}/recording-segments/`, returns
  COMPRESSED rrweb segments (reassemble + decode; respect rate limits).
- Verified org state: replay enabled + recording (org `bhutan-wine`, project `javascript-nextjs`,
  free plan); 76 accepted / 0 rate-limited / 0 filtered in 14 days at current sampling. Exact
  monthly cap unconfirmed (Subscription page errored) — treat as capped, not unlimited.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|-------------------------|-----------|
| Capture engine | Reuse Sentry Replay; link `replayId` | Build first-party fetch/XHR + HAR dump | rrweb already does DOM+console+network with masking + a viewer; homegrew = strictly worse text dump |
| Replay coverage | Opportunistic for all; `startBuffering()` for devs, `flush()` on report | Always-on 100% session sampling | Quota: buffering is free, flush spends 1/report; 100% would burn the cap |
| Real-tenant fidelity | Sandbox-only bodies/DOM detail; real tenants masked+metadata | Bodies everywhere w/ masking; per-session consent | Cleanest data-governance; matches "Demo Winery, never Bhutan" rule |
| Break mode shape | Client-state + tags + consent + start/flush; Sentry integration options set at init | Runtime reconfigure of Sentry integration | Integration options are init-time only; no tenant switcher → tenant fixed per session → init resolution is correct |
| Break mode recording | `replay.start()` (session mode) + AUTO-OFF timeout (~30 min, countdown in indicator) + stop on logout/tab-close | Buffer-mode + flush (loses long-hunt history); session mode no timeout (quota burn if left on) | Captures the full deliberate hunt but bounds worst-case quota spend on a capped free plan (eng-review issue 2) |
| Init-time fidelity input | Non-httpOnly hint cookie set by **Next middleware** (role+tenant → `full`|`masked`), read synchronously at init | Set cookie from layout render (Next FORBIDS `cookies().set()` in a server-component render; no middleware exists yet) | instrumentation-client runs before auth; middleware is the only place that can both read the session AND set a cookie on the response before the bundle loads (eng-review issue 1a) |
| Real-tenant enforcement | Sentry **server-side data-scrubbing** rules (ingest-side) as the real belt; cookie is only a client-side default | Trust the client cookie alone | The cookie is client-WRITABLE — a dev could force `full` in a real tenant. Fail-closed default + masking-always-on + server-side scrub = defense in depth (eng-review issue 1b) |
| AI consumption | Fix agent reads durable `debugContext` trail; recording-segments API optional | Only the Sentry viewer (human-only) | The trail is machine-readable, on-ticket, quota/retention-independent |
| Schema versioning | ONE bump v2→v3 with ALL new optional fields | Bump per phase (v3 then v4) | All fields optional + additive clamp → single forward-compatible bump |

## Implementation Units

### Unit 1: `debugContext` schema v3 — replay + trail fields

**Goal:** Extend the shared debug-context shape/clamp once to carry everything both phases need.
**Files:** `src/lib/feedback/debug-context.ts`, `test/debug-context.test.ts` (or existing suite).
**Approach:** Bump `DEBUG_CONTEXT_SCHEMA_VERSION` to `3`. Add optional, bounded fields to
`clampDebugContext`'s allowlist (everything else still dropped): `replayId?: string` (cap ~64),
`replayUrl?: string` (cap ~300), `narrative?: { doing; expected; actual }` (each capped ~1000),
`huntId?: string` (cap ~64), `interactionTrail?: InteractionEntry[]`, `networkTrail?:
NetworkMetaEntry[]` (both bounded like the console arrays — shared total-char budget, entry caps).
Define the two entry types. Keep v1/v2 tolerance (legacy rows unchanged).
**Tests:** clamp keeps new fields when valid; strips unknown; enforces caps; legacy v2 blob still
clamps; oversized trail truncated to budget.
**Depends on:** none
**Verification:** `npm test` for the debug-context suite green.

### Unit 2: `buildReplayUrl` helper + Sentry org/project env

**Goal:** Deterministic Sentry replay deep-link from a `replayId`.
**Files:** `src/lib/observability/sentry-replay.ts` (new, pure), `test/sentry-replay.test.ts`,
`.env.example`.
**Approach:** Pure `buildReplayUrl(orgSlug, replayId)` →
`https://{orgSlug}.sentry.io/replays/{replayId}/` (verify exact host/path against the org). Read
`NEXT_PUBLIC_SENTRY_ORG_SLUG` (client-safe) with a sane default (`bhutan-wine`); add
`SENTRY_PROJECT_SLUG` + optional `SENTRY_AUTH_TOKEN` to `.env.example` for Unit 11 (server-only).
Returns `undefined` when inputs missing (guarded).
**Tests:** builds expected URL; undefined on empty id/slug.
**Depends on:** none
**Verification:** unit test green.

### Unit 3: Link the replay at submit (opportunistic, all users)

**Goal:** Every report attaches the active `replayId`/`replayUrl` when a replay exists.
**Files:** `src/app/(app)/help/feedback/FeedbackForm.tsx`.
**Approach:** In `submit()` before the POST: `const replay = Sentry.getReplay();` read
`replay?.getReplayId()`; if present, `await replay.flush()` (must resolve BEFORE the state
resets/navigation or the segment never uploads) — wrap in try/catch so a flush REJECTION never
blocks the submit (log + proceed without the link). Then add `replayId` + `buildReplayUrl(...)` to
the `debugContext` object (schema v3). Guard for replay-absent (no-op). No behavior change when
Sentry/replay unavailable.
**Tests:** component/unit — payload includes `replayId`/`replayUrl` when `getReplay` returns an id;
omits them when null; `flush` awaited before reset; **`flush()` rejection still submits** (GAP from
eng-review). Mock `@sentry/nextjs`.
**Depends on:** Unit 1, Unit 2
**Verification:** file a report on Demo with a replay active; read the row back (from MAIN checkout,
`runAsTenant("org_demo_winery", …)`) and confirm `debugContext.replayId`/`replayUrl` populated.

### Unit 4: Surface "Open replay" in the developer workspace

**Goal:** A dev opening a ticket can jump straight to the rewindable session.
**Files:** `src/app/(app)/developer/DeveloperItemDetail.tsx`.
**Approach:** When `debugContext.replayUrl` is present, render an "▶ Open Sentry replay" external
link styled as an outline `Badge`/link (design-review — reuse the Badge idiom + external-link
affordance, token-based, theme-aware), new tab + `rel="noreferrer"`. Dev-only surface already (route
gated by `requireDeveloper`). Show nothing when absent. Keep reporter-facing My Reports unchanged.
**Tests:** render with/without `replayUrl` → link present/absent.
**Depends on:** Unit 1
**Verification:** the ticket from Unit 3 shows a working replay link in `/developer`.

### Unit 5: Narrative-forcing prompt on the report form

**Goal:** Capture intent (doing / expected / actual), not just symptoms.
**Files:** `src/app/(app)/help/feedback/FeedbackForm.tsx`.
**Approach:** Add three optional labeled fields to the BUG_REPORT form using the existing `Textarea`
component (design-review): "What were you doing?", "What did you expect?", "What actually happened?"
— each with a concrete placeholder example, small/2-row, shown for BUG_REPORT only (not FEATURE_REQUEST).
On submit write them to `debugContext.narrative` (schema v3) AND append a readable digest into `body` so
existing triage/LLM paths see it without schema awareness. Non-blocking (empty allowed). Token-based
spacing, theme-aware, matches the existing form's field rhythm.
**Tests:** narrative populated in payload; empty omitted; body digest appended.
**Depends on:** Unit 1
**Verification:** submit with the three fields filled; row shows `debugContext.narrative` + body digest.

--- Phase 2 (dev-only Break Mode) below ---

### Unit 6: Replay-fidelity — middleware cookie + Sentry server-side scrub belt

**Goal:** Make role+tenant fidelity available to the pre-auth Sentry init, with REAL enforcement
that a client-writable cookie can't provide. (Eng-review issue 1: "keep bodies, do it right.")
**Files:** `src/middleware.ts` (NEW — first middleware in the repo; scope its `matcher` to app
routes only), `src/lib/observability/replay-fidelity.ts` (pure mapping), `test/replay-fidelity.test.ts`,
Sentry project settings (server-side data-scrubbing — OUT OF REPO, document in the PR + `.env.example`).
**Approach:**
- Pure `resolveReplayFidelity({ role, effectiveTenantId })` → `"full"` when `isDeveloper` AND
  `effectiveTenantId === DEVELOPER_HOME_ORG_ID`, else `"masked"` (fail-closed).
- **Middleware** reads the Better Auth session cookie, resolves fidelity, and sets a NON-httpOnly,
  same-site `cbh_replay_fidelity` cookie on the RESPONSE (the only place Next allows both reading the
  session and setting a cookie before the client bundle boots — a server-component render throws on
  `cookies().set()`, and no middleware existed before this). Enum value only, no PII. Keep the
  matcher tight and the handler cheap (no DB — session cookie only) to avoid per-request latency.
- **Server-side belt:** configure Sentry project **Data Scrubbing / advanced datascrubbing** so
  request/response body fields are scrubbed at INGEST for anything not explicitly sandbox. This is
  the actual guarantee — the cookie only defaults the client; a dev who force-sets `full` in a real
  tenant is still caught server-side. Document the exact scrub rules in the PR.
**Tests:** pure mapping (dev+sandbox→full; dev+real→masked; non-dev→masked; no session→masked);
**middleware sets the cookie value on the response for each case** (GAP from eng-review). The
server-side scrub is verified manually in Sentry (see Unit 11).
**Depends on:** none
**Verification:** log in as demo developer → cookie `full`; real-tenant user → `masked`; force
`full` via devtools in a real tenant → confirm bodies are scrubbed at Sentry ingest anyway.
**Execution note:** middleware is the one innovation token this plan spends — keep it minimal.

### Unit 7: Sentry init reads fidelity; masking always on, bodies sandbox-only

**Goal:** Configure `replayIntegration` at init from the hint, safe-by-default.
**Files:** `src/instrumentation-client.ts`.
**Approach:** Read `cbh_replay_fidelity` from `document.cookie` synchronously. Always set
`maskAllText: true` + `blockAllMedia: true`. Only when `full`, set
`networkDetailAllowUrls: [window.location.origin + "/api"]` (+ `networkRequestHeaders`/
`networkResponseHeaders` as needed). Consider lowering `replaysSessionSampleRate` (ambient) to
reallocate quota to deliberate hunts (leave `replaysOnErrorSampleRate: 1.0`). Fail closed: unknown/
absent cookie → masked, no body capture.
**Tests:** hard to unit-test init directly; extract the option-builder into a pure
`buildReplayOptions(fidelity, origin)` in `sentry-replay.ts` and test THAT (full → networkDetail
set + masking; masked → masking only, no networkDetail).
**Depends on:** Unit 2, Unit 6
**Verification:** in Demo (dev) DevTools, replay network events include `/api` bodies; in a real
tenant, no bodies + text masked. Confirm via a captured replay in the Sentry viewer.

### Unit 8: Interaction + network-metadata trail buffer

**Goal:** A durable, machine-readable "what they did" trail for the ticket + the AI.
**Files:** `src/lib/observability/interaction-buffer.ts` (new), `test/interaction-buffer.test.ts`.
**Approach:** Mirror `console-buffer.ts`: a pure `createInteractionBuffer` ring + a browser
installer that (only when armed by Break Mode) records route changes (App Router transitions),
clicks (element label/`aria-label`/text only — NEVER input values), and form submits; plus a light
network-metadata recorder (method, same-origin URL path, status, duration, sizes — NEVER bodies).
IMPORT `redactString` + the clamp helpers from `console-buffer.ts`/`debug-context.ts` — do NOT
re-implement (DRY, eng-review). Use ONE delegated `document` click listener reading `closest()` for
a label, active only while armed. In `masked` fidelity, additionally strip click text to element role only.
`drainInteractionTrail()` / `clearInteractionTrail()`. Bounded like the console buffer.
**Tests:** pure ring — records/bounds/redacts; masked mode drops labels; drain shape matches schema.
**Depends on:** Unit 1
**Verification:** unit tests green.

### Unit 9: Break Mode client state + toggle + indicator

**Goal:** The dev-only deliberate-hunt control.
**Files:** `src/components/observability/BreakModeControl.tsx` (new) + a `useBreakMode` hook/context,
mounted from `src/components/AppShell.tsx` (gated by the existing `isDeveloper`); pass
`effectiveTenantId`/`isSandbox` from `src/app/(app)/layout.tsx` into `AppShell`.
**Approach:** Toggle ON → `Sentry.getReplay()?.start()` (session mode), set tags `hunt=true` +
generated `huntId` (`Sentry.setTag`/`setContext`), arm the interaction buffer, escalate the console
buffer cap (add an optional `setMaxEntries`/`escalate()` to `console-buffer.ts`, e.g. 50→200). Show
a fixed indicator naming tenant + fidelity. **Indicator design (design-review, token-based, theme-aware):**
- **Tenant-risk color coding** (future-proofs opening to real tenants; feature stays dev-gated now):
  real customer tenant → `--danger` (#B63D35) pulsing dot, label "● REC · {tenant} · metadata only"
  (loud — recording a real customer is the risky state); sandbox (Demo) → `--warning` amber, calmer,
  "● REC · Demo Winery · full capture". Never `--wine-primary` (reads as normal chrome + too close to
  danger red).
- **Degraded state** → neutral `--ink-600` + `--warning` glyph, "⚠ quota exhausted — replay unavailable".
- **Countdown** appended: "· 27:14 left" (auto-off timer).
- **Placement:** fixed, top-center (clear of the bottom-right AssistantDock FAB), z-index above app
  chrome; tag it `data-feedback-capture-exclude` + `data-assistant-surface` so it's dropped from
  bug-report screenshots (reuse the PR #314 exclusion mechanism).
- **A11y:** `role="status"` + `aria-live="polite"` on state changes; `prefers-reduced-motion` → no
  pulse (static dot + text); AA contrast (danger red on cream passes). All colors via tokens, no hardcodes.
- **Toggle affordance:** a small LABELED control near the dock (dev-only), not a bare icon (explicit >
  clever); off = neutral, on = adopts the tenant-risk color; 44px min touch target. **AUTO-OFF timeout (eng-review issue 2):** Break Mode disables itself after ~30 min
(idle or elapsed) with a live countdown in the indicator, and stops on logout/tab-close
(`visibilitychange`/`beforeunload`) — bounds worst-case quota spend on the capped free plan. Reflect
real state: if `getReplay()` is absent or a `start/flush` throws/quota-drops, show "⚠ quota
exhausted — replay unavailable" and keep the (quota-independent) trail. Toggle OFF (or timeout) →
`replay.stop()`, stop arming, clear tags + de-escalate buffer. Dev-only (never rendered for non-devs).
**Tests:** hook logic unit-tested (arm/disarm, huntId set, indicator state machine incl. degraded,
**auto-off timeout fires + countdown + stop-on-hide** — GAP from eng-review).
**Depends on:** Unit 7, Unit 8
**Verification:** in Demo as developer, toggle Break Mode → 🔴 indicator + tags on the replay
(visible in Sentry); toggle in a real tenant → "metadata only" label.

### Unit 10: Bundle the hunt trail into the report

**Goal:** A report filed during a hunt carries `huntId` + interaction/network trail + `replayId`.
**Files:** `src/app/(app)/help/feedback/FeedbackForm.tsx`,
`src/app/(app)/assistant/FeedbackTicketModal.tsx` (consent step).
**Approach:** On submit, if Break Mode is active, drain the interaction buffer + read `huntId` and
add `interactionTrail`/`networkTrail`/`huntId` to `debugContext` (schema v3) alongside the Unit-3
replay link; `await flush()`. Clear the interaction buffer after submit (mirror
`clearConsoleBuffer`). No-op when Break Mode off.
**Tests:** payload includes trail + huntId when armed; omitted when off; buffers cleared post-submit.
**Depends on:** Unit 3, Unit 8, Unit 9
**Verification:** run a hunt on Demo, file a report, read the row back — `debugContext` has
`interactionTrail`, `networkTrail`, `huntId`, `replayId`.

### Unit 11: Tenancy guard test + `/bug-triage` consumption

**Goal:** Prove no real-tenant leakage; let the AI read the trail.
**Files:** `test/break-mode-tenancy.test.ts` (new), optional `scripts/verify-break-mode.ts` +
`package.json` script; `/bug-triage` skill in `~/.claude` (OUT OF REPO) + optional repo helper
`src/lib/observability/replay-segments.ts` (parse recording-segments).
**Approach:** (a) Test asserts `resolveReplayFidelity` + `buildReplayOptions` never enable
`networkDetailAllowUrls` for a non-sandbox tenant and always set masking; assert the masked
interaction buffer drops labels. (a2) MANUAL/documented: verify the Sentry server-side
data-scrubbing belt actually strips bodies at ingest even when a client forces `cbh_replay_fidelity=full`
in a real tenant (the client cookie is only a default; this is the real guarantee — eng-review 1b).
(b) `/bug-triage` fix agent step: read `debugContext`
(narrative + interactionTrail + networkTrail + consoleLog + replayUrl) into the repro brief;
OPTIONALLY, if `SENTRY_AUTH_TOKEN` present, fetch project-scoped recording-segments, decode, and
summarize. Log clearly when the token is absent (skip, not fail).
**Tests:** the tenancy assertions above; a parse test for a small canned segment payload (if the
repo helper is built).
**Depends on:** Unit 7, Unit 8, Unit 10
**Verification:** `npm test` tenancy suite green; a `/bug-triage` dry-run cites the trail on a
seeded Demo ticket.

## Test Strategy

**Unit tests:** pure cores get direct tests (debug-context clamp, `buildReplayUrl`/
`buildReplayOptions`, `resolveReplayFidelity`, interaction buffer, break-mode state machine) —
mirrors the existing `test/console-buffer.test.ts` discipline. Mock `@sentry/nextjs` for the
FeedbackForm submit tests.
**Integration/verify:** an optional `scripts/verify-break-mode.ts` (run from MAIN checkout,
`runAsTenant("org_demo_winery", …)`) files a ticket and reads back the `debugContext` shape.
**Manual verification:** in-app Claude browser on Demo, logged in as the developer user: file a
plain report (replay link appears in `/developer`); run a Break Mode hunt in Demo (full capture)
and in a real tenant via a support session (masked/metadata-only), confirming the indicator + the
Sentry replay contents match the fidelity. Keep `verify:naming` green before/after; QA-* fixtures
only; clean up.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| instrumentation-client can't see auth → wrong fidelity at init | MED | HIGH | Hint cookie (Unit 6) read synchronously; fail closed to masked |
| Sentry replay option not runtime-flippable per tenant | LOW | MED | No tenant switcher → tenant fixed per session; init-time resolution + reload-on-switch note |
| Free-plan quota exhaustion → dead links / false indicator | MED | MED | Flush-per-report (not per-session); degraded indicator + trail fallback (Unit 9); quota-drop monitor (follow-up) |
| Real-tenant PII captured (bodies/DOM/labels) | LOW | HIGH | Sandbox-only bodies, masking always on, masked interaction labels; tenancy test (Unit 11) |
| `flush()` not awaited → segment lost | MED | MED | Await before state reset/navigation (Unit 3); test asserts ordering |
| recording-segments decode complexity | MED | LOW | Optional/NICE; trail is the primary AI input; skip cleanly without token |
| Exact free-plan cap unknown | MED | MED | Assignment: confirm in Settings → Subscription before dialing ambient sampling |

## Success Criteria

- [ ] A report with an active replay carries a working "Open replay" link in `/developer`.
- [ ] Developer reports guarantee a replay (buffering armed); regular reports link opportunistically.
- [ ] Break Mode records an on-demand hunt with `huntId` tags visible in Sentry.
- [ ] `debugContext` for a hunt report contains `replayId`, `interactionTrail`, `networkTrail`,
      and (when filled) `narrative`; survives replay retention as the durable record.
- [ ] No request/response bodies or unmasked DOM/labels captured in a non-sandbox tenant
      (test-enforced).
- [ ] Replay spend stays ~one per filed report/hunt (no per-session burn increase).
- [ ] `/bug-triage` fix agent cites the trail on a seeded ticket.
- [ ] All tests pass; no regressions (`test/console-buffer.test.ts`, feedback suite, verify:naming).

## Build status

- **Phase 1 (Units 1–5) — BUILT 2026-07-19** on branch `claude/enhanced-bug-reporting-network-cc8b6f`
  (worktree; main checkout was occupied). 6 commits. debugContext v3 clamp + `buildReplayUrl`/
  `captureReplayLink`/`safeSentryReplayUrl` (pure) + replay link at submit + "Open Sentry replay" in
  `/developer` + narrative prompt. Gates: `tsc --noEmit` clean, eslint clean, **vitest 2471 passed**
  (24 new tests; fixed one stale existing assertion). No DB/migration needed. Next: `/review` → `/ship`.
- **Phase 2 (Units 6–11) — BUILT + browser-QA'd 2026-07-19**, same branch. 6 commits. Gates: `tsc`
  clean, eslint clean, **vitest 2516 passed**, `next build` clean (proxy registered). Browser-QA'd on
  Demo Winery end to end: toggle renders (44px, dev-only), indicator read
  `REC · Demo Winery · full capture · 29:53 left` in `--warning` amber with a pulsing dot, survived
  soft navigation, and a report filed mid-hunt persisted `huntId` + 5 interactions + 3 network entries.
  Rendered trail: `click — Inventory / GET /inventory → 200 (76ms) / route — /inventory / GET
  /api/feedback/tickets → 405 (37ms) / click — Submit feedback`. Privacy verified on the stored row:
  no body/value fields and the `?probe=1` **query string was stripped**. QA fixture cleaned up.

### Phase 2 deviations from the plan (all deliberate, all verified)
1. **Unit 6 — `proxy.ts` already existed.** Next 16 renames middleware to `proxy`, and the repo ships
   one. So no new infra and no innovation token. But it only has `getSessionCookie` (presence, no DB)
   and is explicitly not a security boundary (CVE-2025-29927), so resolving role/tenant there would
   mean a session+member DB lookup on EVERY request. Instead fidelity is written where it can change
   (support-tenant enter/exit, plus a mount-time sync from the dev-only control) and `proxy` clears it
   when there is no session. Same architecture, correct mechanism; every gap fails closed to `masked`.
2. **Unit 11 — added the hunt-trail display in `/developer`.** Small scope addition: without it the
   trail is invisible to humans (the same "captured but never rendered" gap found in Phase 1). The
   structured arrays still go to the fix agent via `debugContext`.
3. **NOT DONE (out of repo, flagged):** the `/bug-triage` skill step that reads the trail lives in
   `~/.claude`, and editing a global skill would affect other projects — left for an explicit decision.

### ⚠ Outstanding prerequisite before ANY real-tenant use
**Sentry server-side data-scrubbing rules are not yet configured.** The fidelity cookie is
client-writable, so it is a client-side default, not the guarantee. Until ingest-side scrubbing is set
up in the Sentry project, treat Break Mode as sandbox-only in practice. Recorded in
`docs/architecture/security-register.md` (status 🟡).

## Eng-Review Addenda (2026-07-19)

### Decisions locked
- **Issue 1 (bodies + cookie):** Keep bodies, do it RIGHT — Next middleware sets the fidelity
  cookie + Sentry server-side data-scrubbing is the real enforcement belt (Unit 6 rewritten).
- **Issue 2 (hunt recording):** Session mode + auto-off timeout + stop-on-hide (Unit 9 updated).
- Applied directly (obvious fixes): flush() rejection guard (Unit 3), interaction-buffer DRY import
  (Unit 8), auto-off + middleware-cookie + flush-reject test gaps added (Units 3/6/9), server-side
  scrub verification (Unit 11 a2).

### What already exists (reused, not rebuilt)
- Console ring buffer pattern ([console-buffer.ts](src/lib/observability/console-buffer.ts)) → the
  template for the interaction buffer + source of `redactString`/clamp (DRY).
- `debugContext` clamp ([debug-context.ts](src/lib/feedback/debug-context.ts)), Vercel Blob
  attachments, `isDeveloper` gate ([AppShell.tsx:289](src/components/AppShell.tsx)),
  `DEVELOPER_HOME_ORG_ID` ([access.ts:28](src/lib/access.ts)), and Sentry Replay
  ([instrumentation-client.ts](src/instrumentation-client.ts)) — all reused, no parallel build.

### NOT in scope (deferred, with rationale)
- Assistant `file_feedback` replay linking — server-committed, no client replay handle; follow-up.
- In-app tenant switcher — not built; tenant is fixed per session (what makes init fidelity safe).
- Quota-drop monitor (Sentry Stats API alerting) — NICE; the degraded indicator covers the UX.
- rrweb recording-segments decode for the AI — NICE/optional; the durable trail is the primary input.
- Raising ambient session sampling / any paid-plan feature.

### Failure modes (new codepaths)
| Codepath | Realistic failure | Test? | Error handling? | User sees? |
|----------|-------------------|-------|-----------------|-----------|
| Unit 3 replay link | `flush()` rejects/times out | YES (added) | try/catch → submit proceeds | submit succeeds, no link (fine) |
| Unit 6 middleware | session cookie unreadable | YES (added) | fail-closed → `masked` | no body capture (safe) |
| Unit 6 belt | dev force-sets `full` in real tenant | manual verify | Sentry ingest scrub | bodies scrubbed server-side |
| Unit 9 break mode | dev leaves it on | YES (added) | auto-off timeout + stop-on-hide | indicator countdown, then off |
| Unit 9 indicator | quota exhausted mid-hunt | YES | degraded state | "⚠ quota exhausted", trail still captured |
No critical gaps (every failure has a test AND handling AND is non-silent).

### Parallelization
- **Lane A (Sentry-config chain, sequential):** Unit 1 → Unit 2 → Unit 6 → Unit 7 → Unit 9 → Unit 10 → Unit 11.
- **Lane B (parallel after Unit 1):** Unit 8 (interaction buffer) — independent of the Sentry chain.
- **Lane C (parallel after Unit 1):** Unit 4 (dev workspace link) + Unit 5 (narrative prompt) — UI-only, no shared modules with A/B.
- Phase 1 (Units 1–5) ships and merges before Phase 2 (Units 6–11) — the phases are the natural sequential boundary.
- Conflict flag: Units 3 and 10 both touch `FeedbackForm.tsx` — keep them in the same lane (sequential), never parallel.

## Approved Design Decisions (design-review 2026-07-19)

- **Recording indicator = tenant-risk color coding** (token-based, theme-aware): real customer tenant
  → `--danger` pulsing (loud); sandbox → `--warning` amber (calmer); degraded → neutral + `--warning`.
  Never `--wine-primary`. Countdown appended. Top-center, excluded from bug-report screenshots,
  `role=status`/`aria-live`, `prefers-reduced-motion` aware. Future-proofs opening to real tenants;
  **feature stays developer-gated for now** (user decision).
- **Toggle:** small labeled dev-only control near the dock (explicit > bare icon), 44px target.
- **Narrative prompt:** three labeled `Textarea` fields with example placeholders, BUG_REPORT only.
- **Replay link:** outline Badge/external-link idiom in `/developer`.
- All decisions use existing tokens (`colors.css`/`spacing.css`) + the `Badge`/`Textarea` components —
  no hardcoded colors or spacing.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 2 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 5/10 → 9/10, 4 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0
- **VERDICT:** ENG + DESIGN CLEARED — ready to implement. Preceded by an /office-hours design doc.
