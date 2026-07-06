# PHASE 1 — Identity presentation layer — Completion Report

- **Date:** 2026-07-06
- **Branch:** `feat/phase-1-identity-presentation` (off `feat/phase-0-governance-docs` HEAD; main is branch-protected)
- **Plan:** `plans/PHASE-1-PLAN.md` (reviewed through eng + council + design gates; 13 open questions resolved with the user's go)
- **Posture:** CODE + SCHEMA. 2 reversible migrations, 4 new tenant-scoped tables + 1 nullable `Lot` column, new `verify:naming` guard (NAMING-1/2 flipped `planned → guarded`), new pure-Node frontmatter validator wired into CI.
- **Result:** ✅ green. `tsc` 0 errors · `lint` 0 errors (21 pre-existing warnings) · `vitest` 1498 passed / 117 skipped / **0 failures** · `verify:invariants` 23 guarded (100%) · `verify:invariant-frontmatter` 29 well-formed · `verify:naming` 25 assertions · `verify:tenant-isolation` all checks (script + gated vitest) · `verify:tripwires` 14/14 · `npm run build` clean.

---

## What shipped vs. the plan

| Unit | Planned | Done | Delta |
|------|---------|------|-------|
| S1 | Schema: `Lot.displayName` + `LotIdentifier` + `NamingTemplate(+Version)` + `LotCodeEvent` | ✅ | 4 new tables to the Phase-12 checklist; `field` CHECK; council-hardened uniques. Prisma **relations dropped** (see Surprise 1). |
| S2 | Reversible migrations: schema+RLS (merged, council C2) + idempotent marker backfill | ✅ | 2 migrations (`_naming_identity_schema`, `_naming_identity_backfill`); rollback SQL in each header; `displayName` NOT backfilled (Q12). |
| C1 | Naming-template renderer; default delegates to `buildLotCode`; `generate.ts` reads the tenant template | ✅ | Byte-parity by delegation (proven in V2). No `SEQUENCE` token (eng E2). |
| C2 | `renameLotCore` / `setDisplayNameCore` (append-only, snapshot-safe, collision OFFER) + `swapLotCodes` | ✅ | `swapLotCodes` added (council G1); `displayName` canonicalized (G6). |
| C3 | Cross-identifier resolver + as-recorded/renamed-to reader | ✅ | Disambiguation envelope + `{asRecorded, renamedToImmediate, currentCode}` (council G4/G7). |
| C4 | `LotIdentifier` write helpers | ✅ | `setCurrentCodeTx` updates in place (no `prior-code` dual-write, Q13). |
| U1 | Naming-template CRUD (adminAction, clone-on-customize) + Settings surface | ⚠️ **Partial** | CRUD **server actions shipped** (create/updateSpec/setDefault, blend-origin validation, single-default). **Rendered Settings authoring card deferred** — see Deferred UI. |
| U2 | Lot-detail: displayName + rename + collision offer + a.k.a. | ✅ | `LotIdentityControls` client component (Edit-identity modal, collision OFFER, a.k.a. chip). |
| U3 | Cross-identifier search into lot search entry points | ⚠️ **Partial** | `searchLotsAction` + `describeLotIdentityAction` **shipped**; **wiring into blend/lot-list boxes + the assistant resolver deferred** — see Deferred UI. |
| U4 | Timeline "as-recorded + renamed →" affordance | ⚠️ **Partial** | The data path (`asRecordedWithRename`) + lot-level a.k.a. ship; the **per-entry chip in `TimelineEntryDetail` deferred**. |
| V1 | `scripts/verify-naming.ts` + `verify:naming` | ✅ | 25 assertions (a)–(j) in Demo Winery. |
| V2 | Pure unit tests | ✅ | 16 tests: byte-parity, blend origin refusal, canonicalization. |
| V3 | `verify:tenant-isolation` cases | ✅ | Both harnesses; behavioral RLS + K11 composite-FK + E4 backfill-tenant checks. |
| V4 | Flip NAMING-1/2 → guarded + README snapshot | ✅ | 23 guarded / 5 planned / 1 deferred. |
| V5 | Frontmatter validator + `.gitattributes` (Phase-0 backlog) | ✅ | `verify-invariant-frontmatter.mjs` wired into `ci.yml`; LF pin. |
| V6 | End-of-phase green + this report | ✅ | All gates above. |

## Open-question resolutions (as executed, per the user's go)

Q1 proceed (LotIdentifier net-new). Q2 `verify:naming` in `org_demo_winery`. Q3 added `NamingTemplateVersion` (4th table). Q4 `kind` String / `field` CHECK. Q5 SQL backfill, `gen_random_uuid()::text`, deterministic markers. Q6 default delegates to `buildLotCode`. Q7 hand-rolled `.mjs` validator (no `zod` dep). Q8 free-text entry points (see Deferred UI). Q9 rename = `action()`, template authoring = `adminAction`. Q10 reversibility = documented rollback SQL per migration. Q11 `swapLotCodes` included. **Q12 → `displayName` NULL + coalesce** (runbook deviation, user-approved). **Q13 → `LotCodeEvent` owns rename history; no `prior-code` dual-write** (runbook-tension resolution, user-approved).

## Surprises / deltas from the plan

1. **Composite Prisma relations blew TS's type-instantiation depth.** Declaring multi-field relations (`@relation(fields: [tenantId, lotId], references: [tenantId, id])`) on the new tables degraded `VesselLot`/`Lot` to `{}` in `rack-core.ts`/`topping.ts` (TS2321 "excessive stack depth") once the new model types were forced to instantiate. **Fix:** dropped the Prisma relations; the composite `(tenantId, refId) → (tenantId, id)` FKs live in raw SQL (exactly the `work_order_task` → lot convention, K11). Queries use `lotId`. No tenant-safety loss (the DB FK still enforces it).
2. **Dropped the redundant null-value partial unique.** Migration A initially had `UNIQUE (tenantId, value) WHERE sourceSystem IS NULL` for app-native identifiers; it wrongly blocked `swapLotCodes`' mid-tx state, and it is redundant (current-code values already unique per tenant via `lot.code` + the single-current-code partial). Removed from the migration; dropped on the dev DB + checksum reconciled (the migration was unmerged).
3. **`sourceSystem`/`sourceId`/`legacyCode` scalar columns never existed** (Q1 confirmed at build time) — `LotIdentifier` is net-new; the backfill only seeds `current-code` rows.

## Deferred UI (manual-QA-only surfaces — carried as a Phase-1 UI fast-follow)

The NAMING-1/2 mechanism is complete and **verify-guarded**; the following are additive rendered surfaces on top of the proven+guarded cores + shipped server actions. Deferred because they are manual-QA-only (the repo has no jsdom/RTL) and context-bounded, **not** dropped:
- **Naming-template Settings authoring card (U1 UI).** CRUD actions (`createNamingTemplateAction`/`updateNamingTemplateSpecAction`/`setDefaultNamingTemplateAction`) ship and are admin-gated + blend-origin-validated; the rendered `NamingTemplateCard` in `/settings` is the follow-up.
- **Cross-identifier search in the blend + lot-list boxes + the assistant resolver (U3 UI).** `searchLotsAction` (disambiguation envelope) ships; wiring it into `BlendBuilderClient` search, a `LotsClient` search box, and `assistant/scope.ts resolveLotTarget` as a fallback is the follow-up.
- **Per-entry "renamed → X" chip in `TimelineEntryDetail` (U4 UI).** `asRecordedWithRename` ships and the lot-detail a.k.a. chip covers the lot-level honesty; the per-timeline-row chip is the follow-up.

## Reversibility (rollback SQL — documented per migration header)

- `_naming_identity_schema`: `DROP TABLE lot_code_event, lot_identifier, naming_template_version, naming_template CASCADE; ALTER TABLE lot DROP COLUMN "displayName";`
- `_naming_identity_backfill`: delete rows by the deterministic markers (`code = '__default__'` templates+versions; `kind='current-code' AND sourceSystem IS NULL` identifiers).

## Governance follow-through

- NAMING-1 / NAMING-2 register notes flipped `status: guarded` + `verify: "npm run verify:naming"`; README snapshot updated (23 guarded / 5 planned / 1 deferred).
- New `verify:invariant-frontmatter` (pure Node) wired into `ci.yml` beside `verify:invariants`/`verify:tripwires`; `.gitattributes` pins `docs/architecture/invariants/*.md` to LF (closes PHASE-0 Surprise 2).
- MIGRATE-1 `appliesTo` repoint stays **parked for Phase 3** (standing constraint honored). No kernel/bond contracts touched.

## Landing

Branch `feat/phase-1-identity-presentation`, incremental commits (V5 → S1/S2 → C1-C4 → V1/V2/V4 → V3 → U-backend → U2 → report). Next: `/ship` → PR → CI green → squash-merge → delete branch. Brain-refresh due (`prisma/schema` + `src/lib/ledger` touched) — run at `/ship`.
