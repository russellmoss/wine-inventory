---
title: Team-ready developer intake and Linear delivery handoff
type: feat
status: planned
date: 2026-07-14
branch: codex/developer-intake-linear-handoff
depth: deep
units: 8
delivery: 3 mergeable PRs (agentic routing; Linear link core; developer UX and runbook)
decision: Pilot Linear Free as the human delivery queue; keep /developer as the tenant-safe intake and automation console
---

## Recommendation

Adopt **Linear Free now**, because adding a second developer creates a real ownership and handoff
problem. Do **not** replace the app's feedback system with Linear and do **not** build sprint planning,
assignment, estimates, or a Kanban clone into `/developer`.

Use one source of truth for each concern:

| Concern | Source of truth |
|---|---|
| User-submitted report, tenant context, screenshots, automation history, reporter-visible outcome | Wine Inventory (`FeedbackTicket` / `AssistantFeedback`) |
| Human priority, assignee, cycle, project, and day-to-day delivery status | Linear |
| Branches, commits, checks, pull requests, review, and merge | GitHub |
| Generated plan/fix-agent run state | Existing `AutomationRun` + GitHub workflow links |

The first release is a **manual, explicit promotion** from `/developer` to Linear: copy a sanitized
handoff packet, create the Linear issue, and paste its URL back into the feedback item. Linear's
GitHub integration links the resulting branch/PR. There is no Linear API key, webhook, OAuth flow,
or bidirectional status sync in v1.

`/bug-triage` remains the upstream agentic goalie. It still classifies, deduplicates, dispatches safe
fixes, generates plans through the existing GitHub Actions path, reviews outcomes, and writes status
back to the app. Linear begins **after** that disposition/routing decision; it is the shared human
delivery queue, not a replacement for triage or automation.

This boundary is deliberate. It gives two developers a proper shared queue immediately while keeping
tenant data and private screenshots inside the application, and it avoids creating three competing
copies of every status and assignee.

## Why Linear Free Is Enough Now

Snapshot checked 2026-07-14 against the official pricing and product documentation:

- Free: **unlimited members, 2 teams, 250 issues**, core issues/projects/cycles/initiatives,
  API/webhook access, and 10 MB file uploads.
- Basic: **$10/user/month billed yearly**, 5 teams, unlimited issues/uploads, and admin roles.
- Business: **$16/user/month billed yearly**, unlimited teams plus private teams/guests and the
  advanced triage/insights features.
- The repository currently has **20 GitHub issues total, 5 open**. We will promote only actionable
  feedback, not mirror every raw report, so 250 Linear issues is ample for the two-developer pilot.

Official references:

- <https://linear.app/pricing>
- <https://linear.app/docs/teams>
- <https://linear.app/integrations/github>
- <https://linear.app/docs/github-integration>

Free-plan limitations are acceptable only while the workspace contains trusted developers. Free does
not provide private teams. Raw tenant context, actor email, user agent, debug JSON, and private Blob
attachments therefore remain in Wine Inventory; the handoff packet contains the minimum engineering
summary plus a source item ID/link. If non-developer stakeholders join the Linear workspace, review
the privacy boundary before inviting them.

Linear Free also makes every workspace member an admin. That is acceptable for this two-trusted-
developer pilot, but it is an explicit exit trigger: do not add contractors, customers, or general
staff to this workspace without moving to a plan/permission model that fits the new trust boundary.

## Overview

`/developer` currently combines four jobs on one long page:

1. per-tenant automation-mode settings;
2. a bounded cross-tenant feedback table;
3. detailed ticket/assistant-feedback triage and notes;
4. links to generated plans, GitHub issues, workflow runs, and PRs.

That is workable for one developer, but it does not clearly distinguish unreviewed reports from work
that has entered the engineering queue. It also has no durable link to a human planning system and no
shared assignment/cycle model. With two developers, verbal ownership and ad-hoc GitHub links will
eventually produce duplicate work or orphaned tickets.

This plan reframes `/developer` as the **intake, evidence, and outcome console**:

- **Inbox** — untriaged/new reports needing a decision.
- **Ready to promote** — actionable defects/model misses/product gaps with no delivery link or PR.
- **Tracked work** — promoted to Linear and/or already attached to generated GitHub work.
- **Closed** — resolved or dismissed, with the existing outcome timeline.
- **Automation settings** — moved out of the primary backlog flow into its own panel/tab.

The queues are derived from existing status, disposition, automation, PR, and delivery-link data; they
are not another persisted status enum.

## Problem Frame

The product has built a strong feedback intake and self-healing loop, but `/developer` is not a team
delivery tracker:

- `DeveloperFeedbackItem` has no shared delivery-system link other than generated GitHub artifacts.
- `AssistantFeedback.status` is a legacy string while `FeedbackTicket.status` is an enum. Adding a
  second internal workflow state would deepen that split.
- The table is intentionally bounded to at most 20 tenants × 8 items, so its current presentation must
  not imply that it is a complete project backlog.
- Reporter screenshots and debug context can contain sensitive tenant information and should not be
  copied wholesale into a general planning tool.
- GitHub is excellent for code review and automation, but using issues, PRs, app tickets, and a new
  tracker without explicit ownership boundaries would create status drift.

The right problem is not "make `/developer` into Linear." It is: **make the transition from private
product feedback to shared engineering work explicit, safe, and visible.**

## Requirements

- MUST: `/developer` clearly separates Inbox, Ready, Tracked, Closed, and Automation settings.
- MUST: the application remains the canonical store for original feedback, attachments, automation
  history, tenant context, and reporter-facing outcomes.
- MUST: Linear is the sole human source for engineering assignee, priority, project/cycle, and active
  delivery status once an item is promoted.
- MUST: GitHub remains the sole source for branch/PR/check/review/merge state.
- MUST: a developer can create a sanitized Markdown handoff packet without copying actor email,
  user-agent text, raw debug context, Blob URLs, signed URLs, or screenshot bytes.
- MUST: a developer can attach at most one active Linear issue link to each `FeedbackTicket` or
  `AssistantFeedback`, with who/when provenance and tenant isolation. Multiple duplicate reports may
  deliberately point to the same Linear issue.
- MUST: `/bug-triage` receives both `awaitingRunId` and `awaitingRunKind`; it may dispatch a
  `PLAN` run for a product gap and an `AGENTIC_FIX` run for an in-fence defect, but it must never send
  a product gap to the fix agent or describe an awaiting PLAN as a fix.
- MUST: a product gap or feature request with no PLAN run can be routed idempotently into the existing
  `feedback_plan` GitHub Actions workflow after triage; an already queued/running fix run cannot be
  silently canceled or reclassified.
- MUST: Linear URLs are server-validated as exact `https://linear.app/.../issue/...` URLs; client
  validation is only a convenience.
- MUST: promotion/linking is developer-only, tenant-scoped through `runAsTenant`, audited in the
  item's human outcome/notes history, and idempotent.
- MUST: an item's existing GitHub issue/plan/run/PR links remain visible; promotion does not create or
  delete GitHub artifacts.
- MUST: every handoff has an authenticated `/developer` deep link keyed only by tenant/source/id; it
  never carries a support token, original page query string, signed attachment URL, or reporter data.
- MUST: deep links use an exact `tenantId + sourceType + sourceId` loader after `requireDeveloper()`;
  they do not depend on the bounded 8-items-per-tenant list or fuzzy tenant search.
- MUST: same-URL retries are idempotent, while a different-URL replacement uses an expected-version
  check and fails visibly on stale concurrent edits instead of silently choosing the last writer.
- MUST: no raw Bhutan Wine Co. test data is created. Automated and browser QA use Demo Winery only.
- MUST: a second developer can be onboarded through the already-shipped developer-role flow, then
  work from Linear without receiving production database credentials.
- SHOULD: filters and active queue survive in the URL so two developers can share a useful view.
- SHOULD: split the current `DeveloperClient.tsx` while touching it so the queue, detail, and tenant
  settings surfaces have bounded responsibilities.
- MUST NOT: call the Linear API, store a Linear API key, receive Linear webhooks, or attempt automatic
  two-way status/assignee sync in v1.
