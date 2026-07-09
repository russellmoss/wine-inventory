---
title: Feedback tickets, developer console, and tenant automation modes
type: feat
status: draft
date: 2026-07-09
branch: feat/feedback-ticket-developer-automation
depth: deep
units: 12
reviews: eng-review + council (codex+gemini) + design-review — 2026-07-09; revised per findings (see "Review Revisions" and "GSTACK REVIEW REPORT")
---

> **Review status (2026-07-09):** This plan was revised after an engineering review,
> a cross-LLM council (Codex + Gemini), and a design review. Both council models
> independently rated the original as **"not safe to implement as written"** (3 P0s
> each). The blocking issues are fixed below and summarized in **Review Revisions**.
> Where inline prose below still reads the old way, the Review Revisions section wins.
>
> **⚠️ EXECUTION ORDER — do NOT build units in numeric order.** Follow the **Build Order**
> section (just before Implementation Units). Sequence:
> `1 → 9 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 10 → 11 → 12`, with the shared
> `src/lib/feedback/automation.ts` primitive built inside Unit 1.

## Overview

Add tenant-scoped, developer-controlled feedback automation so the developer can choose how much AI spend runs behind each tenant's assistant thumbs-downs, bug reports, and feature requests.

The app gets three related capabilities:

1. Assistant thumbs-down automation becomes per-tenant configurable:
   - `report only`: save the feedback, no AI or GitHub automation.
   - `plan mode`: Claude writes a full plan document, posts it to GitHub as an issue, and the app stores/renders the plan.
   - `agentic fix`: current behavior, Claude proposes a code fix in a PR.
2. Users can submit tickets from the assistant widget and a Help / Feedback page:
   - Bug reports can be `report only`, `plan mode`, or `agentic fix`.
   - Feature requests can be `report only` or `plan mode`.
   - Tickets can include PNG/JPG attachments stored in Vercel Blob.
3. A global developer user can see feedback across all tenants, filter by tenant/type/status/severity, inspect attachments/plans/PRs/issues, set P0/P1/P2 manually, and enter any tenant as an admin for support.

The intent is cost control without losing the feedback loop: report-only keeps a backlog, plan mode buys thinking but not code, and agentic fix spends AI on a PR only where the developer has explicitly enabled it for that tenant.

## Review Revisions (2026-07-09) — authoritative; supersedes conflicting inline text

These changes came out of the eng review + council (Codex + Gemini) + design review.
Where any section below still describes the old behavior, this section governs.

### Decisions made with the owner

1. **First developer account (was P0).** Do **NOT** promote `demo@demo.com` / `demo1234`.
   The first developer is **`russellmoss87@gmail.com`** (the owner), who is already a
   member of **Bhutan Wine Co.** and gets elevated to the global `developer` role. The
   initial password is set **out-of-band via an env var in the one-time seed script**
   (never hardcoded in this doc, the seed, or any committed file) with
   `mustChangePassword = true` forced on first login. The seed/promote script **must
   refuse to grant `developer` to any `@demo`/`demo@` address**. Because this account is
   a real Bhutan member, its base session stays membership-valid — the developer only
   needs impersonation to enter *other* tenants.

2. **Tenant "enter as admin" is ephemeral, per-request (was P0/P1).** Do **NOT** mutate
   the shared session's `activeOrganizationId`. That poisons every other open tab and
   turns a membership-validated field into a persistent cross-tenant switch. Instead:
   - `session.activeOrganizationId` stays membership-valid for everyone, developer
     included (drop the planned `toAppUser` membership-bypass entirely).
   - Impersonation is a **short-lived, explicitly-scoped, audited support context**
     resolved **per request** (e.g. a signed, expiring `support_tenant` cookie/token
     that names the target tenantId + granting developer + expiry), read on top of the
     normal auth resolution. It never overwrites the base session.
   - Entering, refreshing, and exiting the support context are each audited.

3. **Cross-tenant console reads: bounded RLS loop (kept the invariant).** Keep the
   `runAsTenant(tenantId, …)`-per-tenant approach (no `runAsSystem` in web routes — the
   documented invariant). To avoid Neon/Prisma pool exhaustion (Gemini P0), bound it
   hard: **mandatory pagination**, a **capped tenant fan-out per request** (e.g. ≤ N
   tenants per page), small bounded concurrency (not one unbounded `Promise.all` over
   every tenant), a default window (last 30 days / newest 100), and a short server-side
   cache for the tenant list. If tenant count later outgrows this, a dedicated
   read-only aggregation role is a *future* tripwire-guarded exception, not v1.

4. **AGENTIC_FIX requires a developer approval click in v1 (answers Open Question c).**
   No agent job dispatches automatically, even when a tenant's mode is `AGENTIC_FIX`.
   The item is saved and marked awaiting review; a developer must open it and click
   **Approve** before any GitHub dispatch. Human-in-the-loop on every code-writing run.
   (This also blunts the prompt-injection blast radius — see below.)

### Security fixes folded in (council consensus, P0/P1)

5. **Prompt injection is a boundary, not a prompt instruction (P0, both models).** User
   text, transcripts, screenshots, filenames, and annotations are attacker-controlled and
   flow into an agent that reads the repo and opens PRs. "Treat as untrusted" copy in the
   prompt is not a control. Enforcement:
   - The write-fence (path denylist for `.env*`, secrets, `.github/workflows/`,
     `prisma/migrations/`, auth/session/RLS/tenant code) is enforced **mechanically**
     (the existing `add-paths` fence + a CI check that fails the PR on out-of-fence
     diffs), not by asking the model nicely.
   - Automation runs with a **least-privilege** GitHub token (contents+PR write only,
     no workflow/secrets scope) and only after the human approval gate (#4).
   - **No image-to-text / OCR into the model by default** in v1. Plan/fix prompts get a
     sanitized, structured text summary — not raw user prose dumped inline, not image
     bytes. (Assistant thumbs-down image attachments stay out of the model path in v1;
     answers Open Question a: tickets only, and only as metadata.)

6. **Exactly-once dispatch via a transactional outbox (P1, both models).** The current
   `assistant-feedback-agent.ts` does `findFirst(status=NEW)` then marks the row in a
   separate step — a duplicate-dispatch / out-of-order-callback race. Do not copy that.
   Add an **`AutomationRun`** table (see Data Model) written **in the same tenant tx** as
   the feedback/ticket row, with a **unique idempotency key** per (source, id, kind,
   attempt). A poller/claim step transitions `QUEUED → RUNNING` with a compare-and-swap;
   CI writes back keyed on immutable external ids (`workflow_run_id`, `pr_number`,
   `issue_number`) so re-runs and late callbacks can't create double PRs or stale status.

7. **`FeedbackAttachment` gets tenant-bound composite FKs (P1, Codex; P2, Gemini).** The
   "exactly-one-parent" CHECK does not stop a `tenantId=A` attachment from pointing at a
   `tenantId=B` parent. Apply **Phase-12 checklist step 5**: composite uniques
   `@@unique([tenantId, id])` on `FeedbackTicket` and `AssistantFeedback`, and composite
   FKs `(tenantId, ticketId) → FeedbackTicket(tenantId, id)` and
   `(tenantId, assistantFeedbackId) → AssistantFeedback(tenantId, id)`. RLS isolates on
   the attachment's **own** `tenantId` (the polymorphic parent is irrelevant to
   isolation), so keep the standard `tenant_isolation` policy.

8. **Screenshots: server-trusted validation + capture consent (P1, both models).** The
   client `html-to-image` capture and the `captureSource` flag are both user-controlled.
   Server-side, on every upload: verify **magic bytes** (real PNG/JPEG), enforce
   max size + max dimensions + max count, **strip EXIF/metadata**, and re-derive
   `contentType` from the bytes (don't trust the header or the client's `captureSource`;
   treat `captureSource` as an untrusted hint). Auto-capture is opt-in per the consent
   step; because a full-page capture can contain another tenant's data, the captured
   image is previewed to the user before it's attached, and Blob objects are private +
   served only through the authenticated, tenant/role-checked proxy route (never a raw
   public Blob URL). Consider short-lived signed URLs if proxy latency is a problem.

9. **No blanket `admin || developer` widening (P1, Codex).** Do not sweep every
   `user.role === "admin"` site to also accept `developer`. There are ~40 such sites
   (`access.ts:41,52,70`, `AppShell.tsx:233`, `layout.tsx:12`, `assistant/registry.ts`,
   `assistant/scope.ts`, page/tool gates…). Add **explicit, named gates** —
   `requireDeveloper()` for `/developer`, and a support-scoped check that only grants
   admin-like power **inside an active impersonation context** — and patch only the
   enumerated call sites that genuinely need it. `isTenantAdminLike` is fine as a helper
   but must be applied deliberately, site by site, not globally.

10. **Sanitize stored markdown/notes/filenames rendered in the dev console (P2, Codex).**
    `planMarkdown`, `developerNotes`, `title`, `body`, and filenames are all untrusted and
    render in a privileged UI. Render markdown with a sanitizer that disallows raw HTML;
    normalize/escape filenames; serve attachments with safe content-disposition headers.

### Factual corrections (verified against the codebase)

11. `AssistantFeedback` **already has** `tenantId`, `status` (String: NEW|TRIAGED|
    RESOLVED|DISMISSED), `prUrl`, `notes`, `debugContext`, `actorUserId`, `actorEmail`,
    `conversation` (`prisma/schema.prisma:819-840`). Only the genuinely-new columns
    (`modeAtSubmission`, `automationStatus`, `severity`, `github*`, `plan*`, `resolved*`,
    `developerNotes`) are added. Its `status` **stays a `String`** for back-compat; only
    the new `FeedbackTicket` uses the `FeedbackItemStatus` enum. Note the enum adds
    `IN_PROGRESS`, which the String status never had — keep them separate, don't retro-fit.
