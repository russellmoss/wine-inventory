---
title: S0 Unit 2 addendum — NWS re-issuance cadence and per-property interval widths
type: phase-artifact
phase: S0
unit: 2
date: 2026-07-26
---

# S0 Unit 2 addendum — NWS cadence and interval widths

Sampled every 10 min for 3 h, ending 2026-07-26T22:55:56.947Z.

## 1. Re-issuance cadence — §1.4's ceiling input

Council C5 withdrew the plan's "~170×" forecast-row multiplier as false precision and required the
ceiling to be derived from a MEASURED cadence. Measured:

| Site | Distinct issuances seen | Gaps between them | Product age at sampling (min / median / max) |
|---|---|---|---|
| stoney_hill | 2 | 550 min | 0.4 h / 1.9 h / 9.4 h |
| russian_river | 3 | 85 min, 55 min | 0.6 h / 1.4 h / 2.2 h |
| madera | 4 | 60 min, 60 min, 60 min | 0.5 h / 1.0 h / 1.5 h |
| monticello_va | 2 | 151 min | 0.5 h / 1.9 h / 2.9 h |

**Median observed re-issuance interval: 1.0 h.**

⚠️ **But do not use that pooled median — it hides the finding.** The per-gridpoint spread in the table
above is ~9×, from an exact 60-minute cadence at Madera to 550 minutes at Stoney Hill. Pooling them
produces one number that describes no actual gridpoint. (This is the same mistake an earlier draft of
Unit 8 made from a shorter window; see that document's §4 for the correction written into it.)

With the retained horizon measured at **179 h** (Unit 2 §3), the forecast-row ceiling is therefore a
**range, per gridpoint**:

```
rows/vineyard/year = 8,760 valid hours × ceil(179 h horizon / cadence)

  Madera         cadence 1.0 h  → 179×  ≈ 1,568,040 rows/vineyard/year
  Russian River  cadence 1.2 h  → 150×  ≈ 1,311,000
  Monticello     cadence 2.5 h  →  72×  ≈   630,720
  Stoney Hill    cadence 9.2 h  →  20×  ≈   175,200
```

Two conclusions:

1. **The withdrawn "~170×" was a reasonable UPPER estimate, not an overestimate.** Council C5 was
   still right to withdraw it — it was asserted before measurement and happened to land near the top
   of a range nobody had established. Being accidentally close is not the same as being derived.
2. ⚠️ **A retention job sized on one gridpoint's cadence is wrong by an order of magnitude at
   another.** S1 must size per gridpoint, or measure cadence at ingest and adapt. This is a named S1
   requirement in ADR 0011.

## 2. ⚠️ Per-property interval widths — the finding that changes S1's parser

NWS gridpoint properties are ISO8601 **intervals**, not instants, and the widths differ per property
*and* grow with lead time. Measured distribution, one full response:

| Property | 1 h | 2 h | 3 h | 4 h | 5 h | 6 h | 7 h | 8 h | 9 h | 10 h | 11 h | 12 h | 13 h | slots | hours covered |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `temperature` | 121 | 16 | 8 | 3 | · | · | · | · | · | · | · | · | · | 148 | 189 |
| `dewpoint` | 52 | 24 | 8 | 2 | 5 | · | 1 | 2 | 1 | · | · | · | · | 95 | 189 |
| `relativeHumidity` | 125 | 17 | 5 | · | 1 | · | · | · | · | 1 | · | · | · | 149 | 189 |
| `windSpeed` | 21 | 22 | 9 | 5 | 4 | 3 | 1 | 1 | · | · | 1 | · | 1 | 68 | 189 |
| `skyCover` | 60 | 5 | · | 1 | · | 18 | · | · | · | · | · | 1 | · | 85 | 194 |
| `quantitativePrecipitation` | · | 1 | · | · | · | 13 | · | · | · | · | · | · | · | 14 | 80 |

### ⚠️ The CART inputs are the COARSEST properties in the response

Read down the `slots` column, not across the widths. Over the same 189-hour horizon:

| Property | Slots | Mean bin width | Is it a CART input? |
|---|---|---|---|
| `relativeHumidity` | 149 | 1.3 h | ✅ |
| `temperature` | 148 | 1.3 h | ✅ |
| `dewpoint` | **95** | **2.0 h** | ✅ |
| `windSpeed` | **68** | **2.8 h** | ✅ |
| `quantitativePrecipitation` | **14** | 5.7 h, covering only **80 of 189 h** | wetness interruption |

**Temperature is delivered at roughly twice the resolution of dew point and four times that of wind** —
and dew point and wind are two of CART's three inputs. So the estimator's inputs do not merely arrive
coarse, they arrive coarse *unevenly*, and a naive parser that expands every interval to hourly rows
produces a series in which temperature varies hour to hour while wind sits flat for three. That is a
manufactured correlation between the two, in a threshold model that reads both.

`quantitativePrecipitation` is worse still: 14 slots covering **less than half** the horizon. The rest
of the horizon has no QPF at all — which is a coverage gap, and rule §3.6 says a gap must never render
as "no rain."

### Why this is not a parsing detail

**A 10-hour-wide relative-humidity bin fed into an hourly leaf-wetness model is nine fabricated hours
wearing the tenth one's value.** CART is a threshold model: a flat 10-hour RH plateau either crosses
87.8% for all ten hours or for none of them. There is no intermediate. So a single coarse bin at long
lead time can manufacture — or erase — a ten-hour wetness run, and the wet-run segmentation that feeds
every pathogen model in S5b inherits that artifact whole.

Three consequences, none of which S0 is scoped to fix:

1. **S1's NWS adapter must carry the native interval width per value**, not expand each interval into
   N identical hourly rows and forget it happened. Plan 097 already learned this for the hourly
   forecast modal (`precipDurationH` exists on `VineyardForecastHourly` for exactly this reason); the
   CART inputs need the same treatment, per property, because their widths differ from each other.
2. **The LWD confidence band must degrade with the width of the bin the hour came from.** An hour
   derived from a 1-hour bin and an hour derived from a 10-hour bin are not the same evidence, and
   rule §3.5 already requires estimated values to be labeled.
3. **S7b's application window inherits it too.** `quantitativePrecipitation` arrives in 2- and 6-hour
   bins only, so "will it rain in the next hour" is not a question this product answers at all.

Widths also GROW with lead time, so the degradation is systematic rather than random: the far end of
the horizon is uniformly coarser than the near end. Any model consuming day 6 of the forecast is
consuming a materially different data product from the one it consumes on day 1.