- MUST NOT: turn `/developer` into a project/cycle/estimate/assignment system.
- MUST NOT: enable GitHub Issues Sync during the pilot; generated GitHub issues plus Linear issue sync
  can create duplicate planning items. Use PR/commit linking through the Linear issue ID instead.

## Scope Boundaries

### In scope

- Linear Free workspace/team conventions and second-developer onboarding runbook.
- A tenant-scoped delivery-link record between one feedback source and one Linear issue.
- A hardened `/bug-triage` contract that preserves the existing PLAN and AGENTIC_FIX GitHub Actions
  routes and can create a missing PLAN run for a triaged product gap.
- A pure safe-handoff Markdown builder.
- A developer action to add/replace a Linear link with explicit confirmation and history.
- Queue derivation, filters, counts for the loaded tenant page, and the `/developer` information-
  architecture redesign.
- Existing plan, automation, GitHub issue, run, PR, attachments, and outcome history in one detail
  surface.
- Tests for queue derivation, URL parsing, safe handoff, RLS/isolation, and developer authorization.
- Manual Demo Winery browser QA and a 30-day process review.

## NOT in scope

- Linear OAuth/API/webhook integration.
- Mirroring Linear assignee/status/priority/cycle into Postgres.
- Sending ticket screenshots or raw debug context to Linear.
- Importing all existing GitHub issues into Linear.
- Replacing GitHub Actions automation or existing plan/fix agents.
- Replacing `FeedbackTicket` and `AssistantFeedback` with one large unified model.
- Normalizing the legacy `AssistantFeedback.status` string in this change.
- Customer-facing Linear access, guest accounts, or external support intake.
- A real-time cross-tenant global query that bypasses RLS. The current bounded tenant fan-out remains.
- A generic multi-tracker adapter or one-value tracker enum. V1 is deliberately Linear-specific; a
  generic abstraction waits until a second tracker is actually adopted.
- Automatic cancellation of a queued/running agentic fix when triage changes its disposition. That
  race is surfaced for human resolution because the GitHub job may already be executing.
- A synthetic “stale Linear” warning. Without reading Linear activity, age since linking is not a
  truthful delivery-status signal; use the 30-day manual drift audit until an integration exists.

## What already exists

- `/developer` is gated by `requireDeveloper()` in
  `src/app/(app)/developer/page.tsx` and loads `getDeveloperFeedbackData(...)`.
- `src/lib/developer/feedback.ts` intentionally reads at most 20 tenants per page and 8 feedback
  items per tenant through tenant-scoped reads. Preserve that RLS boundary.
- `src/app/(app)/developer/DeveloperClient.tsx` renders tenant automation controls, filters, the
  backlog table, and the item editor in one client component.
- `src/lib/developer/actions.ts` owns support entry, automation-mode changes, item updates, and run
  approval. New mutations belong here or behind a thin action that calls a pure/domain helper.
- Both feedback source models already carry severity, disposition, status, generated-plan fields,
  GitHub issue/run/PR links, resolved provenance, and developer notes.
- `FeedbackAttachment` is the exact schema precedent for a tenant-scoped record referencing exactly
  one of `FeedbackTicket` or `AssistantFeedback`: two nullable composite FKs plus a database CHECK.
- `AutomationRun` is the precedent for a common source vocabulary and idempotency.
- `dispatchApprovedRun(...)` already branches on `AutomationRun.kind`: PLAN emits
  `feedback_plan`; AGENTIC_FIX emits `assistant_feedback` or `feedback_bug_fix`. Reuse this dispatcher.
- `.github/workflows/feedback-plan.yml` already builds a plan, creates a GitHub issue, and marks the
  source PLANNED. Do not create a second planning pipeline for Linear.
- `scripts/bug-triage-list.ts` currently exposes only `awaitingRunId`, while the underlying loader
  selects no run `kind`; the global bug-triage workflow consequently describes every awaiting run as
  a fix. This is the contract gap this plan must close.
- `recordAutomationGate(...)` creates a run only from the submission-time tenant mode. A later
  PRODUCT_GAP classification therefore needs an idempotent PLAN-run creation path when the original
  mode was REPORT_ONLY or AGENTIC_FIX.
- `parseTriageNotes` already renders machine/human outcome history. Promotion should prepend a human
  history entry rather than introduce a second audit display.
- `BETTER_AUTH_URL` is already the trusted application origin. Use it for absolute `/developer` links;
  never derive the copied origin from `Host`, the reporter's `pageUrl`, or client input.
- The repository has Vitest for pure Node tests, DB-backed verification scripts, and a Playwright
  harness. It does **not** yet have the general server-action/DB Vitest harness recorded in TODOS.md,
  so this plan uses the established verification-script pattern instead of claiming nonexistent
  action integration coverage.
- `Tabs`, `Modal`, `Collapsible`, `Button`, `Badge`, `Input`, and `Textarea` already implement the
  relevant design-system primitives. The redesign reuses them rather than creating one-off controls.
- Plan 063 already shipped safe creation/promotion of a second global `developer` user and guarantees
  a Demo Winery home membership.

### External product findings

- Linear explicitly recommends starting with one or two teams for a small group; Free allows two.
- Linear's GitHub integration links issue IDs in branch names, PR titles/descriptions, and commits and
  can automate issue status from PR state.
- Advanced agent/code-intelligence and private-team features are paid-plan concerns and are not
  required for this two-person workflow.

## Key Decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Adopt a tracker now? | 30-day Linear Free pilot | Wait until coordination breaks | Onboarding the second developer is the clean moment to establish one shared delivery queue. |
| Role of `/developer` | Private intake/evidence/triage/outcome console | Full project tracker | The app has unique tenant context and automation; rebuilding assignments/cycles/boards would be product-irrelevant maintenance. |
| Delivery ownership | Linear only | Assignee in both app and Linear | A duplicated assignee/status will drift. |
| Code truth | GitHub only | Mirror checks/reviews into Postgres | GitHub already owns the secure review and merge workflow. |
| Promotion | Manual sanitized copy + saved link | Linear API/OAuth in v1 | Two developers do not justify credentials, webhooks, retries, and reconciliation yet. |
| GitHub integration | PR/commit linking | GitHub Issues Sync | Current automation already creates some GitHub issues; full sync risks duplicate delivery items. |
| Agentic routing | Preserve `/bug-triage` before Linear; expose run kind and add idempotent PLAN routing | Send every accepted item straight to Linear or the fix agent | The existing goalie has the root-cause, dedupe, fix, plan, PR-review, and write-back loop; Linear should consume its decisions, not bypass them. |
| Storage | New Linear-specific `FeedbackLinearLink` table | Add Linear columns twice; generic tracker enum | One small model avoids duplicated fields/logic on the two source types and follows the attachment precedent without inventing a multi-tracker abstraction before one exists. Multiple rows may share a Linear key so deduplicated reports converge on one engineering item. |
| Queue status | Pure derived queues | New persisted workflow enum | Existing source/automation statuses already exist; another workflow state becomes a second tracker. |
| External content | Sanitized engineering packet | Copy full ticket/debug/screenshots | Least-data handoff protects tenant context and keeps private Blob assets inside the app. |
| Free plan exit | Measured thresholds | Immediate paid plan | Current volume is 20 GitHub issues; pay only when a real limit or privacy need appears. |

## Target Workflow

1. A winery user submits a bug/feature ticket or thumbs-down feedback. The original row and optional
   screenshots stay tenant-scoped in Wine Inventory.
2. The existing automation gate/goalie classifies and deduplicates the item. The intake contract
   includes the awaiting run's kind, so PLAN and AGENTIC_FIX can never be confused.
3. The route follows disposition: an in-fence DEFECT may dispatch AGENTIC_FIX; PRODUCT_GAP may
   idempotently create/dispatch PLAN through `feedback_plan`; MODEL_BEHAVIOR follows the existing
   prompt/eval mitigation gate; NOT_A_BUG is dismissed; UNCLEAR goes to investigation. A queued or
   running wrong-kind run becomes a visible human conflict, never a silent reroute.
