# PHASE 2 — Bond + tax-class model (line-scoped, time-aware) — Completion Report

- **Date:** 2026-07-06
- **Branch:** `feat/phase-2-bond-tax-class` (off `main`; main is branch-protected)
- **Plan:** `plans/PHASE-2-PLAN.md` (eng + council (Codex + Gemini) + design gates; all OQs resolved with the user's go)
- **Posture:** CODE + SCHEMA. S1/S2 (schema + 3 migrations) landed earlier; this report covers C1–C7, U1, V1–V6. New tenant-scoped tables `Bond` + `ChangeOfTaxClassEvent`; line-level bond on `LotOperationLine`; per-bond `ComplianceReport.bondId` + `filerSnapshot`; four invariants flipped `planned → guarded`.
- **Result:** ✅ green. `tsc` 0 errors · `lint` 0 errors (21 pre-existing warnings) · `vitest` 1500 passed / 118 skipped / **0 failures** · `build` clean · `verify:invariants` **27 guarded (100%)** · `verify:invariant-frontmatter` 29 well-formed · `verify:tripwires` 14/14 · `verify:raw-sql` clean · `verify:tenant-isolation` all checks (script; gated vitest mirrors it).
- **New guards (all green vs Neon):** `verify:bond` (17) · `verify:taxclass` (13) · `verify:taxpaid` (11) · `verify:ttb` (27 + AMEND-1 3-period chain). **Non-regressed:** `verify:excise` (17) · `verify:reverse` (31) · `verify:reverse-transform` (37).

---

## What shipped vs. the plan

| Unit | Planned | Done | Delta |
|------|---------|------|-------|
| S1/S2 | Schema + 3 migrations (enums → tables+RLS+composite-FKs → backfill) | ✅ (prior commits) | Applied to dev DB; primary bond backfilled; 7/7 existing reports scoped. |
| C1 | `deriveBond`/`resolveBondsForLots` + admin CRUD | ✅ | Asymmetric fallback (legacy→primary; bond-moving op→explicit; single/unanimous-parent lineage walk). `bond.ts` + `bond-actions.ts`. |
| C2 | `TRANSFER_IN_BOND` symmetric + atomic + reversible | ✅ | Whole-lot/lossless v1 (keeps `deriveBond` single-valued); dedicated bond-**swapping** reversal via a new reverse `bond` family (the generic corrector drops bond fields). §A15/§A7 + §B9/§B3 form-map. |
| C3 | `CHANGE_OWNERSHIP` | ⛔ **DEFERRED (OQ-1)** | Not built; not added to the enum (no half-defined member). The bond-change posting it would share is already in C2. Fast-follow. |
| C4 | Change-Of-Tax-Class event + point-in-time class + §A postings | ✅ | Event supersedes ABV **and** the report `overrides` Json. §A10 (into) / §A24 (out) — the plan's §A10/24/25 line numbers, direction resolved by the footing requirement. Part VII guardrail = the existing WINE-form filter. |
| C5 | `REMOVE_TAXPAID` terminal + `RETURN_TO_BOND` + admissibility guard | ✅ | **User call (STOP gate):** `RETURN_TO_BOND` re-admits **bulk** (ledger +V) posting **§A11** (not the plan's §B4 — §B4 is a bottled line; §A11 foots on §A and matches the §A14 bulk removal). CO-1 chokepoint guard blocks the CORRECTION + ADJUST re-admission paths. `removeTaxpaidCore` hardened to full commandId idempotency (OQ-5). |
| C6 | Per-bond 5120.17 scoping + filer snapshot | ✅ | `foldPeriod` bond dimension (default primary → single-bond folds as before, R2); transfer legs attribute by explicit per-leg bond; §B finished goods → primary report only (v1 boundary); carry-forward per (formType, bondId); filer identity snapshotted at FILE (OQ-2/CO-8). |
| C7 | AMEND-1 cascade | ✅ | One seam at the `writeLotOperation` chokepoint (broadened trigger, eng A1); scopes from emitted lines → **both** chains for a transfer (CO-3); `updateMany` marks all filed versions; begin-balance reads FILED **or** NEEDS_AMENDMENT with an id-desc tiebreaker (A2/CO-7). |
| V1–V4 | `verify:bond`/`taxclass`/`taxpaid` + AMEND-1 in `verify:ttb` | ✅ | Plus the cross-bond-blend BLOCK added to `blend-core` (CO-2, deferred from C1/C2). `verify:reverse` verdict flipped for REMOVE_TAXPAID (T1). |
| V5 | tenant-isolation + flip 4 notes → guarded | ✅ | Behavioral RLS + composite-FK + backfill cases for both tables in both harnesses; 23→27 guarded. |
| U1 | UX surfaces | ⚠️ **Partial** | Shipped: NEEDS_AMENDMENT watermark (CO-11, safety-critical) + admin action seams (transfer/return/change-class; bond CRUD from C1). **Deferred rendered surfaces** — see below. |
| V6 | end-of-phase green + brain + report | ✅ | Registers updated; this report; `/ship`. |

## Open-question outcomes (as executed)

OQ-1 **DEFER** `CHANGE_OWNERSHIP` (council consensus + user). OQ-2 **bond-first filer identity + snapshot at FILE**. OQ-3 legacy lines NULL + derive-to-primary. OQ-4 separate guard scripts (+ AMEND-1 in `verify:ttb`). OQ-5 fold `removeTaxpaidCore` idempotency into C5 (done). OQ-6 return-to-bond is a **current-period excise credit, not a 5000.24 back-amendment** — AMEND-1 stays 5120.17-only (**flag for accountant**). OQ-7 Part VII guardrail only (the WINE-form §A filter already excludes null-ABV fermenting must); full FERMENTING/`DECLARE_WINE` is a Phase-14 backlog note.

## The one STOP-gate decision surfaced to the user

**C5 / TAXPAID-1 — RETURN_TO_BOND target.** The plan said both "positive in-bond `deltaL`" (a bulk vessel ledger leg) **and** "posts §B4" (a bottled §B line); those can't both hold without mis-footing, and the op TAXPAID-1 actually guards (`removeTaxpaidCore`) is the **bulk** ledger REMOVE_TAXPAID (§A14). Surfaced with three options; **user chose bulk-ledger + §A11** ("taxpaid wine returned to bulk", the §A analog of §B4). It foots on §A, matches the removal it reverses, and makes the CO-1 admissibility guard's "unless RETURN_TO_BOND" exception meaningful. Everything else followed the plan.

## Surprises / deltas from the plan

1. **TS type-instantiation-depth blowup (Phase-1 Surprise 1 class).** Once `bond.ts` entered the wider Phase-2 import graph (via the AMEND-1 chokepoint seam), its `DbClient = Prisma.TransactionClient | typeof prisma` **union** forced a deep extended-vs-base `findMany` args comparison that tipped TS past its instantiation-depth ceiling — poisoning the Prisma client types across `rack-core`/`topping`/etc. (manifested order-dependently, not just from the new edge). **Fix:** narrow `bond.ts`'s `DbClient` to the base `TransactionClient` (cast the module-client default). The codebase sits near this ceiling; the `…| typeof prisma` union pattern is the trigger to avoid in widely-imported modules.
2. **AMEND-1 seam placed at the chokepoint, not per-core.** The plan listed wiring into `correct.ts` + the bond/return cores; folding `cascadeAmendmentsForWrite` into `writeLotOperation` (with a cheap pre-check) covers **every** backdated op uniformly with one seam (the plan's own "one seam" preference), and is why the broadened trigger (eng A1) is automatic. It imports `bond.ts` **dynamically** to keep the ledger→compliance type edge out of the static graph.
3. **§A10/§A24 were "spacer" lines in v1's `form-labels`.** The plan's §A10/24 line numbers are correct for the real 5120.17 (they're real write-in cells in the PDF field-map + `period-fold` add/remove arrays); v1 just hadn't labeled them. Added labels for §A10 (changed-to-class), §A11 (taxpaid returned to bulk), and posted change-of-class via §A10/§A24. The plan prose's direction parenthetical was loose; the footing requirement disambiguates (§A10 addition = into-new, §A24 removal = out-of-old).
4. **Cross-bond-blend BLOCK (CO-2) was implicit in C1/C2** but needed a real guard in `blend-core` (resolve all parents' bonds; reject if >1). Added in V1.
5. **Pre-existing verify scrub gaps** (Phase-1 `LotIdentifier`/`LotCodeEvent` FKs → lot) surfaced when the new tables/bonds were seeded; fixed the scrub order in `verify-ttb`/`verify-excise`/`verify-tenant-isolation` (delete bond after reports+lines; event/identifier before lot).

## Deferred (documented fast-follows)

- **C3 `CHANGE_OWNERSHIP`** — OQ-1 defer; a Phase-2 fast-follow (alternate-proprietor logic + inventory snapshots). The bond-change posting is already in C2.
- **U1 rendered surfaces (manual-QA-only; no jsdom/RTL — Phase-1 precedent):** Bond CRUD Settings card, the RETURN_TO_BOND modal (explicit volume + refund confirm), the cross-bond-blend one-click "Transfer-in-bond" affordance, the lot-detail "Change tax class" control + soft cross-class warning, and the timeline REMOVE_TAXPAID refusal affordance. The **cores + admin action seams ship and are guarded**; the refusal **copy** lives in the cores' error messages; the safety-critical NEEDS_AMENDMENT watermark **shipped**. CO-12 single-bond-hide is satisfied by default (no bond-selector chrome exists yet).
- **§B finished-goods per-bond attribution** — bottled finished goods aren't bond-tracked in the schema; they attribute to the primary report (v1 boundary). Bottle from primary, or transfer a secondary-bond lot to primary before bottling.
- **Partial cross-bond transfer** — not supported in v1 (would put one lot on two bonds). Split the lot first, then transfer the child (mirrors the cross-bond-blend "transfer first" rule).

## Governance follow-through

- BOND-1 / TAXCLASS-1 / TAXPAID-1 / AMEND-1 register notes flipped `status: guarded` + `verify:` fields; README snapshot 23→27 guarded / 1 planned (MIGRATE-1) / 1 deferred (CBMA-1); INVARIANTS.md narrative de-"planned"ed.
- scale-register: AMEND-1 synchronous-cascade tripwire + the `NEEDS_CALCULATION` escape hatch (recorded, not built).
- security-register: BOND-1/TAXPAID-1 note (RLS + composite FKs + the tax-paid terminal boundary + admin gate).
- **MIGRATE-1 `appliesTo` repoint stays parked for Phase 3** (standing constraint honored — no kernel/seed contracts touched). **Accountant confirmation flagged** for the OQ-6 excise-credit posture.

## Landing

Incremental commits per unit on `feat/phase-2-bond-tax-class` (C1 → C2 → C4 → C5 → C6 → C7 → V1-V4 → V5 → U1 → V6). Next: `/ship` → PR → CI green → squash-merge → delete branch. Brain-refresh marker advanced at `/ship` (governed `prisma/schema` + `src/lib/{ledger,compliance}` touched).
