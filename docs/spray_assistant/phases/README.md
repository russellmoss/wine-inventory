# Spray Intelligence — phase artifacts

One folder, three artifact types per phase. Naming is mechanical so the
[runbook ledger](../SPRAY_ASSISTANT_RUNBOOK.md#8-status-ledger) can link them without thought.

| Artifact | Filename | Produced by | When |
|---|---|---|---|
| Implementation plan | `S<n>-<slug>-plan.md` | `/plan` | start of the phase |
| Council feedback | `S<n>-council-feedback.md` | `/council` | after the plan, before `/work` |
| Build report | `S<n>-report.md` | you, at ship | after the gate + QA pass |

QA reports live one level up, in [`../qa/`](../qa/), as `S<n>-qa-report.md` — separate because the
QA protocol is a standing gate that outlives any single phase.

Spike sub-artifacts (S0 only) may use a `s0-<topic>.md` prefix, following the VI program's
`p0-*.md` convention — e.g. `s0-hourly-field-inventory.md`, `s0-lwd-estimator-decision.md`,
`s0-retention-economics.md`.

## The phase lifecycle

```
/plan  → S<n>-<slug>-plan.md          (against the repo AS IT EXISTS NOW, not the brief's assumptions)
/council → S<n>-council-feedback.md   (Gemini + Codex; reconcile, record what was folded vs refuted)
/work  → branch + PRs                 (schema-slice PR first if the lane touches schema.prisma)
QA     → ../qa/S<n>-qa-report.md      (QA-PROTOCOL.md §4 safety cases EVERY phase)
/ship  → merge
report → S<n>-report.md               (gate evidence, deviations, measurements, lessons)
ledger → update the runbook §8 row + NOW.md
```

**A lesson that changes a later phase means you edit the runbook**, not just the report. The runbook
is the live document; reports are the archive.

## Before running `/plan` for any phase

Read, in this order:

1. The runbook's §9 scope + gate for that phase — it is the contract.
2. The [discovery brief](../spray-decision-discovery-brief.md) sections the phase implements.
3. The [data-sources design](../spray-data-sources-design.md) — so you don't re-derive a negative
   result that was already probed live.
4. For **S2 and S3a**: [plan 086](../../plans/2026-07-20-086-feat-us-pesticide-registration-plan.md)
   in full. Those phases absorb it; its Key Decisions, measured de-risk, and Risks tables carry over.
   For **S3a** also open `docs/spray orders/Spray work order template.xlsx` — it is the real field
   inventory (transcribed into brief §17.3) and the place the Phase-20 seam has to be drawn.
5. For **S5a/S5b**: the VI runbook's P9 scope — they supersede it, and P9's own decision gate is what
   S0 resolves.
6. **Always:** [RUNBOOK-council-feedback.md](../RUNBOOK-council-feedback.md). The runbook was
   council-reviewed and re-shaped on 2026-07-26; that file records every finding, the adjudication,
   and which findings became standing rules. Several gates exist *because* of a specific finding —
   don't quietly drop one you don't understand.

## Parallel lanes

Lanes marked ⚡ in the same wave are file-disjoint **by design**, and the `/plan` run is where that
gets verified rather than assumed. If two lane plans touch the same file, re-slice or serialize that
file's change before either lane starts. `prisma/schema.prisma` and
`src/lib/spray/contributors.ts` are the known shared choke points — both handled by small
schema-slice PRs landed and serialized ahead of the feature PRs.
