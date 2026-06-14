---
title: Bhutan Wine Company Inventory App
type: feat
status: refined
date: 2026-06-14
branch: feat/bwc-inventory
depth: deep
units: 15
reviewed_by: [codex/gpt-5.4, gemini-3.1-pro]
---

## Overview

Build an internal inventory app for the Bhutan Wine Company on the existing Next.js 16.2.9 +
TypeScript + Prisma 6 + Neon scaffold. It tracks wine across its lifecycle: bulk/in-process wine
in barrels and tanks (with blends) at the winery, bottling runs that convert bulk to bottled
SKUs, bottled-wine inventory by location (via a movement ledger), and finished goods (merch) by
category and location (also via a ledger). Everything is behind email/password login with
admin-managed users, a forced first-login password change, and a full audit trail of who changed
what and when.

The user is a small winery team. The job: always know what wine and goods they have, where it
is, and trust the numbers because every change is attributable.

## Problem Frame

No single source of truth across three inventory states (bulk, bottled, merch), no per-change
attribution, and no clean answer to "how much Merlot do we have, blended vs not" or "how many
cases of the 2025 Ser Kem Marp Reserve are in each location, and how did that number change."
Doing nothing means guesswork at bottling and no accountability for adjustments.

## Requirements

- MUST: Email/password auth. Admin creates users with a temporary password; user must change it
  on first login before using the app. Login events recorded.
- MUST: Single inventory role (any logged-in user edits inventory). User management is ADMIN-only.
- MUST: Persistent vessel registry (barrels + tanks; code, type, capacity in liters). Bulk wine
  always at the reserved "Winery" location.
