# PHASE 0 — Governance & documentation — Completion Report

- **Date:** 2026-07-06
- **Branch:** `feat/phase-0-governance-docs` (off `remediate-base`)
- **Plan:** `plans/PHASE-0-PLAN.md` (reviewed through eng + council + design gates)
- **Posture:** DOCS-ONLY — zero changes under `src/`, `prisma/`, `scripts/`, `package.json`.
- **Result:** ✅ green. `verify:invariants` (21 guarded, 100%) · `verify:tripwires` (14 accounted) · `lint` (0 errors, 21 pre-existing warnings) · `vitest` (1482 passed, 0 failures, 115 skipped) · `build` clean.

---

## What shipped vs. the plan

| Unit | Planned | Done | Delta |
|------|---------|------|-------|
| 1 | Split `INVARIANTS.md` identity clause + add 8 invariants (narrative) | ✅ | Section titled **"Compliance & migration invariants"** (Q3) + new **"Naming & identity presentation"** section placed right after `## Identity & provenance` (design D2). |
| 2 | 8 register notes, `status: planned`/`deferred`, NO `verify:` | ✅ | All 8 created, LF, frontmatter-id matches filename, zero `verify:` lines. |
| 2b | README snapshot (status counts) + template guard-sequencing note | ✅ | README now "29 notes: 21 guarded, 7 planned, 1 deferred"; template has an HTML-comment guard-sequencing rule (not `<%# %>` — the vault uses core Templates, not Templater). |
| 3 | Insert Phase 12.5, rescope 13/14, remediation additions | ✅ | Phase 12.5 inserted; 13 rescoped (kernel + two-track + recon pack + saved mappings + `Depends on: 12.5 + 14`); 14 remaining-scope block; consolidated "Remediation additions" index (hybrid, Q7). No phase renumbered. |
| 4 | Repair dangling refs | ✅ | **All** occurrences repaired (Q1) — see exact targets below. |
| 5 | ux-principles rules 8-12 | ✅ | Rule 11 (offline-first) tagged **"(forward principle — Phase 28; not yet enforceable)"** (design D1); no rule beyond §B.3's five (design D3). |
| 6 | api-strategy InnoVint correction | ✅ | Corrected to public REST API `sutter.innovint.us/api/v1/` (PAT); kept no-QBO gap; anti-lock-in thesis retained. |
| 7 | ADRs 0002 + 0003 (Q5 = both) | ✅ | 0002 identity/naming; 0003 two-track migration **with the rejected replay-through-fold alternative + its Day-1-disagreement failure mode as the explicit regression tripwire**; index updated. |
| 8 | Self-consistency + report + full suite | ✅ | This report; all checks below. |

## Open-question resolutions (as executed)

