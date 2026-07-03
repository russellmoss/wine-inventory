# Phase 15 — Intuit App / QBO Connection Milestone (Unit 0)

Tracking doc for the QuickBooks Online developer app + the production app-review lead time.
**Secrets (Client ID/Secret, KEK) live ONLY in `.env` / Vercel env — never in this file or the repo.**

## App facts (non-secret identifiers)
- **App name:** Cellarhand
- **App ID:** `27ea5de5-b0b5-478a-aae7-449f0b42dff9`
- **Scope:** `com.intuit.quickbooks.accounting` (least privilege — no OIDC/payments)
- **Redirect URI (dev):** `http://localhost:3000/api/accounting/qbo/callback`
- **Redirect URI (prod):** `https://<vercel-domain>/api/accounting/qbo/callback` (add before GA)

## Sandbox (for dev/testing — the only place we post until GA)
- **Sandbox company home:** https://sandbox.qbo.intuit.com/app/homepage
- **Sandbox realmId (from a Playground auth):** `9341457394686717` (verify this is the sandbox
  company's realm when we wire the connect flow; the built callback captures realmId canonically)
- **Keys to use:** the app's **Development** key pair (Keys & credentials → Development tab).
  These are DIFFERENT from the production keys and are what authorize a sandbox company.

## Keys status
- [x] **Development (sandbox) Client ID + Secret** captured into local `.env`
      (`QBO_CLIENT_ID`/`QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT=sandbox`).
- [x] **VERIFIED END-TO-END (2026-07-02):** exchanged a fresh Playground auth code → got
      access + refresh tokens → `GET companyinfo/9341457394686717` returned HTTP 200
      ("Sandbox Company US 115b", US). Keys are valid AND authorize the sandbox.
- [x] Dev-vs-prod resolved: the keys labeled "production" in `Downloads\QBO key.txt` are
      actually the **Development** keys (a prod-only key can't hit the sandbox). No confirmed
      separate production key set yet — obtain at app-review time. Still: delete the Downloads
      txt / rotate if worried, since the secret was shared in chat.
- [x] `APP_ENCRYPTION_KEK` generated (32-byte base64), sandbox value in `.env`.
- [x] Confirm `http://localhost:3000/api/accounting/qbo/callback` is registered on the app's
      Redirect URIs (needed for OUR Connect flow; the Playground uses its own redirect).
      Registered on "Cellarhand" (appId `27ea5de5-b0b5-478a-aae7-449f0b42dff9`); the first real
      Connect click confirms it end-to-end (a `redirect_uri` mismatch there is the one fix point).

## Production go-live (the long pole — start early, blocks GA not dev)
- [ ] Switch to Production keys + submit app for Intuit review.
- [ ] Security questionnaire (maps to Phase 15 Units 1/2/4/5 — token encryption, disconnect/revoke,
      refresh handling). See `docs/security/phase-15-security-pass.md`.
- [ ] Technical requirements: OAuth2 refresh + revoke/disconnect, error handling, minorversion.
- [ ] Timeline: technical review ~20 days; full listing weeks-to-months. Build on sandbox meanwhile.
- [ ] Move `APP_ENCRYPTION_KEK` to a KMS-held key before a real winery connects (SEC-C4 upgrade).
