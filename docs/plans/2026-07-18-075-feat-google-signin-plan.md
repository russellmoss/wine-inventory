---
title: Sign in with Google (Better Auth social login, no self-provision)
type: feat
status: built (live OAuth QA pending — needs real Google creds)
date: 2026-07-18
branch: claude/google-signin-oauth
depth: standard
units: 5
---

## Overview

Let a winery user log into Cellarhand with their Google account instead of an email/password.
Authentication only — no Gmail data access, no restricted scopes, so **no Google security review /
CASA audit is required**. A Google login only works for a user an admin has already created; it links
the Google identity to that existing account by verified email. No self-service signup, no orphan
users, no change to the tenant model.

## Problem Frame

Today every user signs in with an admin-issued email + temporary password (`disableSignUp: true`,
[src/lib/auth.ts:14](src/lib/auth.ts)). That means an admin has to mint and communicate a temp
password, and the user has to change it on first login. For a small winery crew this is friction and a
weak-password footgun. "Continue with Google" removes the password entirely for users who have a Google
account — which is nearly everyone.

The trap in a **multi-tenant** app: a naive social-login setup auto-creates a `User` on first Google
sign-in, but that user has **no `Member` row**, so they land in the fail-closed tenant layer
([src/lib/tenant/tx.ts:52](src/lib/tenant/tx.ts) throws "Tenant context required") — signed in, but
every query throws, with no clean "you have no organization" screen. Which winery would we even add a
random Google account to? None. So auto-provisioning is the wrong model here. We solve this by
**refusing signup for Google and only linking to pre-existing admin-created accounts**, which sidesteps
the orphan-user hole entirely.

Do nothing: the app keeps working on passwords. The cost is ongoing onboarding friction and the temp-
password weakness, not an outage. This is a quality-of-life + security win, low risk.

## Requirements

- MUST: A "Continue with Google" button on the login page that starts Google OAuth.
- MUST: A successful Google login only works for a user whose email already exists (admin-created).
  No new `User` rows are created by Google login (`disableSignUp: true` on the provider).
- MUST: The Google identity links to the existing user by **verified** email, creating an
  `Account(providerId: "google")` row for that user; the user's existing `Member`/tenant wiring is
  reused unchanged.
- MUST: A Google login for an email with no matching user shows a clear, friendly message
  ("Your Google account isn't set up yet — ask your admin to add you"), not a stack trace or a broken
  app shell.
- MUST: A user who signs in with Google is not trapped at the change-password gate
  ([src/lib/access.ts:52](src/lib/access.ts) `mustChangePassword`) — they have no password to change.