4. `/developer` derives Inbox, Ready, Tracked, or Closed from current fields. A developer reviews the
   evidence and generated plan/PR outcome, then accepts, dismisses, or investigates the work.
5. For accepted work without an auto-opened PR, the developer clicks **Copy handoff**, creates a Linear
   issue from the appropriate template, and pastes the Linear URL into **Mark as tracked**.
6. The action validates and stores the link, marks the source `TRIAGED` if it was `NEW`, and prepends a
   stamped human note such as `Promoted to Linear WIN-42 by <developer> — <url>`.
7. The assignee claims/prioritizes the issue in Linear. Branch and PR naming includes `WIN-42`, so the
   GitHub integration owns delivery-state automation.
8. The PR description includes the Wine Inventory source type/id (never a production auth token). The
   developer uses the existing `/developer` support context to review private evidence when needed.
9. Definition of Done: merged or deliberately declined, Linear issue closed/canceled, app item set to
   `RESOLVED`/`DISMISSED`, and a reporter-useful outcome note recorded. Existing automated triage
   resolution may perform the app step when it already owns the PR linkage; otherwise it is one manual
   close action.

## Data Model

Add one Linear-specific `FeedbackLinearLink` model. Do not add a one-value tracker enum:

```prisma
model FeedbackLinearLink {
  tenantId            String             @default("")
  id                  String             @id @default(cuid())
  ticketId            String?
  assistantFeedbackId String?
  linearIssueKey      String             // display snapshot; may change if moved to another team
  linearIssueUrl      String             // normalized submitted URL; old Linear URLs continue to redirect
  linkedByUserId      String
  linkedAt            DateTime           @default(now())
  version             Int                @default(1) // explicit optimistic-concurrency token
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  ticket              FeedbackTicket?    @relation(fields: [tenantId, ticketId], references: [tenantId, id], onDelete: Cascade)
  assistantFeedback   AssistantFeedback? @relation(fields: [tenantId, assistantFeedbackId], references: [tenantId, id], onDelete: Cascade)

  @@unique([tenantId, ticketId])
  @@unique([tenantId, assistantFeedbackId])
  @@index([tenantId])
  @@index([tenantId, linearIssueKey])
  @@index([tenantId, linkedAt])
  @@map("feedback_linear_link")
}
```

Add relation arrays on the two source models (one active row is enforced by the unique keys). The
migration must also include:

- `tenantId` FK to `organization(id)` with `ON DELETE RESTRICT`;
- composite FKs `(tenantId, ticketId)` and `(tenantId, assistantFeedbackId)`;
- an exactly-one-parent CHECK identical in shape to `feedback_attachment`;
- `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and fail-closed `tenant_isolation` USING +
  WITH CHECK policy;
- app role grants/default-privilege verification;
- tenant-isolation harness coverage.

Do not store Linear status, assignee, priority, cycle, description, or a copied screenshot. The link is
the boundary, not a mirror. `linearIssueKey` is intentionally **not unique** and is only a display
snapshot: Linear changes an issue ID and URL when moving it to another team, while old URLs continue to
redirect. Duplicate/fan-out source reports may point to one Linear issue, while the two per-parent
unique constraints still allow only one active delivery link per source item.

## Queue Derivation

Add a pure `deriveDeveloperQueue(item)` helper with this precedence:

1. `CLOSED`: source status is `RESOLVED` or `DISMISSED`.
2. `INBOX`: unresolved automation failure or PLAN/FIX conflict needs attention.
3. `TRACKED`: active delivery link, `prUrl`, `githubIssueUrl`, or automation state `PLANNED` /
   `PR_OPENED`.
4. `INBOX`: disposition is null, source status is `NEW`, or disposition is `UNCLEAR`.
5. `READY`: actionable disposition (`DEFECT`, `MODEL_BEHAVIOR`, `PRODUCT_GAP`) with no tracked work.

Add a separate pure `promotionEligibility(item)` guard. Closed, NOT_A_BUG, and UNCLEAR items cannot be
promoted until they are reopened/reclassified. Actionable items may be promoted, including items that
already have a generated plan or GitHub artifact. Unknown legacy `AssistantFeedback.status` values
fail safe into Inbox with a visible diagnostic rather than being treated as Ready or Closed.

`P0` and awaiting-approval items receive visual attention inside their queue; priority does not create
another queue. The all-tenant active-tab count is explicitly labeled **"N loaded"** because the
cross-tenant read stays bounded; exact-tenant counts are exact for that tenant. Exact tenant selection
uses two independent opaque keyset cursors—one for
`AssistantFeedback`, one for `FeedbackTicket`, each ordered by `(createdAt, id)`—then merges and
de-duplicates the two pages for display. Advancing both cursors eventually traverses that tenant's full
history without raw SQL or an unbounded cross-tenant query. Do not pretend the all-tenant view contains
an unbounded global history.

## Safe Handoff Packet

Add a pure `buildFeedbackHandoffMarkdown(item)` helper. It produces:

- title;
- source type and opaque source ID;
- a canonical, developer-authenticated
  `/developer?tenantId=...&source=...&item=...` deep link built from `BETTER_AUTH_URL` (never from the
  request Host header or reported `pageUrl`);
- kind, severity, disposition;
- sanitized problem statement (bounded title/body/comment);
- generated plan state, title, and GitHub link when present (never copy raw `planMarkdown`);
- acceptance/reproduction prompts for the developer to complete;
- a reminder: "Private evidence remains in Wine Inventory; open the source item in developer support
  context."

It excludes:

- `actorEmail`, `actorUserId`;
- `userAgent` and raw `pageUrl` query strings;
- `debugContext` and conversation transcript;
- filenames, Blob URLs, signed URLs, and image bytes;
- tenant secrets or environment values;
- raw developer notes/history.
- raw generated plan Markdown, because it may have inherited private report context.

The copy button is available only to developers already authorized to view the source and only when
`promotionEligibility` passes. Treat the result as untrusted Markdown in Linear and GitHub; never
render it as HTML in the app. Keep a persistent warning beside the copy control: bounded plain text can
still contain secrets or personal data pasted by a user, so the developer must review the packet before
pasting it into Linear.

## Linear Workspace Setup (No Code)

Create one workspace and one team:

- Team: **Wine Inventory**, identifier `WIN`.
- Workflow: Triage → Backlog → Ready → In Progress → In Review → Done; plus Canceled.
- Labels: `defect`, `assistant-model`, `product-gap`, `security-review`, `P0`, `P1`, `P2`.
- Templates: Bug, Product gap, Assistant/model behavior. Every template has `Wine source:` and
  `Acceptance criteria:` fields.
- Invite only the two developers during the Free pilot.
- Connect the GitHub repository for PR/commit linking and status automation.
- Leave GitHub Issues Sync disabled during the pilot.
- Require the Linear ID in branch names and PR title/body.
- Do not upload ticket screenshots to Linear; use the developer-console source link.

## `/developer` design specification

### Screen hierarchy and first scan

This is **APP UI**: calm, data-dense, task-focused, and utility-led. The first viewport is one
workbench—not a dashboard-card mosaic. If only three signals fit, show: (1) urgent/failed work,
(2) what happened and for which tenant, and (3) the next action/artifact.

```text
Developer nav item
└── /developer
    ├── Eyebrow: Developer
    ├── H1: Feedback operations
    ├── Scope line: "Recent activity across 20 loaded tenants" OR "All history · Demo Winery"
    ├── Primary tablist
    │   ├── Inbox
    │   ├── Ready
    │   ├── Tracked
    │   ├── Closed
    │   └── Automation
    ├── Work tabs
    │   ├── Filter bar: exact tenant · search · severity · disposition · Clear
    │   ├── Bounded-snapshot explanation / exact-tenant paging state
    │   └── Master-detail workspace
    │       ├── Queue list/table
    │       │   └── urgency · item/tenant · delivery signal · time/action
    │       └── Selected item region
    │           ├── Evidence
    │           ├── Triage
    │           ├── Delivery
    │           ├── Automation
    │           └── Outcome
    └── Automation tab
        ├── Tenant search + scope explanation
        └── Tenant mode rows (desktop) / collapsibles (phone)
