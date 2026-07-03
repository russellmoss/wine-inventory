# Phase 16 — Commerce7 DTC integration: go-live runbook

Status: the integration is **code-complete on `main`** and proven offline (`npm run verify:commerce7`,
`npm run verify:commerce7-idempotency`). This runbook is what stands between "built" and "a real winery
relies on it". Nothing here blocks the build; it's the activation + the honest gaps.

## 1. Prerequisites (Unit 0 — the non-code milestone, waiting on the Commerce7 sandbox)

Apply at `commerce7.com/partners-developer-apply`. On approval, create the app in
`dev-center.platform.commerce7.com` and capture:

- **App ID + App Secret Key** → env `COMMERCE7_APP_ID`, `COMMERCE7_SECRET_KEY` (per environment; never
  reuse a lower-env secret in prod).
- Declare minimal scopes: **Order Read, Product Read + inventory write, Customer Read**.
- Set the **Install URL** (with `state` nonce support) → env `COMMERCE7_INSTALL_URL`.
- Set the **webhook** + a **dedicated inbound Basic Auth / signing secret** → env
  `COMMERCE7_WEBHOOK_SECRET` (SEPARATE from the App Secret Key). Set `COMMERCE7_WEBHOOK_BASE_URL` (or
  `NEXT_PUBLIC_APP_URL`) so the registered delivery URL is correct.
- Optional tuning: `COMMERCE7_RATE_PER_MIN` (default 90, under the 100/min cap), `COMMERCE7_ENVIRONMENT`
  (`sandbox` | `production`).

Confirm in the sandbox (each is isolated in the adapter — a change is one edit):
1. **Inventory write** — the exact adjust(delta) endpoint + payload (`client.ts adjustInventory`).
2. **429 body + `Retry-After`** shape (the client already honors `Retry-After`).
3. **Refund / partial-refund + post-fulfillment edit + `PUT /order/upsert` id-churn** behavior (the diff
   engine is status- + net-based; confirm the refund `paymentStatus` strings and add them to
   `SETTLED`/refund detection in `diff.ts` if they differ).
4. **Install-callback + uninstall exact payloads** (field names for `state` + the C7 tenant slug).
5. Whether C7 publishes **webhook source IPs** (add an IP allowlist to the webhook route if so).

Then: connect the sandbox under **Demo Winery** (never Bhutan), and run `npm run verify:commerce7` with
real keys pointed at the sandbox for the live smoke.

## 2. Connect flow (operator)

Settings → **Commerce7 (DTC sales)** → Connect → authorize in Commerce7 → return → **"Link <winery> to
this workspace"** confirm. Then Settings → **Commerce7 mapping**: set the DTC sales accounts (needs
QuickBooks connected) and match each Commerce7 product to a WineSku + Location. Unmapped products/accounts
**hold** their sales (surfaced on `/accounting`) until mapped — nothing is lost or guessed.

## 3. Crons (add to `vercel.json`)

- `/api/cron/commerce7-poll` — every ~15 min (drains dirty markers, re-emits withheld, cursor backstop,
  webhook self-heal).
- `/api/cron/commerce7-inventory` — hourly (additive inventory push + read-only drift check).
- Revenue posting rides the **existing** `/api/cron/accounting-post` (the sales-delta branch) and
  read-back rides `/api/cron/accounting-reconcile`. All gated by `CRON_SECRET`.

## 4. Known gaps to close before relying on the DTC cash tie-out (⚠ confirm with an accountant)

- **Processing fees / payouts (HIGH).** v1 debits **undeposited-funds clearing at gross**; it does NOT
  ingest Commerce7/processor payouts. The clearing account carries a **hanging balance = processor fees +
  the batched-net-payout gap**, reconciled manually until a payout pipeline is built. The DTC margin view
  is explicitly labeled **"revenue gross of processor fees"** for this reason.
- **Revenue JE DR/CR direction** (DR undeposited-funds clearing / CR revenue + sales-tax-payable +
  shipping-income, discount contra) is a v1 read — **confirm with the winery's accountant**.
- **Unpaid / Net-30 / on-account orders** are **held, not posted to A/R** (surfaced on `/accounting`).
  If the winery sells on account, A/R posting is a follow-on.
- **COGS-on-sale** is NOT a new posting — it flows from the Phase-8b sold/unsold variance seam, fed by the
  new `SALE` depletion, on the **sale's accounting date** (period matching). Confirm this matches the
  winery's revenue-recognition expectation.
- Gift cards / store credit / tips are surfaced but not GL-mapped in v1.

## 5. Security posture before GA

- Move the App Secret Key + webhook secret to **KMS-backed access** alongside the SEC-C4 KEK→KMS move.
- Confirm the webhook route + logs never carry a raw C7 payload (D19) — enforced by design + the schema PII test.

## 6. Rollback

Disconnect in Settings (zeroes the webhook, stops polling). The schema is additive (5 new tables + nullable
columns); no destructive migration. Sales deltas + deliveries are append-only and independent of the
Phase-15 cost/AP flows (the delivery source CHECK is exactly-one-of-three).