- **Q1** repair ALL dangling refs + enumerate — done (targets below).
- **Q2** Unit 2b mandatory — done (status counts, no fake %).
- **Q3** combined "Compliance & migration invariants" heading — done (runbook-wins over Gemini's split).
- **Q4** no `DESIGN.md` edit — confirmed; `DESIGN.md` grepped clean of any `Lot.code`-as-identity claim.
- **Q5** BOTH ADRs — done (0003's rationale is the regression tripwire, recorded nowhere else).
- **Q6** full green-suite — run (results above).
- **Q7** hybrid ROADMAP placement — done (rescopes in-phase + a one-line "Remediation additions" index).
- **Q8** keep `Phase 12.5` — done (runbook-wins over Gemini's renumber; no downstream phase renumbered).

## Dangling-reference repairs (exact targets — Q1 / Codex SHOULD-5)

Both target files (`docs/STRATEGY.md`, `docs/competitive-analysis-vintrace-innovint.md`) are **absent** and
were never created — all references redirected to `analysis/incumbent-teardown/SYNTHESIS.md` (the teardown
*is* the competitive analysis). Repaired **6** references (runbook named only 3 — see Surprises):
- `ROADMAP.md` — the BD-milestone note (was `docs/STRATEGY.md`)
- `ROADMAP.md` — the GTM-layer header note (was `docs/STRATEGY.md` + `docs/competitive-analysis-*`, 2 refs)
- `ROADMAP.md` — the Phase-13 ToS clause (was `docs/competitive-analysis-*`)
- `ROADMAP.md` — the cross-cutting sequencing note near EOF (was both)
- `VISION.md` — the product-scope paragraph (was both)

Post-repair grep: `rg "docs/STRATEGY\.md|docs/competitive-analysis-vintrace-innovint\.md" ROADMAP.md VISION.md` → **0 hits**.

## Self-consistency checks (all pass)

- **No `Lot.code`-as-identity language** remains in `INVARIANTS.md`/`ROADMAP.md`/`VISION.md`/`DESIGN.md`/`ux-principles.md` (grep clean; the docs now state `code` unique-per-tenant, `displayName` non-unique, `id` the only opaque identity).
- **Narrative ↔ register agreement:** all 8 notes' `id`/`status` match the `INVARIANTS.md` narrative (7 planned + CBMA-1 deferred).
- **Note well-formedness:** each note has valid frontmatter, `verify`-lines = 0, filename starts with `<id>-`; all LF.
- **`verify:invariants` green** — the 8 planned/deferred notes are correctly skipped (no `verify:`); count is **21 guarded / 100%** (the guarded set, unchanged + now including WORKORDER — see Surprises).
- **Docs-only proof:** every commit's `git diff --cached` touched only docs; zero `src/`/`prisma/`/`scripts/`/`package.json`.

## Surprises / deltas from the plan

1. **Dangling-ref count: 6, not 3.** The runbook named `ROADMAP.md:730-731,754`, but grep found **5** in ROADMAP (also the BD-milestone note + the EOF sequencing note) plus **2** in VISION. Flagged in the plan (Q1); repaired all per your go.

2. **WORKORDER-1/2/3 CRLF (local-only artifact, no repo bug).** A *local* `verify:invariants` under-counted to 18 because `core.autocrlf=true` checks the LF-committed WORKORDER blobs out as CRLF in the Windows working tree, and the checker's `/^---\n/` frontmatter regex silently skips CRLF files. **The committed blobs are LF**, so CI (Linux) always saw all 21 — no repo-level bug. I normalized the local working copies to LF (a no-op against the LF blobs, correctly excluded from the commit). *This is a live demonstration of the exact silent-skip hole both councils flagged.* **Recommended follow-up (Phase 1 governance-hardening backlog):** add an automated frontmatter schema-validator (the Zod check Gemini suggested) that fails on any malformed/CRLF note regardless of `verify:` — it is code, so it belongs with a guard phase, not here. The README tip + note template now warn about LF/CRLF.

3. **Register counts (accurate):** 29 note files = **21 guarded** (incl. WORKORDER, LF in the blob) + **7 planned** + **1 deferred**. The old README "18 / 100%" was stale (pre-dated WORKORDER + these 8); the new snapshot reflects reality.

4. **MIGRATE-1 `appliesTo`** points at `scripts/migrate-legacy-lots.ts` (closest existing anchor); the migration lib doesn't exist yet, so the brain-context hook stays inert for this rule until Phase 3 — correct for a planned invariant.

## Grounding corpus landed with this phase (per your PR-scope decision)

To keep the redirects + ADR/note cross-links resolvable (they point at `analysis/incumbent-teardown/` and
`FIX_RUNBOOK.md`, which were untracked), this PR also commits the **markdown** grounding corpus:
`analysis/incumbent-teardown/` (10 md), `FIX_RUNBOOK.md`, `fix-council-feedback.md`. All docs, no code.

**Not landed (out of scope, follow-up):** the `innovint-docs/` + `vintrace-docs/` scraped corpuses and
`scripts/*.py` scrapers (referenced by `FIX_RUNBOOK.md` Phase 4, not by any Phase-0 governance doc; the
scrapers are code). `FIX_RUNBOOK.md`'s references to those corpus dirs are soft until they land separately.

## Backlog surfaced for later phases

- **Phase 1:** treat the NAMING-2 "renamed →/also-known-as" affordance + cross-identifier search as concrete UI deliverables (design D3); add the automated invariant-frontmatter validator (Surprise 2).
- **Phase 2:** decide AMEND-1 begin-balance regeneration mechanism (sync vs. queued `NEEDS_CALCULATION` lock); decide new-blend-lot tax-class assignment (TAXCLASS-1).
- **Phase 3:** confirm MIGRATE-1's real enforcing path + repoint `appliesTo`.

## Landing

Docs-only, 4 commits on `feat/phase-0-governance-docs` + this report + grounding corpus. Next: `/ship` → PR → CI green → squash-merge → delete branch.
