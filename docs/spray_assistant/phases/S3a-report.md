---
title: "S3a — spray application record + planned harvest date — phase report"
type: phase-report
phase: S3a
date: 2026-07-26
branch: claude/s3a-spray-application-record-b199eb (+ -pr2-cores, -pr3-surface)
status: SHIPPED — PR1+PR2 merged (Wave 2 UNBLOCKED); PR3 browser-QA'd green (2 findings, both fixed in-phase)
---

# S3a — phase report

## What shipped

| PR | Units | State |
|---|---|---|
| [#523](https://github.com/russellmoss/wine-inventory/pull/523) — schema slice | 1–3 | **MERGED** 2026-07-26 |
| [#524](https://github.com/russellmoss/wine-inventory/pull/524) — domain cores + `verify:spray-record` | 4–12 | **MERGED** 2026-07-26 — **Wave 2 (S7a, S8, S6, S7b) is unblocked** |
| PR3 — minimal surface + docs | 13–15 | **browser-QA'd GREEN** ([qa report](../qa/S3a-qa-report.md)) — 2 findings (area provenance, correction datetime shift), both fixed in-phase (`d11c38d8`) and re-proven in browser + DB |

Seven tenant-scoped tables (full Phase-12 checklist), 22 enums, DB-enforced append-only
(BEFORE UPDATE/DELETE triggers, per-table bookkeeping allowlists), at-most-once correction
covering the VOID path, knownness CHECKs (SPRAY-3), partial-unique planned-harvest stream,
GIN'd snapshot arrays. Cores: record / correction / read / drying / planned-harvest / legacy
seam + the ProductFactsResolver port with the null resolver. 79 unit tests;
`verify:spray-record` = 14 assertion groups, all green on Demo Winery.

## Gate evidence (runbook §9 S3a)

| Clause | Evidence |
|---|---|
| RLS / tenant-isolation | verify:tenant-isolation (148 tables + 5 spray cases) ✓; verify:spray-record #1 ✓ |
| Correction-as-event (in-place edit refused) | verify:spray-record #2 (4 tables) + #4 ✓ |
| Ten-block round trip | #3 ✓ (10 lines, per-block acres/times/rates, MEASURED vs HEADER_VOLUME) |
| driedBeforeRain derived + override | #7 ✓ (null port ⇒ INSUFFICIENT_DATA; attributed override wins) |
| Legacy back-compat low-confidence, blocks rotation-OK | #11 ✓ |
| Unknown product ⇒ unknown, never clear | #8 + #9 (DB CHECK bites) ✓ |
| Planned-harvest audited | #12 ✓ (versions, point-in-time, split picks, watermark replay) |
| verify:spray-record e2e | all 14 ✓ (run twice: pre- and post-merge with S2+S4 schema slices) |
| QA report | **GREEN** — [qa/S3a-qa-report.md](../qa/S3a-qa-report.md): SAFE-2/SAFE-10/SAFE-3/SAFE-17/SAFE-19 pass at S3a scope, 17 rows explicitly deferred to their owning phases, 16/16 persistence proofs, mobile pass, fixtures purged, naming green before+after. |

## Deviations from the plan (all called out in the PRs)

1. **Two follow-up migrations** beyond the planned one: the supersession self-FKs went
   RESTRICT→NO ACTION (a corrected chain is mutually-referencing — even the sanctioned owner
   purge could never delete it), and the shared trigger was rewritten via `to_jsonb(OLD)`
   (PL/pgSQL plans `OLD."column"` against every firing table's rowtype; five tables lack the
   pointer column).
2. **File names:** `drying-override-core.ts` / `legacy-mapping-core.ts` (plan said
   `drying-override.ts` / `legacy-mapping.ts`) — the `-core.ts` suffix is what makes
   verify:ai-native see them, which the plan's Unit 12 INTERNAL registration requires.
3. **Mix→material FK** is `ON DELETE NO ACTION`, not `SET NULL` (SET NULL would fire the
   immutability trigger mid-purge; a lone material-line delete is unreachable anyway).
4. **PER_AREA / PER_CARRIER_VOLUME denominators** are explicit REQUIRED inputs
   (`perAreaUnit`, `perCarrierVolume`) — G3 said never guess a dose basis, so the entry form
   collects the denominator instead of the write core assuming one.
5. **Audit actions** reuse the existing `AuditAction` enum values (CREATE/UPDATE) with
   entityType + summary carrying the semantics — new enum values would need an isolated
   ALTER TYPE migration (the Windows enum rule) for zero information gain.

## Open decisions carried (defaults applied, cheap to reverse — flagged for Russell)

- **D1** canonical metric: as planned (entered + canonical; PUR edge reprints the filed number).
- **D2** allowlist tier: honest INTERNAL entries with the S11 retirement condition named — no
  new tier. S11's gate now names the five entries to retire.
- **D3** segment gap: 24 h, warn-only (`SEGMENT_GAP_WARN_HOURS` in `record-pure.ts` — one
  constant to change).

## What the next phases must know

- S7a: PHI reads the EARLIEST open planned date; consume `plannedHarvestChangesSinceCore` as a
  watermark; REI is UNKNOWN on a null block finish (all three now written into runbook §9 S7a).
- S2b: implement `ProductFactsResolver.resolveMany`; owns the pest-code table for
  `targetPestCode` (runbook §9 S2b).
- S6: `materialRatePerHa` legitimately returns null — handle as unknown, never zero dose
  (runbook §9 S6).

## Lessons

- The shared generated Prisma client was clobbered by sibling lanes THREE times mid-run —
  `npx prisma generate` immediately before every tsc/verify/dev is not optional advice.
- `runAsTenant(T, () => prisma.x.count())` silently loses the ALS context (lazy PrismaPromise);
  always `async () => await …`.
