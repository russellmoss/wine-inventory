---
title: S0 Unit 7 — retention economics, measured on an isolated Neon branch
type: phase-artifact
phase: S0
unit: 7
date: 2026-07-26
---

# S0 Unit 7 — retention economics

Measured 2026-07-26T20:01:04.868Z on Neon branch `br-fragrant-unit-at08020n` of project `muddy-shape-80817041`,
connected as **`app_rls`**.

## 0. Isolation, and why the connection role matters

All DDL and synthetic load ran on a throwaway copy-on-write branch. The guard is a control, not a
comment (council C9): before any DDL it asserts the branch id was passed explicitly, that the target
host appears in **no** production connection string in `.env` (pooled and unpooled normalized so
neither can sneak past), and that the host is a Neon endpoint. Any doubt exits non-zero.

Connected as **`app_rls`**, the NOBYPASSRLS role production actually uses. Every latency below therefore includes the RLS policy predicate. Measuring as the owner would have understated all of them, in the direction that makes the design look affordable.

## 1. Storage by scale — OBSERVED, append-only

| Scale | Rows | Total | Heap | Indexes | Bytes/row | **MB per vineyard-year** |
|---|---|---|---|---|---|---|
| 1 vineyard-year | 8,760 | 3.91 MB | 1.48 MB | 2.41 MB | 468 B | **3.91 MB** |
| 10 vineyard-years | 87,600 | 54.34 MB | 14.49 MB | 39.83 MB | 650 B | **5.43 MB** |
| 5-year projection (15 vineyards × 5 y) | 657,000 | 413.03 MB | 108.67 MB | 304.31 MB | 659 B | **5.51 MB** |

⚠️ **Plan §1.7's ~9.4 MB/vineyard-year extrapolation was withdrawn by council C12 and this does not
reinstate it.** That number was derived from the daily table's per-row cost, which is confounded by
upsert churn and structural indexes. The figures above are measured on the actual row shape under the
actual lifecycle, which is what C12 asked for.

## 2. Lifecycle per series kind — the churn the first draft would have missed

Council C9: bulk-inserting once and measuring understates churn-heavy patterns badly. Forecast
"replace in place" creates dead tuples, VACUUM pressure and different index locality from a one-time
load. So each kind is exercised under **its own real lifecycle**.

### OBSERVED

Pattern: append-only, one bulk load

Total 3.91 MB · 468 B/row

### FORECAST

Pattern: 12 × (delete horizon → insert 15 vineyards × 168 h × 4 issuances ≈ 10,080 rows), VACUUM only at the end

| | Total | Heap | Indexes | Dead tuples |
|---|---|---|---|---|
| after 1 cycle | 5.48 MB | 1.68 MB | 3.78 MB | 0 |
| after 12 cycles, pre-VACUUM | 25.38 MB | 20.04 MB | 5.32 MB | 0 |
| after plain VACUUM | 25.39 MB | 20.05 MB | 5.32 MB | — |
| after VACUUM FULL | 4.02 MB | 1.68 MB | 2.34 MB | — |

**10,080 live rows replaced wholesale per cycle. After 12 cycles the table is 4.6× its steady-state size — 19.90 MB of growth for zero additional data**, median cycle 291 ms.

⚠️ **The first version of this measurement was wrong and reported "−0% bloat".** It compared the
size before VACUUM against the size after it. Plain `VACUUM` does not return space to the operating
system — it marks pages reusable — so that difference is approximately zero *by construction*,
whatever the churn. It would have concluded that forecast replace-in-place is free, from a
measurement incapable of showing anything else. The comparison above is against **steady state**:
the same live row count after one clean cycle.

This is what makes the FORECAST retention posture a real decision rather than a preference. A
replace-in-place forecast table costs its steady-state size **plus** whatever accrues between
autovacuum runs, and that overhead scales with **issuance cadence, not with data volume** — the one
cost dimension a row-count projection cannot see.

### REANALYSIS

Pattern: bulk load, then a full-table revision pass (a reanalysis is revisable — see Unit 2 §1)

Total 7.84 MB · 

One full revision pass took 316 ms and grew the table from 3.97 MB to 7.84 MB before VACUUM recovered it to 7.84 MB.

⚠️ **This exercises the hazard Unit 2 named:** a reanalysis is *revisable*, so a stored ERA5 row
can drift out of agreement with the live archive. A recomputation months later can legitimately
produce a different answer from the same code — a replay-integrity problem hiding in the series
kind that looks safest.

## 3. Write path

A storage spike that measured only reads would miss this entirely (council C9).

| Operation | Time |
|---|---|
| `bulkInsert8760` | 0.20 s |
| `upsertOnConflict` | 0.39 s |
| `pruneOneSeason` | 0.04 s |
| `vacuumAfterPrune` | 0.08 s |

## 4. Read latency at the 5-year projection

`EXPLAIN (ANALYZE, BUFFERS)` per shape, warm cache, 12 runs, as `app_rls` with the RLS policy active.

### Arm A — single table, composite index (tenancy invariants fixed)

Table size 418.55 MB (heap 110.34 MB, indexes 308.16 MB)