- MUST: Env-gated. If `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are unset, the Google button is
  hidden and nothing breaks (mirror the ELEVENLABS "Talk" button convention).
- SHOULD: The existing LOGIN audit-log row ([src/lib/auth.ts:79](src/lib/auth.ts)) fires for Google
  logins too (it already will — the session hook is provider-agnostic; verify, don't rebuild).
- SHOULD: `.env.example` + a short setup note documenting the Google Cloud Console redirect URIs.
- NICE: (Deferred) A `/no-organization` screen for the general membership-less case. Pre-existing hole,
  not introduced here.
- NICE: (Deferred) Domain (`hd`) restriction — intentionally NOT added; users are on personal Gmail,
  not Workspace.

## Scope Boundaries

**In scope:**
- Wiring `socialProviders.google` into Better Auth with `disableSignUp` + account-linking policy.
- The login-page button + the unprovisioned-user error path.
- Clearing `mustChangePassword` when a Google account links.
- `.env.example` + setup docs.
- Vitest coverage for the pure decision logic touched.

**Out of scope:**
- Gmail API / invoice ingestion / any restricted scope (separate, audit-gated effort).
- Self-service signup or auto-provisioning of new users/tenants.
- Google Workspace (not required and not used).
- An org switcher or invitation-acceptance UI (Phase 21a, unrelated).
- A general no-membership redirect screen (pre-existing, deferred NICE).

## Research Summary

### Codebase Patterns
- **Auth server config**: [src/lib/auth.ts:10-122](src/lib/auth.ts) — `betterAuth({...})` with
  `emailAndPassword.disableSignUp: true` (line 14), plugins `admin()`, `organization()`,
  `nextCookies()` (102-121). `socialProviders` is added to the root config object. The
  `databaseHooks.session.create.before` hook (59-71) stamps `activeOrganizationId` from `member` rows
  and returns early on zero memberships; `.after` (72-94) writes the LOGIN audit row — both are
  provider-agnostic and work for Google logins as-is.
- **Auth client**: [src/lib/auth-client.ts:10](src/lib/auth-client.ts) exports `signIn`, which is the
  full Better Auth client object — `signIn.social({ provider: "google" })` is **already available** at
  runtime; no export change needed (the login page uses `signIn.email` today).
- **Login UI**: [src/app/login/page.tsx](src/app/login/page.tsx) — `LoginForm` calls
  `signIn.email({ email, password })` (line 31) inside `onSubmit`; the button lives in the `<form>`
  around lines 97-100. The Google button goes just below/above the form.
- **Env convention**: no central env schema. Read `process.env.*` ad-hoc at the call site, exactly like
  the QBO OAuth config accessor [src/lib/accounting/qbo/config.ts:39-42](src/lib/accounting/qbo/config.ts).
  `.env.example` auth block is lines 19-22; the QBO OAuth block (83-95) is the template for a new
  `# --- Google OAuth (login) ---` section.
- **`Account` table is OAuth-ready**: [prisma/schema.prisma:69-87](prisma/schema.prisma) already has
  `accessToken`/`refreshToken`/`idToken`/`scope`/`accessTokenExpiresAt`. Credential rows use
  `providerId: "credential"`; Google writes `providerId: "google"`. **No migration needed.**
- **Admin createUser** [src/lib/users/actions.ts:74-121](src/lib/users/actions.ts) manually creates
  `user` + `account(providerId:"credential")` + `member` in one tx. This is the code that guarantees an
  admin-created user HAS a membership — which is exactly why linking (not provisioning) is safe: the
  linked-to user already has its tenant wiring.
- **Callback route**: [src/app/api/auth/[...all]/route.ts](src/app/api/auth/[...all]/route.ts) is the
  Better Auth catch-all — it already serves `/api/auth/callback/google`. **No route change needed.**

### External Research (Better Auth 1.6.18, verified against installed types)
- Per-provider option `disableSignUp?: boolean` exists on the Google provider options (extends the
  common OAuth options): `node_modules/@better-auth/core/dist/oauth2/oauth-provider.d.mts:77`. When set,
  the OAuth callback refuses to create a new user for an unmatched email
  (`node_modules/better-auth/dist/api/routes/callback.mjs`: `disableSignUp: ... || provider.options?.disableSignUp`).
- Account linking is governed by `account.accountLinking`
  (`node_modules/better-auth/dist/oauth2/link-account.mjs`). The link is **blocked** when
  `requireLocalEmailVerified && !dbUser.user.emailVerified`. Admin-created users have
  `emailVerified: false` (no verification flow in this repo), so linking requires
  `accountLinking: { trustedProviders: ["google"], requireLocalEmailVerified: false }`. Google asserts
  `emailVerified: true` for the incoming identity, and listing `google` as trusted makes the link safe.
- The provider option is `disableSignUp` (confirmed present); there is also a global
  `disableImplicitSignUp`. Use the **per-provider** `disableSignUp: true` so email/password behavior is
  untouched.

### Prior Learnings
- `.claude/worktrees/*` is NOT a real worktree — no `node_modules`, no `.env`. Build/verify runs from
  the **main checkout** `C:\Users\russe\Documents\Wine-inventory` (has `.env` + deps). `npm run` up-
  resolves to the main `package.json`. (memory: build-in-main-checkout-not-worktrees, main-repo-has-env.)
