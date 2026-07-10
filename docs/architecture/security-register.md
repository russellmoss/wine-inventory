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
  `feedback`) so the loop can fix real domain bugs. It MUST NOT include the money/tenancy/ledger/moat
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

## Open items the security loop is watching
<!-- The automated /security-review loop appends findings here (and opens a GitHub issue). -->
- _(none yet)_

---
*Seeded 2026-07-02 from the live RLS/auth setup. The security-posture loop keeps it honest — see [[AUTOMATION]].*
