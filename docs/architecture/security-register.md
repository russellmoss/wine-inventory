# Security Register 🔒

> A living record of the app's security posture as **invariants + a checklist**. Same shape as
> [[scale-register]]: this is the *memory/tracking* layer; the *action* layer is the `/security-review`
> command and the automated **security-posture loop** (see [[AUTOMATION]]). The register is what makes
> every review check the *same things* and record what was decided.
>
> **Working rule:** whenever a security-relevant decision is made, add/adjust an invariant here.
> Tell Claude to **read this file before touching auth, tenancy, or data-access code**.
> Related: [[system-map]], [[scale-register]], the Phase-12 tenant checklist in [[CLAUDE]].

## Status key
🟢 holding · 🟡 watch / partial · 🔴 gap to close

---

## Invariants (the things that must always be true)

### Tenant isolation is enforced at the database, not just the app
- Every domain table is tenant-scoped and protected by Postgres **RLS** (`ENABLE` + `FORCE` + a
  `tenant_isolation` policy with USING **and** WITH CHECK, fail-closed).
- The runtime connects as **`app_rls`** (`NOBYPASSRLS`, non-superuser); only migrations run as owner.
- The **only** non-tenant (global) tables are the auth set: User/Session/Account/Verification/
  Organization/Member/Invitation. Nothing else may be global.
- **Status:** 🟢 (enforced + verified in prod; `npm run` verify scripts + `test/tenant-isolation.test.ts`)

### Every NEW tenant table follows the full checklist or it leaks
- The 9-step Phase-12 checklist in [[CLAUDE]] is mandatory: `tenantId` + index, migration + FK,
  backfill + NOT NULL, per-tenant uniques, composite FKs where needed, RLS enable/force/policy,
  not in the GLOBAL denylist, app_rls grants, a verify case.
- **Status:** 🟡 (correct by process — the security loop's job is to catch a table that skipped it)

### Assistant/automated writes require explicit confirmation
- Write actions go through a signed-token / single-use nonce confirmation path (`src/lib/assistant/
  confirm.ts` + `commit.ts`). Voice can confirm by tap or spoken "confirm" — the token path is unchanged.
- **Status:** 🟢

### Secrets never enter the repo or the client
- Secrets live in `.env` (gitignored) / Vercel env / GitHub Actions secrets. Client-exposed keys are
  `NEXT_PUBLIC_*` **by design only** (e.g. Google Map Tiles, restricted by referrer).
- **Status:** 🟢 (keep verifying no server secret is imported into a client component)

### Auth
- `better-auth` + `@node-rs/argon2` password hashing. Password reset / change flows exist.
- **Status:** 🟡 (baseline solid; the loop should watch for authz gaps as roles/RBAC grow)

<!--
TEMPLATE — copy for each new invariant / finding:

### <short title>
- <the rule, and where it's enforced>
- **Status:** 🟢 / 🟡 / 🔴
-->

---

## Open items the security loop is watching
<!-- The automated /security-review loop appends findings here (and opens a GitHub issue). -->
- _(none yet)_

---
*Seeded 2026-07-02 from the live RLS/auth setup. The security-posture loop keeps it honest — see [[AUTOMATION]].*