- Assistant/auth UI has **no jsdom/RTL** in this repo — test pure logic in vitest; verify the button
  manually in the browser (memory: assistant-dock-history-shipped).

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|-------------------------|-----------|
| How a Google identity maps to a user | **Link to the existing admin-created user by verified email; never create a new user** (`disableSignUp: true` + account-linking) | (a) Auto-provision a new User+Member on first Google login; (b) invitation-acceptance flow | Auto-provision has no signal for *which tenant* to join and drops the user into the fail-closed tenant layer. Linking reuses the admin-created user's existing membership. Matches the repo's "admins create users" model. |
| Unmatched Google login | Reject with a friendly "ask your admin" message | Silently create an orphan; redirect to a signup page | No self-service signup by design. Refusing is the correct, safe outcome. |
| Local email-verified requirement | `requireLocalEmailVerified: false` + `trustedProviders: ["google"]` | Keep the default `true` (would block all links, since admin users are unverified) | Admin-created users are never email-verified in this repo; Google verifies the incoming email; trusting `google` makes linking work without a new verification flow. |
| Change-password gate for SSO users | Clear `mustChangePassword` when a Google account links | Leave it (user stuck on change-password screen with no password) | An SSO user has no password to change; leaving the gate traps them. |
| Env wiring | Ad-hoc `process.env` in `auth.ts`, button env-gated | Introduce a validated env module | Matches QBO convention; a new env schema is out of scope. |

## Implementation Units

### Unit 1: Wire the Google social provider + account-linking policy

**Goal:** Google OAuth works server-side and links to existing users only.
**Files:** [src/lib/auth.ts](src/lib/auth.ts)
**Approach:** Add a `socialProviders` block to the `betterAuth({...})` root (after the `user` block,
~line 45). Configure `google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret:
process.env.GOOGLE_CLIENT_SECRET, disableSignUp: true }` — reading env ad-hoc like
[qbo/config.ts:39-42](src/lib/accounting/qbo/config.ts). Only register the provider when both env vars
are present (a helper that returns `{}` when unset, so the key isn't half-configured). Add
`account: { accountLinking: { enabled: true, trustedProviders: ["google"], requireLocalEmailVerified:
false } }`. Do NOT touch `emailAndPassword.disableSignUp` — password signup stays disabled independently.
**Tests:** No unit test (config object; exercised by manual OAuth + Unit 5's logic tests). Assert via
`npm run build` typecheck that the provider/account option shapes are valid for better-auth 1.6.18.
**Depends on:** none
**Patterns to follow:** [src/lib/accounting/qbo/config.ts:39-42](src/lib/accounting/qbo/config.ts) for
env-accessor style; [src/lib/auth.ts:102-121](src/lib/auth.ts) for where config blocks live.
**Verification:** From the main checkout, `npm run build` passes; with real Google creds in `.env`,
`/api/auth/callback/google` responds (Unit 5 manual flow).

### Unit 2: Clear `mustChangePassword` when a Google account links

**Goal:** A user who signs in with Google is never trapped at the change-password screen.
**Files:** [src/lib/auth.ts](src/lib/auth.ts) (add a `databaseHooks.account.create.after` hook)
**Approach:** In `databaseHooks`, add an `account.create.after` hook: when the created account's
`providerId === "google"`, set that user's `mustChangePassword: false` (and stamp `passwordChangedAt`
to now, mirroring the existing additional-fields intent). Wrap in try/catch and never throw — mirror the
swallow pattern of the existing `session.create.after` audit hook ([src/lib/auth.ts:72-94](src/lib/auth.ts)).
Use `prisma.user.update`. Note: this table is a global/RLS-exempt table (User), so no tenant context is
needed.
**Tests:** Extract the decision ("does linking this provider clear the gate?") into a tiny pure helper
if it keeps the hook clean, and unit-test it; otherwise this is covered by the manual flow in Unit 5.
**Depends on:** Unit 1
**Patterns to follow:** [src/lib/auth.ts:51-96](src/lib/auth.ts) databaseHooks structure + non-fatal
try/catch.
**Verification:** After a Google login by an admin-created user whose `mustChangePassword` was true,
`accessDecision` returns `"ok"` (not `"change-password"`) — confirm the user reaches the app, and
confirm the DB row via a `runAsSystem` read script (User is global; no tenant wrap needed).

### Unit 3: "Continue with Google" button + unprovisioned-user error path

**Goal:** Users can click to sign in with Google; unmatched accounts get a clear message.
**Files:** [src/app/login/page.tsx](src/app/login/page.tsx)
**Approach:** Add a "Continue with Google" button below the email/password form (~lines 97-100). On
click, call `signIn.social({ provider: "google", callbackURL: params.get("from") || "/",
errorCallbackURL: "/login?error=google" })`. Env-gate the button on a public flag so it hides when
Google isn't configured — expose `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` (set to `"1"` alongside the server
creds), mirroring the `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` client-flag convention. Read the `error` query
param and, when present (Better Auth redirects an unmatched `disableSignUp` login back with an error),
render a friendly inline message: "Your Google account isn't set up in Cellarhand yet. Ask your admin to
add you, then try again." Keep the existing email/password form fully intact. Match DESIGN.md tokens for
the button; do not hardcode colors (read DESIGN.md before styling).
**Tests:** None (no jsdom/RTL in repo); manual browser verification in Unit 5.
**Depends on:** Unit 1
**Patterns to follow:** existing button/error markup in [src/app/login/page.tsx](src/app/login/page.tsx);
env-gated client feature like the SatelliteMap key.
**Verification:** Button appears when the flag is set, hidden when unset. Manual: an admin-created user
signs in via Google and reaches the app; a non-existent Gmail is refused and shows the friendly message
(Unit 5).

