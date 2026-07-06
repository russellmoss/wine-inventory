# Council Feedback — PHASE-2-PLAN (Bond + tax-class model)
**Date**: 2026-07-06
**Reviewers**: Codex gpt-5.4 (types + data layer + correctness), Gemini 3.1 Pro (compliance correctness + product/UX)
**Plan**: `plans/PHASE-2-PLAN.md`

## Headline
Both models converged on the same load-bearing gaps and each caught things the other missed. Strongest
catches: (1) **`reversibilityOf(false)` alone does NOT enforce TAXPAID-1** — another positive-volume path
can still re-admit taxpaid wine (Codex); (2) **cross-bond blends are a "superposition violation"** — the
"walk to parent's bond" rule is undefined for multi-parent blends and must be **blocked** (Gemini); (3)
the AMEND-1 cascade + fold must operate on **both** bond chains of a `TRANSFER_IN_BOND` (Codex + Gemini);
(4) the Change-Of-Tax-Class event needs **explicit volume semantics** (both); (5) a real **cross-model
tension on OQ-6** (excise amend) where Gemini cites the correct TTB rule.

## Critical Issues (accepted → folded into the plan)
1. **TAXPAID-1 needs a central admissibility guard, not just a non-reversible verdict** (Codex CRIT-3).
   → C5 gains a guard: a positive in-bond increase to a taxpaid lot is rejected except via `RETURN_TO_BOND`.
2. **Cross-bond blends must be blocked** (Gemini CRIT-3). → C1/C2: all blend parents same bond (else
   `TRANSFER_IN_BOND` first); single-parent lineage child walks to its parent's bond; `verify:bond`
   asserts the block.
3. **AMEND-1 + fold must cover BOTH bond chains of a transfer** (Codex CRIT-1, Gemini SF-2). → C7/C2:
   cascade derives scopes from emitted lines (per-line bond); a reversed transfer marks both chains.
4. **Bond-moving ops require explicit, non-null, source≠dest bond** (Codex CRIT-2, DESIGN-3). → S1/C1/C2:
   asymmetric fallback (legacy may derive primary; bond-moving never) + discriminated input types.
