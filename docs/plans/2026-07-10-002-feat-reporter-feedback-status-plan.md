---
title: Reporter-facing "your reports" feedback status view
type: feat
status: completed
date: 2026-07-10
branch: feat/reporter-feedback-status
depth: standard
units: 4
---

## Overview

Give the winery user who submitted a bug/feature report an in-app view that it was seen and
worked. Today `/help/feedback` is submit-and-forget; the only status surface is `/developer`
(developer-role-gated). The `/bug-triage` goalie already writes the true status back to the DB, so
the reporter's outcome exists, it's just invisible to them. This adds a passive, tenant+user-scoped
"Your reports" list with a plain-English status badge on each item.

## Problem Frame

A cellar hand at Bhutan Wine Co. reports "the barrel-down button 500s." The goalie fixes it, merges
the PR, and writes the ticket to RESOLVED. The cellar hand sees... nothing. No list, no badge, no
signal. From their seat the feedback box is a black hole, which trains people to stop reporting.

The job the reporter is hiring this for: "did anyone look at the thing I flagged, and what happened?"
Two honest outcomes must both be legible: **we made the change** (RESOLVED) and **we looked and won't
change it** (DISMISSED). Silence on either is the failure.

Do nothing → reporting decays and the whole feedback→fix loop (the thing `/bug-triage` exists to
serve) loses its input. Low build cost, real retention-of-signal payoff.

**Product note (not blocking):** the highest-value version pushes a signal when status flips
(notification/inbox). The user explicitly scoped this cut to passive (list + badges); active
notification is a deliberate follow-on, flagged in Out of Scope.

## Requirements

- MUST: a signed-in user sees a "Your reports" list on `/help/feedback` of THEIR OWN submissions —
  both `FeedbackTicket` (bug/feature) and `AssistantFeedback` thumbs-down (`rating === "down"`).
