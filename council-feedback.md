# Council Feedback — FIX_RUNBOOK v2.3 (Vintrace-first migration sequencing)
**Date**: 2026-07-07
**Reviewers**: Codex gpt-5.4 + Gemini 3.1 Pro
**Decision reviewed**: FIX_RUNBOOK Decision 6 — flip incumbent migration order from InnoVint-first (synthetic fixtures) to Vintrace-first (real v7 API + sandbox + two warm Vintrace design partners).

## Outcome: flip endorsed, execution hardened
Both models endorse the **direction** (real Vintrace > synthetic InnoVint). Codex: "InnoVint-first now optimizes for control over fixtures instead of control over actual migration risk — the wrong trade." Gemini: "abandoning synthetic for real partners is the correct impulse." The guardrails below (all adopted into FIX_RUNBOOK Phase 7 + ROADMAP Phase 13) address their conditions.

## Adopted (folded into v2.3)
1. **Frozen captures, not live partner systems** (Codex): dev/test against the sandbox + frozen API/CSV extracts as replayable fixture packs; calibrate live last. Keeps the v2.2 "kernel proven on controllable fixtures" benefit with REAL data shapes.
2. **Hard kernel/adapter boundary** (Codex): adapter extracts+maps only; preflight/seed/archive/reconcile/sign-off stay in the kernel; no partner-specific patches leak in (else it's "Macari-first," not "Vintrace-first").
3. **Productize the CSV as an evidence pack** (Codex): required-export list, completeness checks, provenance manifest, explicit unsupported-history disclosure. CSV report-export variance is the real effort sink.
4. **Honest claim, not "seamless"** (both): "opening balances + fully-archived, queryable history," not "full operational continuity day one."
5. **Beachhead order: lead with Macari (standard estate), Sparkling Pointe second** (Gemini): sparkling (tirage/riddling/disgorge/dosage/assemblage) is an edge case that must not distort the V1 model, and winter is peak complexity for a sparkling house.

## Held (with rationale) — the one cross-model tension
Gemini wanted history **relationally stitched** to current-state for "unbroken TTB lineage." **Not adopted** — it contradicts settled correctness (MIGRATE-1: replaying legacy history through the fold double-counts the SEED). Instead: keep the read-only, **structured + queryable** archive, and get TTB continuity by **archiving the last-filed Vintrace reports + recomputing forward periods from the seed** (carry-forward keys off the last filed report). Cutover lineage is auditable-with-archived-provenance, which is correct and honest for an opening-balances migration.

---
## Raw — Codex (gpt-5.4)
VERDICT: Endorse Vintrace-first. Not the naive version — build against frozen sandbox + partner captures, strict adapter/kernel boundaries, explicit "opening balances + archived history" claim. Synthetic-InnoVint-first = false derisking (derisks parsing a fixture you designed, not real migration risk: missing exports, ugly master data, partial archives, naming drift, sign-off friction). Biggest blind spot: the ugly work moved to CSV report-export variance (columns, report versions, human export steps) — likely underestimated vs the API adapter. Turn CSV into a productized evidence pack. Don't let warm partners create kernel special-casing. One flip condition: if unwilling to build replayable fixtures + evidence-grade reconciliation before touching partner data, neither order is safe.

## Raw — Gemini (3.1 Pro)
VERDICT: Do not endorse v2.3 as written (impulse right, execution needs fixes). API-for-current-state + CSV-for-history/TTB/chemistry is the opposite of "seamless" and risks breaking TTB traceback lineage at the cutover date. Sparkling partner is a massive edge case that will warp the foundational model; winter is sparkling's peak (assemblage/tirage/disgorge), not downtime. Finished-goods/materials omitted from automated migration = a "toy" to an estate winery relying on DTC. Solo-founder bandwidth trap: dual API+CSV pipeline × two divergent operational profiles → bespoke consultant, not scalable SaaS. Required pivot: lead with the standard estate, defer sparkling to V2; stitch CSV history to API current-state for unbroken lineage (or you don't have a viable migration product).