12. `@vercel/blob` (`^2.4.1`) and `html-to-image` (`^1.11.13`) are **already
    dependencies** (`package.json:77,80`). No new deps to add for those.
13. `runLedgerWrite` lives in **`src/lib/ledger/write.ts`**, not `src/lib/tenant/`.
    Feedback/ticket writes don't touch the ledger; use `runInTenantTx` (`src/lib/tenant/tx.ts:17`).
14. Audit is a single file **`src/lib/audit.ts`**, not a directory. Signature:
    `writeAudit(tx, { actorUserId?, actorEmail, tenantId?, action, entityType, entityId?, changes?, summary, ipAddress?, userAgent? })` (`audit.ts:109`). It **must run inside a
    tenant tx** and defaults `tenantId` to `requireTenantId()`. **Cross-tenant audit
    gotcha:** when a developer enters tenant X, the `DeveloperTenantSwitch` audit row must
    be written inside `runAsTenant(X, …)` so it lands in tenant X's log (the tenant being
    entered), with `actorUserId` = the developer. Don't try to audit a switch outside any
    tenant context — `requireTenantId()` will throw.
15. No code currently accepts a `developer` role; today only `"admin"` is honored, and
    `User.role` is a better-auth `admin()`-plugin `String?` field (not a Prisma enum,
    not a custom additionalField). Adding `"developer"` as a valid string value is new.

## Problem Frame

Today an assistant thumbs-down with a comment can trigger `.github/workflows/assistant-feedback.yml`, which runs `scripts/assistant-feedback-agent.ts`. That script asks Claude to inspect assistant code and open a PR with a minimal fix. This is useful, but it has one operating mode: spend AI and create a PR.

That is too blunt for production:

- The developer may want one tenant on aggressive AI automation and another tenant on logging only.
- Some bugs/features need a plan, not an automatic implementation.
- A developer needs one place to view the backlog, attached screenshots, generated plans, and PR outcomes.
- Bug reports and feature requests should not be trapped inside assistant conversation feedback.
- Screenshots/photos often explain UI bugs better than prose, so attachments need to be first-class.

If we do nothing, feedback either costs too much in AI automation or becomes scattered across GitHub Actions, DB rows, and chat history.

## Requirements

