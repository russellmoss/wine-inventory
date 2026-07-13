---
title: Self-replicating "developer" user type in user management
type: feat
status: completed
date: 2026-07-13
branch: claude/developer-user-type-c1d727
depth: standard
units: 6
---

## Overview

The "developer" user type already exists and is load-bearing (global `user.role === "developer"`,
gated through `src/lib/access.ts`, powers `/developer`, the support console, and Demo-Winery home org).
The one missing piece: there is no in-app way to *create* or *promote* a developer — `cleanRole` in
`src/lib/users/actions.ts` hard-rejects anything but `admin | user`, and the `/users` UI only offers
those two. This plan makes "developer" assignable from the `/users` screen, gated so that **only an
existing developer** can mint another one. No email allowlist — the gate is the role itself, so today
that naturally means only `russellmoss87@gmail.com` can do it, and any developer they create inherits
the same power.

## Problem Frame

The user (the sole developer today) wants to add teammates who "act just like I act" — same cross-tenant
support reach, same admin-like access in every tenant, same `/developer` console — without hand-running
`scripts/seed-developer.ts` + `scripts/grant-developer-demo-membership.ts` against the DB each time.
Doing nothing means every new developer is a manual DB/script operation, which doesn't scale and is
error-prone. The important constraint is **privilege containment**: developer is the most powerful role
in the system (bypasses vineyard scoping, reaches other tenants via the support console), so the ability
to grant it must be strictly developer-only — a tenant *admin* must never be able to self-escalate to
developer, or admin becomes a path to cross-tenant access.

Product note: the request is framed as "create a developer user type *like me*." It already exists; the
real deliverable is the *creation/promotion path* plus its authorization gate. We build exactly that and
avoid re-modeling the role.

## Requirements

- MUST: An existing developer can create a brand-new user with `role = "developer"` from `/users`.
- MUST: An existing developer can promote an existing `admin`/`user` to `developer` (and demote back).
- MUST: Only users where `isDeveloper(actor)` is true may assign or revoke the `developer` role. A plain
  admin attempting it is rejected server-side (defense in depth: not just UI-hidden).
- MUST: The developer role option and the "Developer" row badge are visible/usable only to developers in
  the `/users` UI; admins see the current `admin | user` experience unchanged.
- MUST: A newly minted developer is actually functional — they land in the Demo Winery home org on login,
  which requires a `Member` row in `org_demo_winery` (today created out-of-band by
  `scripts/grant-developer-demo-membership.ts`).
- MUST: `/users/page.tsx` stops collapsing a developer's role to `"user"` for display.
- SHOULD: Self-guard — a developer cannot strip their own `developer` role (mirrors the existing
  can't-remove-own-admin / can't-ban-self guards) to avoid locking the system out of developers.
- SHOULD: The role-assignment authorization is a pure, unit-tested function so the security rule is
  covered by fast tests (node-env vitest), not only manual QA.
- NICE: Audit-log entries distinguish developer grant/revoke from ordinary admin/user changes.

## Scope Boundaries

**In scope:**
- `cleanRole` widening + actor-aware authorization for the `developer` role.
- `createUser` / `setUserRole` action changes and their Demo-Winery membership side-effect for developers.
- `/users` UI: role type, select option, row badge, toggle behavior — developer-gated.
- `page.tsx` role coercion fix.
- Unit tests for the authorization rule and role validation; a schema/isolation sanity check for the
  membership write.

**Out of scope:**
- Building the in-app tenant switcher / "god mode" (ROADMAP Phase 21a) — unchanged; developers still reach
  real tenants only via the existing support console.
- Changing what a developer *can do* once they have the role (access.ts predicates stay as-is).
- Converting `user.role` from free-form String to a Prisma enum (larger refactor; the existing
  `member/user/admin/developer` string mismatch is pre-existing and left alone).
- Self-service signup or invitation-based developer onboarding (admins/developers create users directly,
  matching the current Milestone-E model).
- Removing the `scripts/seed-developer.ts` bootstrap (kept as the break-glass path to mint the *first*
  developer if none exists).

## Research Summary

### Codebase Patterns
- **Role is a global user attribute.** `prisma/schema.prisma:25` — `User.role String?`. Values in code:
  `admin | user | developer`. No runtime email check; `russellmoss87@gmail.com` appears only in
  `scripts/seed-developer.ts:11`.
- **Access core (pure, unit-testable, no server imports):** `src/lib/access.ts` — `isDeveloper(user)`
  (`role === "developer"`, ~line 60), `isTenantAdminLike` (admin OR developer, ~line 64),
  `DEVELOPER_HOME_ORG_ID = "org_demo_winery"` (line 28). Keep new authorization logic here.
