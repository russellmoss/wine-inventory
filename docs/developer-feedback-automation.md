# Developer feedback automation

This feature adds tenant-scoped feedback automation for assistant thumbs-downs,
bug reports, and feature requests.

## Required env

- `SEED_DEVELOPER_PASSWORD`: one-time temporary password for `npm run seed:developer`.
- `SUPPORT_TENANT_SECRET`: HMAC secret for the short-lived support tenant cookie.
- `GITHUB_DISPATCH_TOKEN`: token used by the app to dispatch approved automation.
- `GITHUB_REPOSITORY`: `owner/repo`.
- `ANTHROPIC_API_KEY`: used by feedback automation workflows.
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob private upload/read token.
- `DATABASE_URL` / `DATABASE_URL_UNPOOLED`: normal app and owner DB URLs.

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
7. Return to `/developer`, confirm the item appears, set severity/status/notes, and approve a pending run.
8. Exit support view and confirm tenant pages return to the base Bhutan membership.