- MUST: Automation settings are per tenant, but v1 controls live only on the developer page, not tenant-facing Settings.
- MUST: Assistant thumbs-down supports `report only`, `plan mode`, and `agentic fix`.
- MUST: Bug reports support `report only`, `plan mode`, and `agentic fix`.
- MUST: Feature requests support `report only` and `plan mode`; no automatic implementation for feature requests in v1.
- MUST: Existing assistant feedback PR behavior remains available as `agentic fix`.
- MUST: Ticket submission is available from both the assistant/widget surface and a separate Help / Feedback page.
- MUST: Tickets support PNG/JPG attachments, stored in Vercel Blob with DB metadata.
- MUST: Developer users can see all tenants' assistant feedback, bug reports, feature requests, attachments, generated plans, GitHub issues, PRs, run state, status, and IDs.
- MUST: Developer users can change each tenant's assistant feedback, bug report, and feature request automation modes from the developer page.
- MUST: Developer users can set severity manually: `P0`, `P1`, `P2`, plus unset.
- MUST: Developer users can filter by tenant, ticket type, mode, severity, status, automation status, and text.
- MUST: Developer users can switch into a tenant's instance as an admin using a fuzzy tenant picker, via an **ephemeral per-request support context** — NOT by mutating the shared session's `activeOrganizationId` (see Review Revisions #2).
- MUST: Tenant switching is audited (enter/refresh/exit) and does not require creating fake tenant memberships.
- MUST: GitHub/Claude jobs treat user feedback and attachments as untrusted data.
- MUST: No automation ever merges code. Agentic fix only opens a PR, and only after an explicit developer **approval click** in v1 (see Review Revisions #4) — never auto-dispatched.
- MUST: Automation inputs (user text, transcripts, screenshots, filenames) are untrusted; the write-fence is enforced **mechanically** (path denylist + CI check + least-privilege token), not by prompt instruction (see Review Revisions #5).
- MUST: Developer cross-tenant reads do not use an unrestricted owner connection in normal web requests, and are **bounded** (pagination + capped tenant fan-out per request) to avoid connection-pool exhaustion (see Review Revisions #3).
- MUST: The first developer user is a **dedicated internal account (`russellmoss87@gmail.com`)**, already a Bhutan Wine Co. member, elevated to `developer`; its password is set out-of-band via env in the seed with `mustChangePassword`. The seed refuses to grant `developer` to any `demo@`/`@demo` address. `demo@demo.com` stays a normal Demo Winery user (see Review Revisions #1).
- MUST: When a user starts a bug report from the assistant/widget, the first modal step asks whether to capture a screenshot of the current page.
- MUST: If the user chooses yes, the app captures the current page, attaches it automatically, and shows confirmation on the next report step before the user submits.
- SHOULD: Before submission, users can add multiple screenshots/images and optionally annotate each one with editable circles, arrows, and text labels.
- SHOULD: Plan mode creates a GitHub issue rather than a code PR, with the full plan Markdown in the issue body.
- SHOULD: The same plan Markdown is persisted in the DB and rendered in the developer detail modal.
- SHOULD: The plan format should match this repo's existing `docs/plans/*` structure: frontmatter, Overview, Problem Frame, Requirements, Scope, Research Summary, Key Decisions, Data Model, Implementation Units, Tests, Risks.
- SHOULD: The developer console has copyable IDs for use in Codex, Claude Code, or GitHub workflows.

## Scope Boundaries

**In scope:**

- Prisma schema additions for automation modes, tickets, attachments, generated plans, and automation run metadata.
- Tenant-scoped settings fields on `AppSettings`.
- Developer UI controls for each tenant's assistant feedback, bug report, and feature request automation modes.
- Help / Feedback page.
- Assistant/widget ticket modal.
- Assistant/widget auto-screenshot capture flow for bug reports.
- Vercel Blob upload and retrieval routes for ticket attachments.
- GitHub Actions/scripts for plan mode and bug-report agentic fix.
- Developer-only console across tenants.
- Developer tenant switcher / admin view mode.
- Audit logs for setting changes, developer status changes, automation retries, and tenant switches.
- Tenant isolation tests and developer access tests.

**Out of scope for v1:**

- Agentic implementation of feature requests.
- In-app commenting threads on reports.
- Email notifications.
- SLA timers.
- Moving attachments to another storage provider.
- Public support portal for unauthenticated users.
- Auto-prioritization of P0/P1/P2 by AI. The developer sets severity manually.

## Research Summary

### Current Codebase

- Assistant feedback is already persisted in `AssistantFeedback` in `prisma/schema.prisma`.
- `src/app/api/assistant/feedback/route.ts` saves thumbs up/down and currently dispatches GitHub for down-feedback with a comment.
- `.github/workflows/assistant-feedback.yml` runs `scripts/assistant-feedback-agent.ts`, then opens a PR with `peter-evans/create-pull-request`.
- `scripts/assistant-feedback-agent.ts` is intentionally path-fenced to `src/lib/assistant/` and `src/app/(app)/assistant/`, modifies existing files only, treats feedback as untrusted, and writes `.assistant-fix-body.md`.
- Settings already use a per-tenant `AppSettings` row and admin-only actions in `src/lib/settings/actions.ts`, but automation controls should not be exposed there in v1.
- `src/app/(app)/settings/page.tsx` loads settings server-side and passes them into `SettingsClient`; leave this tenant-facing page alone unless a later phase exposes feedback automation to tenants.
- `src/app/(app)/assistant/AssistantChat.tsx` owns the feedback bar and is also used in the embedded assistant widget.
- Auth uses `User.role` as a string today: `admin` or `user`. Developer can be added as a new global role value.
- `getCurrentUser` currently validates `session.activeOrganizationId` against memberships. Developer tenant switching needs an explicit exception.
- The app should not import `runAsSystem` from web routes. Cross-tenant developer reads should enumerate tenants and run tenant-scoped queries per tenant.

### Next.js / Storage Constraints

- Use App Router route handlers for uploads and GitHub webhooks/automation callbacks.
- Next.js 16 request APIs are async; keep route auth checks server-side.
- Use lazy service initialization where a storage or SDK client can touch env.
- Vercel Blob is appropriate for PNG/JPG attachments.
- Client-side page capture can use a browser DOM capture helper such as `html-to-image` for the current app page. It should be best-effort and let users continue without a screenshot if capture fails.
- Prefer private Blob access for screenshots because they may contain winery/customer data. Serve developer previews through an authenticated route instead of exposing raw public URLs.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|---|---|---|---|
| Automation location | Per tenant on `AppSettings`, controlled from `/developer` only in v1 | Tenant-facing Settings; global env flag | Settings need tenant scope, but the developer should control spend and rollout centrally for now. |
| Assistant modes | `REPORT_ONLY`, `PLAN_MODE`, `AGENTIC_FIX` | Boolean auto-fix toggle | Captures the cost ladder: log, plan, implement. |
| Bug modes | `REPORT_ONLY`, `PLAN_MODE`, `AGENTIC_FIX` | No agentic bug fixes | User explicitly wants agentic fix for bug reports too. |
| Feature modes | `REPORT_ONLY`, `PLAN_MODE` | Agentic feature PRs | New features have larger product/design risk; plan-only first. |
| Plan artifact | GitHub issue + DB Markdown | PR containing only a Markdown file | Issues are cleaner for planning and avoid fake code PRs. DB copy lets the frontend render immediately. |
| Attachments | Vercel Blob private object + DB metadata | Store bytes in Postgres; public blobs | Blob is built for files; private/proxied access protects screenshots. |
| Developer access | New global `developer` role | Add developer to every tenant as admin | Avoids fake memberships and makes cross-tenant access explicit. |
| Cross-tenant reads | Enumerate tenants + `runAsTenant`, **bounded** (pagination, capped fan-out, small concurrency) | Owner `runAsSystem` in web app; dedicated read-only role | Preserves RLS discipline without exhausting the pool. Dedicated role is a future tripwire-guarded exception, not v1. |
| Tenant admin view (REVISED) | **Ephemeral per-request support context** (signed, expiring, scoped) layered over the base session | Mutate `session.activeOrganizationId`; query-param override | Mutating the session poisons other tabs and repurposes a membership-checked field as a persistent impersonation switch (council P0/P1). |
| Developer admin power (REVISED) | **Explicit named gates** (`requireDeveloper`, support-scoped check inside impersonation) on enumerated sites | Blanket `admin \|\| developer` across ~40 sites | A blanket widening silently grants powers never intended and creates inconsistent gates (council P1). |
| First developer account (REVISED) | Dedicated **`russellmoss87@gmail.com`** (existing Bhutan member) elevated to `developer`; password via env + `mustChangePassword`; seed denies `demo@` | Promote `demo@demo.com` / `demo1234` | A public weak credential as a cross-tenant superuser was the single biggest risk (both council models, P0). |
| Automation dispatch (NEW) | Human **approval click** before any AGENTIC_FIX/PLAN dispatch in v1; transactional outbox + idempotency key | Auto-dispatch on tenant mode; findFirst→mark-later (current) | Blunts prompt-injection blast radius and prevents duplicate/out-of-order dispatch races (council P0/P1). |
| Attachment integrity (NEW) | Tenant-bound composite FKs (checklist step 5) + server-side magic-byte/size/dimension validation + EXIF strip | "Exactly-one-parent" CHECK only; trust client `captureSource` | CHECK doesn't stop cross-tenant parent pointers; client flags/bytes are attacker-controlled (council P1). |
| Bug-report screenshots | Ask first, then auto-capture current page and attach before the report form | Make users upload manually; always capture without asking | Gives useful visual context while keeping user consent explicit. |
| Screenshot annotation | Optional editable thumbnail-to-fullscreen markup from the report form: circle, arrow, text, undo/clear, multiple images | Separate required annotation step; full image editor; no annotation | Users often know what looks wrong before they can explain it. Markup helps the LLM and the developer focus on the relevant UI area without slowing users who just want to submit. Multiple screenshots support multi-step or before/after bugs. |

## Data Model

### New / Changed Enums

```prisma
enum FeedbackAutomationMode {
  REPORT_ONLY
  PLAN_MODE
  AGENTIC_FIX
}

enum FeedbackTicketKind {
  BUG_REPORT
  FEATURE_REQUEST
}

enum FeedbackSeverity {
  P0
  P1
  P2
}

enum FeedbackItemStatus {
  NEW
  TRIAGED
  IN_PROGRESS
  RESOLVED
  DISMISSED
}

enum FeedbackAutomationStatus {
  NOT_REQUESTED
  QUEUED
  RUNNING
  PLANNED
  PR_OPENED
  FAILED
  SKIPPED
}
```

### `AppSettings` Additions

Add fields to the existing tenant-scoped settings row:

- `assistantFeedbackMode FeedbackAutomationMode @default(AGENTIC_FIX)`
- `bugReportMode FeedbackAutomationMode @default(REPORT_ONLY)`
- `featureRequestMode FeedbackAutomationMode @default(REPORT_ONLY)`

The assistant default preserves current behavior until the developer changes it for a tenant. New ticket surfaces default to logging only. These fields are not exposed in tenant-facing Settings in v1.

### `AssistantFeedback` Additions

Extend the existing table rather than replacing it:

- `modeAtSubmission FeedbackAutomationMode @default(AGENTIC_FIX)`
- `automationStatus FeedbackAutomationStatus @default(NOT_REQUESTED)`
- `severity FeedbackSeverity?`
- `githubIssueUrl String?`
- `githubRunUrl String?`
- `planMarkdown String?`
- `planTitle String?`
- `planGeneratedAt DateTime?`
- `resolvedAt DateTime?`
- `resolvedByUserId String?`
- `developerNotes String?`

Keep the existing `status`, `prUrl`, and `notes` fields for compatibility, then normalize names in a later cleanup only if it is worth it.

### New `FeedbackTicket`

Tenant-scoped table for bug reports and feature requests:

- `tenantId String @default("")`
- `id String @id @default(cuid())`
- `kind FeedbackTicketKind`
- `title String`
- `body String`
- `pageUrl String?`
- `userAgent String?`
- `debugContext Json?`
- `actorUserId String?`
- `actorEmail String`
- `modeAtSubmission FeedbackAutomationMode`
- `automationStatus FeedbackAutomationStatus @default(NOT_REQUESTED)`
- `status FeedbackItemStatus @default(NEW)`
- `severity FeedbackSeverity?`
- `githubIssueUrl String?`
- `githubRunUrl String?`
- `prUrl String?`
- `planMarkdown String?`
- `planTitle String?`
- `planGeneratedAt DateTime?`
- `resolvedAt DateTime?`
- `resolvedByUserId String?`
- `developerNotes String?`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`
- `@@index([tenantId, kind, status, createdAt])`
- `@@index([tenantId, severity, createdAt])`
- `@@index([tenantId, automationStatus, createdAt])`
- `@@unique([tenantId, id])` — required so `FeedbackAttachment` can reference it with a tenant-bound composite FK (Phase-12 checklist step 5; see Review Revisions #7).

`AssistantFeedback` also needs a matching `@@unique([tenantId, id])` added in Unit 1 so
attachments can composite-FK to it too.

Migration follows the Phase 12 checklist: tenant FK, `@@index([tenantId])`, RLS enable/force, `tenant_isolation` policy with `USING` and `WITH CHECK`, app_rls grants, and isolation tests.

### New `FeedbackAttachment`

Tenant-scoped metadata for images:

- `tenantId String @default("")`
- `id String @id @default(cuid())`
- `ticketId String?`
- `assistantFeedbackId String?` optional future support for thumbs-down screenshots
- `blobUrl String`
- `blobPathname String`
- `filename String`
- `contentType String`
- `byteSize Int`
- `sha256 String`
- `captureSource String @default("MANUAL_UPLOAD")` // `MANUAL_UPLOAD` | `AUTO_SCREENSHOT`
- `width Int?`
- `height Int?`
- `createdAt DateTime @default(now())`
- `uploadedByUserId String?`
- `uploadedByEmail String`
- `@@index([tenantId, ticketId])`
- `@@index([tenantId, assistantFeedbackId])`

Add a raw SQL CHECK constraint so exactly one parent is set:

```sql
CHECK (
  ("ticketId" IS NOT NULL AND "assistantFeedbackId" IS NULL)
  OR
  ("ticketId" IS NULL AND "assistantFeedbackId" IS NOT NULL)
)
```

**Tenant-bound composite FKs (Review Revisions #7, required — not optional).** The CHECK
above only enforces "exactly one parent set"; it does NOT stop a `tenantId=A` attachment
from pointing at a `tenantId=B` parent. Add composite FKs so a parent must be in the same
tenant:

```sql
-- requires @@unique([tenantId, id]) on both parent tables
ALTER TABLE "FeedbackAttachment"
  ADD CONSTRAINT fk_attach_ticket
    FOREIGN KEY ("tenantId", "ticketId")
    REFERENCES "FeedbackTicket" ("tenantId", "id") ON DELETE CASCADE,
  ADD CONSTRAINT fk_attach_feedback
    FOREIGN KEY ("tenantId", "assistantFeedbackId")
    REFERENCES "AssistantFeedback" ("tenantId", "id") ON DELETE CASCADE;
```

RLS isolates on the attachment's **own** `tenantId` (the standard `tenant_isolation`
policy) — the polymorphic parent is irrelevant to isolation once the composite FKs are in.

**Store an `annotatedBlobUrl`/`annotatedBlobPathname` (nullable)** alongside the original
so annotated exports and original pixels are both retained (original helps later debugging).
Annotation vector state, if kept for re-editing before submit, lives client-side until
submit; do not persist editable annotation objects server-side in v1.

For v1, ticket attachments are exposed in the UI. Assistant thumbs-down attachment support
stays out of scope for v1 (Open Question a resolved: tickets only; thumbs-down screenshots
can reuse this model later). Attachment bytes are **never** fed to the model (Review
Revisions #5).

### New `AutomationRun` (transactional outbox — Review Revisions #6)

Tenant-scoped outbox/claim row so dispatch is exactly-once and status write-backs are
idempotent. Written **in the same tenant tx** as the feedback/ticket row.

- `tenantId String @default("")`
- `id String @id @default(cuid())`
- `source String` // `assistant_feedback` | `ticket`
- `sourceId String` // AssistantFeedback.id or FeedbackTicket.id
- `kind String` // `feedback_plan` | `assistant_agentic_fix` | `ticket_agentic_fix`
- `attempt Int @default(1)`
- `idempotencyKey String` // e.g. `${kind}:${source}:${sourceId}:v${attempt}`
- `status FeedbackAutomationStatus @default(QUEUED)`
- `approvedByUserId String?` // set when a developer clicks Approve (v1 gate, Rev #4)
- `approvedAt DateTime?`
- `dispatchedAt DateTime?`
- `workflowRunId String?` // immutable external id for CAS write-back
- `issueNumber Int?`
- `prNumber Int?`
- `error String?`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`
- `@@unique([tenantId, idempotencyKey])` // dedupe dispatch
- `@@index([tenantId, status, createdAt])`

Flow: create the source row + an `AutomationRun` (`QUEUED`, unpaid until approved) in one
tx → developer approves (sets `approvedBy*`) → a claim step CAS-transitions `QUEUED →
RUNNING` and only then dispatches GitHub → CI writes back keyed on `workflowRunId` /
`prNumber` / `issueNumber` so late or duplicate callbacks are no-ops. Follows the same
Phase-12 tenant checklist as the other new tables (FK, index, RLS enable/force, policy,
grants, isolation test).

## Automation Behavior

> All dispatch paths below are gated on the **developer approval click** (Review
> Revisions #4) and go through the **`AutomationRun` outbox** (#6) in v1. "Dispatch"
> below means "dispatch after approval + CAS claim," never "auto-dispatch on submit."

### Report Only

Save the row and attachments, set:

- `modeAtSubmission = REPORT_ONLY`
- `automationStatus = NOT_REQUESTED`
- `status = NEW`

No GitHub dispatch. Developer can later manually set severity, write notes, or trigger plan/fix from the developer console.

### Plan Mode

Save the row, set `automationStatus = QUEUED`, then dispatch GitHub:

- `event_type = feedback_plan`
- payload includes `source = assistant_feedback | ticket`, `id`, `tenantId`, and `kind`

GitHub Actions runs a new plan script:

- Reads the feedback/ticket and attachment metadata.
- Fetches private attachment bytes only if the script is explicitly configured to include images.
- Treats all prose and images as untrusted observations.
- Asks Claude to generate a Markdown plan in repo plan-doc format.
- Creates a GitHub issue with the plan as the body.
- Updates the DB row with `planMarkdown`, `planTitle`, `githubIssueUrl`, `githubRunUrl`, `automationStatus = PLANNED`, `status = TRIAGED`.

The app should not require GitHub as the source of truth for the plan view. The DB copy is what the developer modal renders.

### Agentic Fix

Assistant thumbs-down:

- Preserve the existing workflow shape.
- Gate dispatch on `AppSettings.assistantFeedbackMode === AGENTIC_FIX`.
- Store `modeAtSubmission`, `automationStatus`, and GitHub run metadata.
- Continue to open a PR, then mark the row `PR_OPENED` / `TRIAGED`.

Bug report:

- Add a new workflow path for `ticket_agentic_fix`.
- Creates a draft PR with the bug report ID in the title/body.
- Uses stricter safety than normal Claude Code:
  - User report and attachment-derived text are untrusted.
  - No direct pushes to main.
  - No writes to `.env*`, secrets, workflows, Prisma migrations, auth/session security, or tenant/RLS code unless the workflow is manually re-run by a developer with an override label.
  - Prefer minimal app-code fixes.
  - Do not run broad test commands in the secret-holding agent job after model writes; let normal PR CI verify.
- Updates the ticket with `prUrl`, `githubRunUrl`, `automationStatus = PR_OPENED`, `status = TRIAGED`.

Feature request:

- `AGENTIC_FIX` is not offered in the feature-request developer controls and is rejected server-side if submitted.
- Developer can manually take the plan into Codex/Claude Code.

## Developer Role And Tenant Switching

Add a global `developer` user role (a `User.role` string value; not a tenant membership).
The first developer account is a **dedicated internal account, `russellmoss87@gmail.com`**
(the owner), who is **already a member of Bhutan Wine Co.**:

- email: `russellmoss87@gmail.com`
- password: **set out-of-band via env in the one-time seed** (never in this doc or any
  committed file), with `mustChangePassword = true` forced on first login
- role: `developer`

Because this account is a real Bhutan member, its base session is membership-valid — no
membership bypass is needed to use Bhutan; impersonation is only for entering *other*
tenants. `demo@demo.com` stays an ordinary Demo Winery user. The promote/seed script
**must refuse** to grant `developer` to any `demo@`/`@demo` address.

Required auth/access changes:

- `User.role` accepts `developer` (a new valid string; today only `admin`/`user` exist —
  `src/lib/users/actions.ts:36` validation must be widened to allow `developer`).
- Add helpers in `src/lib/access.ts`:
  - `isDeveloper(user)`
  - `isTenantAdminLike(user)` returns true for `admin` OR (a developer **inside an active
    impersonation context** for the current tenant) — NOT any developer globally.
  - `requireDeveloper()` for `/developer` and developer-only actions.
- **Do NOT blanket-widen the ~40 `user.role === "admin"` sites.** Patch only the
  enumerated sites that genuinely need support access, using the explicit gates above
  (Review Revisions #9). Leave the rest as admin-only.
- **Do NOT change `toAppUser` to bypass membership.** `session.activeOrganizationId`
  stays membership-validated for everyone (`access.ts:26-32` / `dal.ts:79` unchanged).

Tenant switch flow (ephemeral per-request — Review Revisions #2):

- Developer page has a fuzzy tenant picker (orgs from the global `organization` table).
- "Enter tenant" server action: validates `requireDeveloper()`, validates the org exists,
  then issues a **short-lived, signed, scoped support token** (names `targetTenantId`,
  granting developer id, expiry) as an httpOnly cookie. It does **not** touch
  `session.activeOrganizationId`.
- Request resolution: when a valid support token is present, the DAL resolves the active
  tenant for **that request only** to `targetTenantId` and treats the developer as
  admin-like for that tenant. The base session is untouched, so other tabs/sessions are
  unaffected and the impersonation expires on its own.
- Audit **inside `runAsTenant(targetTenantId, …)`** (so it lands in the entered tenant's
  log; `writeAudit` needs a tenant context — Review Revisions #14):
  - `actorUserId` = developer, `action = UPDATE` (or a dedicated `IMPERSONATE` action if
    the `AuditAction` enum is extended), `entityType = DeveloperTenantSwitch`,
    `entityId = targetTenantId`, `summary = "Developer entered tenant support view"`.
  - Audit **enter, refresh, and exit** of the support context.
- The Developer nav/page remains visible in every context; add an **unmistakable, sticky,
  high-contrast "Support view: <tenant>" banner** (see Design Review) with a one-click
  "Exit support view" that clears the token.

Cross-tenant developer console (bounded RLS loop — Review Revisions #3):

- Do not use `runAsSystem` in the web route.
- Load organizations from the global `organization` table (cache the list briefly).
- For the current page of tenants, query tenant-scoped feedback/tickets by wrapping each
  read in `runAsTenant(tenantId, ...)`.
- **Bound it hard:** mandatory pagination, a capped number of tenants per request
  (e.g. ≤ 20), small bounded concurrency (a `p-limit`-style cap, NOT an unbounded
  `Promise.all` over every tenant — that exhausts the Neon pooler), and default to last
  30 days / newest 100 items. Surface a clear "showing N of M tenants" indicator so the
  cap is never a silent truncation.

## User Experience

### Developer Automation Controls

Add a "Feedback automation" area in `/developer`. It is tenant-scoped but developer-owned. Tenant admins and normal users do not see or change these controls in v1.

Developer selects a tenant with fuzzy search, then sets:

- Assistant thumbs-down:
  - segmented control: Report only / Plan mode / Agentic fix.
- Bug reports:
  - segmented control: Report only / Plan mode / Agentic fix.
- Feature requests:
  - segmented control: Report only / Plan mode.

Each save is developer-only and audited. Copy should be plain and cost-oriented, for example:

- Report only: "Save it for developer review."
- Plan mode: "Ask Claude for a plan, no code PR."
- Agentic fix: "Ask Claude to open a fix PR."

Do not add this card to tenant-facing `/settings` in v1. A later phase can expose some or all controls to tenant admins if that becomes useful.

### Help / Feedback Page

Add `/help/feedback`:

- Type selector: Bug report / Feature request.
- Title.
- Description.
- Optional current page URL captured client-side.
- Attachment picker for PNG/JPG.
- Submit button.
- Success state with copyable ticket ID.

### Assistant / Widget Modal

Add a compact "Report" or "Feedback" action near the assistant input/widget controls.

Feature request flow:

- Type: Bug report / Feature request.
- Title.
- Details.
- Attach PNG/JPG.
- Optional include current conversation context checkbox when opened from assistant.
- Submit.

Bug report flow:

1. User chooses "Bug report".
2. First modal step asks: "Do you want to take a screenshot of this page to add context?"
3. Buttons: "Yes, capture screenshot" and "No screenshot".
4. If yes, capture the current app page client-side and upload/hold it as a pending attachment. If capture fails, show a small failure state and let the user continue.
5. Next modal step asks for title/details and shows a pending attachment gallery if screenshots/images exist.
6. The user can click any screenshot thumbnail to open a floating full-page annotation overlay above the report form.
7. Annotation tools: circle/ellipse, arrow, text label, undo, clear, save/done.
8. Closing/saving the overlay updates that pending attachment thumbnail to the annotated image.
9. Until submit, clicking the same thumbnail reopens the annotation overlay with the existing annotation state so the user can edit/add more markup.
10. The user may ignore annotation entirely and submit with plain screenshots.
11. The user can add more screenshots/images before submit:
   - "Capture another screenshot" captures the current page again and adds it to the gallery.
   - "Attach image" lets the user add PNG/JPG files manually.
   - Each image can be annotated independently.
12. Submit creates the ticket and attaches every pending screenshot/manual image in its current edited state.

For thumbs-down itself, keep the current quick flow, but the submitted row should now respect the tenant's automation mode.

### Developer Console

Add `/developer`.

Primary layout:

- Tenant fuzzy search / active tenant switcher at top.
- Feedback automation controls for the selected tenant.
- Tabs:
  - All
  - Assistant thumbs-down
  - Bug reports
  - Feature requests
- Filter bar:
  - tenant
  - type
  - mode
  - status
  - automation status
  - severity
  - date range
  - search text
- Table columns:
  - ID
  - tenant
  - type
  - title/comment summary
  - severity
  - status
  - mode
  - automation status
  - GitHub issue/PR
  - created at

Detail modal:

- Full user report/comment.
- Assistant transcript and debug context for thumbs-downs.
- Attachments with image thumbnails and download/open controls, including annotated screenshots.
- Rendered plan Markdown if generated.
- GitHub issue link, PR link, run link.
- Developer notes.
- Severity selector.
- Status selector.
- Retry/trigger controls:
  - Generate plan.
  - Run agentic fix if allowed for source type.
  - Mark resolved/dismissed.
- Copy ID buttons.

## Build Order (READ FIRST when executing — /work must follow this)

**Do NOT execute units in numeric order.** Execute in the dependency order below. The
numbered units are definitions; this section is the sequence.

```
STEP 1  Unit 1   Schema + migration + RLS + AutomationRun table.
                 ⤷ In the SAME step, land src/lib/feedback/automation.ts (the shared
                   primitive: AutomationRun outbox claim + idempotency key + "requires
                   approval" gate). Units 3/4/7/8 all call it — build it now, not in Unit 10.
                 ⤷ Also land the tenant-isolation + composite-FK test here (don't defer to 12).
                 Gate: `verify:tenant-isolation` green, `prisma generate` clean, `tsc` clean.

STEP 2  Unit 9   Developer role + access helpers (isDeveloper/requireDeveloper/
                 isTenantAdminLike) + ephemeral per-request support-token impersonation +
                 seed russellmoss87@gmail.com (password from env, mustChangePassword; seed
                 refuses demo@). Land the role/impersonation tests here (don't defer to 12).
                 Reason it's before Unit 2: Unit 2's developer-only action needs these helpers.
                 Gate: role/impersonation tests green; base session unchanged after enter/exit.

STEP 3  Unit 2   Settings data reader (getFeedbackModes) + developer-only action to change
                 per-tenant modes (uses Step 2 helpers). Reject feature-request AGENTIC_FIX
                 server-side. Do NOT touch tenant-facing SettingsClient.

STEP 4           Middle units — after Steps 1–3, these three lanes are independent and MAY
                 be built in parallel worktrees, or linearly in this order if single-threaded:
                   Lane B: Unit 3  → Unit 7 → Unit 8   (assistant gate, plan workflow, bug-fix workflow)
                   Lane C: Unit 4  → Unit 5 → Unit 6   (ticket API, blob attachments, widget modal)
                   Lane D: Unit 10                     (developer console + Approve action)
                 CONFLICT WATCH: Lanes B and C both touch src/lib/feedback/ — if parallel,
                 coordinate that dir or sequence B's mode-gate before C. If linear, the safe
                 single-threaded order is: 3 → 4 → 5 → 6 → 7 → 8 → 10.

STEP 5  Unit 11  Auditing sweep across all the above (writeAudit call sites; switch audit
                 inside runAsTenant(target)).

STEP 6  Unit 12  Test/docs/runbook sweep — fill remaining gaps, add the CI write-fence job,
                 write docs/developer-feedback-automation.md, run the full verify suite.
```

**Single-threaded TL;DR:** `1 → 9 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 10 → 11 → 12`.
Commit per unit; **a unit is only DONE when its agentic gate is green** (see Agentic
Verification Harness → Per-unit gate). `/work` runs the gate after each unit and must fix
red before advancing — do not proceed on a failing gate.

## Agentic Verification Harness (automated, runs as you build)

**Principle:** every unit lands with an automated proof that runs headless, so the build
is self-checking end-to-end — not manual-QA-at-the-end. This mirrors the repo's existing
`verify:*` scripts (`verify:tenant-isolation`, `verify:commerce7` + `-idempotency`,
`verify:ttb`, `verify:reverse`). External I/O (GitHub REST, Anthropic, Vercel Blob) is
**mocked** so the scripts are offline + deterministic; each wraps its writes in
`runAsTenant("org_demo_winery", …)` and uses `QA-*`-prefixed fixtures.

### New scripts (add to `package.json` `scripts` + `scripts/`)

- **`verify:feedback`** (`scripts/verify-feedback.ts`) — the happy-path loop. Submit a
  thumbs-down and a ticket in each mode; assert the row + `AutomationRun` are created with
  the right `modeAtSubmission`/`automationStatus`; **report-only dispatches nothing**;
  plan/agentic create a `QUEUED` run and **do NOT dispatch until a developer approves**;
  approve → CAS claim → (mocked) dispatch → status write-back `PLANNED`/`PR_OPENED`.
- **`verify:feedback-idempotency`** (`scripts/verify-feedback-idempotency.ts`) — mirrors
  `verify:commerce7-idempotency`. Dispatch twice with the same idempotency key → exactly
  one issue/PR; a duplicate/late CI callback keyed on `workflowRunId`/`prNumber` is a
  no-op; concurrent claim → only one `RUNNING`.
- **`verify:feedback-security`** (`scripts/verify-feedback-security.ts`) — the adversarial
  gate. Asserts: cross-tenant attachment/Blob fetch → 403/404; forged + expired support
  token → denied and base session unchanged after enter/exit; non-developer → `/developer`
  actions denied; feature-request `AGENTIC_FIX` submitted server-side → rejected; seed
  refuses a `demo@` developer; markdown/notes/filename XSS payload → sanitized (no
  executable HTML); upload with spoofed content-type / non-image magic bytes / oversize /
  too-many → rejected and EXIF stripped.
- **`verify:feedback-fence`** (`scripts/verify-feedback-fence.ts` + a CI job) — proves the
  agentic-fix write-fence **mechanically**: a diff touching a denied path (`.env*`,
  `.github/workflows/`, `prisma/migrations/`, auth/RLS/tenant) **fails**; an in-fence diff
  passes. Runs in CI on automation-opened PRs (Review Revisions #5).
- Tenant isolation for the 3 new tables is already covered by **`verify:tenant-isolation`**
  (auto-enumerates the DMMF). Unit 1 only confirms none land in `GLOBAL_MODELS` and adds
  the composite-FK cross-tenant-parent rejection assertion.

### Agent/LLM dry-run (Units 7 & 8)

Add a `--dry-run` flag to `feedback-plan-agent.ts` / `bug-feedback-agent.ts` that runs the
real prompt build + model call but **skips** issue/PR creation, asserting: (a) output
parses as a repo plan-doc (frontmatter + required headings), (b) proposed writes stay
within the fence, (c) no secret-scoped token is used. Ship one golden fixture ticket.
Consistent with the repo's assistant eval-coverage gate.

### Browser agentic QA (Units 6 & 10 — UI, no jsdom/RTL)

Drive the **Playwright `storageState` harness** (per CLAUDE.md) against **Demo Winery**
with `QA-*` fixtures, run via `/qa`. Scenarios: ticket submit (page + widget), screenshot
consent yes/no + capture-failure fallback, annotate/reopen/multi-image, console filters,
detail-modal image preview (auth-checked), the **Approve** action, and the **support-view
banner** enter/exit. Keep `verify:naming` green before AND after.

### Per-unit gate (what `/work` runs after each unit)

| Unit | Agentic gate (all must be green before advancing) |
|------|----|
| 1  | `prisma generate`, `tsc`, `verify:tenant-isolation` (+ composite-FK rejection assertion) |
| 9  | `verify:feedback-security` (role + impersonation slice); base session unchanged after enter/exit |
| 2  | `verify:feedback` (settings/mode slice) + unit tests (feature-req AGENTIC_FIX rejected) |
| 3  | `verify:feedback` (assistant gate: all 3 modes) |
| 4  | `verify:feedback` (ticket create: all modes) |
| 5  | `verify:feedback-security` (upload validation + cross-tenant Blob) |
| 6  | `/qa` browser scenarios + pure-logic unit tests (capture/validation/annotation geometry) |
| 7  | agent `--dry-run` + `verify:feedback` (plan path) + `verify:feedback-idempotency` |
| 8  | `verify:feedback-fence` + agent `--dry-run` + `verify:feedback` (bug path) |
| 10 | `/qa` console scenarios + `verify:feedback` (approve → dispatch) |
| 11 | audit-row assertions folded into `verify:feedback` / `-security` |
| 12 | full sweep: `lint`, `tsc`, `vitest`, `verify:tenant-isolation`, `verify:feedback`, `verify:feedback-idempotency`, `verify:feedback-security`, `verify:feedback-fence`, `verify:invariants`, `verify:tripwires`, + a `/qa` pass |

**Build the verify scripts alongside their first-consuming unit, not all in Unit 12.**
`verify:feedback` skeleton lands with Unit 2; `-security` with Unit 5/9; `-fence` with
Unit 8. Unit 12 is the sweep + CI wiring + docs, not the whole test effort.

### CI wiring

Add `verify:feedback`, `verify:feedback-idempotency`, and `verify:feedback-security` to the
PR gate (same shape as `verify:commerce7` in `ci.yml`). `verify:feedback-fence` runs on the
PRs the automation opens. `verify:invariants` + `verify:tripwires` stay hard gates; if this
feature introduces a new invariant (e.g. "no attachment bytes to the model," "no
`runAsSystem` in `src/app`"), add a typed note under `docs/architecture/invariants/` or
`tripwires/` so it's enforced automatically going forward.

## Implementation Units

### Unit 1 - Schema and Migration

**Goal:** Add automation fields, ticket tables, attachment metadata, enums, RLS, and grants.

**Files:** `prisma/schema.prisma`, new migration under `prisma/migrations/*_feedback_ticket_automation`.

**Approach:** Add enums, `FeedbackTicket`, `FeedbackAttachment`, and `AutomationRun` tables.
Extend `AppSettings` and `AssistantFeedback` (add only the genuinely-new columns —
`status`/`prUrl`/`notes`/`tenantId` already exist per Review Revisions #11; `AssistantFeedback.status`
stays a `String`). Add `@@unique([tenantId, id])` to `FeedbackTicket` **and**
`AssistantFeedback` so attachments can composite-FK to them. Raw SQL for: tenant FK + RLS
enable/force + `tenant_isolation` policy + app_rls grants on all three new tables; the
attachment exactly-one-parent CHECK; the **tenant-bound composite FKs** on attachments
(Review Revisions #7); the `AutomationRun` unique idempotency index. Optionally extend the
`AuditAction` enum with `IMPERSONATE`. **Enum-before-use (Windows rule):** land any new
enum value in an isolated `ALTER TYPE` migration committed before any column defaults to
it.

**Verification:** `npx prisma generate`; `test/tenant-isolation.test.ts` + `scripts/verify-tenant-isolation.ts`
auto-pick the new tables from the DMMF (confirm none land in `GLOBAL_MODELS`); a test
asserts the composite FK rejects a cross-tenant parent pointer.

### Unit 2 - Settings Data and Actions

**Goal:** Read/save per-tenant automation modes without exposing them in tenant Settings.

**Files:** `src/lib/settings/data.ts`, `src/lib/developer/actions.ts`, `src/lib/developer/feedback.ts`, later consumed by `/developer`.

**Approach:** Add a typed settings view and developer-only action. Reject feature request `AGENTIC_FIX` server-side. Audit every change. Do not add controls to `src/app/(app)/settings/SettingsClient.tsx` in v1.

**Verification:** Unit tests for mode validation; developer action authorization tests.

### Unit 3 - Assistant Feedback Mode Gate

**Goal:** Make `/api/assistant/feedback` respect tenant mode.

**Files:** `src/app/api/assistant/feedback/route.ts`, supporting lib under `src/lib/feedback/automation.ts`.

**Approach:** Load active tenant settings inside tenant context. Save `modeAtSubmission`. Dispatch no workflow for report-only, dispatch plan event for plan mode, dispatch existing agentic event for agentic fix.

**Verification:** Route tests for all three modes.

### Unit 4 - Ticket Create API and Help Page

**Goal:** Users can create bug/feature tickets outside the assistant.

**Files:** `src/app/(app)/help/feedback/page.tsx`, client component, `src/app/api/feedback/tickets/route.ts`, `src/lib/feedback/tickets.ts`.

**Approach:** Route handler validates ready user and active tenant, creates ticket, stores mode snapshot from settings, dispatches automation as needed.

**Verification:** Submit report-only/plan/bug-agentic cases.

### Unit 5 - Blob Attachments

**Goal:** Upload and retrieve PNG/JPG attachments, including auto-captured and annotated bug screenshots.

**Files:** `src/app/api/feedback/attachments/route.ts`, `src/app/api/feedback/attachments/[id]/route.ts`, `src/lib/feedback/attachments.ts`.

**Approach:** Use Vercel Blob **private** access. `@vercel/blob` is already a dependency
(`package.json:77`) — do not re-add. **Server-trusted validation on every upload (Review
Revisions #8):** verify **magic bytes** (real PNG/JPEG, not just the header/extension),
re-derive `contentType` from bytes, enforce max size + max dimensions + max count per
ticket, **strip EXIF/metadata**, compute SHA-256. Treat client `captureSource` as an
**untrusted hint** (store it, never trust it for a security decision) — tag
`AUTO_SCREENSHOT` / `MANUAL_UPLOAD` for display only. Store both the original and the
annotated export (`annotatedBlobUrl`) — original pixels help later debugging. The
GET-by-id route re-checks authorization (owning tenant member, or a developer with an
active support context for that tenant) before streaming, and sets safe
content-disposition headers; never expose a raw public Blob URL. Consider short-lived
signed URLs if proxy latency becomes a problem. **Never** feed attachment bytes to the
automation model (Review Revisions #5).

**Verification:** Upload validation tests (reject non-image magic bytes, oversized,
too-many, spoofed content-type); EXIF-strip test; unauthorized cross-tenant image fetch
returns 404/403; developer-with-support-context fetch succeeds and is audited.

### Unit 6 - Assistant Widget Ticket Modal

**Goal:** Users can submit bug/feature tickets from assistant and embedded widget.

**Files:** `src/app/(app)/assistant/AssistantChat.tsx`, possibly `src/app/(app)/assistant/FeedbackTicketModal.tsx`.

**Approach:** Add a modal component rather than bloating `AssistantChat`; **lazy-load the
annotation overlay** as an isolated client component (mirror the existing voice-overlay
lazy-load pattern) so the canvas code never ships to users who don't annotate. `html-to-image`
is already a dependency (`package.json:80`) — do not re-add. For bug reports, start with a
screenshot consent step. On yes, capture the current app surface client-side and **preview
it to the user before attaching** (Review Revisions #8 — a full-page capture can contain
sensitive data). The second step is the bug report form with a pending attachment gallery.
Each pending attachment holds the original image, current annotated export, and editable
annotation objects **client-side until submit** (do not persist annotation vectors
server-side). Clicking a thumbnail opens a floating annotation overlay with circle, arrow,
text, undo, clear, save/done. Users can reopen a thumbnail to keep editing, capture more
screenshots, or add manual PNG/JPG; each image annotated independently. Include optional
current assistant transcript + page URL in `debugContext`.

**Design conformance (see Design Review):** all controls use `src/components/ui/` (Modal,
Button, Input, Badge) and design tokens — no hardcoded colors/spacing, sentence-case
labels, warm shadows, light-only. The annotation canvas must be **reduced-motion aware**
and keyboard-operable (tab to tools, Esc to close, Enter to save); annotation color(s)
come from tokens (the wine accent + a high-contrast outline for visibility on any
screenshot). This repo has **no jsdom/RTL** (vitest is node-env) — this unit ships
**manual-QA-only** for UI; unit-test only the pure logic (capture/validation helpers,
annotation geometry).

**Verification:** Manual browser test in page and widget modes: yes screenshot, no screenshot, annotate screenshot, reopen/edit annotation, capture multiple screenshots, annotate multiple images independently, skip annotation, capture failure fallback, manual attachment, and successful ticket creation.

### Unit 7 - Plan Mode GitHub Workflow

**Goal:** Claude generates a plan Markdown and opens a GitHub issue.

**Files:** `.github/workflows/feedback-plan.yml`, `scripts/feedback-plan-agent.ts`, `scripts/feedback-automation-mark.ts`.

**Approach:** One script supports assistant feedback and tickets by source/id. Dispatch
only fires after the **developer approval click** and via the **`AutomationRun` outbox
CAS claim** (Review Revisions #4, #6). It reads DB context, prepares a **sanitized,
structured** prompt (no raw user prose dumped inline, no image bytes/OCR — Review
Revisions #5), asks Claude for plan Markdown in repo plan-doc shape, creates a GitHub
**issue** through REST, and writes back to the `AutomationRun` + source row keyed on
`issueNumber`/`workflowRunId` so late/duplicate callbacks are no-ops. Runs with a
least-privilege token. The generated markdown is treated as untrusted and sanitized on
render (Review Revisions #10).

**Verification:** Manual `workflow_dispatch` against a Demo Winery ticket; DB row gets
plan + issue URL; a second dispatch with the same idempotency key does NOT create a second
issue.

### Unit 8 - Bug Agentic Fix Workflow

**Goal:** Bug report agentic mode opens a draft PR.

**Files:** `.github/workflows/feedback-bug-fix.yml`, `scripts/bug-feedback-agent.ts`, mark script.

**Approach:** Separate from assistant feedback because the write fence differs. Dispatch
only after developer approval + outbox claim (Rev #4, #6). **Enforce the write-fence
mechanically, not by prompt (Review Revisions #5):** the `add-paths` allow-list plus a
**CI job that fails the PR if the diff touches any denied path** (`.env*`, secrets,
`.github/workflows/`, `prisma/migrations/`, auth/session/RLS/tenant code) unless a
developer applied an override label. Least-privilege GitHub token (contents+PR write only,
no workflow/secrets scope). Do not run broad test commands in the secret-holding agent job
after model writes — let normal PR CI verify. Open a **draft** PR only; never merge. Write
back to `AutomationRun`/ticket keyed on `prNumber`.

**Verification:** Manual Demo Winery bug ticket with a harmless UI bug fixture; the CI
fence job blocks a PR that edits a denied path; PR opens as draft; CI runs on PR; duplicate
dispatch is a no-op.

### Unit 9 - Developer Role and Tenant Switch

**Goal:** Add global developer user power safely.

**Files:** `src/lib/access.ts`, `src/lib/dal.ts`, `src/lib/developer/actions.ts`,
`src/lib/users/actions.ts` (widen role validation), `src/app/(app)/layout.tsx`,
`src/components/AppShell.tsx` (nav entry + support banner), a `scripts/seed-developer.ts`.

**Approach:** Add helpers `isDeveloper` / `isTenantAdminLike` / `requireDeveloper`
(Review Revisions #9 — explicit named gates, do NOT blanket-widen the ~40 admin sites).
Seed/promote **`russellmoss87@gmail.com`** (existing Bhutan member) to `developer`,
password from **env** with `mustChangePassword`; the script refuses `demo@`/`@demo`
addresses. **Do NOT modify `toAppUser` to bypass membership** — base session stays
membership-valid. Implement tenant entry as an **ephemeral, signed, expiring, httpOnly
support-token cookie** resolved per request (Review Revisions #2); the DAL applies it for
that request only. Audit enter/refresh/exit **inside `runAsTenant(targetTenant, …)`**
(Review Revisions #14).

**Verification:** `russellmoss87@gmail.com` can open `/developer`, enter another tenant via
support token and use admin pages there, and the token expires / can be exited; other open
tabs are unaffected (base session unchanged); a normal admin/user cannot open `/developer`
or forge a support context; seed refuses a `demo@` developer.

### Unit 10 - Developer Console

**Goal:** Cross-tenant backlog and detail modal.

**Files:** `src/app/(app)/developer/page.tsx`, `src/app/(app)/developer/DeveloperClient.tsx`, `src/lib/developer/feedback.ts`, `src/lib/developer/actions.ts`.

**Approach:** **Bounded** paginated tenant-scoped reads via `runAsTenant` per tenant —
capped tenant fan-out per request + small bounded concurrency, NOT unbounded `Promise.all`
over every tenant (Review Revisions #3); show "N of M tenants". Detail endpoint/action
loads one item by source/id (inside that item's tenant context). Actions set
severity/status/notes, edit the selected tenant's automation modes, and — for AGENTIC_FIX/
PLAN — expose the **Approve** button that creates/claims the `AutomationRun` (Rev #4).
Render `planMarkdown`/`developerNotes`/`title`/`body`/filenames through a **sanitizer that
disallows raw HTML** (Review Revisions #10). Data-dense table uses `tabular-nums` and a
horizontal-scroll wrapper on mobile (DESIGN.md); severity/status shown with text + Badge
tone, never color-only.

**Verification:** Filters, detail modal, image previews (auth-checked), sanitized markdown
render (XSS payload in a ticket body/plan does not execute), status/severity updates,
approval-gated dispatch, and the tenant fan-out cap behaves (no pool exhaustion under many
tenants).

### Unit 11 - Auditing and Notifications

**Goal:** Make developer actions traceable.

**Files:** `src/lib/audit` call sites, developer actions, automation mark scripts.

**Approach:** Use `writeAudit(tx, input)` from **`src/lib/audit.ts`** (a file, not a dir;
signature per Review Revisions #14) inside a tenant tx. Audit developer automation-setting
changes, developer tenant support enter/refresh/exit (written inside `runAsTenant(target,
…)` so it lands in the entered tenant's log), severity/status changes, **approval clicks**,
automation retries, attachment views by a developer, and manual dismiss/resolved actions.
If a distinct `IMPERSONATE` action reads better than `UPDATE`, extend the `AuditAction`
enum in Unit 1.

**Verification:** Audit rows exist for each action, with the switch audit landing in the
correct (entered) tenant's log and `actorUserId` = the developer.

### Unit 12 - Tests, Docs, and Runbook

**Goal:** Lock the behavior down.

**Files:** `test/tenant-isolation.test.ts`, `scripts/verify-tenant-isolation.ts`,
`scripts/verify-feedback.ts`, `scripts/verify-feedback-idempotency.ts`,
`scripts/verify-feedback-security.ts`, `scripts/verify-feedback-fence.ts`, `package.json`
(script names), `.github/workflows/ci.yml` (PR gate wiring), new route/action tests,
`docs/developer-feedback-automation.md`.

**Note:** the `verify:feedback*` scripts are built alongside their first-consuming unit
(see Agentic Verification Harness), NOT created from scratch here. Unit 12 is the **sweep**:
fill remaining gaps, wire all `verify:feedback*` into CI, run the full harness, write docs.

**Approach:** Add tenant leak checks for `FeedbackTicket`, `FeedbackAttachment`, and
`AutomationRun`. Add role tests for developer vs admin vs user, plus **impersonation
tests**: a developer with a valid support token can read the entered tenant; an expired/
forged token cannot; the base session is unchanged after entering; a non-developer cannot
mint or use a support context. Add the composite-FK cross-tenant-parent rejection test and
the idempotency-key dedupe test. Document required env: `GITHUB_DISPATCH_TOKEN`,
`GITHUB_REPOSITORY`, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, the support-token
signing secret, and the developer-seed password var. Add the CI **write-fence** job
(fails PRs that touch denied paths) to the automation workflows.

**Verification:** `npm run lint`, `npx tsc --noEmit`, `vitest run`, `verify:tenant-isolation`,
`verify:invariants`, `verify:tripwires`, relevant route/action tests, manual GitHub
workflow dry run. Note: UI (Units 6, 10) is **manual-QA-only** — no jsdom/RTL in this repo.

## Security Notes

- User report text, assistant transcripts, screenshots, and attachment filenames are untrusted input.
- Injection defense is **mechanical, not prompt-based** (Review Revisions #5): least-privilege
  token, path write-fence enforced by a CI job, human approval gate before any dispatch, and
  no raw prose / image bytes / OCR into the model. Saying "this is data not instructions" in
  the prompt is defense-in-depth, not the control.
- The first developer is a **dedicated internal account** (`russellmoss87@gmail.com`), not a
  shared/demo credential; the seed refuses `demo@` developers and forces a password change.
- Stored `planMarkdown`/`developerNotes`/`title`/`body`/filenames are sanitized before
  rendering in the privileged console (no raw HTML — Review Revisions #10).
- Private screenshots should not be embedded in public GitHub issues. The issue can mention attachment IDs; the DB/developer console remains the image source.
- If plan mode includes image understanding later, use short-lived signed fetches or upload only redacted derived image summaries to the model.
- Never expose Blob private URLs directly to ordinary users from another tenant.
- Developer role is powerful and should be limited to trusted internal accounts.
- Developer tenant switching must be audited every time.
- Normal web requests should not use owner `runAsSystem`; use tenant-scoped loops.
- Bug agentic fix should start as draft PR only, with CI and human review.

## Test Plan

- Developer automation controls:
  - Developer can change each tenant's modes from `/developer`.
  - Tenant admin cannot change these modes from tenant Settings in v1.
  - Non-developer cannot access the controls.
  - Feature request cannot be set to `AGENTIC_FIX`.
- Assistant feedback:
  - Report-only saves row and does not dispatch.
  - Plan mode saves row and dispatches `feedback_plan`.
  - Agentic mode dispatches existing assistant workflow.
- Tickets:
  - Bug report obeys all three modes.
  - Feature request obeys report/plan modes.
  - Success screen shows ticket ID.
- Attachments:
  - Accept PNG/JPG.
  - Reject other types and oversized files.
  - Auto-screenshot bug flow stores `captureSource = "AUTO_SCREENSHOT"`.
  - Annotated screenshot flow preserves the final annotation in the developer preview.
  - Multiple screenshots/images can be attached to one ticket.
  - Manual uploads store `captureSource = "MANUAL_UPLOAD"`.
  - Cross-tenant fetch is denied.
  - Developer can preview/download.
- GitHub:
  - Plan mode creates an issue and stores Markdown.
  - Assistant agentic fix still opens PR.
  - Bug agentic fix opens draft PR and stores PR URL.
- Developer:
  - Developer sees all tenants with filters.
  - Developer can set P0/P1/P2.
  - `russellmoss87@gmail.com` is the developer and keeps Bhutan Wine Co. access; `demo@demo.com` is NOT a developer; the seed refuses a `demo@` developer.
  - Developer can enter another tenant via an ephemeral support token, use admin pages there, then exit; the base session/active org is unchanged; other tabs are unaffected.
  - An expired or forged support token grants nothing; a non-developer cannot mint one.
  - Normal admin cannot see other tenants.
  - Normal user cannot access `/developer`.
  - Cross-tenant reads are bounded (capped tenant fan-out); no connection-pool exhaustion under many tenants.
- Tenant isolation:
  - New tables pass `verify-tenant-isolation`.
  - Developer cross-tenant reads use explicit tenant loops, not unscoped table reads.

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Developer role accidentally bypasses tenant isolation everywhere | Keep developer special casing in access helpers, validate active org, and query tenant data through `runAsTenant`. |
| Screenshots leak sensitive data into GitHub issues | Store images in Blob/DB only; GitHub issue links the app item ID, not the image. |
| Annotation tool adds bug-report friction | Make annotation optional, provide only 3 tools plus undo/clear, and let users submit without marking up. |
| Bug agentic fix is too broad | Start with draft PR, denylist high-risk paths, no direct merge, normal CI required. |
| Plan Markdown gets out of sync with GitHub issue edits | Treat DB plan as generated artifact; issue is linked discussion. Later edits can happen in developer notes. |
| AI cost still grows | Default tickets to report-only; expose tenant-specific controls only to the developer; developer can manually retry plan/fix only where useful. |
| Feature requests need implementation sometimes | Keep feature requests plan-only in v1; developer can manually take the plan into Codex/Claude Code. |

## Open Questions

- ~~Should assistant thumbs-down support image attachments in v1, or only tickets?~~
  **RESOLVED (Rev #5/#7): tickets only in v1;** thumbs-down screenshots can reuse the
  model later. Attachment bytes are never fed to the model regardless.
- Should generated plan issues be private/internal only by relying on the private repo, or
  should their body omit tenant/user identity more aggressively? **Leaning: omit
  tenant/user identity from the issue body (link the app item id only); keep identity in
  the DB/console** — resolve during Unit 7.
- ~~Should bug agentic fix require a developer approval click even when tenant setting is
  `AGENTIC_FIX`?~~ **RESOLVED (Rev #4): YES, required in v1.**
- Still open: should the support-token expiry be fixed (e.g. 30 min) or renewable up to a
  cap? Should exiting one tenant and entering another be one action or two?

## Acceptance Criteria

- A developer can choose assistant feedback, bug report, and feature request automation modes per tenant from `/developer`.
- Tenant-facing `/settings` does not expose these automation controls in v1.
- `russellmoss87@gmail.com` (existing Bhutan Wine Co. member) works as the first developer
  account, with a password set out-of-band + forced change on first login; `demo@demo.com`
  remains a normal Demo Winery user and the seed refuses `demo@` developers.
- Developer tenant entry is ephemeral (support token), never mutates the base session, and
  is audited on enter/refresh/exit.
- AGENTIC_FIX and PLAN dispatch only after an explicit developer approval click, and never
  create duplicate PRs/issues on retry (idempotency key).
- A thumbs-down in report-only mode only logs.
- A thumbs-down in plan mode produces a GitHub issue and renders the generated plan in the developer console.
- A thumbs-down in agentic-fix mode preserves the current PR-making behavior, but only after a developer approval click (v1 gate).
- A user can submit bug/feature tickets from Help / Feedback and the assistant/widget modal.
- A user starting a bug report from the assistant/widget is first asked whether to capture the current page; choosing yes auto-attaches the screenshot and shows confirmation on the report form.
- A user can optionally annotate any pending screenshot/image with circles, arrows, and text before submitting.
- A user can reopen an annotated screenshot before submit and keep editing it.
- A user can attach multiple screenshots/images to one bug report and annotate each independently.
- PNG/JPG ticket attachments are retrievable from the developer detail modal.
- Bug reports can create a plan issue or draft fix PR depending on tenant setting.
- Feature requests can create a plan issue but not a fix PR.
- A developer user can see and filter all tenant reports, set severity/status, copy IDs, open GitHub links, and switch into a tenant as admin.
- Normal tenant users cannot see cross-tenant feedback or attachments.

## Design Review (2026-07-09)

Checked against `DESIGN.md` (warm editorial, paper-and-ink, single wine accent,
light-only, 8px spacing, md-radius controls, warm shadows, sentence-case labels) and the
`src/components/ui/` library (Button, Card, Badge, Input, Checkbox, Modal, …).

- **D1 — Token conformance (required).** None of the new surfaces (`/developer`,
  `/help/feedback`, the widget modal, the annotation overlay, the support banner) may
  hardcode colors/fonts/spacing. Use tokens + the existing `ui/` components. Severity
  P0/P1/P2 and status map to `Badge` tones (e.g. P0→red, P1→orange/golden, P2→neutral);
  never signal severity by color alone — always pair with the text label.
- **D2 — Segmented control is a NEW component.** The mode picker (Report only / Plan mode /
  Agentic fix) is not in the library. Add a proper token-driven `Segmented` (or reuse a
  radio-group/`Button`-group pattern) and preview it at `/styleguide` — do not one-off it
  inline. This is a small addition but it should enter the system, not bypass it.
- **D3 — Support-view banner is safety-critical UX.** Because impersonation is now
  ephemeral and layered over the base session, the "Support view: <tenant>" banner is the
  primary signal that a developer is acting inside someone else's tenant. Make it
  unmistakable: sticky, full-width, high-contrast (inverse surface or wine accent, within
  the anti-slop rules — no gradients), always visible, with a one-click "Exit support
  view" and the tenant name + expiry. Treat it like a production guardrail, not chrome.
- **D4 — Data-dense console table.** ~10 columns. Use `font-variant-numeric: tabular-nums`
  for IDs/dates, the `.app-main table` horizontal-scroll pattern on mobile, and truncate
  long title/comment cells with a tooltip rather than wrapping. Copy-ID uses a consistent
  affordance.
- **D5 — Annotation overlay is the biggest UI-scope lever (kept, but constrained).** It's
  a bespoke canvas editor (SHOULD-level, not MUST). Keep it, but: lazy-load it, make it
  reduced-motion aware and keyboard-operable, and keep exactly the three tools + undo/clear
  the plan specifies — resist scope-creeping into a full image editor. If v1 timeline
  slips, the fallback is single-image markup with multi-image deferred (the requirements
  mark multi-image annotation as SHOULD).
- **D6 — Accessibility.** Reuse `Modal` (focus trap, Esc). The screenshot-consent step and
  annotation tools need visible focus states (the wine focus ring token) and labels. The
  canvas needs a non-pointer path or at least a documented limitation.

**Design verdict:** No blocking visual issues; the plan is UI-heavy but fits the system if
D1–D3 are honored. D3 (the support banner) is the one design item that is also a safety
control — do not treat it as optional polish.

## What Already Exists (reuse, don't rebuild)

- `AssistantFeedback` model with `tenantId`, `status`, `prUrl`, `notes`, `debugContext`,
  `conversation`, `actorUserId/Email` (`prisma/schema.prisma:819-840`) — extend, don't replace.
- `POST /api/assistant/feedback` with best-effort GitHub `repository_dispatch`
  (`event_type: assistant_feedback`) — the AGENTIC_FIX path already exists; gate + outbox it.
- `.github/workflows/assistant-feedback.yml` + `scripts/assistant-feedback-agent.ts`
  (path-fenced writes, tsc-only, untrusted-input posture) — the fix workflow shape to reuse.
- `runAsTenant` / `runInTenantTx` (`src/lib/tenant/`), RLS via `app.tenant_id`, the
  Phase-12 tenant-table checklist, `verify-tenant-isolation` + `test/tenant-isolation.test.ts`
  (auto-enumerate from DMMF).
- `writeAudit(tx, input)` (`src/lib/audit.ts`) + `AuditAction` enum.
- `AppSettings` per-tenant row + `getAppSettings` (`settings/data.ts`) + admin-only
  `adminAction` wrapper (`settings/actions.ts`) + the `policyChanged`/version pattern.
- `src/components/ui/` (Modal, Button, Badge, Input, Card), `AppShell` nav arrays + the
  existing `AssistantDock`, better-auth `admin()`/`organization()` plugins.
- `@vercel/blob` and `html-to-image` (already dependencies).

## NOT In Scope (considered, deliberately deferred)

- **Auto-dispatch of AGENTIC_FIX/PLAN** — deferred behind the v1 human-approval gate (Rev #4).
- **Feeding attachment bytes / OCR to the model** — deferred; injection blast-radius (Rev #5).
- **Assistant thumbs-down image attachments** — v1 is tickets only (Rev #5/#7).
- **Dedicated read-only aggregation DB role** for the console — future scaling exception;
  v1 uses the bounded RLS loop (Rev #3).
- **Blanket `admin || developer` role widening** — replaced by explicit per-site gates (Rev #9).
- **Multi-image independent annotation** — MUST fallback is single-image if timeline slips (D5).
- **Agentic implementation of feature requests, in-app comment threads, email
  notifications, SLA timers, storage-provider migration, public unauth portal,
  AI auto-prioritization** — as in the original plan's out-of-scope list.
- **Per-tenant exposure of automation controls in `/settings`** — developer-only in v1.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (Codex+Gemini) | `/council` | Independent cross-LLM challenge | 1 | ISSUES → REVISED | 3 P0 + 5 P1/P2 each; all blocking items fixed in Review Revisions |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | REVISED | 4 decisions taken w/ owner; ~10 fixes + 5 factual corrections applied |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR w/ notes | 6 items (D1–D6); D3 support banner flagged as a safety control |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**COUNCIL:** Codex + Gemini both independently rated the original "not safe to implement as
written," converging on the same P0s (demo-credential superuser, session-mutation
impersonation, prompt-injection→PR). All P0/P1 items are addressed in **Review Revisions #1–#10**.

**CROSS-MODEL:** High overlap between Codex and Gemini (demo credential, injection,
exactly-once, attachment tenancy, screenshot exfiltration). Gemini uniquely raised the
connection-pool exhaustion of the RLS loop (Rev #3); Codex uniquely raised admin-check
widening (Rev #9) and admin-XSS via stored markdown (Rev #10). No unresolved cross-model tension.

**UNRESOLVED:** 2 minor open questions (plan-issue identity redaction; support-token
expiry/renewal policy) — non-blocking, resolve during Units 7 and 9.

**VERDICT:** ENG + COUNCIL + DESIGN reviewed and plan REVISED. The blocking security issues
are resolved on paper; the plan is now implementable **provided** the mechanical
enforcement (write-fence CI job, magic-byte validation, composite FKs, approval gate,
bounded fan-out) is built as specified — these are enforcement controls, not prompt/policy
suggestions. Recommend implementation start with Unit 1 (schema/RLS) and Unit 9 (developer
role + ephemeral impersonation) since the rest depends on them.

### Worktree parallelization

| Lane | Units | Notes |
|------|-------|-------|
| A (foundation) | 1 → 2 | schema/RLS then settings data; everything depends on Unit 1 |
| B (server automation) | 3 → 7 → 8 | assistant gate, then plan + bug-fix workflows/scripts (share automation libs + outbox) |
| C (ticket surfaces) | 4 → 5 → 6 | ticket API → blob → widget modal (share `src/lib/feedback/`) |
| D (developer platform) | 9 → 10 | role + ephemeral impersonation, then console (share `src/lib/developer/`) |
| cross-cutting | 11, 12 | auditing + tests/docs weave through all lanes; land last |

Execution: **A first (blocks all)**. Then **B, C, D in parallel worktrees** (B is `scripts/`
+ `.github/` + `src/lib/feedback/automation`; C is `src/lib/feedback/` + `src/app/api/feedback`
+ assistant UI; D is `src/lib/developer/` + `src/lib/access.ts` + `/developer`). **Conflict
flag:** B and C both touch `src/lib/feedback/` and D and B both may touch access/auth around
the approval gate — coordinate those files or sequence B before C's mode-gate work. Merge
B/C/D, then land 11 + 12.