- **Server gates:** `src/lib/dal.ts` — `requireAdmin()` passes developers (via `isTenantAdminLike`),
  `requireDeveloper()` redirects non-developers (~line 143). `toAppUser` sets `preferOrgId` to Demo Winery
  for developers (~line 54).
- **Action wrappers:** `src/lib/actions.ts` — `action()` (~48) and `adminAction()` (~62) →
  `accessDecision(user, { requireAdmin })`. There is no `developerAction` yet; we add one sibling.
- **The choke point:** `src/lib/users/actions.ts` — `cleanRole()` (~34-38) throws on anything but
  `admin|user`; `createUser` (~41-80) creates `User` + credential `Account`, `mustChangePassword: true`,
  welcome email, temp password `Bwc-…`, and does **not** create a `Member` row; `setUserRole` (~102-112)
  also routed through `cleanRole`. Self-guards already present (can't remove own admin, can't ban self).
- **UI:** `src/app/(app)/users/page.tsx:20` coerces `role === "admin" ? "admin" : "user"` (developer →
  "user" today). `src/app/(app)/users/UsersClient.tsx` — `UserRow.role` typed `"admin" | "user"` (~7-17),
  role `<select>` offers only User/Admin (~90-93), toggle flips admin↔user (~168).
- **Nav gate:** `src/components/AppShell.tsx:240` — `isDeveloper = user.role === "developer"` controls the
  `/developer` nav item.
- **Out-of-band bootstrap being productized:** `scripts/seed-developer.ts` (sets `role:"developer"`,
  refuses demo/test addresses) and `scripts/grant-developer-demo-membership.ts:34` (adds `Member` row in
  Demo Winery with org-role `"member"`).
- **Tests:** `test/dal.test.ts` (developer admin-area + vineyard access), `test/access.test.ts`
  (`resolveActiveOrg` developer→Demo Winery), `test/work-orders-authority.test.ts`
  (`canApprove({role:"developer"})`). No test yet for user-creation role validation — that's the gap
  our new pure fn fills.

### Prior Learnings
- No rstack `learnings.jsonl` / context-ledger precedents for roles/auth in this project (binary absent);
  MEMORY.md is the substantive record.
- MEMORY.md / PR #154: `isTenantAdminLike` gate lets developers see "Awaiting-review" — confirms
  developers are treated admin-like broadly; a new developer inherits that automatically.
- Tenancy checklist (AGENTS.md): User/Session/Account/organization/member/invitation are the ONLY
  non-tenant-scoped globals — never add `tenantId` to them. `Member` writes for the new developer target
  `org_demo_winery`.
- Worktree caveat (MEMORY.md, "build-in-main-checkout-not-worktrees"): `.claude/worktrees/<name>` lacks
  `.env`; run builds / `verify:*` / dev server from the MAIN checkout
  `C:\Users\russe\Documents\Wine-inventory`, branch + PR to protected main.

### External Research
better-auth `admin()` plugin owns `createUser/setRole/setPassword/ban/remove`; `organization()` plugin owns
`organization/member/invitation` + active-org-in-session. We are not changing plugin config — role strings
are app-validated, not enforced by better-auth, so widening is a code change with **no migration**.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| How to gate who can mint developers | Actor-aware pure fn `canAssignRole(actor, targetRole)` in `access.ts`; developer role requires `isDeveloper(actor)` | Email allowlist; a new `requireDeveloper`-only action wrapper for the whole action | Role-based gate needs no hardcoded emails and is self-replicating by construction (only a developer can create a developer). Pure fn keeps it unit-testable and reused by both `createUser` and `setUserRole`. |
| Wrapper strategy | Keep `adminAction` on `createUser`/`setUserRole`, add the `canAssignRole` check *inside* when the requested role is `developer` | Split into a separate `developerAction`-wrapped action | Admins must still create admin/user; only the developer-role *branch* needs the stronger gate. One action, one gate, less surface. |
| New-developer org membership | `createUser`/`setUserRole` ensure a Demo Winery `Member` row when the resulting role is developer (fold in `grant-developer-demo-membership.ts` logic via `runAsSystem`/owner context) | Leave it to the out-of-band script; rely on first-login hook | A developer with no `Member` row lands in a home org they don't belong to → broken session. Productizing the grant makes the UI path actually functional. |
| Self-lockout guard | A developer cannot remove their *own* developer role | Allow it | Mirrors existing can't-remove-own-admin; prevents accidentally deleting the last developer path. (Cross-developer demotion is allowed.) |
| Role storage | Leave `user.role` as free-form String | Convert to Prisma enum | Enum is a migration + touches every consumer; out of scope. Pre-existing `member` vs `user` mismatch untouched. |
| First-developer bootstrap | Keep `scripts/seed-developer.ts` as break-glass | Remove it | If zero developers exist, the UI gate would make developer un-mintable; the seed script is the recovery hatch. |

## Implementation Units

### Unit 1: Pure authorization + role-validation core

