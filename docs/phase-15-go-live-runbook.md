# Phase 15 — QuickBooks sync: go-live runbook

Everything needed to take the QuickBooks integration from "built on `main`" to "wineries self-serve it
in prod." Split into **one-time platform setup (you)** and **per-winery onboarding (self-service, in-app)**.

## TL;DR

- **Per-winery = fully self-service in the app.** A winery admin clicks *Connect QuickBooks* (Settings),
  maps their accounts, and watches the *Accounting* dashboard. No terminal, ever.
- **You do a one-time platform setup** (below): the enumerator DB credential, Vercel env, and the
  **Intuit production app review** (the long pole — start it first).
- The sync itself is exactly-once + crash-safe + tenant-isolated; it runs on Vercel Cron automatically.

---

## A. One-time platform setup (operator)

### A1. Intuit production app review — START FIRST (weeks of lead time)
Sandbox works today. A REAL winery connecting their REAL QBO company needs the "Cellarhand" app
approved for production by Intuit (~20-day technical review + listing). Until then, `QBO_ENVIRONMENT`
stays `sandbox` and only sandbox companies connect.
- Submit the app for review; complete the security questionnaire (maps to `docs/security/phase-15-security-pass.md`).
- On approval you get a SEPARATE production key pair (do NOT reuse dev/sandbox keys for prod).
- Register the prod redirect URI: `https://<prod-domain>/api/accounting/qbo/callback`.
- Checklist detail: `docs/plans/phase-15-app-review-checklist.md`.

### A2. Least-privilege enumerator DB credential (required — the crons need it)
The post/reconcile/refresh crons enumerate org ids as the least-privilege `accounting_enumerator`
role (SELECT on `organization` only; NO grant on any token table — SEC-C3). The role is created by
migration; set its password + write the connection string:
```
npx tsx --env-file=.env scripts/setup-accounting-enumerator-credential.ts
```
This writes `DATABASE_URL_ENUMERATOR` to `.env` (gitignored). **Copy that value into Vercel env.**
Without it, the crons throw `DATABASE_URL_ENUMERATOR is not set` and nothing syncs.

### A3. Vercel environment variables (Production + Preview)
| Var | Value |
|---|---|
| `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` | **production** keys (post-A1) |
| `QBO_ENVIRONMENT` | `production` (or `sandbox` while piloting) |
| `QBO_REDIRECT_URI` | `https://<prod-domain>/api/accounting/qbo/callback` (must match Intuit exactly) |
| `APP_ENCRYPTION_KEK` | 32-byte base64, **distinct from sandbox** (see A5) |
| `APP_ENCRYPTION_KEK_KID` | optional (default `kek1`); set when rotating |
| `CRON_SECRET` | long random; Vercel Cron auto-sends it as `Authorization: Bearer` |
| `DATABASE_URL_ENUMERATOR` | from A2 |

### A4. Deploy
`git push` → Vercel build runs `prisma migrate deploy` (applies the Phase-15 migrations + creates the
enumerator role as owner) then `next build`. The three cron entries in `vercel.json` activate on deploy:
- `POST /api/cron/accounting-post` — every 15 min (claim → post → verify)
- `/api/cron/accounting-reconcile` — hourly (read-back; DELETED_IN_GL)
- `/api/cron/accounting-token-refresh` — daily (keep 100-day refresh tokens alive)
Crons no-op for tenants with no CONNECTED connection, so turning them on is harmless.

### A5. Before real financial data (SEC-C4)
The `APP_ENCRYPTION_KEK` is env-resident. It uses a per-record DEK so the blast radius is one row,
and it's upgradable to a cloud KMS WITHOUT re-encrypting rows (re-wrap the DEKs). Move the KEK to a
cloud KMS before a real winery's books go live. Keep sandbox and prod KEKs distinct.

---

## B. Per-winery onboarding (self-service, in-app — no ops)

1. **Settings → QuickBooks → Connect QuickBooks.** Admin authorizes their own QBO company (OAuth/PKCE).
   Only the encrypted refresh token is stored; the canonical realmId is derived from Intuit.
2. **Settings → Account mapping.** Per cost component pick a *cost/expense* account + an *inventory
   asset* account (plain roles, not debit/credit). Optionally set the *Supply bills (A/P)* accounts.
3. **Receive supplies with a vendor + terms** (Setup → Expendables → Receive) to send A/P bills.
4. **Accounting dashboard** shows connection health + the sync queue by status + anything needing
   attention. That's it — the cron does the rest, exactly-once.

A new winery is auto-discovered by the cron (it enumerates all orgs); no per-winery ops.

---

## C. Verify (any environment)
- `npm run verify:tenant-isolation` — RLS isolation through the pooler (incl. accounting tables).
- `npm run verify:accounting-idempotency` — exactly-once under crash/concurrency/backlog (offline).
- `npm run verify:accounting-reversal` — D6 reversal nets to zero (offline).
- `npm run verify:accounting` — live sandbox capstone: seed → post → reconcile (needs a CONNECTED
  Demo Winery; skips gracefully otherwise).
- `npm run qa:e2e` — authed UI renders (Settings cards + dashboard).

## D. Known follow-ons (not blockers for a pilot)
- Withheld/un-exported sources (bottled-before-mapping) aren't surfaced on the dashboard yet (the
  poster re-emits them after mapping; they just aren't shown as "waiting").
- `Period Closed` is a FAILED row + dashboard flag, not an interactive date prompt.
- The VARIANCE sold/unsold debit/credit direction is the v1 interpretation — confirm with an accountant.
- A full Vendor management screen (v1 does find-or-create by name on the receive form).
