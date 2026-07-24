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

### Tenant id is set with `SET LOCAL` inside the transaction, and proven through the pooler (D17)
- Tenant context (`app.tenant_id`) is set with **`SET LOCAL`** *inside* each transaction — never as a
  session-scoped `SET` — because transaction-mode poolers (PgBouncer/Neon) reuse connections and do not
  reset session GUCs between transactions, which would leak one tenant's id to the next request.
- The isolation test suite must exercise the **pooled endpoint** (transaction mode), not only direct
  Postgres — the leak is invisible against a direct connection.
- **Status:** 🟡 (H1 WIRED: CI now runs the isolation suite through a transaction-mode PgBouncer + a SET-LOCAL no-bleed test that a direct-PG proof can't catch; 🟢 on first green CI run)

### Personal data is never embedded in immutable ledger events; erasure = crypto-shredding (D19)
- Immutable append-only events conflict with GDPR/CCPA Art. 17 right-to-erasure. **PII (DTC customers,
  user accounts) lives in a mutable store referenced by id**, never inside ledger events.
- Erasure is **crypto-shredding** (encrypt-then-drop-key), not row deletion — it satisfies erasure
  without breaking the ledger or lineage.
- **Status:** 🟡 (user-account PII: design in now; DTC-customer PII: before Phase 16)

### Offline writes carry tenant context and pass RLS on sync (D25/D17)
- Offline-captured ops queue with their **tenant id attached** and, on reconnect/drain, are written
  inside a transaction that sets `app.tenant_id` via **`SET LOCAL`** — an offline write must never drain
  onto a pooled connection carrying another tenant's session GUC (the D17 pooler-leak failure mode).
- Sync must be **fail-closed**: an op that can't establish its tenant context is rejected to an exception
  state, never written under the ambient/last-set tenant. (Scale/merge side of this is in [[scale-register]].)
- **Status:** 🟡 (best-effort outbox today; enforced properly with the Phase-28 sync layer)

### Assistant/automated writes require explicit confirmation
- Write actions go through a signed-token / single-use nonce confirmation path (`src/lib/assistant/
  confirm.ts` + `commit.ts`). Voice can confirm by tap or spoken "confirm" — the token path is unchanged.
- **Status:** 🟢

### Voice recognition is opt-in input focus, not authentication
- Voice Focus stores only a derived mathematical voiceprint/provider reference, never raw enrollment
  audio. The profile is tenant-scoped, protected by forced RLS, encrypted with the envelope helper, and
  deletable by the user.
- Speaker recognition can gate voice-mode interruption and session controls, but it is not login, MFA,
  RBAC, or write authorization. Auth, tenant membership, and signed write confirmations remain
  authoritative.
- The client never receives match scores, thresholds, ciphertext, wrapped DEKs, provider bodies, or raw
  audio. Shared devices must always expose a physical "Open to anyone" escape hatch.
- **Tripwire:** raw voice audio stored or logged; voiceprint table added to `GLOBAL_MODELS`; a write
  committed because of voice match alone; match scores exposed to the browser; no physical recovery path.
- **Status:** 🟡 (v1 local voiceprint + RLS/envelope path implemented; provider-grade verification is
  still a follow-up hardening decision)

### Work-order template authoring is admin-gated; the client spec is canonicalized server-side (plan 034)
- Creating / editing / cloning / archiving a work-order template is **admin-only** (`adminAction` in
  `src/lib/work-orders/actions.ts`); issuing + running work orders stays open to all roles. A cellar hand
  can't rewrite shared SOPs.
- The client-supplied template `spec` is **untrusted**: the cores (`createTemplateCore` /
  `updateTemplateSpecCore`) run `validateTemplateSpec` **then** `canonicalizeTemplateSpec` (drops unknown
  task types + any `defaults` key not in the vocabulary) and persist ONLY the canonical object — never the
  raw input. Client-side validation is convenience only.
- Reads (`getTemplateDetail` / `listTemplatesForBuilder`) filter by `tenantId` in the query (K12) on top
  of RLS; a cross-tenant template id resolves to null.
- The new `NOTE` (checklist) task kind writes NOTHING (no ledger op / measurement / vessel-activity /
  cost) — guarded by `npm run verify:work-orders-enhancements`.

### Ownership (`ownerId`) is a MODEL, not yet an enforcement boundary — plan 093 foundation / plan 092 RLS
- Plan 093 (F1 #484 + F2 #485) added a scalar `ownerId` on ~25 tables + the `Owner`/`Grower`/`WeighTag`/
  `BillableWineConsumed` entities. Those new tables get the **full tenant-isolation RLS** (AGENTS 9-step,
  proven by `verify:tenant-isolation`) — tenant isolation is NOT weakened. **But there is deliberately NO
  owner-scope RLS yet**: within a tenant, a custom-crush client cannot yet be fenced to only *their* rows.
  That RESTRICTIVE owner-scope quad is **plan 092** (the enforcement half), layered on this verified model.
- ⚠️ **Security tripwire until 092 lands:** do NOT expose a client-facing read path (a "Your wine" portal,
  a per-client login) against these tables — `ownerId` scopes NOTHING at the DB yet, so a client login would
  see the whole tenant. The model is proven correct (`verify:owner-model`, OWNER-1) precisely so 092 can add
  the RLS without a re-migration; until then owner-scope is an app-layer/GUI concern only, not enforced.
- `ownerId` is a maintained projection (OWNER-1), never the source of a security decision on its own; a NULL
  `ownerId` = Estate/facility (not "unknown"), so a fail-open bug would leak *as facility*, not cross-client.
- **Status:** 🟢 (admin gate + server-side canonicalization + tenant scoping verified by the /review
  security specialist + the write-nothing guard)

### Feedback-fix agents: attacker-influenced input, but a fixed output path
- The bug-fix / assistant-feedback agents (`scripts/bug-feedback-agent.ts`,
  `scripts/assistant-feedback-agent.ts`) run in GitHub Actions holding real secrets
  (`DATABASE_URL`, `GH_PAT`) on **untrusted** ticket text — and now on **untrusted screenshots**
  (`scripts/feedback-attachment-images.ts` fetches the ticket's private Blob images and passes them
  to Claude as vision blocks). Both system prompts frame text AND images as data, never instructions.
- Images change the model's **input** only. The **output** path is unchanged and is where safety
  lives: modify-existing-files-only inside the write-fence (`scripts/feedback-fence-rules.ts`), no
  new files, a typecheck gate, a post-run fence self-check, and **no lint/test in the credentialed
  job** (that is the RCE vector — the PR's clean-context CI runs them). So adding vision does not
  widen the RCE surface.
- The Blob token in the two feedback CI jobs is **read-only in use**; the job already holds stronger
  secrets. There is no read-only Blob token type in this `@vercel/blob` version. Size/count/byte
  budgets in the selector bound cost + payload.
- **Tripwire:** any change that lets an image (or its decoded text) trigger a **tool call / code
  execution** in the agent, or that runs lint/test/`npm`-scripts in the credentialed job.
- **Status:** 🟢 (output path unchanged; pure selector guarded by `test/feedback-attachment-images.test.ts`)

### The feedback auto-fix fence widens to cellar-floor domains, never to money/tenancy/ledger (plan 052)
- The write-fence allowlist (`scripts/feedback-fence-rules.ts` `allowedPrefixes`) covers UI/assistant
  PLUS the cellar-floor server domains (`work-orders`, `vessel(s)`, `lot`, `blend`, `bottling`, `bulk`,
  `cellar`, `ferment`, `harvest`, `chemistry`, `stock`, `inventory`, `sparkling`, `vineyard`,
  `winemaking-calc`, `units`, `reference`, `settings`, `locations`, `fieldnotes`, `developer`,
  `feedback`) so the loop can fix real domain bugs, PLUS `test/` so a fix carries its regression test.
  Allowing `test/` is safe: test files run ONLY in the PR's clean-context `check` CI (vitest, no
  secrets), NEVER in the credentialed feedback-bug-fix agent job (which writes files but runs no
  lint/test — the RCE boundary is unchanged). It MUST NOT include the money/tenancy/ledger/moat
  domains: `ledger`, `cost`, `money`, `accounting`, `commerce`, `compliance`, `transform` (kept out by
  omission — unlisted ⇒ `isAllowed` false), the hard-denied `auth`/`dal`/`tenant`/`prisma`/`.env`/
  workflows/migrations, and the file `src/lib/audit.ts` (audit-trail integrity is human-review-only).
- **What breaks at scale:** widening auto-merge into domain code lets an autonomous LLM land a change
  to code that writes to the append-only ledger. The required `check` CI job runs NO DB domain proof,
  so the backstop is the label-gated **`feedback-domain-verify`** job: it runs a touched domain's
  runtime `verify:*` (resolved by `resolveDomainVerifies`); a mapped domain whose proof fails blocks
  the merge, and an UNMAPPED widened domain has no proof so the auto-merge gate (`bug-triage`) must
  route it to a human. Auto-merge stays fence-only + small + root-fix + CI-green as before.
- **Tripwire:** the excluded set (`ledger`/`cost`/`money`/`accounting`/`commerce`/`compliance`/
  `transform`/`audit.ts`) appearing in `allowedPrefixes`; a domain fix auto-merging with
  `feedback-domain-verify` red or absent; a new widened domain shipping with no `domainVerifyMap`
  entry AND being treated as auto-mergeable. See [[TRIP-SEC-FEEDBACK-FENCE]].
- **Status:** 🟡 (fence + backstop shipped and unit-tested; the `feedback-domain-verify` CI job needs
  its first live run to confirm the domain `verify:*` run clean in-CI, and the global `bug-triage`
  auto-merge FENCE must be synced to match — plan 052 Unit 5)

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

### Third-party OAuth tokens are encrypted at rest, and the system path can't read them (Phase 15)
- QuickBooks tokens: ONLY the **refresh token** is persisted, AEAD-envelope-encrypted (per-record DEK
  wrapped by an env KEK; AAD binds `table|provider|environment|tenantId|connectionId|fieldName|kid` so
  a ciphertext can't be transplanted). The **access token is cached in memory, never a DB column**
  (SEC-N2). A non-CONNECTED connection holds NO token material (DB CHECK, SEC-S5).
- The accounting cron enumerates org ids as a dedicated **least-privilege `accounting_enumerator`**
  role with SELECT on `organization` ONLY and **no grant on any token table** (SEC-C3); per-tenant
  token reads happen under `app_rls`. `runAsSystem` (owner) is migrations-only — never used to read a
  tenant row on the cron path.
- Token **refresh is serialized per connection** (`SELECT … FOR UPDATE` + a `tokenVersion` CAS inside
  the tenant tx); the rotating refresh token is never lost/duplicated, and NEEDS_REAUTH is set only
  after the locked read confirms no newer token (SEC-N4). OAuth `state` is a server-stored single-use
  PKCE nonce; the canonical realmId is derived from a trusted Intuit call, not the callback (SEC-C1/C2).
- OAuth payloads (code/tokens/Authorization/ciphertext) are scrubbed from Sentry + logs (SEC-S4).
- **Tripwire:** a token column read on any cron/system path; a WITHHELD/posted delivery that leaks a
  token; `accounting_enumerator` gaining a grant on a token table; a non-CONNECTED row with a ciphertext.
- **Status:** 🟡 (built + envelope/refresh/isolation proven by unit + `verify:tenant-isolation` +
  `verify:accounting-idempotency`; SEC-C4 KEK is env-resident — move to a cloud KMS before prod GA)

### Commerce7 DTC integration — no OAuth, app-global secret, weak-auth webhook, PII-min (Phase 16)
- Commerce7 has **no OAuth/tokens**: an app-global **App ID + Secret Key** over Basic Auth + a `tenant:`
  header. The Secret Key + the **separate inbound webhook secret** are **env-only** (never a DB column,
  scrubbed from logs). No secret is stored per-tenant — the commerce tables hold none.
- **Install is nonce-bound** (reuses the `OAuthState` single-use-nonce pattern tied to the initiating
  admin + workspace + an explicit admin confirm); the callback's `tenantId` is the C7 slug ONLY, never
  trusted to pick our tenant (tenant-hijack fix). One-install guard = a partial unique on
  `(provider, externalTenantId) WHERE status='CONNECTED'`.
- **Webhook authenticity despite no HMAC on C7 payloads:** the delivery URL embeds our tenant id + an
  **HMAC of it keyed on the inbound webhook secret**, constant-time verified — it both ROUTES a
  session-less POST to the right tenant (no cross-tenant read; the app is a NOBYPASSRLS role, and
  `runAsSystem`/owner is never reached from an HTTP path) and gates it (unforgeable). Payload slug must
  match the CONNECTED record; the dirty-marker upsert is bounded (dedup by order id + a backlog cap); a
  fake id that 404s on re-fetch is dropped. The webhook is re-fetch-before-act (a hint only).
- **DTC-customer PII (D19):** the order projection + immutable deltas + dirty markers + logs carry ONLY
  opaque ids + amounts + SKU refs — never a name/email. A schema test (`commerce7-schema.test.ts`)
  fails if a PII-shaped column is ever added; nothing is stored, so there's nothing to shred.
- **Uninstall:** the app-global C7 uninstall POST can't cross-tenant-resolve (RLS-forced tables), so it
  authenticates + acks; the per-tenant poll/reconcile marks the connection when C7 rejects the creds.
- **Tripwire:** a secret in a commerce DB column; a PII-shaped column on `commerce7_order`/
  `sales_export_event`; a webhook route that trusts the payload without the HMAC path; a cross-tenant
  read on the webhook/uninstall path; `runAsSystem` imported into the web app.
- **Status:** 🟡 (built + proven offline by `verify:commerce7` + `verify:commerce7-idempotency` +
  `verify:tenant-isolation`; **live sandbox smoke pending** (Unit 0); Secret-Key KMS posture rides SEC-C4)

## Bond isolation + tax-paid terminal boundary (Phase 2, BOND-1 / TAXPAID-1)

- **What:** `Bond` + `ChangeOfTaxClassEvent` are tenant-scoped + RLS-forced (Phase-12 checklist);
  composite `(tenantId, bondId) → bond` / `(tenantId, lotId) → lot` FKs (raw SQL, K11) make a
  cross-tenant/cross-bond reference a DB error, not a leak. A `TRANSFER_IN_BOND` posts its symmetric
  removed/received pair in ONE `runLedgerWrite` (BOND-1) — no half-committed cross-bond state.
- **Tax-paid boundary:** `REMOVE_TAXPAID` is terminal — the generic reverser refuses it, and a central
  admissibility guard at the `writeLotOperation` chokepoint (CO-1) blocks any CORRECTION-of-taxpaid or
  positive in-bond ADJUST on a tax-paid-removed lot. The ONLY re-admission is a refund-flagged
  `RETURN_TO_BOND`. This keeps the federal tax-paid line from being silently crossed behind the reverser.
- **Authz:** high-risk bond ops (transfer, return-to-bond, tax-class change, bond CRUD) are `adminAction`-
  gated (coarse admin gate; Owner-Based Permissions are Phase 23).
- **Tripwire:** a one-sided/two-transaction cross-bond post; `REMOVE_TAXPAID` back in `CELLAR_TYPES` or
  `CORRECTABLE`; a positive in-bond delta re-admitting tax-paid volume via any op other than
  `RETURN_TO_BOND`; a lot-level "home bond" column treated as the compliance source of truth.
- **Status:** 🟢 (proven by `verify:bond` / `verify:taxpaid` / `verify:tenant-isolation`)

---

## Identity presentation layer — new tenant-scoped tables + rename authority (Phase 1)
- **What:** `LotIdentifier`, `LotCodeEvent`, `NamingTemplate`, `NamingTemplateVersion` — all tenant-scoped
  to the Phase-12 checklist (RLS ENABLE+FORCE + `tenant_isolation` USING/WITH CHECK, fail-closed) with
  composite `(tenantId, refId) → (tenantId, id)` FKs in raw SQL (K11). The tenant-isolation auto-coverage
  guard requires RLS on every one; behavioral cases live in both isolation harnesses.
- **Boundary:** rename/`displayName` are normal tenant-user actions (`action()`) — renaming is first-class
  UX and not in the admin/owner high-risk set. Naming-**template authoring** is admin-gated (`adminAction`).
  Identity is `id`; a `code` collision is a label error (offered disambiguation), never a data-integrity or
  cross-tenant risk.
- **Tripwire:** a new lot-identity table missing RLS (auto-coverage guard fails); a `WHERE code =` /
  `lotCode =` join in `src/lib/{ledger,cost,transform,blend,compliance}` (a rename would then silently
  mis-resolve — caught by `verify:naming`); a rename path writing a `LotOperationLine` snapshot (history
  rewrite — `verify:naming` asserts snapshots are untouched); `runAsSystem` imported into the web app.
- **Status:** 🟢 (built + guarded by `verify:naming` + `verify:tenant-isolation`)

---

### An autonomous fix agent can write to `main` — the fence is the whole control
- The feedback auto-fix loop (AGENTIC_FIX mode, `src/lib/feedback/automation.ts`) dispatches a GitHub-Actions
  agent that writes code and opens/merges PRs with **no human authoring the diff**.
- It is bounded by a **fence**: only UI/assistant + widened cellar-floor `src/lib` domains are auto-fixable;
  **NEVER** money/ledger/tenancy/audit/auth/`prisma`/migrations (plan 052). Enforced by CI checks
  `verify:feedback-fence` + `feedback-domain-verify`, a tight auto-merge gate (fence-only + fully-green +
  small + root-cause-reviewed), and branch protection (never `--admin`).
- The plan-059 `triageClass` disposition routes `product-gap`/out-of-fence items to humans, so the agent is
  not handed changes it structurally shouldn't attempt.
- **Watch:** the fence allowlist IS the trust boundary — widening it into `src/lib/{ledger,cost,tenant,compliance,accounting,commerce}` or `prisma/` hands an autonomous agent the crown jewels. A green `feedback-domain-verify` proves the domain's own tests pass, NOT that a fix is complete — read the diff before trusting the gate.
- **Status:** 🟡 (control in place + CI-gated; posture depends entirely on keeping the fence tight — see the plan-052 fence sync + the `/bug-triage` goalie).

## User management is app-layer tenant-isolated (the GLOBAL-table exception) — #90
- **What:** `User`/`Member`/`Organization` are GLOBAL, RLS-exempt tables (denylist in
  `src/lib/tenant/models.ts`; Better Auth reads them pre-login). So — unlike every domain table — the
  DB does NOT scope them by tenant. For user management, the app layer is the *only* isolation, via an
  org-membership filter: `src/lib/users/scope.ts` (`memberOfTenant` / `tenantUserWhere`), keyed off the
  caller's VERIFIED effective tenant (`supportOrganizationId ?? activeOrganizationId`), shared by the
  Users page (reads) and all `src/lib/users/actions.ts` mutators (writes). `createUser` binds a new
  non-developer to the creating admin's org with a `Member` row (developers land in the Demo home);
  a cross-tenant target loads as "User not found." (never "forbidden") so ids can't be probed.
- **History:** before this, `/users` ran an unscoped `user.findMany` (every tenant's accounts visible to
  any admin) and every mutator loaded the target by bare `findUnique({id})` — so an admin at winery A
  could reset/ban/re-role winery B's users (account takeover). Proven closed against live data + the two
  isolation harnesses.
- **Boundary:** `role`/`banned` remain GLOBAL flags on `User` (not per-`Member`). Today only developers
  are multi-org, and the takeover-critical mutators (`setUserRole`/`setUserBanned`/`resetUserPassword`)
  are additionally `canManageDeveloperTarget`-gated, so a plain admin can't touch a developer even when
  they share an org. See TODOS.md ("Per-tenant user role/state") for the deeper model question.
- **Tripwire:** a new user-management read/mutator that queries `User`/`Member` WITHOUT
  `memberOfTenant`/`tenantUserWhere` (or an equivalent membership `where`); moving `User` off the
  denylist; a `createUser`-style path that mints a user with no `Member` row (orphan → can't log in +
  invisible to the scoped page). Covered by `test/user-scope.test.ts` (shape) + the user-management case
  in `test/tenant-isolation.test.ts` / `scripts/verify-tenant-isolation.ts`.
- **Status:** 🟢 (built + guarded by `verify:tenant-isolation` + `user-scope` unit test; live-data proof
  on Bhutan/Demo).

## Consolidated maintenance completion/undo — app-layer authorization + no new RLS surface (plan 061)
- **What:** a multi-vessel maintenance task carries its member set in `plannedPayload.groupActivity` **JSON**
  (no `work_order_task_member` table, no member columns) — so consolidation adds **no new tenant-scoped table
  and no new RLS surface** (ADR 0004). The per-barrel historical record stays the real `VesselActivityEvent`
  rows (each tenant-scoped + RLS'd). `undoMaintenanceTaskCore` (`approval.ts`) is authed to admin/developer
  **OR** the person who recorded the completion (self-undo, mirroring group-rack D1) — it's a crew "undo,"
  never a reviewer action (record-only maintenance auto-DONEs and never enters the review queue).
- **Fan-out tenant safety (plan 060):** the new `AnalysisPanel.vesselReadingGroupId` is on an already
  tenant-scoped + RLS'd table; the group id is derived from the caller's own `clientRequestId` and the
  uniqueness key is per-tenant (`(tenantId, vesselReadingGroupId, lotId)`), so a fan-out can never write or
  collide across tenants (tenantId is auto-injected + RLS-enforced). Additive nullable column — no auth/global
  table touched.
- **Tripwire:** a group-maintenance undo/complete path that skips `canApprove`/self-owner check; consolidation
  ever migrating members into a real table WITHOUT the Phase-12 tenant checklist; a fan-out write that sets
  `vesselReadingGroupId` from anything but the request-scoped plan.
- **Status:** 🟢 (app-layer authz + JSON members = no new RLS surface; guarded by `verify:group-maintenance`
  and the `analysis_panel` RLS policy + per-tenant unique).

## Near-duplicate vendor guard is INTERACTIVE-only — automated create stays exact (plan 074)
- **What:** the create-time near-duplicate guard (`findVendorNearMatches`/`nearDuplicateLevel` in
  `vendors-shared.ts`, surfaced via `getVendorNearMatchesCore` → `checkVendorNearMatchesAction`) runs only on
  the **interactive** create surfaces — the `/setup/vendors` modal and the assistant `create_vendor` tool. It
  is **advisory** (a "did you mean?" soft-block, never an auto-merge; merge stays admin-gated, plan 072). The
  **automated** find-or-create path (`findOrCreateVendorCore` → A/P bill emit, material intake, invoice ingest,
  backfill) is DELIBERATELY left at exact-name match: you cannot interpose a human "did you mean?" mid
  bill-post. So an automated path can still mint a near-dup ("Scott Labs" vs "Scott Laboratories"); that is a
  known, accepted gap for this slice. Excludes the currency-suffix case ("Acme (EUR)", plan 073) and the
  Unknown fallback from ever being flagged.
- **Tripwire:** wiring `getVendorNearMatchesCore` (or any blocking guard) into `findOrCreateVendorCore` /
  the A/P path (would block or prompt inside a governed-money write); making the guard auto-merge instead of
  advisory; a future detective sweep (the intended closer of this gap) that auto-collapses vendors without the
  admin-gated merge. Proof: `verify:vendor-dedupe` + `test/vendors-shared.test.ts` + `test/assistant-create-vendor-dedup.test.ts`.
- **Status:** 🟢 (advisory read-side guard, no new RLS surface — reads existing tenant-scoped `vendor` rows;
  the automated-path gap is documented and slated for the later agentic detective sweep).

## QBO → Cellarhand vendor pull is READ-ONLY + human-gated; new tenant table `vendor_import_candidate` (plan 075)
- **What:** Slice 1 pulls QBO vendors INTO Cellarhand (paginated `SELECT * FROM Vendor`) and lands unmatched
  ones in a new tenant-scoped `vendor_import_candidate` review queue for human accept/reject/merge. Read-only
  against QBO (the only writes are local `Vendor` + `vendor_import_candidate`); no auto-insert (advisory,
  human-confirmed — same posture as Slice 0). `Vendor.externalVendorId` is the single source of truth for
  "already synced" (audited writes only, via the accept/merge cores). Currency-variant QBO records
  ("Acme (EUR)", plan 073) collapse to one candidate so PII/noise doesn't multiply.
- **RLS / tenancy:** `vendor_import_candidate` follows the Phase-12 checklist verbatim (tenantId + FK →
  organization RESTRICT + composite `(tenantId, suggestedVendorId)` → vendor K11 SET-NULL + RLS ENABLE/FORCE +
  `tenant_isolation` USING+WITH CHECK + `GRANT app_rls` + the `DO $$` migration guard); covered by
  `verify:tenant-isolation` (coverage guard + an explicit block). The optional poll cron enumerates orgs via the
  least-privilege enumerator role (org list ONLY, never `accounting_connection` — SEC-C3); the per-tenant
  `runAsTenant` block reads the connection + token, never a bare `prismaBase` read (would return 0 rows under RLS).
- **Tripwire:** an auto-accept that inserts vendors without human review; a pull that writes back to QBO (this
  slice must not); the cron reading `accounting_connection` as the enumerator instead of per-tenant; treating a
  currency-suffixed record as a distinct supplier (floods the queue / fragments PII). Proof: `verify:vendor-import`
  + `test/qbo-vendor-pull.test.ts` + the isolation block.
- **Status:** 🟢 (read-only QBO + advisory human-gated queue; new RLS table proven; enumerator SEC-C3 respected).

## Cellarhand → QBO eager vendor push is OPT-IN, POST-COMMIT, home-currency-only; no new RLS surface (plan 077)
- **What:** Slice 2 pushes a Cellarhand-created vendor INTO QuickBooks immediately (opt-in per tenant via
  `AppSettings.pushVendorsToQbo`, default false). The push runs AFTER `createVendorCore` commits — never inside
  its `runInTenantTx` (a multi-second QBO HTTP call under a held DB tx = Neon P2028). Fuzzy-matches against QBO
  first (Slice-1 `listVendors` + Plan-074 `findVendorNearMatches`) and offers link-to-existing so it never
  blind-creates a "Scott Labs"/"Scott Laboratories" dup in QBO. Only the HOME-currency vendor is pushed
  (unsuffixed); foreign currency-scoped vendors ("Acme (EUR)", plan 073) stay LAZY at bill-post. Two new COLUMNS
  only (`Vendor.syncStatus` plain string, `AppSettings.pushVendorsToQbo`) — no new table, RLS-neutral (existing
  `tenant_isolation` policies cover new columns).
- **RLS / tenancy:** the retry sweep (`runVendorSyncSweep`) + backfill enumerate orgs via the least-privilege
  enumerator role (org list ONLY, never `accounting_connection` — SEC-C3); every per-tenant read/write is inside
  `runAsTenant` (never a bare `prismaBase` read — 0 rows under RLS). Two local vendors resolving to one QBO id is
  blocked by the Slice-1 `@@unique([tenantId, externalVendorId])` → P2002 → `syncStatus='conflict'` (surfaced,
  never a 500). Server actions RETURN `{ok,error}` (prod redaction).
- **Tripwire:** moving the push INSIDE `createVendorCore`'s tx (P2028); pushing suffixed foreign-currency vendors
  eagerly (plan-073 double-currency corruption); making push always-on instead of opt-in; the sweep/backfill
  reading `accounting_connection` as the enumerator; a blind create that skips the fuzzy pre-check (QBO dup).
  Proof: `verify:vendor-sync` (link / idempotent / conflict / sweep-gating / opt-in round-trip on real DB;
  `VERIFY_VENDOR_SYNC_LIVE=1` adds the live QBO push + pre-check) + `verify:tenant-isolation`.
- **Status:** 🟢 (opt-in, post-commit, home-currency-only, column-add only — no new RLS table; unique guard +
  conflict state proven; the lazy bill-post path remains the backstop).

## Knowledge-base RAG: GLOBAL corpus (no RLS) + app-code entitlement + untrusted crawled content (plan 079)
- **What:** the crawled winemaking corpus is GLOBAL (no `tenantId`, no RLS) — a shared reference library.
  Per-winery access is a tenant-scoped `knowledge_source_subscription` (full Phase-12 RLS). Because the
  corpus has NO row-level security, source entitlement is enforced in APPLICATION CODE: retrieval filters
  the global chunks to the tenant's enabled sources (empty set ⇒ zero rows, fail-closed), and the citation
  redirect route `/kb/source/<id>` MUST re-resolve the caller's tenant and re-check the subscription per
  request (a guessable global id would otherwise be an authz bypass — council C2).
- **Untrusted content:** crawled HTML/PDF text is DATA, never instructions (prompt-injection surface), and
  the bigger real harm is extraction error (a dropped decimal → wrong dose). The KB tool quotes numeric
  dose/temp/limit phrases VERBATIM from the source + tells the user to verify, defers ALL math to the
  existing calculators (`calc_so2`/`calc_sugar`), and crawled titles are escaped + length-limited before
  they reach Markdown/the redirect route.
- **Crawler boundary:** SSRF controls (allowlist-only hosts, private-IP rejection, redirect-host checks,
  size/timeout/page-count caps); cross-domain link following only INTO allowlisted domains. The weekly
  re-crawl loop (`knowledge-recrawl.yml` → `scripts/recrawl-knowledge.ts`, Unit 12) DOES write — but ONLY
  the GLOBAL reference corpus, never tenant/financial data — and every write is additive + reversible +
  self-correcting (changed pages re-embed into a new revision behind an atomic flip; a 404 tombstones to
  `status='withdrawn'` but keeps the rows; a re-reached doc flips back to `active`). It opens a GitHub
  issue as the audit trail and never touches code / never merges `main`. It runs as owner
  (`runAsSystem`, needs `BYPASSRLS` to write the global tables); a narrower write role is a deferred
  follow-up (acceptable for v1: global reference data only, no tenant reach, single-flight, reversible).
  The tombstone pass is gated to COMPLETE crawls (a capped/incomplete run can't distinguish "removed"
  from "not yet reached", so it self-suppresses rather than risk a wrong withdrawal).
- **Source onboarding + robots posture:** every source is `KNOWLEDGE_SOURCES`-registered with its host in
  `TRUSTED_DOMAINS` (the crawl boundary). Sources are one of two kinds: **auto-crawl** (sitemap +
  link-following, e.g. AWRI/WA/WSU — WSU declares its non-standard `/wp-sitemap.xml` via `sitemapUrls`), or
  **curated** (`autoCrawl:false` — a dedicated operator script; excluded from the weekly loop so it can't
  choke on slow crawl-delays / undiscoverable URLs). Curated adds: `scott-labs` (a VENDOR, tier 2 — its
  `/learn/` articles are bare root slugs intermixed with products + cider/beer/spirits, NOT prefix-separable,
  so `crawl-scott-labs.ts` fetches the winemaking handbook PDF + a curated wine-article allow-list; license
  note flags brand/dosage specifics as vendor-sourced) and `osu-owri` (Oregon Wine Research Institute PDFs
  via `crawl-owri.ts`, which walks the ungated collection listing for `/downloads/` links and never touches
  the JS-challenge-gated `/concern/` item pages). Our fetcher UA is `CellarhandKnowledgeBot`, subject to the
  robots `*` group (which permits OSU's `/collections/` + `/downloads/`); the OSU `ClaudeBot Disallow` targets
  Anthropic's training crawler, a different agent. The OSU **Extension** site (extension.oregonstate.edu)
  is also a curated `osu-extension` source (WINE/GRAPES ONLY): its robots is `User-agent: * → Allow: /`
  and blocks only NAMED training crawlers (ClaudeBot/GPTBot/CCBot) with `ai-train=no,use=reference` — our
  UA is permitted and we do reference-use RAG (cite + link back), not training. Because the wine articles
  live in a flat `/catalog/` namespace shared with ~4k unrelated pubs + beer/cider/spirits,
  `crawl-osu-extension.ts` enumerates the two wine hubs + the sitemap and keeps ONLY wine/grape URLs
  (positive wine/grape keyword required, off-topic crops + beverages + academic-program pages excluded;
  dry-run reviewable). We stay off the robots-clean-but-JS-rendered `/topic/.../resources` listings.
- **Tripwire:** the citation route redirecting without the per-request subscription recheck; retrieval
  dropping the enabled-source filter (or degrading empty→all); a numeric answer paraphrased instead of
  quoted; the crawler following a link to a non-allowlisted domain or fetching a private IP; owner creds
  used to write TENANT/financial content (the re-crawl writing the global reference corpus is expected);
  the tombstone pass running on a capped/incomplete crawl. Proof: `verify:knowledge-base` +
  `verify:tenant-isolation`; see [[decisions/0007-knowledge-base-rag-global-corpus-tenant-subscriptions]].
- **Status:** 🟢 (shipped to main PR #285; Units 1–10 + 12 built — subscription RLS proven, app-code
  entitlement + citation recheck + numeric guardrail live, re-crawl freshness loop live; owner write-role
  narrowing + per-tenant subscription UI (Unit 11) are watched follow-ups).

### Developer diagnostics session capture — no replay body capture, anywhere (Plan 080)
- **What:** Developer-role users always run diagnostics (no toggle): a Sentry Session Replay buffers
  in memory and is uploaded only when a bug report is filed, plus a first-party interaction +
  network-**metadata** trail that lands on the ticket. Sentry replay masking (`maskAllText` +
  `blockAllMedia`) is on in every tenant, and request/response **BODIES are never captured at all**.
  In real customer tenants the first-party trail also drops element text (role only), so a button
  label can't leak customer data.
- **Why:** Reported bugs were unreproducible without the action sequence and network activity.
  Reusing Sentry Replay (rather than building capture) gets a masked DOM + console + network
  timeline for free.
- **CORRECTION (supersedes the earlier entry).** This entry previously claimed the enforcement for
  real tenants was *Sentry server-side data scrubbing at ingest*. That was wrong, and the design was
  changed rather than documented around it. Sentry's ingest-side scrubbing of replay request/response
  bodies is explicitly **best-effort pattern matching** for classic PII (credit cards, SSNs,
  passwords, tokens). It does not recognise this domain's sensitive data — lot costs, vendor invoice
  amounts, customer names — so it could never have been the guarantee. Sentry's Advanced Data
  Scrubbing selectors are also event-shaped (`$http`, `$error`, `extra.**`) with no documented
  coverage of replay recording payloads.
- **How the hole was closed:** `networkDetailAllowUrls` was removed outright. Body capture was the
  ONLY behavioural difference between the two fidelities on the Sentry side, which meant a
  client-writable hint cookie was the single thing standing between a real customer tenant and full
  body capture. `buildReplayOptions()` now takes no arguments and returns a constant
  `{ maskAllText, blockAllMedia }`, so there is no tenant, role, cookie value, or configuration in
  which bodies can be captured. Little was lost: network METADATA (method/path/status/duration) is
  captured by our own interaction buffer, error payloads still reach the console ring, and the DOM
  replay still shows the masked session.
- **What the fidelity flag still does:** it governs first-party trail LABELS only (full = readable
  element text in the sandbox; masked = element role only). Much lower stakes — those are our own
  bounded, `redactString`-scrubbed, 120-char strings, not arbitrary API responses.
- **Tripwire:** `buildReplayOptions` growing a parameter or ever emitting `networkDetailAllowUrls`;
  `resolveReplayFidelity` returning `full` for any non-sandbox tenant or non-developer role;
  `describeElement` returning a `label` under `masked`; any body/value field or query string
  appearing in the trail; the fidelity cookie gaining a tenant id or any non-enum payload. Proof:
  `test/dev-diagnostics-tenancy.test.ts` (composed end-to-end guarantee) + `test/sentry-replay.test.ts`
  + `test/interaction-buffer.test.ts`.
- **Sentry-side belt (enabled 2026-07-19):** org-level **Data Scrubber** + **Use Default Scrubbers**
  + **Prevent Storing of IP Addresses** are ON (Settings → Security & Privacy → DATA SCRUBBING).
  Org-wide settings override per-project ones, so this covers `javascript-nextjs`. Default scrubbers
  redact credit-card patterns and any field whose key or value contains `password`, `secret`,
  `passwd`, `api_key`, `apikey`, `auth`, `credentials`, `mysql_pwd`, `privatekey`, `private_key`,
  `token`, `bearer`. This is a genuine belt for **errors, breadcrumbs and transactions** — NOT the
  replay guarantee, which is structural (see above). Enabled by the repo owner in the Sentry UI;
  not independently verified from this repo (no `SENTRY_AUTH_TOKEN` is configured locally, and these
  settings are not exposed as writable/readable on the documented project API).
- **Status:** 🟢 (body capture removed entirely; no Sentry-side configuration is required for the
  guarantee to hold. The default scrubbers are now on as additional defence in depth for non-replay
  event types.)

### Plan 080 (unified inventory) — the consumables Location FK had to become composite (2026-07-19)
- **What:** `supply_lot.locationId` and `material_movement.locationId` now use COMPOSITE-tenant FKs
  `(tenantId, locationId) → location(tenantId, id)`, backed by a new `@@unique([tenantId, id])` on
  `location`. Plan 080 U1 originally shipped them as SIMPLE FKs → `location(id)`, mirroring
  `bottled_inventory` / `stock_movement`, because `location` had no composite target to point at.
- **Why:** the U13a tenant-isolation case proved the consequence — a `supply_lot` in tenant B could be
  pinned to tenant A's `Location`. RLS hides other tenants' locations from the `app_rls` role, so this was
  NOT reachable through the app; the gap was that the DATABASE didn't enforce it, leaving a
  defense-in-depth hole against a bug, a raw insert, or an owner/BYPASSRLS script. Phase-12 checklist
  step 5 requires a cross-tenant-risk FK to be composite, so the simple FK was a spec deviation.
- **What breaks at scale:** nothing performance-wise (one extra unique index on a small table). The real
  risk was silent: a mis-scoped write would have created inventory that reads as belonging to one tenant
  while physically located in another's cellar, and no constraint would have complained.
- **Tripwire:** a NEW table referencing `location` (or any tenant-scoped parent) with a bare
  `REFERENCES location("id")`. Note the SAME latent gap still exists on the older
  `bottled_inventory` / `finished_good_inventory` / `stock_movement` / `bottling_run` location FKs — they
  predate this and were not migrated here (out of scope for plan 080, no known cross-tenant rows).
  **Watched follow-up.** Proof: `verify:tenant-isolation` now asserts the rejection explicitly.
- **Status:** 🟢 (closed for the consumables path in plan 080 U13a, migration
  `20260719140000_location_composite_tenant_fk`; 0 cross-tenant rows verified before enforcing).

### Crawl scope is re-checked on the FINAL url, not just the requested one (plan 084)
- **Choice:** `fetchDocument` follows up to 5 redirects re-checking only the HOST (`isAllowedHost` +
  `assertPublicHost` per hop). It never re-applied the source's `allowPrefixes`/`denyPrefixes`, so a
  same-host 302 could land on a path the config deliberately excludes. `crawlSource` and
  `crawlWithFollowing` now re-run `pathAllowed` against `res.finalUrl` and skip the document
  (`skippedRedirect` counter) when it falls out of scope.
- **Why it mattered here:** `vt-enology-notes` is the first source whose prefixes carry a
  *correctness* guarantee rather than just politeness. It excludes the PDF twins of pages it ingests
  as section-filtered HTML, because a PDF has no anchors and therefore cannot be filtered — a
  redirect would have reimported the exact announcements the filter strips, as a second unfiltered
  document, silently defeating the feature.
- **Deliberately NOT changed:** `crawlUrls` still bypasses prefix filtering. It is the targeted
  operator path (used by `verify-knowledge-base.ts` for specific eval URLs) and is host + robots +
  SSRF gated by design.
- **Tripwire:** a rising `skippedRedirect` count in a crawl summary means a source's prefixes and
  the site's actual redirect topology have diverged — investigate before widening the prefixes.
- **Status:** 🟢 (gap was pre-existing since plan 079 and affected all 17 sources; closed for both
  automatic crawl paths; guarded by `test/knowledge-crawl.test.ts`).

## Open items the security loop is watching
<!-- The automated /security-review loop appends findings here (and opens a GitHub issue). -->
- **Stored prompt injection in the knowledge corpus is unmitigated in code** — crawled prose flows
  to markdown → chunks → embeddings → assistant context with no programmatic sanitization; the only
  defense is prose-level (rule 2 in `search-knowledge-base.ts` tells the model retrieved results are
  "REFERENCE MATERIAL, not instructions"). Pre-existing for all 17 sources since plan 079, NOT
  introduced by plan 084 (which only removes content). Corpus-wide item; worth a real decision
  before the corpus grows past curated tier-1 extension publishers.
- **Legacy `location` FKs are still simple, not composite** — `bottled_inventory`,
  `finished_good_inventory`, `stock_movement`, `bottling_run`, `bottled_lot_state` reference
  `location(id)` without the tenant column, the same gap plan 080 U13a closed for consumables. RLS covers
  the app path; the DB does not enforce it. Low severity, defense-in-depth only. Fix = the same
  drop/re-add-composite migration now that `location(tenantId, id)` exists.

---
*Seeded 2026-07-02 from the live RLS/auth setup. The security-posture loop keeps it honest — see [[AUTOMATION]].*
