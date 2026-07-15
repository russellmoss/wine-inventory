# Developer feedback automation

This feature adds tenant-scoped feedback automation for assistant thumbs-downs,
bug reports, and feature requests.

## Linear delivery handoff

The Linear handoff keeps Wine Inventory as the private source of truth for feedback,
tenant context, attachments, automation history, and reporter-facing outcomes. Linear
is the human delivery queue after triage, while GitHub remains the source of truth for
branches, pull requests, checks, reviews, and merges.

V1 stores a tenant-scoped, server-validated Linear issue link and produces a bounded,
sanitized handoff packet. It does not call the Linear API or mirror Linear status,
assignee, priority, or cycle data. No Linear API key, OAuth app, webhook secret, or
application environment variable is required. The `WIN` team identifier is a workspace
convention, not app configuration.

The complete two-developer operating procedure, Linear Free setup, source-of-truth table,
Definition of Done, and 30-day pilot gate live in [Developer workflow](developer-workflow.md).

## `/bug-triage` payload compatibility

`npm run triage:list` emits payload `contractVersion: 2`. The installed `/bug-triage`
consumer requires repository commit `d2b504f90616faaa06753632e2a8f3f7c0d6aecf` or newer and
must branch on both `awaitingRunId` and `awaitingRunKind`. PRODUCT_GAP uses `npm run
triage:plan`; eligible defects use the AGENTIC_FIX dispatcher. A queued/running wrong-kind
run is a visible human conflict, never an automatic cancellation.

## Required env

- `SEED_DEVELOPER_PASSWORD`: one-time temporary password for `npm run seed:developer`.
- `SUPPORT_TENANT_SECRET`: HMAC secret for the short-lived support tenant cookie.
- `GITHUB_DISPATCH_TOKEN`: token used by the app to dispatch approved automation.
- `GITHUB_REPOSITORY`: `owner/repo`.
- `ANTHROPIC_API_KEY`: used by feedback automation workflows.
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob private upload/read token. Needed in TWO places:
  the app (upload/read attachments) AND as a **GitHub Actions secret** for the
  `feedback-bug-fix` / `assistant-feedback` workflows, so the fix agent can fetch a
  ticket's private screenshots and pass them to Claude as vision input. If the secret is
  absent, the agent runs text-only (no crash), it just can't see the images.
- `DATABASE_URL` / `DATABASE_URL_UNPOOLED`: normal app and owner DB URLs.

> **Dev / free tier:** the screenshots ride on Vercel Blob. On the Hobby plan the included
> free Blob allotment covers dev/QA easily (attachments are capped at 5 MB and ≤5 per item),
> so create a Blob store in the Hobby project and copy `BLOB_READ_WRITE_TOKEN` into local
> `.env`. Note Blob is usage-metered, not a hard fixed free tier, so it is not a "can never
> be billed" guarantee — dev volume just stays well inside the free bucket.

## First developer

Run:

```bash
npm run seed:developer
```

The script promotes `russellmoss87@gmail.com` to `developer`, requires the
account to already be a Bhutan Wine Co. member, refuses demo/test addresses, and
sets `mustChangePassword=true`.

## Local verification

```bash
npm run db:generate
npx tsc --noEmit
npm run verify:feedback
npm run verify:feedback-idempotency
npm run verify:feedback-security
npm run verify:feedback-fence
npm run verify:developer-linear-link
```

With database env configured:

```bash
npm run verify:tenant-isolation
```

## Manual QA

1. Sign in as `russellmoss87@gmail.com`.
2. Open `/developer`.
3. Change Demo Winery modes for assistant feedback, bug reports, and feature requests.
4. Enter Demo Winery support view and confirm the sticky banner appears.
5. Submit a bug from `/help/feedback` with a PNG/JPG attachment.
6. Open the assistant, click `Report bug`, choose screenshot capture, preview it, and submit.
7. Return to `/developer`; verify Inbox, Ready, Tracked, Closed, Automation, URL filters, and
   exact Demo Winery paging.
8. Open a Demo item. Confirm the evidence, triage, delivery, automation, and outcome regions
   remain in-page and the URL deep link reopens the exact item.
9. Copy a handoff and confirm it contains no actor email, debug context, Blob URL, filename, raw
   plan Markdown, or signed URL.
10. Reject a lookalike Linear URL, save a valid `linear.app` issue URL, and confirm the item remains
    open while moving to Tracked.
11. Resolve or dismiss with a 20+ character outcome and confirm the item remains open while moving
    to Closed.
12. Exit support view and confirm tenant pages return to the base membership.