**Goal:** One unit-tested place that answers "may this actor assign this target role?" and "is this a
valid role string?", so both server actions and the UI reuse identical logic.
**Files:** `src/lib/access.ts` (add `ASSIGNABLE_ROLES`, `canAssignRole(actor, targetRole)`), and either
`src/lib/users/actions.ts` (rewire `cleanRole` to delegate) or a small `src/lib/users/role.ts` helper.
**Approach:** Add `canAssignRole(actor: { role?: string|null }, targetRole: string): boolean` — returns
false for unknown roles; for `"developer"` requires `isDeveloper(actor)`; for `admin|user` requires
`isTenantAdminLike(actor)`. Keep it pure (no server-only imports) alongside `isDeveloper`. Widen the set
of *recognized* roles to include `developer`. `cleanRole` becomes: validate the string is a known role,
then the *caller* enforces `canAssignRole`.
**Tests:** New `test/user-role-authorization.test.ts`: developer→can assign developer/admin/user; admin→can
assign admin/user but NOT developer; user→can assign none; unknown role→rejected for everyone.
**Depends on:** none
**Patterns to follow:** existing predicates `src/lib/access.ts:60-68`; test style `test/dal.test.ts`.
**Verification:** `npx vitest run test/user-role-authorization.test.ts` (from main checkout).

### Unit 2: Server actions — gate developer grant/revoke + self-lockout guard

**Goal:** `createUser` and `setUserRole` accept `role: "developer"` but only when `canAssignRole(actor, …)`
passes; a developer cannot strip their own developer role.
**Files:** `src/lib/users/actions.ts`.
**Approach:** Change the `role` input types from `"admin"|"user"` to include `"developer"`. In `createUser`
and `setUserRole`, after resolving the actor (already available from `adminAction`), call
`canAssignRole(actor, requestedRole)` and throw `ActionError("Only a developer can assign the developer
role.")` on failure — this runs even though the wrapper is `adminAction`, giving server-side defense in
depth. Add a guard: if `setUserRole` target is self AND current role is developer AND new role is not
developer → `ActionError` (self-lockout). Keep existing audit-log calls; include the role transition.
**Tests:** Extend `test/user-role-authorization.test.ts` with the self-lockout predicate if extracted as a
pure helper (`canRevokeOwnDeveloper`), so the guard is unit-covered without booting a DB.
**Depends on:** Unit 1
**Patterns to follow:** existing `adminAction` wrapping + `ActionError` + `runInTenantTx` in this file;
existing self-guards (can't-remove-own-admin, can't-ban-self).
**Verification:** typecheck (`npx tsc --noEmit`) + the vitest file above.

### Unit 3: Ensure Demo Winery membership for new/promoted developers

**Goal:** Any user who ends up a developer via the UI has a `Member` row in `org_demo_winery`, so their
session resolves correctly.
**Files:** `src/lib/users/actions.ts` (call site), possibly a small helper
`src/lib/users/ensure-developer-membership.ts` reusing the logic from
`scripts/grant-developer-demo-membership.ts`.
**Approach:** After `createUser` creates a developer, or `setUserRole` promotes one, upsert a `Member`
(`userId`, `organizationId = DEVELOPER_HOME_ORG_ID`, org-role `"member"`) idempotently. Because `member`
is an auth-global table and the target org is fixed, perform this in an owner/system context
(`runAsSystem`) rather than the acting admin's tenant tx — mirror how the existing grant script connects.
Idempotent upsert (no duplicate membership on re-promote).
**Tests:** A short `runAsTenant`/`runAsSystem` integration check is heavy for vitest node-env; instead add
a pure test that the helper computes the correct membership payload, and rely on manual/`verify` proof
(Unit 6). Flag: confirm whether ordinary `createUser` should also create a membership in the admin's org
(pre-existing gap — see Risks); do NOT expand scope to fix that here unless trivial.
**Depends on:** Unit 2
**Patterns to follow:** `scripts/grant-developer-demo-membership.ts:34`; `runAsSystem` usage per AGENTS.md.
**Verification:** manual — create a developer via UI, confirm the `member` row exists (Unit 6 script).

### Unit 4: `/users` UI — developer-gated select, badge, toggle

**Goal:** Developers see and can pick "Developer" in the add-user form and change-role control; admins see
today's unchanged admin|user experience.
**Files:** `src/app/(app)/users/UsersClient.tsx`.
**Approach:** Extend `UserRow.role` union to include `"developer"`. Pass a `viewerIsDeveloper` prop (from
`page.tsx`) down. Conditionally render the "Developer" `<option>` and a developer badge/row styling only
when `viewerIsDeveloper`. The role change control: when the viewer is a developer, offer a 3-way select
(User/Admin/Developer) instead of the admin↔user toggle; otherwise unchanged. Disable the control that
would strip the viewer's own developer role (matches Unit 2 server guard) so the UI never offers a losing
action.
**Tests:** No jsdom/RTL in repo (memory: UI ships manual-QA-only) — no component test. Keep any extracted
display logic (e.g. `roleLabel(role)`) pure and unit-test that.
**Depends on:** Unit 2
**Patterns to follow:** existing select/toggle in `UsersClient.tsx:90-93,168`.
**Verification:** manual browser QA (Unit 6) as a developer and as an admin.