- MUST: each row shows a reporter-friendly status badge covering BOTH outcomes:
  NEW/TRIAGED → "Open" (or "Reviewing"), IN_PROGRESS → "In progress", RESOLVED → "Resolved",
  DISMISSED → "Reviewed, no change" (won't-fix).
- MUST: scoped to the current user's own items (`actorUserId === user.id`) within their tenant; the
  read goes through the session-tenant-scoped `prisma`, NEVER the developer cross-tenant reader.
- MUST: NOT expose internal fields to the reporter — no `developerNotes`, `prUrl`, `githubIssueUrl`,
  `severity`, `automationStatus`, `debugContext`. Show only title/kind/status/submitted+resolved dates.
- MUST: reuse existing `Badge`/`Card` UI + DESIGN.md tokens; no hardcoded colors/fonts; no new deps.
- SHOULD: the list reflects a just-submitted report without a manual full reload (refresh the server
  data after `FeedbackForm` submit).
- SHOULD: sensible empty state ("No reports yet") and newest-first ordering.
- NICE: a subtle "Updated <date>" when `resolvedAt` is set, so "we addressed it" has a timestamp.

## Scope Boundaries

**In scope:**
- Read path for the current user's own feedback (server data fn, session-tenant-scoped).
- Pure status→badge mapping (label + tone), unit-tested.
- `/help/feedback` page: render "Your reports" alongside the existing form; refresh-on-submit.

**Out of scope (flag as follow-ons):**
- **Active notification** when status flips (toast/inbox/badge-in-nav). This is the higher-value
  cut the user deferred; note it.
- **A public-facing resolution message** ("here's what we changed / why we won't"). `developerNotes`
  is internal and must not leak; a reporter-safe message would be a NEW schema column
  (`resolutionMessage` + who/when) → a tenant-scoped migration. Not now.
- Editing/reopening/commenting on a report from the reporter side.
- Cross-user visibility (seeing other people's reports in the same tenant) — see Decision below.

## Research Summary

### Codebase Patterns
- Submit-only today: [help/feedback/page.tsx](src/app/(app)/help/feedback/page.tsx) renders
  [FeedbackForm.tsx](src/app/(app)/help/feedback/FeedbackForm.tsx) (a **shared** client component,
  also used by the assistant's `FeedbackTicketModal`). [/api/feedback/tickets/route.ts](src/app/api/feedback/tickets/route.ts)
  is POST-only.
- Models both carry what we need ([schema.prisma:871](prisma/schema.prisma:871) AssistantFeedback,
  [schema.prisma:907](prisma/schema.prisma:907) FeedbackTicket): `actorUserId`, `status`,
  `resolvedAt`, `createdAt`, `tenantId`. FeedbackTicket has `kind/title/body`; AssistantFeedback has
  `rating`/`comment` and its status is a plain String (`NEW|TRIAGED|RESOLVED|DISMISSED`, no
  IN_PROGRESS), while FeedbackTicket uses the `FeedbackItemStatus` enum (adds IN_PROGRESS). The
  mapping must handle both status vocabularies.
- Tenant scoping: per AGENTS.md/CLAUDE.md, an `(app)` server component reading via the extended
  `prisma` (`@/lib/prisma`) auto-resolves the session tenant (RLS-enforced). The developer reader
  (`getDeveloperFeedbackData`, which wraps `runAsTenant` per tenant) is the WRONG tool here — it's
  cross-tenant and role-gated. Use a plain session-scoped query.
- Session user: `getCurrentUser()` from `@/lib/dal` returns `id`, `email`, `banned`,
  `mustChangePassword`, `activeOrganizationId`, `supportOrganizationId` (used in the POST route).
- Write-then-refresh precedent: [[assistant-write-refresh-and-wo-routing]] — `router.refresh()` after
  a write re-runs the server component. Same trick refreshes the list after a submit.
- Badge tones seen in use: `neutral`, `gold`, `red` ([DeveloperClient.tsx:137](src/app/(app)/developer/DeveloperClient.tsx:137)),
  `neutral` in FeedbackForm. Unit 2 must confirm the full tone set in `@/components/ui` Badge and pick
  an existing positive/success tone for "Resolved" (do not invent one).

### Prior Learnings
- [[bug-triage-skill-shipped]] — the goalie writes status via `triage:resolve` (CLI twin of
  `updateFeedbackItem`) to these exact columns; this view is the read side of that write.
- No jsdom/RTL in the repo; vitest is node-env ([[assistant-dock-history-shipped]]) → UI ships
  manual-QA-only; only the pure status→badge mapping gets a unit test.
- Demo Winery is the QA tenant ([[demo-winery-testing-convention]]); QA fixtures are `QA-*`-prefixed.

### External Research
None — no new framework surface.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Read path | Server data fn called from the page (server component) | New `GET /api/feedback/tickets` | The list is initial-render data; a server fn needs no client fetch/loading state and auto-scopes to the session tenant. A GET route is extra surface + manual auth/tenant plumbing. |
| Visibility scope | The user's OWN items (`actorUserId === user.id`) | All items in their tenant | "Your reports" = what *I* submitted. Tenant-wide would surface other users' (possibly sensitive) report text and needs a product call. Own-only is the safe, obvious v1. |
| Reporter-safe fields | title/kind/status/dates only | Also show developer notes / PR links | `developerNotes` is internal triage chatter; PR/issue links + severity are internal. Leaking them is a data-exposure bug. Whitelist, don't blacklist. |
| Freshness | `router.refresh()` after submit | Poll / client fetch | Passive scope; refresh-on-submit is the one dynamic moment that matters and reuses the existing pattern. |
| No resolution message v1 | Status + `resolvedAt` timestamp only | Add a reporter-safe `resolutionMessage` column | A real "here's what we did" needs a schema migration (tenant-scoped, RLS checklist) + a goalie change to write it. Deferred; status + date already answers "was it addressed." |
| Mapping location | Pure module, unit-tested | Inline in the component | The two status vocabularies (enum vs string) make the mapping the one bug-prone bit; isolate + test it. |

## Implementation Units

### Unit 1: Reporter-scoped read of the current user's feedback
**Goal:** Return the signed-in user's own tickets + down-rated assistant feedback, tenant-scoped, reporter-safe.
**Files:** `src/lib/feedback/my-reports.ts` (new).
**Approach:** Add `getMyReports()`: resolve `getCurrentUser()`; if none, return `[]`. Query via the
session-scoped `prisma` — `feedbackTicket.findMany({ where: { actorUserId: user.id }, orderBy: { createdAt: 'desc' } })` and `assistantFeedback.findMany({ where: { actorUserId: user.id, rating: 'down' }, orderBy: { createdAt: 'desc' } })`. Do NOT use `getDeveloperFeedbackData`/`runAsTenant` — the session tenant + RLS scope it. Return a merged, newest-first array of a NARROW reporter-safe shape only: `{ sourceType, id, kind, title, status, createdAt, resolvedAt }` (for assistant items, title = "Assistant feedback" and kind = "Assistant"; never include comment/body if it risks leaking, but the user's own submitted text is theirs to see — include a short title only). Explicitly select/whitelist columns; never spread the row.
**Tests:** No DB unit test (node-env, no harness for RLS); verified live in Unit 4 against Demo Winery. Assert by code review that only whitelisted fields are returned.
**Depends on:** none
**Patterns to follow:** session-scoped `prisma` read (contrast [feedback.ts](src/lib/developer/feedback.ts) which is the cross-tenant reader — do the opposite); `getCurrentUser` usage in [tickets/route.ts:8](src/app/api/feedback/tickets/route.ts:8).
**Verification:** From the main checkout, a tsx one-off wrapped in `runAsTenant('org_demo_winery', …)` calling a thin wrapper returns only the demo user's rows with the narrow shape.

### Unit 2: Pure status → reporter badge mapping
**Goal:** One tested function turns any ticket/assistant status into a reporter-friendly `{ label, tone }`.
**Files:** `src/lib/feedback/reporter-status.ts` (new), `test/reporter-status.test.ts` (new).
**Approach:** `reporterStatus(status: string): { label: string; tone: BadgeTone }` covering BOTH
vocabularies: `NEW`/`TRIAGED` → "Open" (neutral), `IN_PROGRESS` → "In progress" (gold), `RESOLVED` →
"Resolved" (positive/success tone — use the actual tone name the Badge component supports; confirm the
tone set in `@/components/ui` first), `DISMISSED` → "Reviewed, no change" (neutral or red-muted).
Unknown/any other → "Open" (fail-safe visible, never blank). Keep it pure (no imports beyond the
Badge tone type).
**Tests:** `test/reporter-status.test.ts` — one case per status value + an unknown value; assert label
and that tone is a valid Badge tone. Follows the existing pure-logic vitest pattern (e.g. `test/voice-*.test.ts`).
**Depends on:** none
**Verification:** `npm run test -- reporter-status` (or the repo's vitest invocation) is green.

### Unit 3: "Your reports" UI on the help page
**Goal:** Render the list with badges next to the form, refreshing after a submit.
**Files:** `src/app/(app)/help/feedback/page.tsx` (modify), `src/app/(app)/help/feedback/MyReports.tsx` (new, server), `src/app/(app)/help/feedback/FeedbackPanel.tsx` (new, thin client wrapper) — final component split at the implementer's discretion.
**Approach:** Make `page.tsx` await `getMyReports()` and render a "Your reports" `Card`/section (server)
below the form: each row = title + `reporterStatus` badge + submitted date (+ "Updated <resolvedAt>"
when set); empty state when none. For refresh-on-submit without changing the SHARED `FeedbackForm`
API destructively: wrap the form in a small client component that passes `onSubmitted={() => router.refresh()}` (FeedbackForm already accepts `onSubmitted`). Do not alter FeedbackForm's other call site (assistant modal). All styling via DESIGN.md tokens; reuse `Badge`/`Card`.
**Tests:** Manual QA (Unit 4) — no jsdom. Keep any conditional logic trivial so the risk lives in the tested mapping.
**Depends on:** Unit 1, Unit 2
**Patterns to follow:** server component data fetch in [help/feedback/page.tsx](src/app/(app)/help/feedback/page.tsx); token-based inline styles as in FeedbackForm; `router.refresh()` after write per [[assistant-write-refresh-and-wo-routing]].
**Verification:** Page renders the current user's reports with correct badges; submitting a new report makes it appear without a manual reload.

### Unit 4: Live QA in Demo Winery
**Goal:** Prove the loop end to end on real data, and prove isolation.
**Files:** none (QA only).
**Approach:** Using the Playwright `storageState` harness (per CLAUDE.md UI-QA section) as the Demo
Winery user: (a) submit a `QA-*` bug report → it appears under "Your reports" as "Open"; (b) flip its
status via `npm run triage:resolve -- --status=RESOLVED` (or DISMISSED) → after refresh the badge reads
"Resolved"/"Reviewed, no change"; (c) confirm a report submitted by a DIFFERENT user is NOT listed
(own-only scope) and that no internal field (developer notes / PR link) appears anywhere in the DOM.
**Tests:** The three manual scenarios above; `verify:naming` green before and after; mutate only `QA-*` fixtures.
**Depends on:** Unit 3
**Verification:** All three scenarios pass; screenshot the list showing an Open and a Resolved item.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Verified the submit-only page, POST-only route, and role-gated `/developer`; the gap is real. |
| Scope Boundaries | HIGH | Own-only + whitelist + no-schema keeps it a pure read feature; notification/resolution-message deferred cleanly. |
| Implementation Units | HIGH | Read + pure mapping + one page edit; models already carry every field, no migration. |
| Test Strategy | MEDIUM | Only the mapping is unit-tested (repo has no jsdom); UI + isolation lean on Demo-Winery manual QA — standard here but manual. |
| Risk Assessment | HIGH | Main risk is a data leak (internal fields) or a tenant/user scope miss; both are addressed by whitelisting the returned shape and asserting isolation in Unit 4. |

## Risks & Mitigations

- **Leaking internal triage data to a customer.** `developerNotes`/PR/issue/severity must never reach
  the reporter. Mitigate: Unit 1 returns an explicit narrow shape (whitelist, never spread the row);
  Unit 4 greps the rendered DOM for internal fields.
- **Wrong scope (see another user's or another tenant's reports).** Mitigate: session-scoped `prisma`
  (RLS) + `actorUserId === user.id` filter; Unit 4 verifies a second user's report is absent.
- **Two status vocabularies drift.** AssistantFeedback status is a String, FeedbackTicket an enum.
  Mitigate: one pure `reporterStatus` with an explicit default and a test per value.
- **Touching the shared FeedbackForm.** It's reused in the assistant modal. Mitigate: don't change its
  API; add refresh via a wrapper passing the existing `onSubmitted` prop.
