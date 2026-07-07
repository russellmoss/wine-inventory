---
title: "PHASE 2 — Bond + tax-class model (line-scoped, time-aware)"
type: feat
status: completed
date: 2026-07-06
branch: feat/phase-2-bond-tax-class
depth: deep
units: 13
---

## Build Progress (feat/phase-2-bond-tax-class)

- ✅ **S1 — schema** (commit `feat(phase-2): schema …`): Bond + ChangeOfTaxClassEvent models, line-level `sourceBondId`/`destBondId`, `ComplianceReport.bondId`/`filerSnapshot`, `OperationType += TRANSFER_IN_BOND, RETURN_TO_BOND`, `ComplianceReportStatus += NEEDS_AMENDMENT`. `prisma validate` + `generate` clean. `CHANGE_OWNERSHIP` NOT added (OQ-1 deferred).
- ✅ **S2 — migrations** (commit `feat(phase-2): migrations …`): 3 migrations (enum-only → schema+RLS+composite-FKs → idempotent backfill). **Applied to dev DB** and verified: Demo Winery primary bond created; 7/7 existing 5120.17 reports scoped to `bondId`. RLS fail-closed guard passed.
- ✅ **C1–C7 + V1–V6 COMPLETE** (C3 DEFERRED per OQ-1). All guards green vs Neon: `verify:bond` (17), `verify:taxclass` (13), `verify:taxpaid` (11), `verify:ttb` incl. AMEND-1 chain, non-regressed `verify:excise`/`verify:reverse`/`verify:reverse-transform`; full vitest 1500, lint 0-error, build clean, `verify:invariants` 27/27. BOND/TAXCLASS/TAXPAID/AMEND flipped `guarded`. **U1 partial** (NEEDS_AMENDMENT watermark + action seams shipped; rendered surfaces deferred as manual-QA fast-follow). See `PHASE-2-REPORT.md`. One STOP-gate call: RETURN_TO_BOND re-admits bulk → §A11 (user chose, resolving the plan's §B4-vs-bulk contradiction).

## Overview

Give the append-only ledger a real **Bond** entity and close the compliance model's four
biggest table-stakes gaps: **bond isolation with symmetric transfer-in-bond posting** (line-level,
time-aware), a **dated append-only Change-Of-Tax-Class event**, a **tax-paid terminal state** with an
explicit refund-flagged Returned-to-Bond re-admission, and **amended-chain integrity**. This unblocks
the two most valuable migration segments (custom-crush facilities and any >1-bond winery) and is a hard
prerequisite for the Phase-3 migration kernel (the seed must place multi-bond positions on the right
bond). Everything is built to honor the "class/bond is derived at report time, never a stored source of
truth" architecture Cellarhand already runs on.

## Problem Frame

Cellarhand has a correct, append-only 5120.17 core and a shipped 5000.24 excise engine — but **no bond
entity exists anywhere** (schema or code): §A lines 7/15 and §B 3/4/9 are static labels with no writer,
and the system implicitly assumes one bond per tenant (`analysis/incumbent-teardown/compliance.md` §4
[ABSENT]). Both incumbents treat multi-bond + transfer-in-bond as core (compliance.md §1.3, §2.3). A
custom-crush facility with N AP clients files N+1 reports today Cellarhand cannot represent at all.

Second, tax class is purely **ABV-derived** with no way to model an intentional cross-class blend, a
premature-declaration correction, or a hand-set class — the "riskiest divergence" from both incumbents
(compliance.md §6). Third, `REMOVE_TAXPAID` sits in the generic reverser's `CELLAR_TYPES`, so an
ordinary timeline "Undo" silently re-admits tax-paid volume in-bond, corrupting the tax-paid boundary
(the TAXPAID-1 hazard, live today). Fourth, correcting a FILED period surfaces only a dead
`downstreamStale` warning boolean — later FILED reports' begin-balances silently desync (compliance.md
§5.5).

If we do nothing: we cannot migrate or serve any multi-bond or custom-crush winery (the highest-value
segments), and the tax-paid + amended-chain gaps are latent compliance-corruption bugs.

## Requirements