| Read shape | p95 | median |
|---|---|---|
| S5b black rot — contiguous wet-run scan for one vineyard over a date range, OBSERVED ONLY | 265.6 ms | 154.9 ms |
| S5b downy secondary — night-hour filter on temperature and RH over a range | 42.3 ms | 36.2 ms |
| S6 residual — open-ended range from an arbitrary application timestamp to now, summing precip and integrating temperature | 105.8 ms | 50.2 ms |
| S7b — forward forecast hours from now, LATEST ISSUANCE ONLY | 39.2 ms | 21.1 ms |
| REPLAY — the inputs to a decision made at time D, keyed on ingestedAt (the genuine bitemporal read, NOT an issuedAt <= D approximation) | 42.2 ms | 33.6 ms |
| The C3 CONTRACT read — a historical read that must EXCLUDE forecast rows. A performance question wearing a correctness question's clothes | 31.6 ms | 27.8 ms |

### Arm B — partial indexes per series kind

Table size 408.22 MB (heap 110.34 MB, indexes 297.83 MB)

| Read shape | p95 | median |
|---|---|---|
| S5b black rot — contiguous wet-run scan for one vineyard over a date range, OBSERVED ONLY | 151.6 ms | 142.8 ms |
| S5b downy secondary — night-hour filter on temperature and RH over a range | 43.9 ms | 35.9 ms |
| S6 residual — open-ended range from an arbitrary application timestamp to now, summing precip and integrating temperature | 111.4 ms | 48.6 ms |
| S7b — forward forecast hours from now, LATEST ISSUANCE ONLY | 28.5 ms | 20.6 ms |
| REPLAY — the inputs to a decision made at time D, keyed on ingestedAt (the genuine bitemporal read, NOT an issuedAt <= D approximation) | 184.4 ms | 52.8 ms |
| The C3 CONTRACT read — a historical read that must EXCLUDE forecast rows. A performance question wearing a correctness question's clothes | 26.5 ms | 24.8 ms |

### Arm A vs Arm B

| Read shape | A (composite index) | B (partial indexes) | Δ |
|---|---|---|---|
| `s5b_blackrot_wetrun` | 265.6 ms | 151.6 ms | -114.0 ms |
| `s5b_downy_night` | 42.3 ms | 43.9 ms | +1.6 ms |
| `s6_residual` | 105.8 ms | 111.4 ms | +5.6 ms |
| `s7b_forward_forecast` | 39.2 ms | 28.5 ms | -10.7 ms |
| `replay_bitemporal` | 42.2 ms | 184.4 ms | +142.2 ms |
| `c3_contract_read` | 31.6 ms | 26.5 ms | -5.1 ms |

Index footprint: A 308.16 MB · B 297.83 MB.

### The C3 contract read

The historical read that must **exclude forecast rows** is a performance question wearing a
correctness question's clothes. If the safe query is the slow one, the safe query stops getting
written — not through malice, through a p95 chart. Its number above is the one to watch when S1
picks the physical design.

## 5. Side result — the cheaper key shape (NON-DECISIONABLE)

> NON-DECISIONABLE (council C10). Costed as an input to a future tenancy-rules conversation. S0 draws no conclusion from it and it appears in no gate.

| | Total | Heap | Indexes |
|---|---|---|---|
| with the tenancy invariants (text cuid PK + `(tenantId, id)` guard) | 54.34 MB | 14.49 MB | 39.83 MB |
| natural composite key, no cuid PK, no composite guard | 18.34 MB | 11.82 MB | 6.49 MB |

Difference: **36.01 MB (66%)** at 10 vineyard-years.

**This is not a recommendation and S0 does not act on it.** Plan §1.7 measured that 41% of the daily
table's index budget has never been scanned, and both zero-scan indexes are structural: the cuid
primary key and the `(tenantId, id)` composite-FK guard from the AGENTS.md Phase-12 checklist step 5.
Council C10 was explicit that neither is S0's to relax — a storage spike is the wrong layer at which
to reopen a tenancy safety invariant. The number is recorded because a future tenancy-rules
conversation will want it, and for no other reason.

## 6. Criteria

| Criterion | Observed | Threshold | Verdict |
|---|---|---|---|
| C6 | 5.51 MB/vineyard-year | ≤ 25.00 MB | ✅ PASS — OBSERVED, append-only, at the 5-year projection |
| C7 | 265.6 | ≤ 250 | ❌ FAIL — worst shape: s5b_blackrot_wetrun (Arm A) |

## 7. Branch lifecycle

Branch `br-fragrant-unit-at08020n` on host `ep-odd-fog-aty1qpiv-pooler.c-9.us-east-1.aws.neon.tech`, created for this measurement from the default
branch and carrying a full copy of production **including the Bhutan tenant** — which is why deleting
it is part of this unit rather than cleanup.

Two honest notes on the deletion:

- The plan asked for branch deletion in a `finally`. **There is no `NEON_API_KEY` in `.env`**, so this
  process cannot delete a Neon branch; only the measurement TABLES are dropped in the `finally`.
- The branch is therefore created with an **`expiresAt`**, so Neon removes it automatically even if
  every step here fails, and the deletion is additionally performed and recorded explicitly.