5. **Change-Of-Tax-Class needs explicit volume semantics** (Codex CRIT-4, Gemini CRIT-1). → C4: post the
   lot's on-hand volume as-of the event date (from the existing period fold) + stamp `volumeAtEvent`;
   emit nothing for a no-op. Kept as a table event (ledger-op alternative rejected — would put tax class
   on the ledger line, contradicting the settled "class is derived, never stored" architecture; the
   volume-snapshot addresses Gemini's real "toxic reconstruction" concern).
6. **Part VII "In Fermenters" contamination** (Gemini CRIT-2). → new **OQ-7** + guardrail: brand-new-blend
   derivation must not promote null-ABV fermenting must into Part I; declaring out of fermenters posts
   §A2/§A25. Full FERMENTING-state/`DECLARE_WINE` is likely beyond Phase-2 scope — escalate.

## Design Questions / cross-model tension
- **OQ-6 (excise amend) — CROSS-MODEL TENSION, resolved toward Gemini (TTB-correct).** Codex: decide now,
  likely amend the 5000.24 chain. Gemini: **NO — a physical return-to-bond today is a decreasing
  adjustment/credit on the CURRENT period's 5000.24 (Schedule B) or a Form 5620.8 claim; amending the old
  return falsifies history.** → **OQ-6 RESOLVED: AMEND-1 stays 5120.17-only; flag for accountant.**
- **OQ-1 (`CHANGE_OWNERSHIP`) — council consensus = DEFER** (both). Runbook Exact Scope lists it →
  surface the runbook-vs-council tension at the STOP gate; recommendation flips to defer.
- **OQ-2 (per-bond filer identity)** — bond-first AND snapshot filer identity onto the report row at FILE
  (Gemini + Codex).
- **OQ-3 (historical backfill)** — both lean physical-stamp for perf; bond-moving ops explicit regardless.
  Keep NULL+derive for legacy with the asymmetric guard; flag the index tradeoff at the STOP gate.
- **AMEND-1 UI illusion** (Gemini CRIT-4) — a `NEEDS_AMENDMENT` report must be watermarked Draft/Projected,
  never shown as "Filed." Carry-forward chaining still reads last-filed for continuity. → `/design-review`.

## Suggested Improvements (accepted)
- A2 carry-forward: deterministic final tiebreaker (`id desc`); mark ALL filed versions in a downstream period.
- Indexes: composite `(tenantId, formType, bondId, status, periodEnd, generatedAt)`; `(tenantId, lotId, observedAt)` on the event table.
- Partial `RETURN_TO_BOND` (explicit volume).
- Single-bond UX: hide bond UI when count == 1 → design-review.
- Exhaustive compile-time handling of new `OperationType` across reverse/form-map/labels.
- Dedupe same-period blend §A5/20 vs class-change §A10/24/25 (adjust blend target class in the fold).

---
## Raw Response — Codex (gpt-5.4)

**CRITICAL**
- TRANSFER_IN_BOND must amend-mark and fold on both bond scopes, not a single op scope. If the seam/fold
  resolves bond once per op or lot, one side can stay FILED or net to zero. Fix: derive scopes from
  emitted lines, carry explicit bondId per movement row, mark every touched {formType,bondId} chain in
  the same tx.
- Nullable sourceBondId/destBondId unsafe on bond-moving ops. Fix: require explicit ids, require
  sourceBondId !== destBondId, reject fallback-to-primary on those op types.
- Making REMOVE_TAXPAID non-reversible does not by itself enforce TAXPAID-1 — it only closes the undo
  path, not another positive-volume path. Fix: central admissibility guard on positive in-bond increases;
  whitelist only RETURN_TO_BOND + legit originations/transfers.
- ChangeOfTaxClassEvent needs explicit volume semantics or §A10/24/25 will drift/double-count. Fix:
  define the event as moving on-hand volume at observedAt from classBefore→classAfter; emit nothing for a
  no-op.
- OQ-6 not optional: a backdated taxable reversal leaves later filed 5000.24 rows wrong. Fix: decide now
  whether refund RETURN_TO_BOND amend-marks the excise chain, or encode an op-to-form impact map.

**SHOULD FIX**
- A2 query needs a deterministic final tiebreaker (id desc, or latest-version-per-period first).
- @@index([tenantId,formType,bondId]) too weak; add status,periodEnd,generatedAt.
- Bond resolver + event table need tenantId+lotId+observedAt indexes in the same migration.
- cascadeAmendmentMarks should mark all filed versions in a downstream period.
- Enum/mirror work must be explicit and exhaustively handled at compile time (reverse/verdict/form/labels/tests).
- Optional bond fields on LedgerLine aren't enough — use builders/discriminated input types.

**DESIGN QUESTIONS**
- CHANGE_OWNERSHIP: wire semantics now or keep it out of the enum this phase.
- Bond-first filer identity is safe only if snapshotted onto the report row at generation time.
- Historical null bond backfill acceptable only if the fallback is asymmetric in code (legacy → primary
  OK; bond-moving ops → never implicit primary).

## Raw Response — Gemini (3.1 Pro)

**CRITICAL**
1. The "no-volume" tax class change breaks the pure fold — generating §A10/24/25 requires reconstructing
   on-hand volume at the event instant. Fix: make it a balanced LEDGER OP (self-transfer -Vol classA /
   +Vol classB).
2. Part I (Bulk) vs Part VII (Fermenters) contamination — "falls back to class A" promotes fermenting
   must from Part VII to Part I illegally. Fix: a FERMENTING pseudo-class/state; wine stays Part VII until
   a DECLARE_WINE op.
3. Cross-bond blends: superposition violation. Fix: block cross-bond blends; force a TRANSFER_IN_BOND of
   one parent first.
4. AMEND-1 "known-bad state" illusion — a NEEDS_AMENDMENT report shows stale numbers as "Filed." Fix: UI
   masks/overlays a Draft/Projected watermark.

**SHOULD FIX**
1. Double-counting blends (§A5/20) vs same-period class changes (§A10/24/25). Fix: suppress the
   class-change posting when it corrects a cross-class blend child in the same period; adjust the blend's
   target class in the fold.
2. Symmetric transfer-in-bond reversals must cascade NEEDS_AMENDMENT to BOTH bond chains.
3. Partial return-to-bond — RETURN_TO_BOND must specify exact volume, not a state toggle.
4. Single-bond UX friction — hide bond dropdowns/warnings/filters if a tenant has one bond.

**DESIGN / OPEN QUESTIONS**
- OQ-1 CHANGE_OWNERSHIP: Defer (needs alternate-proprietor logic + inventory snapshots).
- OQ-2 per-bond filer identity: Bond-first; ComplianceProfile 1:1 with Bond, fall back to Tenant.
- OQ-3 historical line bond backfill: Stamp every historical line (NULL + read-time derivation destroys
  index usage for high-volume ledger aggregations).
- OQ-6 refund RETURN_TO_BOND amend the FILED 5000.24? NO (critical tax rule) — decreasing adjustment on
  the CURRENT period's 5000.24 (Schedule B) or Form 5620.8; amending the old return falsifies history.
  Keep AMEND-1 scoped strictly to 5120.17.
