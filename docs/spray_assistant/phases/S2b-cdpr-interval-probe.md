# S2b Unit 0 — CDPR `prod_site.dat` PHI/REI probe

**Run:** 2026-07-26 · **Source:** `https://files.cdpr.ca.gov/pub/outgoing/product/` (the directory S2
already ingests; host already in `TRUSTED_DOMAINS`) · **Files fetched:** `prod_site.dat` (86,951,970 B,
1,242,171 rows), `product.dat` (18,198,016 B, 71,086 rows), `site.dat`, `target_pest.dat`,
`preharvest_interval.dat`, `reentry_interval.dat` · **Snapshot date:** 2026-07-24

## Verdict

> **The hypothesis is CONFIRMED: `prod_site.dat` carries per-product, per-crop PHI and REI, and the
> `0`-versus-not-recorded question has a clean, safe answer.**
>
> **But it does NOT turn S2b into an ingestion phase.** Coverage on grapes is **40.4% PHI / 64.0% REI
> / 30.4% both** — far below Unit 7's pre-committed 80% REGULATORY threshold — and the source
> contains internal contradictions including physically impossible values. **It is a proposal source
> that gives curation a large head start, not an authority that replaces it.**

## 1. Layout (decoded empirically, then oracle-validated)

Fixed-width, 68 chars + CRLF, no header. Column boundaries found by profiling which positions are
always blank across 414,057 sampled rows.

| Cols | Field | Notes |
|---|---|---|
| `[0,7)` | `prodno` | right-aligned; joins to `product.dat` |
| `[8,13)` | `site_code` | joins to `site.dat` |
| `[15,19)` | qualifier (`0A00`) | not decoded, not needed |
| `[20,24)` | signed numeric | not decoded (values like `-39`, `0100`); **not** an interval |
| `[25,28)` + `[28]` | **PHI** value + unit | unit ∈ `D`/`H`/`M`/blank |
| `[29,32)` + `[32]` | **REI** value + unit | unit ∈ `D`/`H`/`M`/blank |
| `[34]` | status | `A`ctive / `I`nactive |

Unit alphabet matches `preharvest_interval.dat` and `reentry_interval.dat`, both of which are
**unit lookups only** (`D`=DAYS, `H`=HOURS, `M`=MINUTES) — they carry no values, which is what first
suggested the values had to live on the product-site row.

**Which field is which** is settled by the distributions, and they are unambiguous:

- **Field A → PHI.** Top values `7D` (66,423), `14D` (64,593), `1D`, `3D`, `21D`, `30D`, `60D`.
- **Field B → REI.** Top values `12H` (261,897), `4H` (186,217), `24H` (122,656), `48H` (48,711), `72H`.

## 2. Oracle validation — PASSED

| Oracle | Expected | Found in the data |
|---|---|---|
| **Mancozeb** (DuPont Manzate Pro-Stick `352-704`, Manzate 200 `352-398`) | **66-day PHI** — the brief §14 calls it *"a structural constraint on the whole program"* | **PHI = 66 days, REI = 24 hours** ✅ |
| **Pristine** (`7969-199`) | 14-day PHI, 12-hour REI | **PHI = 14 days, REI = 12 hours** ✅ |
| **Captan** (Drexel 80WDG `66222-58`, Drexel 50W `19713-235`) | long REI, brief §8.4 says *"4 days for many activities"* | **REI = 72 h / 48 h / 4 days** ✅ |
| **JMS Stylet-Oil** (`65564-1`) | the separation-rule worked example | REI = 4 hours; PHI not recorded |

`66D` appears on **102** grape site rows. Three independent published values reproduced exactly.

## 3. ⚠️ The kill question — ANSWERED, and favourably

The probe's stated go/no-go was: *"is a fixed-width `0` distinguishable from 'not recorded'? If not,
the field is unusable, because `PHI = 0` reads as pick today."*

**It is distinguishable — the UNIT column is the null discriminator, not the value.**

| Measurement | Count (of 1,242,171 rows) | Meaning |
|---|---|---|
| value `≠0` with a **blank** unit | **2** (PHI), **2** (REI) | essentially never — 4 rows total |
| value `=0` **with** a unit | **739** (PHI), **155** (REI) | a genuine zero-interval (apply up to harvest) |
| blank unit | 939,441 (PHI), 598,212 (REI) | **not recorded** |

So the rule is exact:

- **blank unit → NOT RECORDED → resolve `UNKNOWN`.** Never `0`.
- **non-blank unit → a real interval,** including a legitimate `0D`.
- the 4 ambiguous rows (nonzero value, blank unit) → treat as **not recorded**, fail closed.

**Ingesting on the value would be catastrophic**: 76% of PHI cells contain `0`, so a value-keyed
ingest would tell growers *"PHI = 0 days, pick today"* for three-quarters of the corpus. Ingesting on
the unit is safe. This must be a contract test, not a code comment.

## 4. Coverage — measured against Unit 7's pre-committed thresholds

Distinct **ACTIVE** products with a grape site row (`1014` GRAPES ALL / `29141` / `29143` GRAPES WINE
/ `1020` VINIFERA): **4,965 products · 4,842 distinct EPA registration numbers.**

| Fact | Products with it recorded | Share |
|---|---|---|
| PHI | 2,004 | **40.4%** |
| REI | 3,180 | **64.0%** |
| **both** | 1,508 | **30.4%** |
| neither | 1,289 | 26.0% |

**Against the pre-committed threshold — REGULATORY (PHI *and* REI) ≥ 80% unblocks S7a — this is
30.4% and the threshold is NOT MET.** Recorded before the measurement, honoured after it.

⚠️ The denominator matters: this is the whole CDPR grape corpus. **The curated top-60-AI set is a
different, much smaller, and probably better-covered population** (major branded fungicides carry
fuller DPR records than the biological tail). Unit 7 must re-measure against the curated set
specifically; this number sizes the *corpus*, not the *curated target*.

## 5. ⚠️ New hazard the probe found: the source contradicts itself

A product typically has **three near-duplicate grape site rows** (`1014`, `29141`, `29143`) and they
do not always agree.

| Disagreement | Products | Share |
|---|---|---|
| conflicting **PHI** values across grape rows | 32 | 0.6% |
| conflicting **REI** values | 33 | 0.7% |
| PHI recorded on one grape row, **blank** on another | 70 | 1.4% |
| REI recorded on one grape row, **blank** on another | 59 | 1.2% |

Verified against raw bytes (the slicing is correct — these are DPR's values, not a parse artifact):

```
"  36220  1014  0A00 -39   12H 12H A"   EMPOWER  -> PHI = 12 HOURS
"  36220 29141  0A00 0100  13D 12H A"   EMPOWER  -> PHI = 13 DAYS
"  61970  1014  0A00 0010   7M  0  A"   BONIDE   -> PHI = 7 MINUTES
```

A **12-hour** and a **7-minute** pre-harvest interval are not plausible label values. So the source
carries transcription errors, and a naive "take the first matching row" ingest would pick one at
random. Two consequences, both folded into the plan:

1. **Join rule:** consider *all* grape site rows for a product and take the **most restrictive
   recorded** value — the same most-conservative rollup S2 already uses for resistance codes (K13).
   Surface a disagreement as a review flag, never resolve it silently.
2. **This is exactly why rule §3.1 exists.** DPR's product database is *DPR's transcription of a
   label*, not the label. It is evidence for a reviewer. It feeds the `--propose` path (KD-8) and
   **never auto-populates a curated row.**

## 6. What this changes in the plan

- **S2b stays a curation phase.** It does not become an ingestion phase. The 80% gate is not met.
- **But curation gets a large head start**: the reviewer's job shifts from *research from scratch* to
  *verify and fill* for ~40% of PHI and ~64% of REI. That should materially reduce the §10 calibration
  spike's per-product minutes, and the spike should now measure the **verify** workflow, not the
  research one.
- **KD-12 still stands, unchanged.** This source carries **one base REI per product-site** — it is
  *not* task-conditional. Council G2's 12-hour-scouting versus 48-hour-tying distinction is **not** in
  this data, so the `pesticide_product_rei_condition` child relation is still required for early-entry
  exceptions. The DPR value seeds the base, nothing more.
- **Unit 2 gains a seeding step** (propose-only) and **two new contract tests**: unit-keyed nullity,
  and most-restrictive rollup across conflicting grape rows.

## 7. Reproducing

Scripts are throwaway and live in the session scratchpad (`layout.mjs`, `analyze.mjs`, `oracle.mjs`,
`coverage.mjs`). Nothing was committed to `src/` and no production code path was touched. If the
seeding step in Unit 2 is built, these become `scripts/seed-product-facts.ts --propose`.