### Unit 4: Env template + setup docs

**Goal:** Anyone configuring the app knows exactly what to set in Google Cloud Console.
**Files:** [.env.example](.env.example), a short section in [AGENTS.md](AGENTS.md) Environment block (or
a `docs/` note) 
**Approach:** Add a `# --- Google OAuth (login) ---` block to `.env.example` after the QBO block
(mirroring lines 83-95): `GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=`, `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=`.
Document the setup: create a Google Cloud project (free, no Workspace), configure the OAuth consent
screen (External, non-sensitive `email`/`profile` scopes → no verification needed for the login-only
scope set), and register **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google`
(dev) and `https://<prod-domain>/api/auth/callback/google` (prod). Note that `BETTER_AUTH_URL` must
match the prod origin for the callback to resolve. State plainly: Gmail *reading* is a separate, audit-
gated effort and is NOT enabled by this.
**Tests:** none (docs).
**Depends on:** none
**Patterns to follow:** [.env.example](.env.example) QBO block (83-95); AGENTS.md Environment section
style.
**Verification:** `.env.example` documents all three vars; a teammate can follow the steps and get a
working callback.

### Unit 5: Tests + end-to-end verification on Demo Winery

**Goal:** Lock the decision logic and prove the flow works against a real Google account.
**Files:** [test/access.test.ts](test/access.test.ts) and/or [test/dal.test.ts](test/dal.test.ts); a
throwaway `runAsSystem` read script under `scripts/` for DB proof (not committed unless useful).
**Approach:** (1) Add/extend pure-logic vitest cases for any helper introduced in Unit 2 (provider →
clear-gate decision) and re-assert the existing "no-membership resolves to null" invariant still holds
([test/access.test.ts:102-104](test/access.test.ts)) — this change must NOT alter that. (2) Manual e2e
against the **main checkout** dev server + the in-app Claude browser: the USER logs in via Google with a
Gmail that matches an admin-created Demo Winery user (create a `QA-*` user first via the admin flow),
confirm they reach the app and are NOT gated on change-password; then attempt a Gmail with no matching
user and confirm the friendly refusal. (3) DB proof: a short `runAsSystem` script reads the new
`Account(providerId:"google")` row + the user's `mustChangePassword=false` (User is global — no
`runAsTenant` needed). Clean up `QA-*` fixtures; keep `verify:naming` green before and after.
**Depends on:** Units 1-3
**Patterns to follow:** [test/access.test.ts](test/access.test.ts) / [test/dal.test.ts](test/dal.test.ts)
pure-function suites; the UI-QA browser flow + `runAsSystem` proof pattern from CLAUDE.md.
**Verification:** `npm run test` green (from main checkout); manual browser flow passes both the match
and no-match cases; DB script confirms the linked account.