```

URL state is explicit and shareable:

```text
view=inbox|ready|tracked|closed|automation
tenantId=<exact organization id>
q=<bounded search>
severity=P0|P1|P2
disposition=<FeedbackTriageClass>
source=ASSISTANT_FEEDBACK|FEEDBACK_TICKET
item=<opaque source id>
assistantCursor=<opaque cursor>
ticketCursor=<opaque cursor>
```

The selected item remains visible after a successful action even if it moves out of the current queue.
Show “This item is now in Tracked/Closed” with an action to switch views; never make work disappear at
the moment of success. If filters change around an open item, keep the detail and label it “Outside the
current filters” until the developer closes it.

Count semantics avoid a new 20-tenant × 4-queue query fan-out: in all-tenant mode only the active tab
shows `N loaded`; inactive tabs show no number. Selecting an exact tenant enables exact counts on all
four queue tabs because only one RLS context is queried. Never derive inactive-queue zeroes from the
active queue's bounded result set.

### Interaction-state matrix

| Feature | Loading | Empty | Error | Success | Partial / stale |
|---|---|---|---|---|---|
| Route shell | Stable header + token-based row skeletons; no layout jump | N/A | Route `error.tsx`: “Developer feedback could not load” + Retry | Tabs and scope line render before work area | Exact item may load while bounded list is still refreshing |
| Queue | Five compact row skeletons | All-tenant: “No {queue} items in recent loaded activity. Choose a tenant to inspect older history.” Exact tenant: “{Tenant} has no {queue} items.” | Inline region alert + Retry; filters remain | Rows show attention, item/tenant, delivery, age/action | Selected item outside queue stays in detail with location callout |
| Filters / paging | Changed control disabled only while URL navigation commits | Clear action hidden when nothing is set | Invalid enum/cursor is removed and announced; safe defaults remain | URL, Back, Forward, and copied link reproduce the view | Per-source cursor advances only for emitted rows; “More” remains while either source has results |
| Exact deep link | Detail skeleton in the selected-item region | Generic “Item unavailable” (deleted, malformed, or not visible) + Back to queue | Same non-sensitive state; never reveal wrong-tenant existence | Old items open even outside snapshot cap | Item can be outside current queue/filter and is labelled honestly |
| Copy handoff | Button busy text “Copying…” | Disabled when promotion eligibility fails, with reason | Clipboard denied: show selectable packet + “Select all” instruction | `aria-live`: “Handoff copied”; label returns without shifting layout | Persistent warning asks developer to review free text for secrets/PII |
| Link / replace | Save button busy; field locked against double submit | No link: concise URL field and privacy boundary note | Invalid URL retained inline; different-winner/stale-version conflict offers Reload; server error offers Retry | “Tracked as WIN-42”; item stays open with Open Linear and View Tracked actions | Existing current-tenant fan-in count requires confirm; initial key tooltip explains snapshot semantics |
| Automation approval | Button says “Starting plan…” or “Starting fix…” from run kind | No awaiting run: show current state, no disabled mystery button | Dispatch failure shows stored reason and retry/next step | Correct GitHub workflow/run link appears | In-flight wrong-kind conflict is an Inbox attention banner, not a false FAILED state |
| Outcome close | Resolve/Dismiss busy; controls locked | Submit disabled until trimmed outcome is 20+ chars | Inline validation/server error retains text | “Closed with outcome”; item remains open with next-item/View Closed actions | Concurrent update reloads fresh history; never overwrites notes |

All status/error text is visible, persistent until the next action, and announced through a polite
`aria-live` region. Do not rely on ephemeral toast-only feedback.

### User journey and emotional arc

| Step | Developer does | Intended feeling | Design support |
|---|---|---|---|
| 1 | Opens Developer | Oriented, not overwhelmed | Inbox default, one tablist, honest data scope, urgent work first |
| 2 | Scans queue | Confident about what needs attention | Three-signal rows; failures/conflicts outrank tracked work; no 10-column wall |
| 3 | Opens an item | Context stays intact | Wide master-detail; narrow in-page detail with Back and URL state |
| 4 | Classifies/reviews evidence | Safe and deliberate | Evidence separated from mutable triage; source-specific selects; private attachment boundary |
| 5 | Generates/reviews plan or fix | Trusts the automation route | PLAN/FIX named explicitly with state, artifact, failure, and conflict copy |
| 6 | Promotes to Linear | In control of privacy and concurrency | Review warning, sanitized packet, URL validation, fan-in/replace confirmations |
| 7 | Closes work | Sees a complete loop | Meaningful outcome requirement, reporter timeline, item remains visible after move |

- **5 seconds:** the page answers “what needs me now?” through Inbox, urgency, and attention ordering.
- **5 minutes:** a developer can classify, inspect automation, promote, and hand off without losing
  list/filter context or wondering which system owns the next step.
- **5 years:** source-of-truth boundaries and audit history remain legible even if the team outgrows
  Linear Free or later adds an API integration.

### Design-system and anti-slop constraints

- Reuse `Tabs`, `Collapsible`, `Button`, `Badge`, `Input`, `Textarea`, and the existing token files.
  Do not add a new component library or one-off palette.
- Use `Inter Tight` light headings, `Inter` UI text, warm paper/ink surfaces, wine accent for the one
  primary action, and semantic danger only for P0/failure. Do not use raw hex values.
- Do not rely on the known-misaligned `Badge tone="gold"` as a warning color. P1/P2 remain explicit
  text/outline signals; status meaning is never color-only.
- The queue/detail grid supplies the visual anchor. Avoid stacked `Card` wrappers, ornamental icons,
  emoji status markers, decorative gradients, thick borders, and oversized shadows.
- Motion is functional only: token-duration tab/row/detail transitions, disabled under
  `prefers-reduced-motion`. No animated counters or decorative entrance choreography.
- External Linear/GitHub links use descriptive text such as “Open WIN-42 in Linear,” open in a new
  tab with `rel="noopener noreferrer"`, and never use a bare “here.”

Litmus result after these constraints: product purpose is unmistakable; the master-detail workbench is
the anchor; headings are scannable; each region has one job; cards are unnecessary; motion only aids
state change; the page remains intentional with every decorative shadow removed. No hard-rejection
pattern remains.

### Responsive and accessibility contract

- **≥1100 px content width:** two-column master-detail grid
  `minmax(0, 1.4fr) minmax(360px, .8fr)`; detail region is sticky within the page, never viewport-
  trapping. Queue uses a compact semantic table with real `<button>` controls inside sortable `<th>`
  cells—never an `onClick` attached only to `<th>`.
- **768–1099 px:** one work region. Selecting an item replaces the queue within the route; Back to
  queue restores the triggering row's focus and scroll position.
- **≤767 px:** horizontally scrollable `Tabs`; filters collapse behind one “Filters (N)” control;
  rows render as a semantic list; selected detail is full-width in-page; primary actions use at least
  44 px targets and stack in one sticky action region only when it does not obscure content.
- At 200% zoom and 320 CSS px, no action or status requires horizontal page scrolling. Long tenant
  names, IDs, titles, and Linear keys wrap or truncate with an accessible full label.
- `Tabs` keeps its existing arrow/Home/End behavior. Selected queue links use `aria-current`; attention
  state includes text, not color alone. Detail is a labelled `<section>`/`<aside>`, not a fake dialog.
- On narrow selection, focus moves to the item H2; Back restores focus to the originating item. On
  validation failure, focus moves to the first error. Busy actions expose `aria-busy` and remain
  protected from double submission.
- Use semantic links/buttons, visible focus rings from `--shadow-focus`, programmatic labels for every
  select/input, and keyboard-operable confirmation. Test keyboard-only, screen reader landmarks,
  reduced motion, touch, and high zoom in Demo Winery.

### Resolved design decisions

| Decision | Resolution | If it changes later |
|---|---|---|
| Primary navigation | One five-item tablist; Automation is the fifth tab | Revisit only if `/developer` gains non-feedback tools |
| Item presentation | Wide master-detail; narrow in-page detail using URL/Back | Do not revert to a custom fixed overlay without dialog/focus work |
| Status editing | Source-appropriate select values, never free text | Normalize the legacy DB string in its own migration |
| Post-action movement | Keep item visible, announce destination, offer next view/item | Never silently remove the row/detail on success |
| Linear key after team move | Display as initial-handoff snapshot with tooltip; URL is durable redirect | API sync can refresh both in a later plan |
| Duplicate Linear key | Warn/confirm using current-tenant count only | Cross-tenant aggregation remains out of scope |
| Outcome quality | Trimmed minimum 20 characters for Resolve/Dismiss | Product can tune after observing real outcomes |
| Staleness | No synthetic stale badge without Linear activity data | Reconsider with reconciliation/API telemetry |

## Implementation Units

### Unit 1: Preserve the agentic PLAN vs AGENTIC_FIX contract

**Goal:** Keep `/bug-triage`, GitHub plan generation, fix agents, PR review, and write-back fully
functional before Linear receives human delivery work.

**Repository files:** `src/lib/developer/feedback.ts`; `src/lib/feedback/automation.ts`;
`scripts/bug-triage-list.ts`; a new narrowly named plan-routing CLI such as
`scripts/bug-triage-plan.ts`; `package.json`; relevant feedback verification/unit tests.

**Local rstack contract:** after the repository payload exists, update the installed
`~/.claude/workflows/bug-triage.js` / `/bug-triage` contract to consume `awaitingRunKind`, dispatch
only AGENTIC_FIX from the defect path, and call the plan-routing command for PRODUCT_GAP. This local
skill update is an explicit rollout step, not part of the Git PR; document its minimum compatible
repository commit in the runbook.

**Approach:**

- change the awaiting-run projection from an arbitrary `source -> id` map to a deterministic
  `{ id, kind }` projection and surface `awaitingRunKind: PLAN | AGENTIC_FIX | null`;
- expose the latest nonterminal `activeRun { id, kind, status }` for AWAITING_APPROVAL/QUEUED/RUNNING
  so conflict derivation never guesses from the source's single summary status;
- add `ensurePlanAutomationRun(...)` using the existing PLAN idempotency key and a serializable
  tenant transaction;
- if a wrong-kind AGENTIC_FIX is still AWAITING_APPROVAL, mark that run SKIPPED with a structured
  reason and `completedAt` before creating PLAN; if it is QUEUED/RUNNING/PR_OPENED, refuse and surface
  a human conflict;
- for that in-flight conflict, preserve both the truthful run status and PRODUCT_GAP disposition,
  prepend a stamped conflict note, and expose a derived `automationConflict` object; do not mark the
  running job FAILED or rewrite the disposition to UNCLEAR merely to move queues;
- if PLAN is already AWAITING_APPROVAL/QUEUED/RUNNING/PLANNED, return it idempotently;
- route the resulting PLAN through the existing `approveAutomationRun` + `dispatchApprovedRun`, which
  already emits `feedback_plan`; do not create another workflow;
- keep PRODUCT_GAP out of the code-fix dispatch candidate set even if an old awaiting fix ID exists.

**Tests:** payload includes kind; PLAN and AGENTIC_FIX dispatch to the correct repository event; missing
PLAN creation is idempotent; awaiting wrong-kind fix is skipped with reason; in-flight wrong-kind fix
is refused; PLANNED is never re-dispatched; product gaps never enter the fix candidate set.

### Unit 2: Linear-link schema, migration, and isolation

**Goal:** Persist exactly one tenant-safe Linear handoff per feedback item.

**Files:** `prisma/schema.prisma`; new migration under
`prisma/migrations/*_feedback_linear_link`; `scripts/verify-tenant-isolation.ts`;
`test/tenant-isolation.test.ts`; `src/lib/tenant/models.ts` only to verify the new model is **not**
added to `GLOBAL_MODELS`.

**Approach:** Add the model/relations and all nine tenant-table checklist items. Backfill is not
needed because the table starts empty. Add the exactly-one CHECK and composite parent FKs explicitly
in SQL. Regenerate Prisma.

Before adding cases, change the isolation harness's positive-control tenant from the legacy
`org_bhutan_wine_co` constant to `org_demo_winery`; this plan must not create QA fixtures in the real
tenant. **Tests:** create/read isolation in Demo; fail-closed without tenant context; cross-tenant parent FK
rejected; both-parent/neither-parent rows rejected; duplicate active link for one source rejected;
two different source items may share one Linear key.

**Verification:** `npm run db:generate`; tenant isolation tests; schema validation.

### Unit 3: URL parser, queue derivation, and safe handoff core

**Goal:** Put security and queue semantics in pure, unit-tested functions.

**Files:** new `src/lib/developer/linear-links.ts`; new
`test/developer-linear-links.test.ts`.

**Approach:** Implement:

- `parseLinearIssueUrl(value) -> { linearIssueKey, normalizedUrl } | error`;
- `deriveDeveloperQueue(item) -> INBOX | READY | TRACKED | CLOSED`;
- `buildDeveloperQueueWhere(sourceType, queue) -> source-specific Prisma where`;
- `promotionEligibility(item) -> { allowed, reason }`;
- `buildFeedbackHandoffMarkdown(item) -> string`.

Reject `http`, lookalike/subdomain hosts, credentials, ports, missing `/issue/`, and non-issue Linear
URLs. Canonicalize harmless query/hash fragments away. Bound every copied string.

Treat the parsed issue key as a display snapshot, not durable external identity. Tests include an old
URL/key retained after a simulated team move. **Tests:** URL allow/deny matrix; queue precedence;
query/derivation parity fixtures for every queue and both source types; unknown legacy status;
promotion eligibility; P0/failed/awaiting cases; a golden handoff packet; assert
sensitive fields, raw plan Markdown, and private URLs never appear even when present in the fixture.

### Unit 4: Developer actions and exact-item loader

**Goal:** Save/correct the handoff link, expose it through the bounded list, and make old-item deep
links reliable without weakening RLS.

**Files:** `src/lib/developer/actions.ts`; `src/lib/developer/feedback.ts`; new
`src/lib/developer/linear-link-actions.ts` for the transactional domain mutation.

**Approach:** Add
`linkFeedbackToLinear({ tenantId, sourceType, id, linearUrl, expectedVersion, replace })`.
Require the current developer before tenant entry, parse the URL server-side, then
`runAsTenant(tenantId)` and transact against the correct source FK. Validate the source exists inside
that same tenant and re-run `promotionEligibility` on fresh DB state. If source status is NEW, advance
it to TRIAGED. On create/replace, update `linkedByUserId`/`linkedAt`, prepend a bounded stamped human
note recording the old/new key, and write the normal tenant audit entry in the same transaction.
Revalidate `/developer`.

Add `getDeveloperFeedbackItem({ tenantId, sourceType, id })`: call it only after `requireDeveloper()`,
enter exactly that tenant with `runAsTenant`, select exactly that source/id and its link/automation
summary, and return not-found for wrong-tenant or malformed input. The page uses this direct loader for
`tenantId + source + item`; the bounded cross-tenant loader is never the deep-link lookup path.

Add `getDeveloperTenantFeedbackPage(...)` for exact tenant selection. It accepts two opaque,
strictly decoded `(createdAt,id)` cursors for the source tables, queries `pageSize + 1` from each
inside the same tenant context, merges by stable order, and returns the next cursor for each source.
After merge-and-slice, each cursor advances only to the last row from that source that was actually
emitted; a source with no emitted row retains its prior cursor. Malformed cursors fail validation and
repeated pages de-duplicate by `sourceType:id`.

Both list loaders accept the active queue and apply the shared source-specific query builder
**before** applying `take`. Do not fetch the newest eight rows and then filter on the client:
that can falsely report an empty Inbox while older actionable work exists. Counts remain explicitly
bounded-snapshot counts; exact tenant keyset paging is the path to complete history. All-tenant mode
queries only the active queue and shows only its loaded count. Exact-tenant mode may run bounded count
queries for all four queues inside that one tenant context.

The bounded loader includes one Linear relation in the same source query and returns
`{ linearIssueKey, linearIssueUrl, linkedAt, version }`. It also returns `awaitingRunKind`, derived
`automationConflict`, and enough current fields to derive queues without exposing new raw data.

**Concurrency:** first create is protected by the source-specific unique key. On a uniqueness race,
read the winner: the same normalized URL succeeds idempotently; a different URL returns a visible
conflict. Replacement requires `replace: true` and an integer `expectedVersion`; atomically update only
with `updateMany({ where: { id, version: expectedVersion }, data: { ..., version: { increment: 1 } } })`
and require `count === 1`. A zero count is a stale-client conflict and must reload. Build
the history note from fresh DB state inside the same transaction so a stale editor cannot overwrite
newer notes. Reusing a Linear key on a different source remains allowed; when the same key already
tracks reports in the **current tenant**, warn with that tenant-local count and require confirmation.
Never imply that the count spans tenants.

**Tests:** authorization decision helper, wrong-tenant source, exact-item fail-closed read, idempotent
same URL, different-URL race conflict, stale integer-version replacement conflict, shared-key fan-in, explicit
replacement, NEW→TRIAGED transition, and note preservation. DB behavior belongs in a dedicated
Demo-safe verification script plus the tenant-isolation harness; pure rules stay in Vitest.

### Unit 5: `/developer` information architecture

**Goal:** Make the default view a useful intake queue, not a settings page followed by a wide table.

**Files:** `src/app/(app)/developer/page.tsx`; `DeveloperClient.tsx`; new colocated
`DeveloperWorkspace.tsx`, `DeveloperQueueList.tsx`, `DeveloperFilters.tsx`,
`TenantAutomationPanel.tsx`, and route-level `loading.tsx` / `error.tsx`; pure helpers remain under
`src/lib/developer/`.

**Approach:** Use one accessible `Tabs` strip with Inbox, Ready, Tracked, Closed, and Automation; avoid
nested tab systems. Counts in all-tenant mode say "loaded" and queue filtering occurs server-side
before the cap. Search/tenant/disposition/severity and `view` persist in URL params. Canonical
`tenantId=<id>&source=<sourceType>&item=<id>` deep links use the exact item loader; malformed params
produce a non-sensitive not-found state. Default to Inbox.

The work view is a responsive master-detail workspace, not stacked cards: a compact semantic queue
list/table plus a selected-item detail region on wide screens; at narrower widths, selection replaces
the list within the same URL and a Back to queue control restores context. The first scan exposes only
three things: urgency/attention, item + tenant, and next delivery action. Linear/GitHub/outcome details
stay in the detail region. Automation is its own tab; its tenant rows become `Collapsible` sections on
phones. Preserve bounded-tenant copy and pagination messaging.

**Tests:** pure queue/filter tests only; no new jsdom stack.

**Verification:** `npx next build`; keyboard and responsive browser QA on Demo Winery.

### Unit 6: Detail and explicit promotion UX

**Goal:** One detail surface supports evidence review, triage, safe promotion, tracked links, and close
outcome.

**Files:** new `DeveloperItemDetail.tsx` (or split from `DeveloperClient.tsx`); existing actions/types.

**Approach:** Organize the selected-item region into Evidence, Triage, Delivery, Automation, and
Outcome sections. It is a labelled page region on wide screens and an in-page full-screen detail mode
on narrow screens—not an overlay modal—so deep links, Back, focus restoration, and browser history are
natural. Add:

- **Copy Linear handoff** button using the safe packet;
- **Mark as tracked** URL field + confirm;
- existing Linear/GitHub issue/run/PR links in one Delivery section;
- explicit replace-link confirmation showing old and new keys;
- current-tenant fan-in warning before reusing a Linear key already linked to other reports;
- existing attachments opened only through current authenticated routes;
- source-appropriate status selects (remove the current free-text Status input);
- resolve/dismiss action requiring a trimmed outcome of at least 20 characters;
- persistent copy-packet privacy warning plus a selectable-text fallback if clipboard access fails;
- inline `aria-live` success/error feedback that does not disappear before it can be read.

Do not display or copy a Linear assignee/status because v1 does not fetch Linear.

**Manual QA:** two developer accounts open the same Demo ticket; simultaneous promotion converges;
copy packet contains no email/debug/blob URL; invalid lookalike URL fails; correct link persists; queue
moves Ready→Tracked; close moves Tracked→Closed with outcome.

### Unit 7: Team runbook and onboarding

**Goal:** Make the process executable by a new developer without oral history or production secrets.

**Files:** update `docs/developer-feedback-automation.md`; add
`docs/developer-workflow.md`; update `.env.example` only if later scope adds an env (v1 should not).

**Approach:** Document:

1. create/promote developer account through the shipped `/users` flow;
2. grant GitHub repository access and require branch protection/PR review;
3. invite to Linear Free workspace/team;
4. use Demo Winery for QA and request temporary support context for tenant evidence;
5. claim/prioritize only in Linear;
6. branch/PR naming with `WIN-###` and feedback source marker;
7. Definition of Done across Linear, GitHub, and the reporter outcome;
8. never share `.env`, owner DB URLs, production credentials, or raw ticket attachments externally.

Include a one-page "Where does this update go?" table matching the source-of-truth table above.

Also document that Linear Free makes every member an admin, that the local `/bug-triage` contract must
match the repository payload version, and that expanding workspace membership is a permission-review
event rather than a casual invite.

### Unit 8: End-to-end proof and 30-day pilot gate

**Goal:** Prove the app boundary and decide from evidence whether Free/manual remains sufficient.

**Verification:** run:

- `npx vitest run test/developer-linear-links.test.ts`;
- `npm run verify:feedback-linear-links`;
- `npm run verify:feedback`;
- `npm run verify:feedback-idempotency`;
- `npm run verify:feedback-security`;
- `npm run verify:feedback-fence`;
- `npm run verify:feedback-domain`;
- `npm run verify:tenant-isolation`;
- DB-enabled `test/tenant-isolation.test.ts` with `TENANT_ISOLATION_DB=1` in the test-DB/CI gate;
- `npm run verify:naming`;
- `npm run lint`;
- `npx next build`;
- in-app-browser QA on Demo Winery only.

After 30 days record:

- number of actionable reports promoted;
- duplicate work incidents;
- tracked items closed in Linear but left open in the app;
- minutes/week spent copying/linking;
- Linear issue count and team count;
- whether anyone outside the trusted developer group needs access.

Decision rules:

- **Stay Free/manual** while under ~200 issues, ≤2 teams, only trusted developers need access, and
  manual promotion/reconciliation is under ~15 minutes/week.
- **Upgrade to Basic** when the 250-issue cap, >2 team structure, unlimited uploads, or admin roles are
  genuinely needed.
- **Evaluate Business** when private teams/guests or advanced triage/insights are required; Basic does
  not provide private teams.
- **Plan an API integration** only when promotion volume exceeds ~10 items/week or status drift is a
  repeated operational problem. That integration gets its own threat model, idempotency/outbox design,
  credentials plan, webhook verification, and reconciliation job.

## Architecture after engineering review

```text
PRIVATE TENANT INTAKE                         AGENTIC ROUTING
────────────────────                         ───────────────
FeedbackTicket / AssistantFeedback
        │
        ├── AutomationRun { id, kind, status }
        │             │
        │             └── /bug-triage list MUST expose id + kind
        │                              │
        │                    classify + deduplicate
        │                              │
        │        ┌─────────────────────┼────────────────────────┐
        │        │                     │                        │
        │     DEFECT              PRODUCT_GAP               UNCLEAR / NO
        │        │                     │                        │
        │  AGENTIC_FIX only     ensure PLAN run only     investigate/dismiss
        │        │                     │
        │        └──── existing dispatchApprovedRun ────────────┘
        │                              │
        │              GitHub Actions: fix PR or plan issue
        │                              │
        └──────── status / artifact / outcome write-back
                                       │
                              derived /developer queue
```

```text
Wine Inventory (private evidence)       Linear (human work)       GitHub (code truth)
┌───────────────────────────────┐       ┌───────────────────┐     ┌─────────────────┐
│ tenant/source/id              │       │ priority/assignee │     │ branch/commits  │
│ debug + screenshots           │       │ cycle/project     │     │ checks/review   │
│ plan/fix run + outcomes       │       │ delivery status   │     │ PR/merge        │
└──────────────┬────────────────┘       └─────────┬─────────┘     └────────┬────────┘
               │ allowlisted Markdown + exact app link          WIN-###   │
               └────────────────────────►│◄───────────────────────────────┘

No raw evidence crosses the first boundary. No Linear status is mirrored back in v1.
```

The PLAN/FIX routing diagram belongs as an inline comment beside the deterministic awaiting-run
projection or plan-routing helper if the implementation remains non-obvious. The simpler UI component
tree does not need an inline code diagram; this plan remains its maintained source.

## Staged delivery and two-developer worktrees

The complexity check is triggered (>8 files and several modules). Keep the complete outcome, but land
it as three independently reviewable PRs:

| PR | Scope | Exit gate |
|---|---|---|
| A — agentic routing | Unit 1 and the versioned payload/verification contract | PLAN and AGENTIC_FIX routes are unambiguous; global skill rollout instructions are ready |
| B — Linear link core | Units 2–4: schema/RLS, pure rules, actions, exact loaders | migration, isolation, security goldens, DB verification, lint/build green |
| C — developer workflow | Units 5–8: queue/detail UX, runbook, browser QA, pilot gate | Demo-only QA and complete Definition of Done |

| Workstream | Modules touched | Depends on |
|---|---|---|
| A. Agentic route contract | `src/lib/feedback`, `src/lib/developer`, `scripts`, feedback workflows/tests | — |
| B. Linear schema/RLS | `prisma`, isolation verification/tests | — |
| C. Pure Linear rules | new `src/lib/developer` helper + unit test | source-of-truth decision only |
| D. Actions and loaders | `src/lib/developer` | B + C |
| E. Queue/detail UI | `src/app/(app)/developer` | stable C types; D for final wiring |
| F. Runbook and rollout | `docs` | A contract + Linear workspace choices |
| G. Integrated proof | verification, browser QA | A–F |

Parallel lanes:

- Lane 1: A (developer 1).
- Lane 2: B → D (developer 2; D waits for C).
- Lane 3: C → presentational E skeleton (developer 1 or 2; final action wiring waits for D).
- Lane 4: F can run beside B–E once the workspace identifier is chosen.
- Final sequential gate: merge A, then B, then C; rebase before G and run the full proof once.

Conflict flags: A and D both touch `src/lib/developer`; C and D add adjacent helpers; E's final wiring
imports D. Keep those phases sequential or agree on exported contracts before parallel work. Do not
let two worktrees independently refactor `DeveloperClient.tsx`.

## Build Order

```text
Linear workspace pilot setup (no code)
  ↓
Unit 1 agentic PLAN/FIX contract
  ↓
Unit 2 schema/RLS
  ↓
Unit 3 pure rules + security goldens
  ↓
Unit 4 actions/exact loaders
  ↓
Unit 5 queue IA ──→ Unit 6 detail/promotion UX
  ↓
Unit 7 runbook/onboarding
  ↓
Unit 8 full proof + 30-day measurement
```

Do not begin Units 2–6 until the owner confirms the source-of-truth boundary and creates/chooses the
Linear workspace/team identifier. The team identifier is process configuration, not an application
environment variable in v1.

## Test Strategy

### Unit

- Linear URL parser allow/deny cases.
- Derived queue precedence and edge cases.
- Safe-handoff golden output and forbidden-field assertions.
- Note prepend/retention and bounded length.

### Integration

- Tenant-scoped link create/read/update.
- Cross-tenant source/link attempts fail.
- Exactly-one-parent and uniqueness constraints hold.
- Two same-item promotions converge; one Linear key may intentionally attach to duplicate source
  items in a tenant.
- Only a developer can link/replace.

### Browser (Demo Winery only)

- Queue tabs, URL-persisted filters, tenant paging copy.
- Authenticated item deep-link open; malformed/cross-tenant item params fail closed.
- Automation settings remain usable after moving them.
- Evidence/attachments remain authenticated and are not copied in the packet.
- Promotion, invalid URL, replacement/fan-in confirmation, stale-version conflict, and close outcome.
- Two-developer concurrency smoke test.
- Narrow viewport and keyboard navigation.

### Coverage map

```text
CODE PATH COVERAGE
==================
[+] triage list + routing
    ├── [UNIT] awaiting PLAN is identified as PLAN
    ├── [UNIT] awaiting AGENTIC_FIX is identified as AGENTIC_FIX
    ├── [UNIT] PRODUCT_GAP + no PLAN -> one idempotent PLAN run
    ├── [UNIT] awaiting wrong-kind fix -> SKIPPED + PLAN
    ├── [VERIFY] queued/running wrong-kind fix -> visible conflict, no PLAN/fix dispatch
    └── [REGRESSION] PLANNED and PR_OPENED are never re-dispatched

[+] parseLinearIssueUrl / handoff rules
    ├── [UNIT] exact https://linear.app/<workspace>/issue/<KEY>/... accepted
    ├── [UNIT] http, credentials, port, lookalike/subdomain, non-issue path rejected
    ├── [UNIT] query/hash removed; key is a display snapshot
    ├── [UNIT] every copied field is bounded
    └── [SECURITY GOLDEN] identity/debug/blob/signed URL/raw notes/raw plan never copied

[+] linkFeedbackToLinear
    ├── [UNIT] unauthenticated/non-developer decision denied
    ├── [DB VERIFY] wrong tenant/source fails closed
    ├── [DB VERIFY] first create + NEW -> TRIAGED + audit/history
    ├── [DB VERIFY] same URL race is idempotent
    ├── [DB VERIFY] different URL race is a conflict
    ├── [DB VERIFY] stale explicit replacement is a conflict
    └── [DB VERIFY] same Linear key on another source is allowed

[+] feedback loaders
    ├── [UNIT] malformed exact-item params/cursors rejected
    ├── [DB VERIFY] exact old item loads outside the bounded list
    ├── [DB VERIFY] cross-tenant item appears as not found
    ├── [UNIT] two source cursors merge in stable order without duplicates
    └── [REGRESSION] all-tenant view remains bounded and honestly labeled
```

```text
USER FLOW COVERAGE
==================
Developer opens /developer
    ├── [BROWSER] Inbox default + honest loaded counts
    ├── [BROWSER] queue/filter URL survives reload/back/forward
    ├── [BROWSER] exact deep link opens old item; invalid link is non-sensitive not-found
    ├── [REGRESSION] Automation settings still save and support entry still works
    └── [BROWSER] keyboard tabs, focus return, narrow layout

Developer promotes accepted work
    ├── [BROWSER] safe packet copies; clipboard failure has recoverable feedback
    ├── [BROWSER] valid Linear URL -> Tracked
    ├── [BROWSER] invalid/lookalike URL -> inline error, form retained
    ├── [BROWSER] simultaneous different links -> one winner, one reload/replace prompt
    ├── [BROWSER] Linear created but app save fails -> paste same URL and retry safely
    └── [BROWSER] resolve/dismiss requires outcome -> Closed
```

The pure and DB branches are automated. Browser cases are an authenticated Demo Winery QA gate because
the existing Playwright setup authenticates a tenant owner, not the global developer role; do not
claim automated `/developer` E2E coverage until a safe developer-test identity harness exists.

### Failure modes

| Codepath | Production failure | Test | Handling | Developer-visible result |
|---|---|---|---|---|
| Triage intake | Awaiting PLAN mislabeled as a fix | Unit + feedback verification | Require `awaitingRunKind`; candidate filters assert kind | Correct Plan/Fix label and action |
| Product-gap reroute | Fix already queued/running | DB verification | Refuse automatic reroute; preserve run; write conflict note | Human conflict card with next step |
| Plan creation | Retry/double triage creates two PLAN runs | Idempotency unit/verification | Existing kind-aware idempotency key + serializable tx | Existing run returned |
| URL parse | Lookalike host or credential-bearing URL | Unit allow/deny matrix | Server rejects before DB write | Inline validation error; input retained |
| Link create | Two developers submit different URLs | DB concurrency verification | Unique create + compare winner | Loser reloads or explicitly replaces |
| Link replace | Stale page overwrites newer link/notes | DB verification | Integer-version compare-and-swap + fresh note read | Stale-edit message; no lost update |
| Exact deep link | Item is older than list cap or belongs to another tenant | DB/isolation verification | Exact tenant loader; wrong tenant is not-found | Item opens or generic not-found, never leakage |
| Clipboard | Browser denies clipboard access | Browser QA | Catch error and expose selectable packet fallback | Recoverable copy error |
| Manual handoff | Linear issue created but app link save fails | Browser QA | No distributed transaction; retry same URL idempotently | Clear retry instruction; no duplicate required |
| Linear team move | Key/URL changes upstream | Unit + runbook | Stored URL remains usable redirect; key labeled snapshot | Link still opens; no false sync claim |
| Bounded all-tenant view | Older intake is not on current page | Unit + browser QA | Honest label + exact-tenant keyset paging | Operator can narrow tenant and continue |

No planned failure path is both silent and lacks a test/handling strategy. The authenticated browser
cases remain a manual release gate and are called out as such.

### Performance budget

- Do not add a per-row Linear-link or duplicate-count query. Include the one-to-one link relation in
  the two existing source queries; if related-report counts ship, batch/group them by key once per
  current tenant and label them tenant-local.
- The all-tenant page remains capped at 20 tenants × 8 items per source. Adding link data must not
  increase the current per-tenant query count beyond one bounded batch.
- Exact tenant mode uses two indexed keyset queries plus bounded automation/link lookups; exact item
  mode uses one source query plus its included relations. No raw SQL UNION and no unbounded array.
- Safe Markdown/queue derivation stays pure O(n) over loaded items and is memoized only if profiling
  shows a client render problem; no new cache is justified.
- Record query count/duration in local verification for a 20-tenant loaded page and a 500-item Demo
  tenant. Treat per-row growth or >2× baseline latency as a release blocker.

## Security and Privacy Notes

- A Linear link does not grant access to the source ticket; Wine Inventory auth/support context still
  gates tenant evidence.
- Never put a signed/private attachment URL into Linear. Even an expiring URL leaks data while valid.
- External issue titles/descriptions are untrusted input when rendered back in any future integration.
- Do not store Linear tokens in the browser or database. There are no Linear credentials in v1.
- The new table follows the full tenant + RLS checklist and is not a global model.
- The free workspace has no private-team boundary. Membership stays limited to trusted developers.
- Replacing a delivery link must retain old/new keys in the item note so accidental relinking is
  explainable.
- Support context remains ephemeral and audited; Linear never becomes a tenant-impersonation path.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Developers update Linear but forget the app outcome | Medium | Medium | Definition of Done plus a 30-day manual drift audit; automate only if recurrence justifies it. |
| Same task exists as an app ticket, GitHub issue, and Linear issue | Medium | Medium | Clear concern ownership; one saved Linear link; no GitHub Issues Sync; show all artifacts in one Delivery section. |
| Sensitive ticket content copied to Linear | Medium | High | Pure safe packet with deny-list goldens; attachments/debug/identity never copied; trusted members only. |
| Free plan reaches 250 issues | Low initially | Low | Promote only actionable work, review at ~200, export/upgrade intentionally. |
| Lack of private teams becomes unsafe as team grows | Low initially | High | Do not invite non-developers under this model; Business/privacy review before broader access. |
| Every Linear Free member is an admin | Medium if membership grows | High | Keep the workspace to two trusted developers; treat any additional invite as an explicit permission/plan review. |
| `/bug-triage` dispatches a PLAN as though it were a fix | Medium before Unit 1 | High | Surface `awaitingRunKind`, hard-gate candidate sets by kind, and regression-test repository events. |
| Product gap has an in-flight fix run | Low | High | Never cancel silently; surface a conflict and require human handling after the GitHub job state is known. |
| Cross-tenant developer query becomes unbounded | Low | High | Preserve bounded tenant fan-out and explicit loaded-count wording; full paging only after tenant selection. |
| Two developers promote the same report | Medium | Low | Unique create + same-URL idempotency + different-URL conflict + expected-version replacement; shared Linear keys remain valid for duplicate reports. |
| `/developer` refactor breaks automation settings | Medium | Medium | Split presentation only after pure queue/action tests; dedicated Demo browser regression pass. |
| Manual handoff feels redundant | Medium | Low | Measure time; API integration threshold is explicit, not assumed. |

## Success Criteria

- [ ] Linear Free workspace has exactly one Wine Inventory team and both developers; GitHub PR/commit
      integration works; GitHub Issues Sync is off.
- [ ] Both Linear members are explicitly trusted as workspace admins; no contractor/customer/general-
      staff account is invited under the Free-plan trust model.
- [ ] `/bug-triage` receives `awaitingRunKind`, dispatches PRODUCT_GAP through PLAN only, dispatches
      eligible DEFECT work through AGENTIC_FIX only, and still surfaces generated GitHub plans/PRs for
      agentic review and write-back.
- [ ] `/developer` is visibly an intake/triage/outcome console with Inbox, Ready, Tracked, Closed, and
      separate Automation settings.
- [ ] A feedback item can store one validated Linear link with linker/time provenance and tenant RLS.
- [ ] The safe handoff packet contains enough engineering context but no actor identity, raw debug
      context, signed/Blob URLs, screenshots, or secrets.
- [ ] Linear owns human assignment/priority/cycle/status; the app does not duplicate those fields.
- [ ] GitHub owns code/review/merge; existing generated issue/run/PR links remain intact.
- [ ] Queue counts do not overstate the bounded cross-tenant read; selected-tenant history can be paged.
- [ ] Two developers cannot create two active handoffs for the same source item.
- [ ] Demo-only isolation, feedback, security, naming, lint, and Next build gates are green.
- [ ] The second-developer onboarding/runbook is sufficient without sharing production `.env` or owner
      database credentials.
- [ ] A 30-day review explicitly chooses: remain Free/manual, upgrade, or plan an API integration.

## Deferred Follow-ups

- Linear OAuth/API creation from the app, only if the 30-day threshold is met.
- Signed Linear webhook → internal status/outcome reconciliation with replay protection.
- A nightly reconciliation report for closed-in-Linear/open-in-app drift.
- A generic external-delivery adapter if another tracker is ever adopted.
- Status normalization between `AssistantFeedback` and `FeedbackTicket` as its own migration.
- A global coordination projection only if tenant count makes bounded fan-out operationally inadequate.

## Design review completion

```text
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | DESIGN.md active; APP UI; text-only review  |
| Step 0               | 6/10; IA, states, responsive, concurrency   |
| Pass 1  (Info Arch)  | 6/10 -> 10/10 after master-detail spec      |
| Pass 2  (States)     | 5/10 -> 10/10 after full state matrix       |
| Pass 3  (Journey)    | 5/10 ->  9/10 after journey/time horizons   |
| Pass 4  (AI Slop)    | 7/10 -> 10/10 after cardless workbench      |
| Pass 5  (Design Sys) | 7/10 -> 10/10 after token/component rules   |
| Pass 6  (Responsive) | 5/10 -> 10/10 after viewport/a11y contract  |
| Pass 7  (Decisions)  | 8 resolved, 0 deferred                      |
+--------------------------------------------------------------------+
| NOT in scope         | written                                     |
| What already exists  | written                                     |
| TODOS.md updates     | 0; gaps were included in this plan          |
| Approved Mockups     | 0; rstack designer unavailable              |
| Overall design score | 6/10 -> 9/10                                |
+====================================================================+
```

The remaining point is visual verification after implementation, not an unresolved plan decision.
Run `/design-review` against the rendered Demo Winery surface before landing PR C.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Council Codex seat timed out; no findings claimed |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 12 issues hardened, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 6/10 → 9/10, 8 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **COUNCIL:** Gemini completed; 4 validated critical plan gaps were resolved. The Codex transport and
  fallback reviewer timed out, as recorded in `council-feedback.md`.
- **UNRESOLVED:** 0 engineering or design decisions.
- **VERDICT:** ENG + DESIGN CLEARED — Plan 067 is ready for implementation in the staged PR order.