- MUST: A vessel holds 1+ blend components (vineyard + variety + **vintage** + volume in L).
- MUST: Bottling run on a date draws from a vessel by total liters (auto-proportioned across the
  vessel's components), decrements bulk, suggests bottle count (liters / 0.75, user adjusts),
  creates/links a SKU, records source composition, and lands bottles in a location via the ledger.
- MUST: Bottled inventory = SKU (wine name + vintage, 750ml) tracked as total bottles per
  location via a movement ledger (RECEIVE / ADJUST / TRANSFER); cases + loose are derived for
  display. Locations are user-managed.
- MUST: Finished goods (merch only) tracked as integer quantity per location via the same ledger,
  each assigned to a user-managed category.
- MUST: Audit trail of every inventory mutation AND user-management action (who, when,
  before -> after), admin-viewable in-app, shown in human-readable form.
- MUST: Reporting — bulk by variety (unblended-by-ratio vs blended) at the winery; bottled by SKU
  + location; finished goods by category + location.
- MUST: Adopt the look of `design-system/` with Savvy branding removed and a wine-burgundy accent.
- SHOULD: Managed reference lists for Variety and Vineyard.
- SHOULD: Vessel "current fill" (capacity vs filled volume).
- NICE: CSV export of reports.

## Scope Boundaries

**In scope:** full data model + migrations, auth, audit, three inventory domains, bottling,
movement ledger for bottled + finished goods, user management, reporting, design-system
integration, seed (admin + "Winery").

**Out of scope (and why):**
- **Bulk wine movements** (transfer between vessels, racking, top-up, additions, explicit blend
  ceremony) — DEFERRED per decision. v1 is fill-then-bottle; components are edited directly on the
  vessel. Bottling is the only bulk drawdown. (Revisit when cellar workflows demand it.)
- **Bottling loss / heel tracking** — DEFERRED per decision. Volume consumed = bottlesProduced ×
  0.75 (no separate loss field). Residual heels handled by directly editing/zeroing components.
- **Bottled wine as a finished good / retail bridge** — out. Finished Goods = non-wine merch only.
- Multiple bottle formats / case sizes — 750ml + 12/case (but `bottleSizeMl` kept as a real
  multiplier so magnums are a later config change, not a rewrite).
- Pricing/sales/orders, lab/quality data, roles beyond admin/user, mobile/external API.

## Research Summary

### Codebase Patterns
Fresh scaffold: `src/lib/prisma.ts` singleton; starter `Wine` model to be replaced; db scripts
wired; Tailwind v4 (CSS-first, no JS config); App Router; `@/*` alias; Next 16.2.9 + React 19.
Per `AGENTS.md`, read `node_modules/next/dist/docs/` before writing Next-specific code.

### External Research (auth + audit)
- Auth.js v5 Credentials silently fails with DB sessions -> use **Better Auth 1.6.x** (credentials
  + DB sessions + `admin` plugin). DB sessions give login tracking + revocation.
- Hashing: `@node-rs/argon2` (Argon2id, prebuilt; `bcryptjs` fallback).
- Next 16: `middleware.ts` -> `proxy.ts`, and it's NOT a security boundary (CVE-2025-29927).
- `mustChangePassword` on User (via Better Auth `additionalFields`); authoritative gate in DAL +
  every server action + route handler.
- Audit: explicit `writeAudit(tx, ...)` inside the same `prisma.$transaction` as the mutation.
- Server Actions for all mutations; read session via Better Auth server API.
- Neon: pooled `DATABASE_URL` runtime, direct `DATABASE_URL_UNPOOLED` for migrate/seed.

### Council Review (codex/gpt-5.4 + gemini-3.1-pro) — incorporated
See `council-feedback.md`. Key fixes folded in below: Better Auth as schema source of truth +
auth-before-app sequencing; plugin role/`banned` semantics; `mustChangePassword` bypass closure;
Serializable bottling tx; `totalBottles` canonical (derive cases/loose); DB CHECK constraints;
soft-delete + nullable historical FKs with `SetNull` + email snapshots; vintage on bulk
components; movement ledger for bottled + finished goods; unblended-by-variety-ratio reporting;
auto-proportioned bottling drawdown; human-readable audit viewer; index coverage; dependency
re-ordering.

### Design System (`design-system/`)
Warm palette (cream `#FFF8F1`, ink, ecru `#C7BCA1` borders), single accent — replace Savvy gold
`#8E7E57` with wine burgundy `#722F37`. Inter (body) / Inter Tight (headings) / Big Caslon
(display serif, generic). 9 pure-React components (Button, Card, Badge, Avatar, Input, Checkbox,
Eyebrow, Metric, Quote) -> convert `.jsx` to `.tsx` in `src/components/ui/`. Strip `assets/logos`,
`uploads/Savvy*`, `--savvy-*` token names, "Savvy Wealth" strings. Tokens go in `globals.css` via
Tailwind v4 `@theme`/CSS vars (NOT a JS config).

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Auth library | Better Auth 1.6.x | Auth.js v5 (credentials+DB sessions fails), Lucia (dead) | DB sessions for login tracking + revocation; admin plugin = ADMIN-only user mgmt |
| Auth schema ownership | **Better Auth is the source of truth**; generate its tables first, extend `user` via `additionalFields` | hand-written auth models | Avoids drift on sign-in/createUser/setPassword/revocation |
| Roles / disablement | plugin's lowercase `admin`/`user` + `banned` (with sign-in hook rejecting banned) | `ADMIN|USER` enum + `disabled` bool | Match plugin defaults; avoid auth-bypass from mismatch |
| Hashing | `@node-rs/argon2` (Argon2id) | native argon2/bcrypt (node-gyp), bcryptjs (fallback) | Prebuilt, Vercel-safe |
| Sessions | DB sessions (opaque cookie) | JWT | Login events = session rows; revocable |
| Forced pw change | `mustChangePassword` gate in DAL + every action + route handler; privileged auth calls wrapped in server actions behind one `requireReadyUser`/`requireAdmin` | middleware/proxy only | `proxy.ts` not a security boundary; closes admin-API bypass |
| Mutations | Server Actions | API routes | Internal app |
| Audit | `writeAudit(tx,...)` in the mutation transaction; auth-managed writes audited via Better Auth DB hooks where possible (documented where not atomic) | $extends, triggers | Actor+before+after together, testable |
| Prisma | 6.19.3 (url in schema) | Prisma 7 (driver adapter) | Working today, less churn |
| Bulk movements | **Fill-then-bottle only (v1)**; edit components directly; bottling is the only drawdown | full bulk-ops, transfer+adjust | Per user decision; keep v1 small |
| Bottling loss | **Simple**: consumed = bottlesProduced × 0.75; no loss/heel field | track drawn vs produced + heel write-off | Per user decision |
| Bottled qty storage | canonical `totalBottles` (derive cases/loose) | fullCases + looseBottles columns | Avoids desync; council CRITICAL |
| Bottled + finished-goods changes | **Movement ledger** (RECEIVE/ADJUST/TRANSFER) + cached balance per (item, location) | direct balance edits | Per user decision; clean transfers/shrinkage history |
| Finished goods | **merch only**, separate from bottled wine | bridge wine into goods | Per user decision |
| Reference & vessels & users | **soft-delete** (`isActive`/`banned`); historical FKs nullable `SetNull` + email/name snapshots | hard delete | Preserve audit/history (council) |
| Bulk component identity | variety + vineyard + **vintage**, `@@unique([vesselId,varietyId,vineyardId,vintage])` | variety+vineyard only | Legal vintage + traceability (council) |
| Unblended vs blended | by **variety ratio** (100% one variety = unblended), aggregated across vessels | row-count == 1 | Correct domain semantics (council) |

## Data Model (target `prisma/schema.prisma`, Prisma 6)

Directional shape. Replaces starter `Wine`. Auth tables (`user`, `session`, `account`,
`verification`) are generated by Better Auth (Unit 1) — shown here for context only.

- **user** (Better Auth + additionalFields): id, email (unique), name, emailVerified, image?,
  role (`admin`|`user`), banned (bool), banReason?, banExpires?, **mustChangePassword** (bool),
  **passwordChangedAt?**, createdAt, updatedAt.
- **session** (Better Auth): id, userId, token, expiresAt, ipAddress?, userAgent?, createdAt,
  updatedAt. = login-event ledger.
- **account** (Better Auth): credential hash (Argon2id) + provider fields. **verification**: as generated.
- **Location**: id, name (unique), isSystem (bool; "Winery"=true), isActive (bool, default true),
  createdAt. Shared by bottled wine + finished goods.
- **Variety**: id, name (unique), isActive. **Vineyard**: id, name (unique), isActive.
- **Vessel**: id, code (unique), type (`BARREL`|`TANK`), capacityL (Decimal, CHECK > 0),
  isActive, createdAt.
- **VesselComponent**: id, vesselId, varietyId, vineyardId, vintage (Int), volumeL (Decimal,
  CHECK >= 0). `@@unique([vesselId, varietyId, vineyardId, vintage])`. 100%-one-variety vessel =
  unblended (by ratio).
- **WineSku**: id, name, vintage (Int), bottleSizeMl (Int, default 750), isActive, createdAt.
  `@@unique([name, vintage, bottleSizeMl])`.
- **BottlingRun**: id, date, wineSkuId, bottlesProduced (Int, CHECK >= 0), volumeConsumedL
  (Decimal), destinationLocationId, createdById? (`SetNull`), createdByEmail (snapshot), createdAt.
- **BottlingSource**: id, bottlingRunId, vesselId, varietyId, vineyardId, vintage,
  volumeConsumedL. Traceability of what bulk fed the run.
- **StockMovement** (ledger for bottled wine + finished goods): id, createdAt, createdById?
  (`SetNull`), createdByEmail (snapshot), itemKind (`BOTTLED_WINE`|`FINISHED_GOOD`), wineSkuId?,
  finishedGoodId?, locationId, kind (`RECEIVE`|`ADJUST`|`TRANSFER`), deltaUnits (Int; bottles for
  wine, each for goods; signed), reason?, transferGroupId? (pairs out/in legs), bottlingRunId?
  (set when a movement originates from bottling). Exactly one of wineSkuId/finishedGoodId set.
- **BottledInventory** (cached balance): id, wineSkuId, locationId, totalBottles (Int, CHECK >= 0).
  `@@unique([wineSkuId, locationId])`. = sum of BOTTLED_WINE movements; updated in the same tx.
- **FinishedGoodCategory**: id, name (unique), isActive.
- **FinishedGood**: id, name, categoryId, isActive, createdAt.
- **FinishedGoodInventory** (cached balance): id, finishedGoodId, locationId, quantity (Int,
  CHECK >= 0). `@@unique([finishedGoodId, locationId])`.
- **AuditLog**: id, createdAt, actorUserId? (`SetNull`), actorEmail (snapshot), action
  (`CREATE|UPDATE|DELETE|LOGIN|PASSWORD_RESET|PASSWORD_CHANGE|USER_CREATED|USER_DELETED|BOTTLING|STOCK_MOVEMENT`),
  entityType, entityId?, changes (Json: `{field:{from,to}}`), summary (String, human-readable),
  ipAddress?, userAgent?.

**Indexes (non-unique):** VesselComponent(vesselId), VesselComponent(varietyId),
BottlingSource(bottlingRunId), BottlingSource(vesselId), StockMovement(wineSkuId),
StockMovement(finishedGoodId), StockMovement(locationId), StockMovement(createdAt),
BottledInventory(locationId), FinishedGoodInventory(locationId), AuditLog(createdAt),
AuditLog(entityType, entityId), AuditLog(actorUserId).

**DB CHECK constraints (raw SQL in migration):** volumeL >= 0, capacityL > 0, totalBottles >= 0,
quantity >= 0, bottlesProduced >= 0.

## Implementation Units (dependency-ordered)

### Unit 1: Better Auth setup + auth schema (source of truth)
**Goal:** Install/configure Better Auth and let it own the auth tables before any app migration.
**Files:** `package.json`, `src/lib/auth.ts`, `src/lib/auth-client.ts`,
`src/app/api/auth/[...all]/route.ts`, `prisma/schema.prisma` (auth models), `.env`/`.env.example`
(`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`).
**Approach:** Add `better-auth`, `@node-rs/argon2`. Configure email/password, admin plugin
(`admin`/`user` roles, `banned` disablement), custom Argon2id hash/verify, and `additionalFields`
`mustChangePassword`/`passwordChangedAt`. Generate the Prisma auth schema from this exact config;
migrate auth tables first.
**Tests:** Argon2 hash/verify wrapper (hash != plaintext; verify true/false).
**Depends on:** none
**Verification:** A script can create a user and sign in; a session row appears.

### Unit 2: Audit infrastructure
**Goal:** Reusable audit writer available before any audited flow.
**Files:** `prisma/schema.prisma` (AuditLog), migration, `src/lib/audit.ts` (`writeAudit(tx,...)`,
`diff(before,after)`, `summarize(...)`), `src/lib/actions.ts` (`withAction`/`withAdminAction`
wrappers: authorize -> ready-check -> run -> revalidate).
**Approach:** `writeAudit` inserts via the tx client. `diff` returns changed keys only;
`summarize` produces the human-readable string. Document recipe: read before -> in
`$transaction` mutate + writeAudit -> revalidate.
**Tests:** `diff` create/update/delete; `summarize` formatting.
**Depends on:** Unit 1
**Verification:** Sample action writes a correct AuditLog row inside one transaction.

### Unit 3: App domain data model + migration
**Goal:** All inventory/domain entities in one coherent migration (auth already settled).
**Files:** `prisma/schema.prisma`, migration (+ raw-SQL CHECK constraints).
**Approach:** Model Location, Variety, Vineyard, Vessel, VesselComponent, WineSku, BottlingRun,
BottlingSource, StockMovement, BottledInventory, FinishedGoodCategory, FinishedGood,
FinishedGoodInventory per the data model: soft-delete flags, vintage on components, uniques,
indexes, CHECK constraints, historical FKs nullable + `SetNull`.
**Tests:** none (schema). `prisma validate` + migrate.
**Depends on:** Unit 1
**Verification:** `npm run db:migrate` succeeds; Studio shows all tables + constraints.

### Unit 4: Design-system integration + app shell
**Goal:** Adopt de-Savvy'd design system; authenticated app shell + styleguide.
**Files:** `src/styles/tokens/*.css`, `src/app/globals.css`, `src/app/layout.tsx`,
`src/components/ui/*.tsx` (9 components), `public/assets/fonts/BigCaslon-*.otf`,
`src/components/AppShell.tsx`, `src/app/styleguide/page.tsx`.
**Approach:** Copy tokens, rename `--savvy-*`, set wine accent, wire via Tailwind v4 `@theme`.
Convert components to typed `.tsx`. Text wordmark only. Left-nav shell.
**Tests:** none (visual). Build + `/styleguide` renders.
**Depends on:** none
**Verification:** `npm run build` green; `/styleguide` in wine palette, zero Savvy refs.

### Unit 5: Auth UI + DAL gate + forced password change
**Goal:** Login, sign-out, change-password, authoritative session gate (no bypass).
**Files:** `src/app/login/page.tsx`, `src/app/change-password/page.tsx`, `proxy.ts`,
`src/lib/dal.ts` (`getCurrentUser`, `requireReadyUser`, `requireAdmin`), `src/app/(app)/layout.tsx`,
change-password + sign-out actions.
**Approach:** `proxy.ts` = optimistic cookie redirect only. `requireReadyUser` (used by every
protected read/action) loads the user, rejects banned, and redirects to `/change-password` when
`mustChangePassword`. Change-password action hashes new pw, clears flag, sets `passwordChangedAt`,
revokes other sessions, writes `PASSWORD_CHANGE` audit. Sign-in hook writes `LOGIN` audit (ip/ua).
**Tests:** `requireAdmin` rejects user; gate redirects when `mustChangePassword`; banned rejected.
**Depends on:** Units 1, 2
**Verification:** New user with temp pw is forced to `/change-password` and can't reach app data until changed.

### Unit 6: Locations (dynamic, Winery reserved, soft-delete)
**Goal:** CRUD for the shared Location registry.
**Files:** `src/app/(app)/locations/*`, `src/lib/locations/actions.ts`.
**Approach:** Create/rename/deactivate. Block rename/deactivate of system "Winery"; block
deactivate when nonzero balances exist there. Audited.
**Tests:** cannot modify "Winery"; cannot deactivate location with stock; create/rename audited.
**Depends on:** Units 3, 5
**Verification:** Locations list/add/rename; "Winery" protected.

### Unit 7: Reference data — Varieties + Vineyards (soft-delete)
**Goal:** Managed lists.
**Files:** `src/app/(app)/reference/*`, `src/lib/reference/actions.ts`.
**Approach:** CRUD, unique names, deactivate (not delete) — inactive hidden from dropdowns,
preserved in history. Audited.
**Tests:** unique-name; deactivate keeps history; active-only in pickers.
**Depends on:** Units 3, 5
**Verification:** Add "Merlot", vineyards; appear in bulk forms.

### Unit 8: Vessel registry (soft-delete, fill calc)
**Goal:** CRUD for barrels/tanks.
**Files:** `src/app/(app)/vessels/*`, `src/lib/vessels/actions.ts`.
**Approach:** Register (code unique, type, capacityL). Current fill = sum component volumes vs
capacity, over-capacity warning. Deactivate instead of delete. Audited.
**Tests:** capacity > 0; fill calc; over-capacity warning.
**Depends on:** Units 3, 5
**Verification:** Vessels list shows fill %; add BARREL/TANK.

### Unit 9: Bulk / in-process wine (fill-then-bottle, edit directly)
**Goal:** Manage vessel contents (single/blended components, with vintage) at the Winery.
**Files:** `src/app/(app)/bulk/*`, `src/lib/bulk/actions.ts`.
**Approach:** Add/edit/remove components (vineyard + variety + vintage + volumeL) directly on a
vessel. Validate total <= capacity. Unblended-by-ratio = 100% one variety. Component-level
before/after audit. (No transfer/racking/additions in v1.)
**Tests:** total <= capacity; unblended-by-ratio classification; audit on edit.
**Depends on:** Units 7, 8
**Verification:** Fill a tank with 2 components -> flagged a blend; single-variety -> unblended.

### Unit 10: Bottling workflow
**Goal:** Convert bulk to bottled SKU with traceability, via the ledger.
**Files:** `src/app/(app)/bottling/*`, `src/lib/bottling/actions.ts`.
**Approach:** Pick date + vessel + total liters to draw (system auto-proportions the deduction
across that vessel's components). Suggest bottles = round(totalL / 0.75), user adjusts;
volumeConsumedL = bottlesProduced × 0.75. Choose/create WineSku (name + vintage) + destination
location. In one **Serializable** `$transaction` with retry: conditionally decrement each
VesselComponent (`updateMany` row-count check; empty -> remove), create BottlingRun +
BottlingSource, create a `RECEIVE` StockMovement (bottlingRunId set) and upsert BottledInventory
(+bottlesProduced), write `BOTTLING` audit. Reject over-draw.
**Tests:** bottle suggestion math; auto-proportion split; over-draw rejected; volumes decremented;
BottledInventory increments; BottlingSource captures composition+vintage; concurrent runs don't overdraw.
**Depends on:** Units 6, 9
**Verification:** Bottling a vessel reduces its volume and creates traceable bottled inventory at the chosen location.

### Unit 11: Bottled wine inventory + SKUs + ledger
**Goal:** Define SKUs and manage bottled stock via movements.
**Files:** `src/app/(app)/bottled/*`, `src/lib/bottled/actions.ts`.
**Approach:** SKU CRUD (name + vintage; soft-delete). StockMovement actions for BOTTLED_WINE:
RECEIVE (+), ADJUST (+/- with reason), TRANSFER (paired out/in across locations via
transferGroupId), each updating BottledInventory in the same tx; balance CHECK >= 0; derive
cases/loose for display (floor/mod 12). Audited (`STOCK_MOVEMENT`).
**Tests:** transfer conserves total + moves between locations; adjust can't drive negative;
cases/loose derivation; movement + balance updated atomically; audited.
**Depends on:** Units 6, 10
**Verification:** Set/receive/transfer "2025 Ser Kem Marp Reserve"; balances + ledger consistent.

### Unit 12: Finished goods (merch) + ledger
**Goal:** Categories + goods + per-location quantities via movements.
**Files:** `src/app/(app)/finished-goods/*`, `src/lib/finished-goods/actions.ts`.
**Approach:** Category CRUD (soft-delete, block deactivate when goods assigned). FinishedGood CRUD
(category). StockMovement actions for FINISHED_GOOD (RECEIVE/ADJUST/TRANSFER) updating
FinishedGoodInventory; non-negative. Audited.
**Tests:** category deactivate blocked when in use; quantity non-negative; transfer conserves;
movement+balance atomic; audited.
**Depends on:** Units 3, 5, 6
**Verification:** Add "Logo T-Shirt" under "Apparel"; receive/transfer across locations.

### Unit 13: User management (admin-only)
**Goal:** Admin creates/deletes users and resets passwords — no `mustChangePassword` bypass.
**Files:** `src/app/(app)/users/*`, `src/lib/users/actions.ts`.
**Approach:** All actions wrapped in server actions behind `requireAdmin` + ready-check; never
expose Better Auth admin endpoints to the client. Create user with generated temp password (shown
once), `mustChangePassword=true`. Reset password (flag + revoke sessions). Ban/soft-delete user
(revoke sessions). Set role. Audit `USER_CREATED`/`USER_DELETED`/`PASSWORD_RESET` (auth-managed
writes audited via Better Auth DB hooks where atomic; documented where not). USER role rejected.
**Tests:** USER blocked from every user-mgmt action; created user has mustChangePassword; reset
revokes sessions; banned user can't authenticate; audited.
**Depends on:** Units 2, 5
**Verification:** Admin creates a user; temp pw forces reset on first login; banned user blocked.

### Unit 14: Reporting + audit viewer
**Goal:** Three reports + admin audit view.
**Files:** `src/app/(app)/reports/*`, `src/app/(app)/audit/*`, `src/lib/reports/*`.
**Approach:** (a) Bulk by variety at the winery: for each variety, sum volumeL where the vessel is
100% that variety (unblended) vs volume of that variety inside multi-variety vessels (blended),
aggregated across vessels. (b) Bottled by SKU + location from BottledInventory (cases + loose +
total). (c) Finished goods by category + location from FinishedGoodInventory. Audit viewer: filter
by actor/entityType/date, show the human-readable `summary` + before->after. Read-only aggregates.
**Tests:** unblended/blended-by-ratio on a fixture (incl. same variety across vessels, 95/5 blend);
bottled totals; finished-goods rollup; audit filter.
**Depends on:** Units 9, 11, 12
**Verification:** "How much Merlot, blended vs not" and "how many cases of X and where" both answerable on screen.

### Unit 15: Seed, dashboard, wiring
**Goal:** First-run readiness + landing dashboard.
**Files:** `prisma/seed.ts`, `package.json` (seed script + direct URL), `src/app/(app)/page.tsx`.
**Approach:** Idempotent seed: one ADMIN user (env-driven email + temp password,
`mustChangePassword`) and the reserved "Winery" location. Dashboard: total bulk liters, bottled
cases, finished-goods count, recent audit activity. Empty states + nav wiring.
**Tests:** seed idempotent (exactly one Winery + one admin).
**Depends on:** Units 6, 14
**Verification:** Fresh DB -> seed -> admin login -> forced pw change -> dashboard renders.

## Test Strategy

**Unit (Vitest, added Unit 1):** Argon2 hash/verify; audit `diff`/`summarize`; bottle-count +
auto-proportion + cases/loose math; unblended-by-ratio classification; capacity validation;
`requireReadyUser`/`requireAdmin`/`mustChangePassword`/banned guards; ledger balance math.
**Integration (Neon test branch):** bottling Serializable tx (decrement + run + sources + movement
+ balance + audit) including a concurrent-overdraw case; transfer movement pairing.
**Manual e2e:** seed -> admin login -> forced reset -> create user -> register vessel -> fill blend
-> bottle (auto-proportioned) -> bottled inventory + traceable run -> transfer bottled stock ->
add finished goods -> all three reports -> audit log shows human-readable history with actor.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Better Auth generated schema vs app expectations | MED | MED | Auth is source of truth, generated + migrated first (Unit 1) before app models |
| Next 16 specifics vs training data (proxy.ts, Server Actions, Tailwind v4) | HIGH | MED | Read `node_modules/next/dist/docs/`; build-check each unit |
| Concurrent bottling overdraw | MED | HIGH | Serializable tx + retry + conditional `updateMany`; integration test |
| Audit gap if a mutation skips writeAudit | MED | MED | `withAction` wrapper + checklist; integration asserts audit rows |
| Auth-managed writes not atomic with app audit | MED | LOW | Better Auth DB hooks where possible; documented otherwise |
| `@node-rs/argon2` on Vercel | LOW | MED | Prebuilt binaries; `bcryptjs` fallback |
| Simple bottling leaves residual liters in a vessel | MED | LOW | Accepted (user decision); user can edit/zero components directly |
| Neon free-tier / migrations on pooled URL | LOW | MED | Use `DATABASE_URL_UNPOOLED` for migrate/seed |

## Success Criteria

- [ ] Admin creates a user with a temp password; that user is forced to change it on first login; banned users can't sign in.
- [ ] User management is reachable/usable only by ADMIN, with no `mustChangePassword` bypass.
- [ ] A vessel can be filled with a single variety or a blend (variety + vineyard + vintage) and shows fill vs capacity.
- [ ] Bottling draws by total liters (auto-proportioned), decrements bulk, suggests bottle count, creates a SKU, lands stock in a location, and is traceable to source composition + vintage.
- [ ] Bottled wine + finished goods change only via the movement ledger (RECEIVE/ADJUST/TRANSFER); balances never go negative; cases/loose derived.
- [ ] Every inventory and user-mgmt change produces a human-readable audit row (who/when/before->after), admin-viewable.
- [ ] All three reports answer the example questions, with unblended/blended computed by variety ratio.
- [ ] App matches the design system with no Savvy branding and a wine-burgundy accent.
- [ ] All tests pass; `npm run build` is green.

## Refinement Log (2026-06-14, post-council)

Applied automatically (correctness, no user input needed):
- Better Auth made the schema source of truth; auth tables generated/migrated first (Unit 1), app
  models second (Unit 3). Roles use plugin `admin`/`user` + `banned` (dropped `ADMIN|USER` enum +
  `disabled`). `mustChangePassword` bypass closed: privileged auth calls wrapped in server actions
  behind `requireReadyUser`/`requireAdmin`; gate applies to reads + route handlers.
- Bottling transaction set to Serializable + retry with conditional decrements.
- `BottledInventory`/`FinishedGoodInventory` store canonical integer balances; cases/loose derived.
- DB-level CHECK constraints added; non-unique indexes specified; historical FKs nullable +
  `SetNull` + email/name snapshots.
- Added `vintage` to `VesselComponent` (identity = variety+vineyard+vintage) + uniqueness.
- Soft-delete (`isActive`/`banned`) across reference data, vessels, SKUs, categories, users.
- Unblended/blended computed by variety ratio (aggregated), not row count.
- Bottling UX: pick vessel + total liters; auto-proportion across components.
- Audit viewer shows human-readable `summary`; AuditLog gains a `summary` field.
- Dependency order fixed: audit infra (Unit 2) before audited auth flows (Unit 5); bottling (10)
  depends on locations (6); user mgmt (13) depends on auth (5) + audit (2).

Applied per user decision:
- Bulk = fill-then-bottle only (no transfer/racking/addition/blend-ceremony in v1).
- Bottling = simple (consumed = bottlesProduced × 0.75; no loss/heel tracking).
- Finished goods = non-wine merch only (no bridge to bottled wine).
- Bottled wine + finished goods use a movement ledger (RECEIVE/ADJUST/TRANSFER) + cached balances.

Deferred (noted, not built): bulk movements, bottling-loss/heel accounting, multi-format bottles,
retail/finished-goods bridge for wine.