- **MUST**: A `Bond` entity (registry #, penal sum, premises, owner link), tenant-scoped + RLS-isolated,
  full Phase-12 checklist.
- **MUST**: Bond affiliation posted at the **operation/line level and time-aware** (movement carries
  source + destination bond); the authoritative bond of a position is **derived point-in-time from the
  ledger**, mirroring `deriveTaxClass()`. Any lot-level "home bond" is projection-only, never authority
  (BOND-1).
- **MUST**: `TRANSFER_IN_BOND` op family — a single balanced op in one `runLedgerWrite` posting
  **symmetric** Removed-in-Bond (source, §A15/§B9) / Received-in-Bond (destination, §A7/§B3) to both
  bonds' reports (BOND-1). A one-sided or two-transaction post is a violation.
- **MUST**: Per-bond 5120.17 report scoping — one filed 5120.17 per bond; filing chains (carry-forward)
  never cross bonds. Extends `formScope`, never weakens it (COMPLIANCE-1).
- **MUST**: A dated, append-only **Change-Of-Tax-Class event**; ABV stays the suggested default but a
  winemaker can intentionally set/correct a class; posts §A 10/24/25 (TAXCLASS-1). Cross-class blend
  posts symmetric produced-by/used-for-blending (§A 5/20); the winemaker is warned.
- **MUST**: `REMOVE_TAXPAID` is a **terminal one-way state** — not re-admissible via `reverseOperationCore`;
  only a distinct **refund-flagged `RETURN_TO_BOND`** event re-admits (§B4) (TAXPAID-1).
- **MUST**: **AMEND-1** — correcting a FILED period marks all later FILED reports in that **form + bond**
  chain `NEEDS_AMENDMENT` and regenerates begin-balances down the chain, atomically with the correction.
- **MUST**: Flip BOND-1 / TAXCLASS-1 / TAXPAID-1 / AMEND-1 register notes `planned → guarded` with real
  `verify:` fields; new `verify:bond`, `verify:taxclass`, `verify:taxpaid` guards; AMEND-1 by extending
  `verify:ttb`. `verify:tenant-isolation` extended for every new tenant-scoped table.
- **MUST**: End green per the cross-phase checklist (full vitest, build, lint, `verify:invariants` +
  `verify:tripwires` + all phase `verify:*`, `verify:ttb`/`verify:excise` non-regressed).
- **SHOULD**: `CHANGE_OWNERSHIP` — atomic append-only ownership/bond change with **no** follow-up
  zero-volume Measurement ritual (kills vintrace's worst quirk; runbook Exact Scope + §A.3.8). *Scope
  confirmation is Open Question OQ-1 — the user's session brief omitted it; the runbook includes it.*
- **SHOULD**: Harden `removeTaxpaidCore` commandId idempotency to the full crush-core pattern (it's
  governed code we're already editing for TAXPAID-1). *Scope is OQ-5.*
- **NICE**: Bond CRUD Settings surface (admin-gated) beyond the server actions.

## Scope Boundaries

**In scope:**
- Bond entity; line-level, time-aware bond posting + point-in-time bond derivation; `TRANSFER_IN_BOND`;
  per-bond 5120.17 scoping; Change-Of-Tax-Class event + point-in-time class resolution; cross-class blend
  §A 5/20 posting; `REMOVE_TAXPAID` terminal + `RETURN_TO_BOND`; AMEND-1 cascade; the four guards.

**Out of scope (kept in their roadmap homes / later phases):**
- **International compliance** (AU WET / NZ excise / CA Winegrower / state tax-class thresholds) —
  partner-gated Phase-14 sub-phase (compliance.md §5, §7.7). Explicitly OUT.
- **CBMA controlled-group apportionment** — CBMA-1 stays `deferred`, no code (reviewer mod 3).
- **DSP / 5110.40 / Part VI, formula wine / Part IX, nonbeverage / Part VIII** — documented coverage
  gaps, not built (compliance.md §7.8).
- **Migration-kernel work** (external-file seed, `LegacyOperation`, reconciliation pack) — Phase 3. The
  `MIGRATE-1` `appliesTo` repoint stays parked. Any discovery requiring a kernel-contract or Phase-3+
  decision is an **escalation, not an improvisation**.
- **Owner-Based Permission matrix** — Phase 23. High-risk bond ops get only the coarse admin/owner gate
  (conventions).
- **In-place mutate/delete on the ledger** — forbidden (§C.1). Tax-class change, ownership change, and
  every reversal/re-admission are **events**, append-only.

## Research Summary

### Codebase Patterns (file:line — from two Explore agents)

**Ledger cores (`src/lib/ledger/`)**
- `runLedgerWrite<T>(fn)` — `write.ts:38-67`. SERIALIZABLE + P2034 retry; sets `app.tenant_id` GUC as the
  first statement (re-run on retry). Every new `…Tx` core MUST run inside one `runLedgerWrite`.
- `writeLotOperation(tx, input)` — `write.ts:107-294`. The composition target: `assertBalanced`,
  cross-tenant guard, immutable `LotOperation` create, `createMany` lines with durable `lotCode`/`vesselCode`
  snapshots (`write.ts:183-199`), then folds VesselLot / barrel-fill cost / BottledLotState /
  vessel_component. Does **not** accept `metadata` — cores `tx.lotOperation.update` right after
  (`crush-core.ts:310`, `removal-core.ts:65`).
- `…Tx(tx,…)` + wrapper convention: canonical `rackWineTx` (`rack-core.ts:83-200`) + `rackWineCore`
  (`rack-core.ts:204-206`); transform `crushLotTx`/`crushLotCore` (`crush-core.ts:110-394`).
- Symmetric posting already exists: `planLedgerRack` (`math.ts:94-128`) emits `-deduct` (source vessel),
  `+(deduct-loss)` (dest vessel), `+loss` (external) — the structural analog for `TRANSFER_IN_BOND`
  (add per-leg bond). `planVesselLoss` (`math.ts:402-427`) is the REMOVE_TAXPAID shape (matched pair to
  a `vesselId:null` counter-account).
- `OperationType` enum: `prisma/schema.prisma:876-911`; **sole TS mirror** `OPERATION_TYPES`
  (`vocabulary.ts:9-38`) — must be kept in sync. Windows enum rule precedent: isolated `ALTER TYPE …
  ADD VALUE IF NOT EXISTS` migration (`prisma/migrations/20260701020100_remove_taxpaid_optype/`,
  and the multi-value `20260630000000_crush_press_ferment_enums/`).
- `LotOperationLine` — `schema.prisma:1375-1401`: `tenantId, id, operationId, lotId, vesselId?, deltaL
  Decimal(10,2) CHECK <>0, reason?, bucket (VESSEL|EXTERNAL|BOTTLE_STORAGE), bottleDelta?, lotCode,
  vesselCode`. **Where the bond column goes** (line-level, next to the snapshots). Runtime `LedgerLine`
  type: `math.ts:21-34`; persisted at `write.ts:183-199`. Note the `deltaL <> 0` CHECK = LEDGER-2
  (no-op lines forbidden) — a zero-volume event cannot be a ledger line.
- `reverseOperationCore` — `reverse.ts:107-154`. Family `Set`s at `reverse.ts:57-63`; `reversibilityOf`
  verdict at `reverse.ts:77-88`. **`REMOVE_TAXPAID` is in `CELLAR_TYPES` (`reverse.ts:59`)** → reverses
  via `correctOperationCore` → **re-admits tax-paid volume (TAXPAID-1 hazard, live)**. LEDGER-10 (every
  reversal writes a new CORRECTION, never mutates — guarded by `verify:reverse`), LEDGER-11 (downstream
  guard `laterTouchedKeys` `reverse-guard.ts:16-28` → `planCorrection` `math.ts:441-465`, guarded by
  `verify:reverse-transform`), LEDGER-3 single-correction (`correctsOperationId @unique` + `correctedBy`
  early-throw `reverse.ts:117`).
- commandId idempotency: full pattern in crush-core (`findByCommandId` pre-check `crush-core.ts:81-101`
  + `isCommandConflict` P2002 catch `crush-core.ts:71-79`). **`removeTaxpaidCore` has the shortcut**
  (stores commandId, no pre-check — `removal-core.ts:27,59`); new cores follow the full pattern.

**Compliance engine (`src/lib/compliance/`)**
- Tax class is **derived, never stored**: `deriveTaxClass()` pure (`tax-class.ts:51-99`) + as-of resolver
  `resolveClassesForLots` (`generate.ts:85-125`) + per-lot override map (`ComplianceReport.overrides
  Json`) + `Lot.taxAbvOverride`. The `Lot` stores only derivation *inputs* (`ProductType`,
  `CarbonationMethod`, `SparklingMethod`) — `schema.prisma:937-942` states class is derived at report
  time, never a Lot column. **This is the exact pattern bond derivation must mirror.**
- `form-type.ts:11-17` — `OPS_FORM`/`EXCISE_FORM`/`formScope()`; every report query spreads `formScope(...)`
  (COMPLIANCE-1). Per-bond scoping extends this pattern.
- `form-map.ts:85-144` (`mapLineToForm`) — **no `TRANSFER_IN_BOND` case**; §A7/15 + §B3/9 exist only as
  static labels (`form-labels.ts:23,29,47,48,51`). `DISPOSITION_LINES` (`form-map.ts:61-73`) has **no
  `RETURNED_TO_BOND`** (§B4 label unused). Cross-class blend already sets `partXReason` + posts A5/A20
  (`form-map.ts:120-124`) — the pattern the Change-Of-Tax-Class event mirrors.
- `ComplianceReport` — `schema.prisma:1927-1962`: `formType` discriminator, `status` **(only `DRAFT|FILED`
  — `schema.prisma:955-958`; no `NEEDS_AMENDMENT`)**, `version (ORIGINAL|AMENDED)`, `cadence`,
  **`onHandEnd Json` (the carry-forward source, `:1944`)**, `computed Json`, `overrides Json`,
  `amendsReportId`, `amends`/`amendedBy` self-relation. **No `bondId`.**
- `ComplianceProfile` — `schema.prisma:1965-1991`: per-tenant filer identity (`registryNumber`, EIN,
  operated-by, cadence defaults, `isEftPayer`). `@@unique([tenantId])`. No bond fields. *(→ OQ-2: where
  per-bond filer identity lives.)*
- Carry-forward: `foldPeriod` (`generate.ts:229-381`), begin block `generate.ts:267-284` = prior FILED
  report's `onHandEnd` via `formScope + periodEnd < start`, orderBy `periodEnd desc, generatedAt desc`.
  **No period→period FK** (implicit chain). Persisted back at `generate.ts:450`.
- **AMEND-1 gap**: `downstreamStale` boolean (`generate.ts:458-463`) is only surfaced as a warning
  (`compliance/actions.ts:105`); nothing regenerates later begin-balances. Excise is stateless YTD
  (`generate-excise.ts:11-13`) so **AMEND-1 chain-propagation is a 5120.17-only concern**.
- COMPLIANCE-2 enforced by begin-from-FILED-same-formType + the balanced fold (`period-fold.ts:143-168`);
  filing blocked if `balanced === false` (`generate.ts:488-490`).
- verify regressions: `verify:ttb` (`scripts/verify-ttb.ts`) **files → reverses a removal → amends** and
  asserts the amended report foots + A14 class-b shrank — **this test reverses a removal via the generic
  path and MUST be updated** to the new terminal semantics (RISK R1). `verify:excise` asserts a FILED
  excise return does NOT feed the 5120.17 carry-forward (the COMPLIANCE-1 regression).

**Confirmed ABSENT**: no `Bond` model/column/op; `bond` in code is only unused form-line labels + an
in-bond/out-of-bond *conceptual* framing. All five Phase-2 additions are greenfield.

### Prior Learnings (Phase-0 / Phase-1 precedent — carried conventions)

- **Surprise 1 (Phase-1):** composite **Prisma relations** blow TS's type-instantiation depth (degraded
  `VesselLot`/`Lot` to `{}` in `rack-core.ts`). **Fix carried forward: drop Prisma relations; the
  composite `(tenantId, refId) → (tenantId, id)` FKs live in raw SQL** (the `work_order_task → lot`
  convention, K11). Queries use scalar ids. **All new Phase-2 FKs (Bond→organization, line→Bond,
  report→Bond, event→Lot) follow this — raw SQL composite FKs, no Prisma `@relation`.**
- **RLS merged into the table-creation migration** (council C2) — not a separate RLS migration.
- **Partial uniques in raw SQL** where Prisma can't express them (Phase-1 C1/C4); beware the
  Postgres NULL-distinct trap on nullable unique columns.
- **`@@unique([tenantId, id])`** on any table targeted by a cross-tenant composite FK (checklist step 5).
- **`commandId` → `@@unique([tenantId, commandId])`** (tenant-scoped, never bare global — Phase-1 E1).
- Windows enum rule (isolated `ALTER TYPE`, committed before any write); `migrate diff → deploy`, stop
  dev server before `db:generate`; `verify:*` runs inside `runAsTenant("org_demo_winery", …)`.
- Branch off current HEAD (main is branch-protected); land via PR → CI → squash-merge → delete branch.
- Ignore the known pre-broken `invariant-drift.test.ts` load error in vitest output.

### External Research
None required — this is entirely internal domain + TTB-form logic already modeled in the corpus
(`analysis/incumbent-teardown/compliance.md` cites every incumbent action→line mapping).

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| **Bond authority** | Line-level `sourceBondId`/`destBondId` on `LotOperationLine`; authoritative bond **derived point-in-time** via a new `resolveBondsForLots` mirroring `resolveClassesForLots` | Mutable `Lot.bondId` as source of truth | BOND-1: a mutable home-bond column is projection-only; the ledger is authority. Mirrors the shipped `deriveTaxClass` architecture. |
| **Change-Of-Tax-Class shape** | A dedicated tenant-scoped, **append-only `ChangeOfTaxClassEvent` table** (dated, from/to class, actor, commandId), read point-in-time by `resolveClassesForLots` and posted §A 10/24/25 at report time | A zero-volume `CHANGE_TAX_CLASS` ledger op | A tax-class change carries **no volume** → a ledger line would violate the `deltaL <> 0` CHECK / LEDGER-2. The class is derived, not folded, so it doesn't belong in the volume fold. The event supersedes the ad-hoc `overrides Json` as the point-in-time class authority. |
| **`TRANSFER_IN_BOND` structure** | New op family, `transferInBondTx` composing `writeLotOperation` (symmetric legs carrying per-leg bond), one `runLedgerWrite`; form-map posts §A15/§B9 (source) + §A7/§B3 (dest) | Two separate ops (out + in) | BOND-1 requires atomic symmetric posting in **one** transaction; two ops could half-commit. Structurally the rack family (`planLedgerRack`). |
| **`REMOVE_TAXPAID` reversal** | Remove from `CELLAR_TYPES`; `reversibilityOf` returns `reversible:false` with a bespoke reason routing to `RETURN_TO_BOND`; a distinct refund-flagged `RETURN_TO_BOND` op is the only re-admission (posts §B4) | Leave in `CELLAR_TYPES` (status quo) | TAXPAID-1: an ordinary compensating reversal silently re-admits tax-paid volume in-bond. Terminal-state guard is the whole point of the invariant. |
| **AMEND-1 begin-balance regeneration (parked design Q-a)** | **Synchronous, in-transaction** `NEEDS_AMENDMENT` marking of the entire downstream (formType, bond) FILED chain; begin-balance **figures regenerate deterministically at amended-report generation** via the existing carry-forward (the corrected period's amended `onHandEnd` flows forward). **Reject the queued-job + `NEEDS_CALCULATION` lock for v1.** | Queued background job with a `NEEDS_CALCULATION` lock | (i) The queue leaves the chain **transiently inconsistent** — the exact silent-desync hazard the invariant exists to prevent. (ii) The chain is short (monthly ⇒ a handful of rows) and marking is O(rows); no persisted begin-store to rebuild ("carry-forward makes this cheap"). (iii) The repo has **no job-queue infra**. **At-scale escape hatch** noted: if marking/eager-recompute risks exceeding `LEDGER_TX_TIMEOUT_MS` (custom-crush × many bonds × long chains), move to a `NEEDS_CALCULATION` lock + background regen — recorded as a scale-register tripwire, not built now. |
| **Brand-new blend-lot tax class (parked design Q-b)** | A newly-minted blend child's class is **derived** (`deriveTaxClass`) from the blended wine's resolved as-of ABV + inherited product attributes — the same point-in-time derivation as every lot; **not** a stored/pinned inherited label. An operator who wants an intentional class records a **Change-Of-Tax-Class event**. §A 5/20 produced-by/used-for-blending still posts because the derived child class differs from the source legs' classes at the movement; winemaker warned on cross-class sources; absent a post-blend reading, `deriveTaxClass` falls back to class A + `needsAbvReview` (surfaces as a filing blocker, never a silent misclassification) | Pin a chosen class on the child at creation (InnoVint-style stored attribute) | Preserves "class is derived, never stored" (the entire compliance model); a physical blend yields a real wine whose federal class **is a fact of its measured ABV**. Pinning reintroduces a mutable stored class as source-of-truth (contradicts BOND-1/TAXCLASS-1) and creates a second correction surface that can drift from ABV. TAXCLASS-1 deliberately fixed only the existing-receiving-lot case; this extends it consistently. |
| **Per-bond scoping mechanics** | Add nullable `ComplianceReport.bondId` (null = legacy single-bond); extend `formScope` with a bond dimension; carry-forward chains per **(formType, bondId)**; filer identity resolves **bond-first, tenant-profile fallback** | Per-bond `ComplianceProfile` (drop the `tenantId` unique) | Keeps the shipped tenant-level profile for cadence/EFT defaults; `Bond` owns registry #/penal sum/premises; smaller blast radius on an existing unique. *(Confirm at OQ-2.)* |
| **New op reversibility** | `TRANSFER_IN_BOND` reversible (symmetric inverse, both bonds); `CHANGE_OWNERSHIP` reversible (event inverse); `RETURN_TO_BOND` is itself a re-admission (not reversed by the generic path — it's the refund event) | — | Extends LEDGER-10 append-only reversal; keeps the timeline "Undo" honest per family. |

## Implementation Units

> **Migration ordering note (Windows enum rule):** every `ALTER TYPE … ADD VALUE` lands in an isolated,
> enum-only migration that **commits before** any migration or code writes the value. Table+column+RLS
> migrations follow. Use `migrate diff → deploy`; stop the dev server before `db:generate`.

### Unit S1: Schema — Bond, ChangeOfTaxClassEvent, line-level bond, report bond scope, enum additions
**Goal:** All new models/columns/enums declared in `prisma/schema.prisma` per the Phase-12 checklist.
**Files:** `prisma/schema.prisma`; `src/lib/ledger/vocabulary.ts` (`OPERATION_TYPES` mirror); `src/lib/compliance/types.ts` (status/enum mirrors); `src/lib/tenant/models.ts` (confirm NOT added to `GLOBAL_MODELS`).
**Approach:**
- `Bond` — tenant-scoped: `tenantId @default("")` + `@@index([tenantId])`, `registryNumber`, `penalSum Decimal`, `premises` (address parts), `ownerId String?` (org/tenant-owner link), `isPrimary Boolean`, `@@unique([tenantId, registryNumber])`, `@@unique([tenantId, id])` (composite-FK target). **No Prisma relations** (Surprise 1) — FK to `organization` via raw SQL in S2.
- `ChangeOfTaxClassEvent` — tenant-scoped, append-only: `lotId`, `fromClass String?`, `toClass String`, `observedAt`, `actor`, `reason String?`, `@@unique([tenantId, commandId])`, `@@unique([tenantId, id])`, indexes on `(tenantId, lotId, observedAt)`. Composite FK → `lot` in S2 (raw SQL).
- `LotOperationLine`: add `sourceBondId String?`, `destBondId String?` (nullable; line-level; null ⇒ derivation defaults to primary bond). Composite FK `(tenantId, bondId) → bond(tenantId, id)` in S2 (raw SQL).
- `ComplianceReport`: add `bondId String?` + a composite **`@@index([tenantId, formType, bondId, status, periodEnd, generatedAt])`** (council Codex-SF — the carry-forward + downstream-mark scans need `status`/`periodEnd`/`generatedAt`, not just the 3-col prefix; raw SQL if a descending/partial index is warranted). Snapshot the resolved **filer identity** onto the report row at FILE time (council Codex-DESIGN2 / OQ-2) so amended reprints are stable.
- `ChangeOfTaxClassEvent`: add `volumeAtEvent Decimal?` (stamped at write) + index `(tenantId, lotId, observedAt)` (council Codex-SF).
- Enums: `OperationType += TRANSFER_IN_BOND, RETURN_TO_BOND` (**`CHANGE_OWNERSHIP` DEFERRED — OQ-1 resolved; not added this phase**) — mirror in `vocabulary.ts`, and handle **exhaustively** in `reverse.ts`/`form-map.ts`/`form-labels.ts` (compile-time exhaustive switch, council Codex-SF); `ComplianceReportStatus += NEEDS_AMENDMENT` (mirror in `types.ts`).
**Tests:** typecheck only (schema unit). `db:generate` clean.
**Depends on:** none.
**Patterns to follow:** Phase-1 `LotIdentifier`/`LotCodeEvent` table shape; `LotOperationLine` `schema.prisma:1375`; `ComplianceReport` `schema.prisma:1927`.
**Verification:** `npx prisma validate`; `db:generate` no errors; `OPERATION_TYPES` matches the enum.

### Unit S2: Migrations — isolated enum ALTERs, then tables+columns+RLS (merged), then backfill
**Goal:** Reversible migrations that add the enums, tables, columns, RLS, composite FKs, app_rls grants, and backfill existing data.
**Files:** `prisma/migrations/*_bond_taxclass_enums/`, `*_bond_taxclass_schema/`, `*_bond_taxclass_backfill/`.
**Approach:**
- **M1 (enum-only):** `ALTER TYPE "OperationType" ADD VALUE IF NOT EXISTS` ×3 + `ALTER TYPE "ComplianceReportStatus" ADD VALUE IF NOT EXISTS 'NEEDS_AMENDMENT'`. Header comment documents the commit-before-write rule.
- **M2 (schema + RLS merged, council C2):** CREATE `Bond`, `ChangeOfTaxClassEvent`; ALTER `LotOperationLine` ADD `sourceBondId`/`destBondId`; ALTER `ComplianceReport` ADD `bondId` + index. Raw-SQL composite FKs: `Bond(tenantId,ownerId?)`/`Bond→organization`, `LotOperationLine (tenantId, sourceBondId)/(tenantId, destBondId) → Bond(tenantId,id)` ON DELETE RESTRICT, `ChangeOfTaxClassEvent (tenantId, lotId) → Lot(tenantId,id)`, `ComplianceReport (tenantId, bondId) → Bond(tenantId,id)`. `ENABLE` + `FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy (USING + WITH CHECK on `current_setting('app.tenant_id', true)`, fail-closed) on the 2 new tables. app_rls DML grants. Rollback SQL in each header.
- **M3 (backfill, idempotent):** create each tenant's **primary `Bond`** from `ComplianceProfile.registryNumber`/premises (`isPrimary=true`); set `ComplianceReport.bondId = primaryBond.id` for all existing reports; leave line bond columns NULL (derivation defaults to primary bond — see OQ-3). `SET NOT NULL` on `Bond.tenantId` after backfill. Deterministic markers.
**Tests:** migration applies clean on the dev DB; rollback SQL validated; `verify:tenant-isolation` (S-later) will cover RLS.
**Depends on:** S1.
**Execution note:** M1 must deploy before any code/migration writes the new values.
**Patterns to follow:** Phase-1 `_naming_identity_schema` (merged RLS) + `_naming_identity_backfill`; `20260701020100_remove_taxpaid_optype`.
**Verification:** `prisma migrate diff` empty after deploy; new tables have RLS forced; existing reports have `bondId`.

### Unit C1: Bond entity — point-in-time derivation + CRUD
**Goal:** A `deriveBond`/`resolveBondsForLots` resolver mirroring `deriveTaxClass`/`resolveClassesForLots`, plus admin-gated Bond CRUD server actions.
**Files:** `src/lib/compliance/bond.ts` (new); `src/app/(app)/compliance/**` or `settings/**` actions (new); read helpers.
**Approach:** `deriveBond(lotId, asOf)` reads the latest bond-carrying op line (dest bond of the most-recent `TRANSFER_IN_BOND`/`CHANGE_OWNERSHIP` ≤ asOf), defaulting to the tenant's primary bond when none.
- **Asymmetric fallback rule (council Codex-CRIT2/DESIGN3):** default-to-primary is legal **only** for legacy/origination rows with no bond history. A **bond-moving op** (`TRANSFER_IN_BOND`/`RETURN_TO_BOND`/`CHANGE_OWNERSHIP`) must carry an **explicit, non-null** bond and never derive primary implicitly; `deriveBond` encodes this asymmetry.
- **Lineage-child rule (eng A4, refined by council Gemini-CRIT3):** a **single-parent** split/lees child walks to its parent's derived bond as-of the lineage event (not primary). A **multi-parent BLEND cannot straddle two bonds** — wine can't be in a superposition of premises. Therefore **cross-bond blends are BLOCKED at commit**: all blend parents must resolve to the **same** bond; if they differ, the operator must `TRANSFER_IN_BOND` a parent first. (This replaces the ambiguous "walk to parents" for the multi-parent case.)
- `resolveBondsForLots(ids, asOf)` batches it (mirror `generate.ts:85-125`, no N+1). Bond CRUD via `adminAction`.
**Tests:** pure/DB test — a legacy lot derives primary; a bond-moving op with a null bond is **rejected**; after a `TRANSFER_IN_BOND` a lot derives the dest bond as-of; a **single-parent** child of a lot on a secondary bond derives the parent's bond, not primary (A4); a **cross-bond blend is refused** (Gemini-CRIT3).
**Depends on:** S1, S2.
**Patterns to follow:** `tax-class.ts:51`, `generate.ts:85-125`.
**Verification:** covered by `verify:bond` (V1).

### Unit C2: TRANSFER_IN_BOND op family (symmetric, atomic)
**Goal:** A `transferInBondTx`/`transferInBondCore` that posts a single balanced op carrying source+dest bond, and a form-map case posting symmetric §A15/§B9 + §A7/§B3.
**Files:** `src/lib/compliance/transfer-in-bond-core.ts` (new); `src/lib/ledger/math.ts` (bond-aware leg planner or extend `planLedgerRack`); `src/lib/ledger/write.ts` + `math.ts` `LedgerLine` (carry `sourceBondId`/`destBondId`); `src/lib/compliance/form-map.ts` (new `case "TRANSFER_IN_BOND"`); `src/lib/ledger/reverse.ts` (register reversible).
**Approach:** Reuse the rack symmetric-leg shape; each leg stamps its bond via a **discriminated input type** so the compiler forces `sourceBondId`/`destBondId` (non-null, source≠dest) on this op (council Codex-CRIT2 + type-safety SF). One `runLedgerWrite`. Full crush-core commandId idempotency. `form-map` posts source removed-in-bond + dest received-in-bond. Register in `reversibilityOf` + the dispatch `switch` (symmetric inverse reversing both bonds' postings). **Reversal + AMEND-1 on BOTH chains (council Codex-CRIT1 / Gemini-SF2):** the cascade + fold derive affected scopes from the **emitted lines** (each carries its bond), so a `TRANSFER_IN_BOND` (or its reversal) into a FILED period marks **both** the source and destination `(formType, bond)` chains `NEEDS_AMENDMENT` — never one side.
**Tests:** covered by `verify:bond` (V1) — symmetric posting on both bonds; atomic (one op).
**Depends on:** C1.
**Patterns to follow:** `rack-core.ts:83-206`, `planLedgerRack` `math.ts:94-128`, `form-map.ts:120-124`.
**Verification:** `verify:bond`; `verify:reverse` (new family reverses cleanly).

### Unit C3: CHANGE_OWNERSHIP op (atomic, no zero-volume ritual) — *SCOPE OQ-1*
**Goal:** An append-only `changeOwnershipTx`/`changeOwnershipCore` that changes ownership + bond in one op with **no** follow-up zero-volume Measurement (kills vintrace's quirk).
**Files:** `src/lib/compliance/change-ownership-core.ts` (new); `form-map.ts` (bond-change posting reuses the transfer-in-bond lines when the bond changes); `reverse.ts` (register).
**Approach:** Writes ownership change + (if bond changes) the symmetric transfer-in-bond posting, atomically. ESTATE ↔ CUSTOM_CRUSH_CLIENT re-routing. Admin-gated.
**Tests:** DB test — ownership+bond change in one op, no ritual op appended; reversible.
**Depends on:** C2.
**Execution note:** ⛔ **DEFERRED (OQ-1 resolved — council consensus, user go).** Do NOT build C3 this phase. The bond-change *posting* it would share is already in C2; `CHANGE_OWNERSHIP` (with alternate-proprietor logic + inventory snapshots) is a Phase-2 fast-follow. Do **not** add `CHANGE_OWNERSHIP` to the `OperationType` enum this phase (no half-defined enum member — council Codex-DESIGN). Record in `PHASE-2-REPORT.md`.
**Patterns to follow:** `transitionStateCore` (`src/lib/ferment/transition-core.ts`) event shape; C2.
**Verification:** folded into `verify:bond`.

### Unit C4: Change-Of-Tax-Class event + point-in-time class resolution + §A 5/20/10/24/25
**Goal:** A dated append-only `ChangeOfTaxClassEvent` writer, class resolution that reads it point-in-time, and form-map postings for change-of-class and cross-class blend.
**Files:** `src/lib/compliance/tax-class-event-core.ts` (new); `src/lib/compliance/generate.ts` (`resolveClassesForLots` reads latest event as-of period end, then `deriveTaxClass` fallback); `src/lib/compliance/form-map.ts` (§A 10/24/25 for change events; confirm §A 5/20 cross-class blend posting fires); blend core warn-on-cross-class.
**Approach:** Append-only event (from/to class, `observedAt`, actor, commandId). `resolveClassesForLots` precedence: latest in-scope `ChangeOfTaxClassEvent` → `Lot.taxAbvOverride`-driven `deriveTaxClass`.
- **Explicit volume semantics (council Codex-CRIT4 / Gemini-CRIT1):** the event posts the lot's **on-hand volume as-of `observedAt`** to §A 10 (out of old class) / §A 24/25 (into new / returned-to-fermenters). That volume comes from **the same period fold the report already runs** (not a separate millisecond replay). **Stamp `volumeAtEvent` onto the event row at write time** so the row is self-describing + auditable. A **no-op / idempotent class assignment emits nothing**. *(Ledger-op alternative — a balanced self-transfer — was raised by Gemini and rejected: it would require putting tax class on the ledger line, contradicting the settled "class is derived, never stored" architecture. The volume-snapshot addresses the real reconstruction concern.)*
- **No double-count with cross-class blend (council Gemini-SF1 / R6):** if a Change-Of-Tax-Class event **corrects a cross-class blend child within the same reporting period**, the fold must **adjust the blend's target class** rather than post a *separate* §A 10/24/25 — otherwise the same volume is reported twice (blend §A5/20 + class-change §A10/24/25). The two form-map paths stay mutually exclusive per volume.
- **Part VII guardrail (council Gemini-CRIT2, → OQ-7):** the brand-new-blend derivation must **not** promote a null-ABV *fermenting* lot into Part I (class A). Declaring out of fermenters posts §A2 (produced by fermentation) / §A25 (returned to fermenters), not a silent class-A bulk promotion. Full FERMENTING-state / `DECLARE_WINE` handling is likely beyond Phase-2 scope — see OQ-7.
- Brand-new blend lot: **derived** per Key Decision (b); warn on cross-class sources.
**Tests:** covered by `verify:taxclass` (V2).
**Depends on:** S1, S2.
**Patterns to follow:** `resolveClassesForLots` `generate.ts:85-125`; cross-class blend `form-map.ts:120-124`.
**Verification:** `verify:taxclass`.

### Unit C5: REMOVE_TAXPAID terminal + RETURN_TO_BOND (TAXPAID-1) — the load-bearing reverser change
**Goal:** Make `REMOVE_TAXPAID` non-reversible via `reverseOperationCore`; add a refund-flagged `RETURN_TO_BOND` re-admission op posting §B4.
**Files:** `src/lib/ledger/reverse.ts` (remove `REMOVE_TAXPAID` from `CELLAR_TYPES`; `reversibilityOf` bespoke non-reversible verdict); `src/lib/compliance/return-to-bond-core.ts` (new); `src/lib/compliance/form-map.ts` (`DISPOSITION_LINES` add `RETURNED_TO_BOND → §B4`); `src/lib/compliance/removal-core.ts` (harden commandId idempotency — OQ-5); **`scripts/verify-ttb.ts` (update the "reverse a removal" step to `RETURN_TO_BOND`)** (RISK R1).
**Approach:** `RETURN_TO_BOND` is a distinct op (`refundFlagged` metadata) re-admitting an **explicit volume** in-bond (**partial return supported — a volume, not a state toggle**, council Gemini-SF3), full idempotency pattern, admin-gated. `reversibilityOf(REMOVE_TAXPAID)` → `{reversible:false, code:"taxpaid-terminal", reason:"Tax-paid removal is terminal; use Return-to-Bond (refund)"}`.
- **Central admissibility guard (council Codex-CRIT3 — the real TAXPAID-1 enforcement):** `reversibilityOf(false)` alone only closes the *Undo* path; it does **not** stop an `ADJUST`/`CORRECTION`/topping positive in-bond increase from re-admitting tax-paid volume behind the reverser's back. Add a **guard at the ledger-write chokepoint** (`writeLotOperation` or a shared admissibility check): a **positive in-bond `deltaL` for a lot that carries prior `REMOVE_TAXPAID` volume is rejected** unless the op is `RETURN_TO_BOND` (or a legit origination/transfer). This is the invariant's teeth — `verify:taxpaid` must exercise the ADJUST path, not just Undo.
- **Fold OQ-5 here (eng CQ3):** harden `removeTaxpaidCore` to the full crush-core commandId idempotency pattern.
- **`RETURN_TO_BOND` does NOT amend the FILED 5000.24 excise return (OQ-6 resolved, council Gemini):** a physical return-to-bond is a **decreasing adjustment/credit on the CURRENT-period 5000.24** (Schedule B) or a Form 5620.8 claim — amending the prior excise return would falsify filed history. AMEND-1 stays 5120.17-only. `RETURN_TO_BOND` still triggers the 5120.17 AMEND-1 cascade if backdated into a filed 5120.17 period (via C7's broadened trigger). **Flag for accountant confirmation** (runbook posture).
**Tests:** covered by `verify:taxpaid` (V3). **Regression (IRON RULE, eng T1):** `verify:reverse` MUST assert `REMOVE_TAXPAID` is now non-reversible (its verdict flipped from the current `CELLAR_TYPES` membership) — update the existing `verify:reverse` case, don't just add. Update `verify:ttb`'s "reverse a removal" step to `RETURN_TO_BOND` (R1).
**Depends on:** C1 (bond context for the returned volume).
**Patterns to follow:** `planVesselLoss` `math.ts:402-427`; `removal-core.ts`; `reverse.ts:57-88`.
**Verification:** `verify:taxpaid`; `verify:reverse` still green; `verify:ttb` green after the test update.

### Unit C6: Per-bond 5120.17 report scoping
**Goal:** One filed 5120.17 per bond; carry-forward chains never cross bonds; filer identity bond-first.
**Files:** `src/lib/compliance/form-type.ts` (add a bond-scope helper alongside `formScope`); `src/lib/compliance/generate.ts` (`foldPeriod` begin-block + `generateReport` `downstreamStale` count filter by `bondId`; report reads line-level `deriveBond`); `src/app/(app)/compliance/**` (bond selector — minimal).
**Approach:** Carry-forward query gains `bondId` in `where` (`generate.ts:269-273` + `:462`). A report is generated per (formType, bond). Filer identity resolves from `Bond` first, `ComplianceProfile` fallback (OQ-2). Single-bond tenants (bondId = primary) chain exactly as before (backfilled).
**Tests:** `verify:bond` asserts per-bond chains don't cross; `verify:ttb`/`verify:excise` non-regressed (single-bond).
**Depends on:** C1, C2.
**Patterns to follow:** `form-type.ts:11-17`, `generate.ts:229-381`.
**Verification:** `verify:bond`; `verify:ttb` + `verify:excise` green.

### Unit C7: AMEND-1 amended-chain propagation
**Goal:** Any op appended into an already-FILED period marks all later reports in the (formType, bondId) chain `NEEDS_AMENDMENT` atomically, without breaking the downstream carry-forward.
**Files:** `src/lib/compliance/amend.ts` (new — `cascadeAmendmentMarks(tx, formType, bondId, observedAt)`); `src/lib/cellar/correct.ts` + the new bond/return cores (call the cascade inside the op's `runLedgerWrite` when `observedAt` lands in a FILED period); `src/lib/compliance/generate.ts` (replace the dead `downstreamStale` boolean `:458-463` with real cascade marking; fix the begin-balance query per A2).
**Approach:** Synchronous, in-transaction marking (Key Decision a).
- **Broadened trigger (eng A1/A3):** the cascade fires for **any appended op whose `observedAt` falls at/inside an already-FILED period** — not only `CORRECTION`. The hook is one `cascadeAmendmentMarks(tx, …)` seam in the compliance module.
- **Scopes derived from emitted lines, mark ALL versions (council Codex-CRIT1/SF, Gemini-SF2):** the affected `(formType, bond)` chains are derived from the op's **emitted lines** (each carries its bond), so a cross-bond `TRANSFER_IN_BOND`/reversal marks **both** source and dest chains. Within each downstream period, **mark every FILED version** (an older ORIGINAL can linger beside a newer AMENDED) — not just the row the query happens to fetch.
- **Carry-forward must not break on a marked report (eng A2 — the sharpest catch):** the begin-balance lookup (`generate.ts:267-284`) filters `status: "FILED"`. Once P2 flips to `NEEDS_AMENDMENT`, P3's begin lookup would skip P2 → grab P1 → **wrong begin balance**. Fix: the begin-balance query reads the most recent report **whose status is `FILED` OR `NEEDS_AMENDMENT`** (a marked report still carries its last-filed `onHandEnd` until its amended successor is filed). **Deterministic tiebreaker (council Codex-SF):** select the **latest version per period first** (ordered `periodEnd desc, generatedAt desc, id desc`) so an ORIGINAL and AMENDED sharing a `periodEnd`/`generatedAt` never resolve ambiguously. FILED reports stay immutable.
- **UI must not present a marked report as final (council Gemini-CRIT4 → design-review, Gate 3):** carry-forward *chaining* reads the last-filed figure (correct for continuity), but a `NEEDS_AMENDMENT` report's aggregates must be **watermarked Draft/Projected** in the UI, never shown as "Filed."
**Tests:** AMEND-1 extension of `verify:ttb` (V4).
**Depends on:** C6 (bond-scoped chains), S1/S2 (`NEEDS_AMENDMENT`), C2/C5 (broadened trigger covers their backdated ops).
**Patterns to follow:** `generate.ts:267-284`, `:458-463`; `correctOperationCore` (`cellar/correct.ts:114-141`).
**Verification:** `verify:ttb` AMEND-1 assertions.

### Unit V1: `scripts/verify-bond.ts` + `verify:bond`
**Goal:** Guard BOND-1 in Demo Winery.
**Files:** `scripts/verify-bond.ts` (new); `package.json` (`"verify:bond"`).
**Approach:** Two bonds; a `TRANSFER_IN_BOND`; assert **symmetric** Removed-in-Bond (source §A15/§B9) / Received-in-Bond (dest §A7/§B3) on both bonds' 5120.17; assert the position's bond is **derived point-in-time from the line** (not a mutable column); assert per-bond filing chains don't cross. **Add (eng T3/T4):** a blend/split child of a lot on the secondary bond derives the parent's bond, not primary (A4); and a **single-bond tenant** (bondId backfilled to primary) chains exactly as pre-Phase-2 (R2 regression). `runAsTenant("org_demo_winery", …)`.
**Tests:** self.
**Depends on:** C1, C2, C6.
**Patterns to follow:** `verify:reverse` shape; `scripts/verify-ttb.ts`.
**Verification:** `npm run verify:bond` green.

### Unit V2: `scripts/verify-taxclass.ts` + `verify:taxclass`
**Goal:** Guard TAXCLASS-1.
**Files:** `scripts/verify-taxclass.ts` (new); `package.json`.
**Approach:** Cross-class blend posts §A 5/20 (+ §A 10/24/25 on a change event); a dated Change-Of-Tax-Class event corrects a premature declaration; result carries the destination/derived class; a brand-new blend lot's class **derives** (Key Decision b) and warns on cross-class sources. **Add (eng T5, guards R6):** assert the change-event §A 10/24/25 posting and the cross-class-blend §A 5/20 posting do **not** double-count the same volume — the two form-map paths stay distinct.
**Depends on:** C4.
**Verification:** `npm run verify:taxclass` green.

### Unit V3: `scripts/verify-taxpaid.ts` + `verify:taxpaid`
**Goal:** Guard TAXPAID-1.
**Files:** `scripts/verify-taxpaid.ts` (new); `package.json`.
**Approach:** `REMOVE_TAXPAID` **cannot** be re-admitted by `reverseOperationCore` (assert the verdict is non-reversible + the generic Undo refuses); `RETURN_TO_BOND` (refund-flagged) **does** re-admit and posts §B4.
**Depends on:** C5.
**Verification:** `npm run verify:taxpaid` green.

### Unit V4: AMEND-1 assertions in `verify:ttb`
**Goal:** Guard AMEND-1 without a separate script (runbook: extend `verify:ttb`).
**Files:** `scripts/verify-ttb.ts` (extend).
**Approach:** File **three** consecutive periods; correct the earliest FILED period; assert (i) every later report in the (formType, bond) chain flipped to `NEEDS_AMENDMENT`; (ii) **the carry-forward still chains through the marked P2 (eng A2)** — P3's begin-balance reads P2's last-filed `onHandEnd`, not P1's, before any re-file; (iii) after re-filing P2 as AMENDED, P3's amended begin picks up the corrected `onHandEnd`; (iv) a **backdated `TRANSFER_IN_BOND` into a FILED period** also triggers the cascade (eng A1/A3 broadened trigger).
**Depends on:** C7.
**Verification:** `npm run verify:ttb` green (incl. AMEND-1).

### Unit V5: Tenant-isolation + flip register notes → guarded
**Goal:** Extend `verify:tenant-isolation` for the new tables; flip the four notes `planned → guarded`.
**Files:** `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts` (cases for `Bond`, `ChangeOfTaxClassEvent`; behavioral RLS + composite-FK + backfill-tenant checks); `docs/architecture/invariants/{BOND-1,TAXCLASS-1,TAXPAID-1,AMEND-1}-*.md` (`status: guarded` + `verify:` field); `docs/architecture/invariants/README.md` (counts); `INVARIANTS.md` (drop "planned").
**Approach:** BOND-1 → `verify: "npm run verify:bond"`; TAXCLASS-1 → `verify:taxclass`; TAXPAID-1 → `verify:taxpaid`; AMEND-1 → `verify:ttb`.
**Depends on:** V1–V4.
**Verification:** `verify:tenant-isolation` + `verify:invariants` + `verify:invariant-frontmatter` green.

### Unit U1: UX surfaces, states & plain-language copy (design-review, Gate 3)
**Goal:** Specify the user-facing surface so a compliance screen never misleads (a wrong screen = a wrong federal filing). Thin UI — reuses existing compliance/Settings patterns + DESIGN tokens; no net-new layout.
**Files:** `src/app/(app)/compliance/**` (report list/detail, bond selector, `NEEDS_AMENDMENT` badge); `src/app/(app)/settings/**` (Bond CRUD); lot-detail / timeline (change-tax-class + return-to-bond affordances); the ledger error surface (refusal messages).
**Approach — the decided UX (all use DESIGN tokens, no hardcoded color/spacing):**
- **`NEEDS_AMENDMENT` watermark (CO-11):** report list + detail render a `NEEDS_AMENDMENT` badge in the DESIGN **warning** token, and the aggregates get a "superseded — figures may be stale" treatment; **never the plain "Filed" chip.** Plain-language banner (ux-principle 8): *"This period was reopened by a correction dated {date}. File an amended return to true up the numbers."* Carry-forward chaining still reads the last-filed figure; the UI just never presents it as final.
- **Single-bond hide (CO-12):** when the tenant's bond count == 1, **hide the bond selector, column, and filters entirely** — the report is just "the 5120.17," no bond chrome. The primary bond is created transparently at backfill (the winery never "sets up bonds" to use the product).
- **Bond CRUD self-serve (ux-principle 9):** bonds are **tenant-editable by an admin in Settings — explicitly NOT a support ticket** (the InnoVint anti-pattern, compliance.md §2.3). Empty state: warm, one line on what a bond is, primary **"Add bond"** action.
- **`REMOVE_TAXPAID` refusal (ux-principle 8):** the timeline "Undo" on a tax-paid removal must **not** dead-end in an opaque error — it names the cause and offers the path: *"Tax-paid removals are final for TTB. To bring wine back into bond, record a Return-to-Bond (refund) instead."* with a one-click affordance to that action.
- **`RETURN_TO_BOND` affordance:** a **distinct action** (not "undo"), explicit **volume input** (partial supported, CO-9), refund-flag confirmation, admin-gated; plain-language on the current-period excise-credit consequence (OQ-6 resolution).
- **Cross-bond-blend block (ux-principle 8 + 12):** when a blend draws from lots on different bonds, block with *"These lots are on different bonds ({A}, {B}). Transfer one into the other's bond first."* + a one-click **Transfer-in-bond** affordance — a **real `TRANSFER_IN_BOND`, never a phantom-vessel round-trip** (ux-principle 12).
- **Change-tax-class + cross-class warning:** lot-detail "Change tax class" action (dated, reason); a **soft warning** (not a block) on a cross-class blend: *"Sources cross tax classes ({A}, {B}); this blend will be reported as {destClass}."* (matches the incumbents' soft-warning pattern).
- **Exports never fail silently (ux-principle 10):** per-bond 5120.17 generation produces the file or a clear, actionable error.
**Tests:** manual-QA in Demo Winery (repo has no jsdom/RTL — UI ships manual-QA-only, per house convention); the underlying cores/guards are covered by `verify:bond`/`verify:taxpaid`/`verify:taxclass`.
**Depends on:** C1, C4, C5, C6, C7.
**Verification:** manual walkthrough of each surface above in Demo Winery.

### Unit V6: End-of-phase green + brain refresh + report
**Goal:** Full green per the cross-phase checklist + `PHASE-2-REPORT.md`.
**Files:** `PHASE-2-REPORT.md` (new); `docs/architecture/{system-map,security-register,scale-register}.md` + `.brain-refresh-marker` (governed code touched → refresh per `/ship`).
**Approach:** Run the full suite, build, lint, all `verify:*`; record what shipped vs. planned, deferrals (OQ outcomes), surprises. Add the AMEND-1 at-scale escape-hatch as a scale-register tripwire; add a BOND-1/TAXPAID-1 note to the security register.
**Depends on:** all.
**Verification:** the full cross-phase checklist ticks.

## Test Strategy

**Guard scripts (Demo Winery, `runAsTenant`):** `verify:bond`, `verify:taxclass`, `verify:taxpaid` (new);
AMEND-1 folded into `verify:ttb`. Model on `verify:reverse`/`verify:ttb` shape.
**Regression:** `verify:ttb` (updated reversal step) + `verify:excise` must stay green — proves per-bond
scoping didn't regress single-bond filing and the excise chain still ignores the ops carry-forward.
`verify:reverse`/`verify:reverse-transform` must stay green after the `REMOVE_TAXPAID` reverser change.
**Unit:** pure tests for `deriveBond` precedence and the class-resolution precedence (event → ABV).
**Tenant-isolation:** `Bond`, `ChangeOfTaxClassEvent` in both harnesses.
**Manual verification:** create two bonds in Demo Winery, run a `TRANSFER_IN_BOND`, generate each bond's
5120.17, confirm symmetric lines; record a Change-Of-Tax-Class event and confirm §A 10/24/25; attempt an
Undo on a `REMOVE_TAXPAID` (must refuse) then a `RETURN_TO_BOND` (must re-admit).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **R1** — `verify:ttb` today reverses a removal via the generic path; making `REMOVE_TAXPAID` terminal breaks it | HIGH | HIGH | Update the `verify:ttb` reversal step to `RETURN_TO_BOND` (C5); this is expected, not collateral. The council should scrutinize the reverser change. |
| **R2** — Per-bond carry-forward regresses single-bond filing | MED | HIGH | Backfill `bondId = primaryBond` on all existing reports; keep `bondId` nullable-legacy path; `verify:ttb`/`verify:excise` gate it. |
| **R3** — Synchronous AMEND-1 cascade exceeds `LEDGER_TX_TIMEOUT_MS` on long chains | LOW | MED | Short chains in practice; marking is O(rows). Escape hatch (`NEEDS_CALCULATION` lock + background regen) recorded as a scale-register tripwire, not built. |
| **R4** — Windows enum-rule violation (writing a new enum value in its adding migration) | MED | HIGH | M1 is enum-only and deploys first; code that writes the values ships after. |
| **R5** — Composite Prisma relations re-trigger the Phase-1 TS depth blowup | MED | MED | Drop all Prisma `@relation`; composite FKs in raw SQL only (Surprise 1). |
| **R6** — Change-Of-Tax-Class posting double-counts against cross-class-blend §A 5/20 | MED | HIGH | `verify:taxclass` asserts the event posts §A 10/24/25 and the blend posts §A 5/20 with no overlap; keep the two paths distinct in `form-map`. |
| **R7** — `deltaL <> 0` CHECK / LEDGER-2 blocks a zero-volume tax-class change | — | — | Avoided by design: Change-Of-Tax-Class is a table event, not a ledger line. |

## Open Questions

✅ **ALL RESOLVED at the STOP gate (user go, 2026-07-06).** Recorded below; `/work` builds to these.

1. **OQ-1 — `CHANGE_OWNERSHIP` scope.** ✅ **RESOLVED: DEFER** (user, council consensus). Unit C3 dropped
   from this phase; not added to the `OperationType` enum. Fast-follow after single-owner multi-bond is
   stable. Runbook-vs-council tension recorded in `PHASE-2-REPORT.md`.
2. **OQ-2 — Per-bond filer identity.** ✅ **RESOLVED: bond-first + snapshot at FILE** (plan recommendation).
   `Bond` owns registry #/penal sum/premises; filer identity resolves bond-first, tenant-profile fallback,
   and is **snapshotted onto the report row at FILE time** so amended reprints don't drift (council
   Codex-DESIGN2). `ComplianceProfile` stays `@@unique([tenantId])` for cadence/EFT defaults.
3. **OQ-3 — Historical line bond backfill.** ✅ **RESOLVED: legacy lines NULL + derive-to-primary** (user).
   Bond-moving ops always carry explicit bond (C1, non-negotiable); legacy lines stay NULL and derive the
   primary bond. The report chain filters `ComplianceReport.bondId` (stamped), not line bond, so the hot
   query is unaffected. Perf tradeoff (council leaned stamp-all) recorded; revisit only if a hot query ever
   filters on line bond.
4. **OQ-4 — Guard granularity.** ✅ **RESOLVED: separate scripts** (plan recommendation) — `verify:bond`,
   `verify:taxclass`, `verify:taxpaid` each stand alone (clearer register `verify:` fields per invariant);
   AMEND-1 folds into `verify:ttb` (runbook-specified).
5. **OQ-5 — Harden `removeTaxpaidCore` idempotency.** ✅ **RESOLVED (eng-review): fold into C5.** We're
   editing the file for TAXPAID-1 anyway; the full crush-core pattern closes a latent double-submit bug at
   near-zero marginal cost. (No longer an open question — recorded here for traceability.)
6. **OQ-6 — TAXPAID-1 refund ↔ excise AMEND.** ✅ **RESOLVED (council, cross-model tension → Gemini
   TTB-correct).** You do **NOT** amend a FILED 5000.24 when wine physically returns to bond today —
   that's a **decreasing adjustment/credit on the CURRENT-period 5000.24** (Schedule B) or a Form 5620.8
   claim; back-amending would falsify filed history. AMEND-1 stays **5120.17-only**. **Flag for accountant
   confirmation** (runbook's "confirm with an accountant" posture) — recorded, not open.
7. **OQ-7 — Part VII "In Fermenters" contamination.** ✅ **RESOLVED: guardrail only + backlog** (user).
   C4 guardrail: the brand-new-blend derivation must not promote null-ABV fermenting must into Part I;
   declaring out of fermenters posts §A2/§A25. A full FERMENTING pseudo-class + `DECLARE_WINE` op is a
   **Phase-14 backlog note** (Part VII is already `[PLANNED]`/stubbed — `form-map.ts:93-96` — not newly
   broken). A new op family would be an escalation, out of Phase-2 scope.

*(Carried from Phase-1 precedent: expect ~1–2 build-time surprises around composite FKs and enum
migration ordering; the 13-question adjudication style from Phase 1 applies here.)*

## Success Criteria

- [ ] A >1-bond winery's book is representable: `TRANSFER_IN_BOND` posts symmetrically at the line level;
      the bond of a position is time-aware (derived, never a mutable authority column); each bond files
      its own 5120.17; tax-paid is a true terminal state; (if OQ-1) ownership/bond changes atomically with
      no ritual; amending a filed period cascades `NEEDS_AMENDMENT` correctly.
- [ ] BOND-1 / TAXCLASS-1 / TAXPAID-1 / AMEND-1 all `guarded` with real `verify:` fields; `verify:invariants` green.
- [ ] `verify:bond` + `verify:taxclass` + `verify:taxpaid` green; AMEND-1 assertions in `verify:ttb` green.
- [ ] `verify:ttb` + `verify:excise` non-regressed; `verify:reverse`/`verify:reverse-transform` green.
- [ ] `verify:tenant-isolation` extended for `Bond` + `ChangeOfTaxClassEvent`.
- [ ] High-risk bond ops (transfer, ownership, return-to-bond, filing) admin/owner-gated.
- [ ] Full vitest suite green (ignore `invariant-drift.test.ts` load error); `build` + `lint` clean.
- [ ] Brain refreshed (governed code); `PHASE-2-REPORT.md` written.
- [ ] Landed via PR → CI green → squash-merge → delete branch.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Grounded in compliance.md §4/§5 + confirmed-absent bond entity. |
| Scope Boundaries | HIGH | Runbook Phase-2 block is explicit; OQ-1 is the one scope ambiguity, surfaced. |
| Implementation Units | HIGH | Every anchor point has a file:line from the two research agents. |
| Test Strategy | HIGH | Mirrors shipped `verify:*` shapes; R1 test-update identified up front. |
| Risk Assessment | MEDIUM | R1/R2 (reverser + per-bond carry-forward) are the real hazards; both have gated mitigations but warrant council scrutiny on the atomic symmetric posting + reverser/TAXPAID interaction. |

## Eng-Review Adjudications (Gate 1 — `/plan-eng-review`)

Ran analytically (autonomous pipeline; no per-issue STOP). Runbook + INVARIANTS win settled decisions —
these findings are refinements *within* those decisions, not relitigations. Deep cross-LLM adversarial
challenge is deferred to the `/council` step (Gate 2). Confidence in parentheses.

| # | Finding | Severity | Adjudication |
|---|---------|----------|--------------|
| **A1** (8/10) | AMEND-1 trigger was scoped to `CORRECTION` only; a **backdated `TRANSFER_IN_BOND`/`RETURN_TO_BOND`/`CHANGE_OWNERSHIP`** into a FILED period desyncs a filed report identically. | HIGH | **Accepted → C7 broadened:** the cascade fires for **any appended op with `observedAt` ≤ latest FILED periodEnd** in its (formType, bond) chain. One explicit `cascadeAmendmentMarks(tx,…)` seam in the compliance module (no scattered coupling). |
| **A2** (8/10) | **Sharpest catch.** Carry-forward filters `status:"FILED"`; once P2 flips to `NEEDS_AMENDMENT`, P3's begin-balance lookup skips P2 → grabs P1 → **wrong begin balance**. | HIGH | **Accepted → C7:** begin-balance query reads the most recent report with status `FILED` **or** `NEEDS_AMENDMENT` (a marked report still carries its last-filed `onHandEnd` until its amended successor is filed). New `verify:ttb` assertion (V4 iii-loop). |
| **A3** (7/10) | Reversing a cross-bond `TRANSFER_IN_BOND` whose dest period is FILED is itself a backdated op → needs AMEND-1 on the dest chain. | MED | **Accepted → subsumed by A1's broadened trigger** (a reversal is a CORRECTION op; now covered). Noted in C2. |
| **A4** (7/10) | Bond derivation for a **blend/split child** (no bond-carrying op of its own) would default to primary — wrong if the parent sat on a secondary bond (the bond analog of the brand-new-blend-lot tax-class question). | MED-HIGH | **Accepted → C1:** lineage-child bond walks to the parent's derived bond as-of the lineage event. New `verify:bond` assertion (T3). |
| **CQ3 / OQ-5** (7/10) | `removeTaxpaidCore` lacks the `findByCommandId` idempotency pre-check; we're editing the file for TAXPAID-1 anyway. | MED | **Accepted → folded into C5** (harden to the full crush-core pattern). OQ-5 resolved. |
| **CQ2** (8/10) | Change-Of-Tax-Class as a **table event** (not a ledger op) is asymmetric with `TRANSFER_IN_BOND` (a ledger op). | — | **Kept as-is, reinforced:** the asymmetry is *principled* — bond change **moves volume** (real ledger legs); tax-class change moves volume **between report columns only** (no physical movement) → an event, not a `deltaL<>0` line. Timeline surfaces the event like `LotCodeEvent` (honest history). |
| **T1** (9/10) | REGRESSION (IRON RULE): `verify:reverse` likely asserts `REMOVE_TAXPAID` reversible today; the verdict flips. | CRITICAL | **Mandatory → C5/V3:** update the existing `verify:reverse` case to assert non-reversible. No ask. |
| **T5 / R6** (7/10) | Double-count risk between change-event §A10/24/25 and cross-class-blend §A5/20. | MED | **Accepted → V2 assertion:** the two form-map paths post distinct volume, no overlap. |
| **P1/P2** (5-6/10) | Sync cascade cost + resolveBonds/Classes N+1. | LOW | **No change:** cascade marking is O(rows), regeneration is lazy at re-file; resolvers batched (C1/C4). R3 escape-hatch tripwire stands. |

**Scope challenge:** accepted as-is (essential, not accidental, complexity; runbook-scoped; reuses every
existing seam). **What already exists:** documented in Research Summary (all reused, none rebuilt).
**NOT in scope:** documented in Scope Boundaries. **Parallelization:** largely **sequential** — new cores
(C2/C3/C5) could be drafted in parallel but all converge on three hot files (`reverse.ts`, `form-map.ts`,
`generate.ts`); recommend sequential execution to avoid merge conflicts. **Failure modes:** no critical
gap left silent — A2 (wrong begin balance) was the one silent-failure path and is now test-covered.
**Unresolved:** none (all findings adjudicated in-plan). **Verdict:** Eng gate CLEAR — proceed to `/council`.

## Council Adjudications (Gate 2 — `/council`, cross-LLM)

Codex gpt-5.4 (types + correctness) + Gemini 3.1 Pro (compliance + UX). Full record: `council-feedback.md`.
Ran autonomously; findings adjudicated in-plan (the genuinely user-facing calls went to Open Questions).
Runbook + INVARIANTS still win settled decisions.

| # | Finding (source) | Adjudication |
|---|------------------|--------------|
| **CO-1** | `reversibilityOf(false)` alone doesn't enforce TAXPAID-1 — an ADJUST/correction positive in-bond increase re-admits taxpaid volume behind the reverser (Codex CRIT3) | **Accepted → C5: central admissibility guard** at the write chokepoint blocks a positive in-bond `deltaL` to a taxpaid lot unless it's `RETURN_TO_BOND`. `verify:taxpaid` exercises the ADJUST path. **(Highest-value catch.)** |
| **CO-2** | Cross-bond blends = superposition violation; "walk to parents" undefined for multi-parent (Gemini CRIT3) | **Accepted → C1/C2: BLOCK cross-bond blends** (all parents same bond, else transfer first); single-parent child walks to its parent. `verify:bond` asserts the refusal. |
| **CO-3** | AMEND-1 cascade + fold must cover BOTH bond chains of a transfer / its reversal (Codex CRIT1, Gemini SF2) | **Accepted → C7/C2:** scopes derived from emitted lines (per-line bond); mark **all** filed versions in each downstream period on **both** chains. |
| **CO-4** | Bond-moving ops must carry explicit non-null source≠dest bond; fallback is asymmetric (Codex CRIT2/DESIGN3) | **Accepted → S1/C1/C2:** discriminated input types force bond fields; legacy rows may derive primary, bond-moving ops never. |
| **CO-5** | Change-Of-Tax-Class needs explicit volume semantics (Codex CRIT4, Gemini CRIT1) | **Accepted → C4:** post on-hand volume as-of the event (from the existing fold) + stamp `volumeAtEvent`; no-op emits nothing. Kept a table event (ledger-op rejected — would put class on the line, contradicting class-is-derived). |
| **CO-6** | Same-period blend §A5/20 vs class-change §A10/24/25 double-count (Gemini SF1) | **Accepted → C4/V2:** a same-period class-change on a blend child adjusts the blend's target class in the fold, not a separate posting. |
| **CO-7** | A2 carry-forward tiebreaker ambiguity; index too weak; event-lookup index (Codex SF) | **Accepted → C7/S1:** order `periodEnd desc, generatedAt desc, id desc` (latest-version-per-period first); composite index incl. status/periodEnd/generatedAt; `(tenantId,lotId,observedAt)` on the event table. |
| **CO-8** | Filer identity must be snapshotted onto the report at FILE (Codex DESIGN2) | **Accepted → S1/C6 (OQ-2):** snapshot at file time so amended reprints are stable. |
| **CO-9** | Partial `RETURN_TO_BOND` (explicit volume, not a toggle) (Gemini SF3) | **Accepted → C5.** |
| **CO-10** | Part VII "In Fermenters" contamination — null-ABV fermenting must promoted to Part I (Gemini CRIT2) | **Accepted (guardrail) → C4 + new OQ-7:** derivation must not promote fermenting must; full FERMENTING/`DECLARE_WINE` is a scope escalation, surfaced to the user. |
| **CO-11** | AMEND-1 UI "known-bad state" illusion (Gemini CRIT4) | **Routed to `/design-review` (Gate 3):** watermark `NEEDS_AMENDMENT` aggregates Draft/Projected; chaining still reads last-filed. |
| **CO-12** | Single-bond UX friction — hide bond UI at count==1 (Gemini SF4) | **Routed to `/design-review` + C6.** |

**Cross-model tensions:** (a) **OQ-6 excise-amend** — Codex "amend the 5000.24 chain" vs Gemini "NO,
current-period credit; back-amending falsifies history." **Resolved toward Gemini (TTB-correct); flag for
accountant.** (b) **OQ-1 CHANGE_OWNERSHIP** — runbook includes it; both councils say defer. **Surfaced to
the user; recommendation flipped to defer.** (c) **Change-Of-Tax-Class ledger-op vs table-event** — Gemini
pushed ledger-op; **kept table-event** (class-is-derived is settled architecture; volume-snapshot resolves
the real concern). **Verdict:** COUNCIL CLEAR — proceed to `/design-review`, then STOP.

## Design Adjudications (Gate 3 — `/plan-design-review`)

Plan-stage UX/IA review (no code yet → no live visual audit; thin UI, reuses existing compliance/Settings
patterns + DESIGN tokens → no mockups warranted). Ran autonomously; the decided UX is now **Unit U1**.
Grounded in `DESIGN.md` + `docs/architecture/ux-principles.md` (rules 8/9/10/12).

**Initial design completeness 4/10 → 9/10 after fixes.** The backend semantics were sharp; the
user-facing surface was terse references. Fixed by specifying every message + state-visibility rule in U1.

| Pass | Before→After | What was added |
|------|-------------|----------------|
| 1 Info Arch | 5→9 | Bonds in Settings (self-serve); bond selector on the report page **only when >1 bond**; change-class + return-to-bond on lot detail. |
| 2 Interaction states | 3→9 | **Highest-value gap.** `NEEDS_AMENDMENT` watermark (CO-11); single-bond hide (CO-12); the two plain-language refusal/block messages; Settings empty state. |
| 3 User journey | 5→9 | Refusals name the cause + offer the path (ux-8), never dead-end; the winery never "sets up bonds" to start (transparent primary bond). |
| 4 AI slop | 8→8 | N/A — reuses existing compliance UI; nothing generic. |
| 5 Design system | 7→9 | DESIGN warning token for the badge; reuse existing report/Settings components. |
| 6 Responsive/a11y | 7→7 | Inherits existing surfaces; no new layout. |
| 7 Unresolved | — | None new — CO-11/CO-12 resolved into U1; single-bond empty state specified. |

**Key design calls:** (a) InnoVint's "add a bond via support ticket" is an **anti-pattern** — bonds are
self-serve admin config (ux-9). (b) The cross-bond-blend "transfer first" flow is a **real
`TRANSFER_IN_BOND`, never a phantom vessel** (ux-12). (c) A `NEEDS_AMENDMENT` report's numbers are
**watermarked, never shown as Filed** (CO-11) — the carry-forward still chains the last-filed figure for
continuity. **NOT in scope:** any bond visual redesign; a bond dashboard (single-report-per-bond is enough).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (compliance table-stakes, runbook-scoped) |
| Codex Review | `/council` | Independent 2nd opinion | 1 | issues_adjudicated | 5 CRIT + 6 SF; all folded or → OQ |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 8 findings, 0 silent gaps |
| Council (Gemini) | `/council` | Compliance + UX | 1 | issues_adjudicated | 4 CRIT + 4 SF; TTB rule resolved OQ-6 |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | 4/10 → 9/10; CO-11/CO-12 resolved → Unit U1 |

**UNRESOLVED:** 0 (all findings adjudicated in-plan). **Open questions for the user's STOP gate:** OQ-1
(CHANGE_OWNERSHIP — council says defer vs runbook lists it), OQ-2 (filer identity), OQ-3 (historical bond
backfill), OQ-4 (guard granularity), OQ-7 (Part VII fermenters). **Resolved:** OQ-5 (fold idempotency),
OQ-6 (excise not amended — TTB rule).
**VERDICT:** ENG + COUNCIL + DESIGN all CLEARED. Plan is review-complete. **STOP — awaiting the user's
explicit go before `/work`.**