## Test Strategy

**Unit tests:** Vitest, pure functions only (no jsdom). Cover the provider→clear-gate helper (if
extracted) and re-assert the no-membership invariant in `test/access.test.ts` / `test/dal.test.ts`.
**Integration tests:** None automated (OAuth needs a live Google round-trip and there's no auth
integration harness). Covered by the manual e2e + `runAsSystem` DB proof.
**Manual verification:** From the main checkout: `npm run dev`, open `/login` in the in-app browser,
USER completes the Google round-trip (never type a password yourself) for (a) a matching admin-created
Demo Winery user → reaches app, no change-password gate; (b) an unmatched Gmail → friendly refusal.
Confirm persistence with a `runAsSystem` read of the `account` + `user` rows.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Account-linking-by-email lets whoever controls Gmail X sign in as user X | LOW | MED | Intended SSO behavior: the admin deliberately set email X, and Google verifies ownership. Only `google` is trusted; `allowDifferentEmails` stays default-false. Document it. |
| Admin-created user still has a live temp password after linking Google | MED | LOW | Clearing `mustChangePassword` leaves the temp password usable for email/password login. Acceptable (admin communicates it out-of-band); optionally follow up by nulling the credential account's password on link. Note in docs, don't block. |
| Wrong `BETTER_AUTH_URL` in prod → callback mismatch | LOW | MED | Unit 4 documents that `BETTER_AUTH_URL` must equal the prod origin and the exact redirect URI must be registered in Google Cloud Console. |
| Better-auth 1.6.18 option-shape drift (`disableSignUp` / `accountLinking`) | LOW | MED | Verified against installed `.d.mts`; `npm run build` typecheck catches any mismatch before merge. |
| A membership-less session still reaches the app shell (pre-existing hole) | LOW | LOW | Not introduced by this change (linking reuses existing membership). Deferred NICE: a `/no-organization` screen. |

## Success Criteria

- [x] "Continue with Google" appears on `/login` when configured, hidden when not. (env-gated on
      `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`)
- [ ] An admin-created user signs in with Google, links by verified email, and reaches the app.
      (LIVE QA — needs real Google creds + a human doing the Google login)
- [ ] That user is NOT stopped at the change-password gate. (LIVE QA; unit-covered by
      `clearsPasswordChangeGate`)
- [ ] A Google login for an unknown email is refused with a friendly, actionable message. (LIVE QA;
      `disableSignUp: true` set + friendly `?error=` message wired)
- [ ] No new `User` rows are created by Google login. (LIVE QA; enforced by `disableSignUp: true`)
- [x] Email/password login is unchanged; the no-membership invariant test still passes.
- [x] `npx tsc --noEmit`, `eslint`, and `vitest` (38 tests) green; `verify:raw-sql` guard green.
- [x] `.env.example` + AGENTS.md cover Google Cloud Console redirect URIs and clarify no Workspace /
      no Gmail-read scope.
