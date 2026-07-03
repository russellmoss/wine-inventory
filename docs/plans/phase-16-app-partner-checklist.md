# Phase 16 — Commerce7 App Partner application + sandbox checklist (Unit 0)

The one non-code milestone. Runs in parallel with the build; it gates only the **live sandbox
verification**, not the code (which is complete and proven offline). See the go-live runbook for the
env wiring once keys are in hand.

## Apply + create the app
- [ ] Apply at `commerce7.com/partners-developer-apply`.
- [ ] On approval, create the app in `dev-center.platform.commerce7.com`.
- [ ] Capture **App ID** + **App Secret Key** (per environment — no lower-env reuse in prod).
- [ ] Declare minimal scopes: **Order Read, Product Read + inventory write, Customer Read**.
- [ ] Set the **Install URL** (supports a `state` nonce) → `COMMERCE7_INSTALL_URL`.
- [ ] Set the **webhook** (Order Create/Update/Delete) + a **dedicated inbound Basic Auth / signing
      secret** (SEPARATE from the App Secret Key) → `COMMERCE7_WEBHOOK_SECRET`.
- [ ] Set `COMMERCE7_WEBHOOK_BASE_URL` (or rely on `NEXT_PUBLIC_APP_URL`).

## Confirm the five undocumented surfaces in the sandbox (each isolated in the adapter)
- [ ] **Inventory write** — exact adjust(delta) endpoint + payload → `commerce7/client.ts adjustInventory`.
- [ ] **429** — response body + `Retry-After` header (client already backs off + honors it).
- [ ] **Refunds** — full + partial refund + post-fulfillment edit + `PUT /order/upsert` id-churn; capture
      the exact `paymentStatus` strings and reconcile them with `diff.ts` (`SETTLED` set + `/refund/i`).
- [ ] **Install + uninstall** — exact callback payload field names (the `state` nonce + the C7 tenant slug).
- [ ] **Webhook source IPs** — whether C7 publishes them (add an IP allowlist to the webhook route if so).
- [ ] Pull the live OpenAPI; fold any shape corrections into the adapter config comments.

## Exit
- [ ] `GET /product` curl with the app creds + `tenant:` header returns 200.
- [ ] Connect the sandbox under **Demo Winery** (never Bhutan Wine Co.).
- [ ] `npm run verify:commerce7` with real keys → the live smoke passes.

## Findings (append here as confirmed)
- _(pending sandbox access)_