### Unit 5: Fix role display coercion in the users page

**Goal:** A developer renders as "developer", not "user", in the `/users` list; the page passes
`viewerIsDeveloper` to the client.
**Files:** `src/app/(app)/users/page.tsx`.
**Approach:** Replace the `role === "admin" ? "admin" : "user"` coercion (line ~20) with a pass-through of
the actual role constrained to the known set (`admin|user|developer`), defaulting unknown to `user`.
Compute `viewerIsDeveloper = isDeveloper(currentUser)` (page already resolves the user via `requireAdmin`)
and pass it to `UsersClient`.
**Tests:** none (thin server component); covered by manual QA.
**Depends on:** Unit 4
**Patterns to follow:** existing `requireAdmin()` usage `src/app/(app)/users/page.tsx:6`.
**Verification:** manual — developer appears with the developer badge in the list.

### Unit 6: End-to-end verification (browser + DB proof)

**Goal:** Prove the full loop in the Demo Winery sandbox: a developer creates a developer; an admin cannot.
**Files:** none (verification only) — optionally a throwaway `runAsTenant("org_demo_winery", …)` tsx read
script under `scripts/` (QA-prefixed, cleaned up) to read back the created rows.
**Approach:** From the MAIN checkout, run the dev server; as the existing developer, open `/users`, create
a `QA-*` developer, confirm the temp password + `member` row (script). Log in as a plain admin, confirm the
Developer option is absent AND that a crafted server call still throws (server-side gate). Clean up QA
fixtures; keep `verify:naming` green before and after.
**Tests:** re-run the full `npx vitest run` to confirm no regressions in `test/dal.test.ts`,
`test/access.test.ts`, `test/work-orders-authority.test.ts`.
**Depends on:** Units 1-5
**Patterns to follow:** QA rules in CLAUDE.md (Demo Winery only, QA-* fixtures, clean up).
**Verification:** documented pass/fail for each of the two roles.

## Test Strategy

**Unit tests (vitest, node-env):** `test/user-role-authorization.test.ts` covers `canAssignRole` across
developer/admin/user × target roles and the self-lockout predicate — this is the security core and must be
exhaustive. Extend existing `test/access.test.ts` only if a predicate signature changes.
**Integration:** none automated (DB writes for membership are proven via a `runAsTenant`/`runAsSystem`
script per repo convention rather than a vitest DB harness).
**Manual verification:** Unit 6 — developer creates developer (UI + DB row), admin blocked in UI and at the
server, self-lockout guard fires, no regressions.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Admin self-escalation to developer (privilege escalation → cross-tenant support access) | MED | HIGH | Server-side `canAssignRole` gate in the action, not just UI hiding; exhaustive unit test that admin cannot assign developer. |
| New developer has no Demo Winery `Member` row → broken session | MED | MED | Unit 3 productizes the membership grant; Unit 6 verifies the row exists. |
| Last developer accidentally demotes themselves → developer role becomes un-mintable | LOW | HIGH | Self-lockout guard (Unit 2) + `scripts/seed-developer.ts` retained as break-glass. |
| Pre-existing `createUser` doesn't create org membership for ordinary users (surfaced during research) | — | MED | Out of scope; note it, don't silently expand. Flag to user as a follow-up if it bites. |
| Free-form `role` string drift (`member` vs `user`) | LOW | LOW | Centralize valid roles in `access.ts`; don't touch the schema default in this plan. |
| Building/verifying inside the `.claude/worktrees` checkout (no `.env`) | MED | MED | Do builds/`verify:*`/dev server from the MAIN checkout per MEMORY.md; branch + PR to main. |

## Success Criteria

- [ ] A developer can create a new `developer` user from `/users` (temp password returned, welcome email best-effort).
- [ ] A developer can promote/demote between user/admin/developer (except stripping their own developer role).
- [ ] An admin cannot assign the developer role — blocked in the UI AND rejected server-side.
- [ ] The newly created developer has a `Member` row in `org_demo_winery` and lands there on login.
- [ ] `/users` displays a developer as "developer", not "user".
- [ ] `test/user-role-authorization.test.ts` passes and covers the full actor×target matrix + self-lockout.
- [ ] No hardcoded email anywhere in the new runtime code — the gate is `isDeveloper(actor)` only.
- [ ] All existing tests pass (`npx vitest run`); `verify:naming` green before and after.
