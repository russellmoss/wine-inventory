---
title: S0 Unit 0 — is observed hourly data backfillable?
type: phase-artifact
phase: S0
unit: 0
date: 2026-07-26
status: resolved — backfillable
---

# S0 Unit 0 — is observed hourly data backfillable?

_Probed live 2026-07-26T19:16:36Z. Every identifier and endpoint tried is in §5, so a negative result is reproducible rather than asserted._

## 1. The verdict

> **OUTCOME 1 — BACKFILLABLE.** Past hourly observed data for our geographies is retrievable on demand from a keyless archive. **The irreversibility argument is WITHDRAWN** from plan §1.3 and from Unit 8. There is no scheduling urgency, and no minimal-capture job needs to jump the queue ahead of the rest of S1.

| Archive | Usable for CART inputs? |
|---|---|
| NCEI ISD `global-hourly` (identifier RESOLVED from the station-history inventory, not guessed) | ✅ yes |
| Iowa Environmental Mesonet ASOS archive (keyless) | ✅ yes |
| IEM depth — does the keyless archive reach every season S0 needs (2021–2025)? | ✅ yes; deepest year with data probed was **2005** |

## 2. NWS `/stations/{id}/observations` — the trailing window, measured

⚠️ **This corrects the plan.** Plan §1.3 called the live window *"a trailing window of roughly a day
or two"*. It probed T-1 (78 obs) and T-7 (0 obs) and read the gap the pessimistic way. Bisected here at
every intermediate offset, the window is **seven days**, and it is seven days at every US site:
T-1 through T-6 are full, T-7 is the partial boundary day, T-10 onward is empty. The live endpoint has
roughly **7× more retry headroom than the plan assumed** — which matters independently of the archive
finding, because it means a single missed daily cron run was never going to cost data even if no archive
existed. Two premises pointed the same way and both were wrong in the same direction.

| Site | Station | T-1d | T-2d | T-3d | T-4d | T-5d | T-6d | T-7d | T-10d | T-14d | T-30d | T-90d | T-365d |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Stoney Hill | `KDYL` @ 9.8 km | 78 | 78 | 78 | 78 | 83 | 76 | 5 | 0 | 0 | · | · | · |
| Russian River Ranch | `KSTS` @ 3.3 km | 80 | 80 | 79 | 80 | 78 | 78 | 3 | 0 | 0 | · | · | · |
| Madera | `KMAE` @ 17.4 km | 58 | 57 | 48 | 54 | 59 | 61 | 2 | 0 | 0 | · | · | · |
| Paro | _no NWS coverage (rule §3.9)_ | —|—|—|—|—|—|—|—|—|—|—|—|
| Monticello AVA (Virginia) — fixture only | `KCHO` @ 13.2 km | 79 | 80 | 78 | 78 | 80 | 78 | 3 | 0 | 0 | · | · | · |

`·` = not probed (two consecutive empties past T-7 stops the walk rather than burning requests).

## 3. The archives

### NCEI ISD `global-hourly`

The plan's first attempt guessed a USAF-WBAN identifier and got an empty response, which proves nothing.
This probe resolves the mapping from `isd-history.csv` first, then queries. Nearest inventory stations,
filtered to those covering 2021 through 2025:

| Site | Nearest ISD stations (id · call · distance) |
|---|---|
| Stoney Hill | `72511354786` KDYL @ 9.8 km<br>`72409514792` KTTN @ 17.2 km<br>`72408594732` KPNE @ 27.8 km |
| Russian River Ranch | `72495723213` KSTS @ 3.7 km<br>`99999993245` BODEGA 6 WSW @ 28.2 km<br>`A0704900320` KO69 @ 36.0 km |
| Madera | `74504693242` KMAE @ 17.4 km<br>`72389799999` KFCH @ 21.1 km<br>`72389093193` KFAT @ 26.1 km |
| Paro | `43399099999` VQPR @ 0.8 km<br>`55773099999` PAGRI @ 50.1 km<br>`42299099999` GANGTOK @ 79.8 km |
| Monticello AVA (Virginia) — fixture only | `99999903759` CHARLOTTESVILLE 2 SSE @ 2.7 km<br>`72401693736` KCHO @ 13.2 km<br>`72311403715` KLKU @ 44.7 km |

ISD carries `TMP` and `DEW` but **not** a relative-humidity field — RH is derived from temperature and
dew point. That is fine for CART, whose inputs are RH *and* dew-point depression, both computable from
the same pair. It matters for Arm B, where a derived RH is not an independent measurement of RH.

### Iowa Environmental Mesonet ASOS archive

Keyless, and it serves `relh` **derived and published alongside** `tmpf`/`dwpf`, plus `sknt` (wind) and
`p01i` (hourly precip) — the complete CART input set from the same measured ASOS network the live NWS
observations endpoint exposes. Probe results in §5.

**Keyless archive depth, probed at Stoney Hill (KDYL):**

| Year probed (Jul 1–3) | Rows returned |
|---|---|
| 2021 | 95 ✅ |
| 2015 | 59 ✅ |
| 2005 | 96 ✅ |
| 1998 | 0 ❌ |

⚠️ **A 429 is not an absence.** The first run of this probe hit `HTTP 429 Too many requests` on the
deepest year and would have recorded *"no data before 2015"* — a fabricated absence understating the
archive's depth by a decade, in the exact direction that would have made the retention argument look
stronger than it is. The probe now retries 429/5xx with backoff and treats only 404 as a coverage signal.

### Arm B station availability — answers plan §7 and §8 q6

The plan's own confidence table said the thing that would raise Unit 5 from MEDIUM is *"confirmation
that a usable measuring station exists near more than one fixture site"*, and §8 q6 asked whether Arm B
is acceptable with only one. Measured:

| Site | Station | Distance | Archive | Independently measured | RH column |
|---|---|---|---|---|---|
| Stoney Hill | `KDYL` | 9.8 km | IEM ASOS (keyless archive) | temperature, dewPoint, wind, precipitation | published (derived) |
| Russian River Ranch | `KSTS` | 3.3 km | IEM ASOS (keyless archive) | temperature, dewPoint, wind, precipitation | published (derived) |
| Madera | `KMAE` | 17.4 km | IEM ASOS (keyless archive) | temperature, dewPoint, wind, precipitation | published (derived) |
| Paro | `VQPR` | 0.8 km | NCEI ISD global-hourly | temperature, dewPoint, wind | absent |
| Monticello AVA (Virginia) — fixture only | `KCHO` | 13.2 km | IEM ASOS (keyless archive) | temperature, dewPoint, wind, precipitation | published (derived) |

**Answer to §8 q6: Arm B is NOT limited to one site. All five fixture sites have a usable station**, four of them under 20 km. The plan's stated remedy — "re-weight site selection toward stations rather than regimes" — is unnecessary; the regime-selected set already has station coverage.

⚠️ **But the win is smaller than the table first looks, and this must not be flattened into**
**"we validated RH against measured RH".** No station in this set measures relative humidity.
ASOS measures **temperature and dew point** with separate sensors; the `relh` column IEM publishes is
**computed from that pair**, exactly as ours would be. Comparing our derived RH against their derived RH
tests the psychrometric arithmetic, not the measurement.

So Arm B's independent quantities are **temperature, dew point, wind speed and hourly precipitation**.
RH is validated only *transitively*, through T and Td. Unit 1b must therefore set its input-tolerance
budget on **dew-point depression** as the primary humidity criterion rather than on RH, and Unit 5 must
state the derivation every time it reports an RH error figure.

A second consequence, in our favour: **Paro has an ISD station 0.8 km away (`VQPR`, Paro Airport)**
with measured temperature, dew point and wind across the seasons we need. The plan assumed Bhutan was
*"ERA5 only"*, and it is not. That gives the jurisdiction-neutrality site a real validation arm and is
a correction back to the data-sources design, which treats non-US as reanalysis-only.

### Regional / state mesonets — recorded, not integrated

| Network | Covers | Access | Keyless |
|---|---|---|---|
| Synoptic Data (MesoWest) | national aggregator (ASOS, RAWS, state mesonets) | API token required; free non-commercial tier | ❌ |
| CA CIMIS | California agricultural stations (Madera, Russian River) | free API key by registration; hourly RH + measured wind at 2 m over turf | ❌ |
| Iowa Environmental Mesonet — ASOS archive | every US ASOS/AWOS site incl. KDYL, KCHO, KSTS, KMAE | keyless CGI, decades of history | ✅ |
| NEWA (Cornell) | Northeast/Midwest ag stations, incl. computed leaf wetness | out of scope by plan §2 (NEWA integration of any kind is excluded) | ❌ |
| Bhutan / NCHM | Paro | no public hourly API found; reanalysis only | ❌ |

## 4. What this changes

1. **Plan §1.3's irreversibility argument is withdrawn.** No conclusion in Unit 8 may cite
   irrecoverable loss of observed data, because observed data is recoverable.
2. **No minimal-capture job jumps the queue.** Open question 5 for Russell is answered by measurement:
   it does not need to, so S1 keeps its planned shape.
3. **The daily-cron risk is downgraded from permanent to latency.** A missed capture is still a gap in
   the live series, and it is still SILENT — there is no alerting on a skipped capture — but it is now
   a gap that can be filled after the fact, not data destroyed.
4. **The retention decision gains an option Unit 8 must consider explicitly:** *backfill-on-demand* for
   OBSERVED, not just retain-or-prune. Storage stops being the only lever.
5. ⚠️ **The silent-cron risk does NOT go away, it changes shape.** The intra-cron window (council G3 —
   downy secondary sporulation can complete in a single night, and a grower asking at 08:00 when the
   cron ran at 00:00 is missing the decisive eight hours) is a *freshness* problem, and backfill does
   nothing for freshness. Unit 6 still owns whether the system fails open or closed in that window.
6. **Arm B is a five-site arm, not a one-site arm** (§3). That is the single largest change to Unit 5's
   confidence, and it lands with the caveat above: the independent quantities are T, Td, wind and
   precipitation, never RH itself.

**What did NOT change:** none of this makes the estimator better. Backfillable inputs and a five-site
Arm B bound the *input* problem harder; there is still no measured leaf wetness anywhere in this set,
and Arm A remains the only arm that touches a decision. Plan §1.1's narrowing stands unaltered.

## 5. Every attempt, recorded

A negative result is only useful if it is reproducible. Every request this probe issued:

| Source | Site | What | HTTP | Records | Note |
|---|---|---|---|---|---|
| NWS | stoney_hill | nearest stations | 200 | 4 | KDYL@9.8km, KTTN@17.2km, KCKZ@24.9km, KPNE@27.8km |
| NWS obs | stoney_hill | T-1d (6h window) | 200 | 78 | temperature=78 dewpoint=78 relativeHumidity=78 windSpeed=63 qc:V=78 |
| NWS obs | stoney_hill | T-2d (6h window) | 200 | 78 | temperature=78 dewpoint=78 relativeHumidity=78 windSpeed=74 qc:V=78 |
| NWS obs | stoney_hill | T-3d (6h window) | 200 | 78 | temperature=78 dewpoint=77 relativeHumidity=77 windSpeed=75 qc:V=78 |
| NWS obs | stoney_hill | T-4d (6h window) | 200 | 78 | temperature=78 dewpoint=78 relativeHumidity=78 windSpeed=77 qc:V=78 |
| NWS obs | stoney_hill | T-5d (6h window) | 200 | 83 | temperature=83 dewpoint=83 relativeHumidity=83 windSpeed=81 qc:V=83 precipitationLastHour=2 |
| NWS obs | stoney_hill | T-6d (6h window) | 200 | 76 | temperature=76 dewpoint=76 relativeHumidity=76 windSpeed=74 qc:V=76 |
| NWS obs | stoney_hill | T-7d (6h window) | 200 | 5 | temperature=5 dewpoint=5 relativeHumidity=5 windSpeed=4 qc:V=5 |
| NWS obs | stoney_hill | T-10d (6h window) | 200 | 0 | EMPTY |
| NWS obs | stoney_hill | T-14d (6h window) | 200 | 0 | EMPTY |
| NWS | russian_river | nearest stations | 200 | 4 | KSTS@3.3km, AR323@14.2km, HWKC1@25.5km, OAAC1@47.2km |
| NWS obs | russian_river | T-1d (6h window) | 200 | 80 | temperature=80 dewpoint=80 relativeHumidity=80 windSpeed=77 qc:V=80 |
| NWS obs | russian_river | T-2d (6h window) | 200 | 80 | temperature=80 dewpoint=80 relativeHumidity=80 windSpeed=76 qc:V=80 |
| NWS obs | russian_river | T-3d (6h window) | 200 | 79 | temperature=79 dewpoint=79 relativeHumidity=79 windSpeed=78 qc:V=79 |
| NWS obs | russian_river | T-4d (6h window) | 200 | 80 | temperature=80 dewpoint=80 relativeHumidity=80 windSpeed=79 qc:V=80 precipitationLastHour=2 |
| NWS obs | russian_river | T-5d (6h window) | 200 | 78 | temperature=78 dewpoint=77 relativeHumidity=77 windSpeed=78 qc:V=78 precipitationLastHour=3 |
| NWS obs | russian_river | T-6d (6h window) | 200 | 78 | temperature=78 dewpoint=78 relativeHumidity=78 windSpeed=76 qc:V=78 |
| NWS obs | russian_river | T-7d (6h window) | 200 | 3 | temperature=3 dewpoint=3 relativeHumidity=3 windSpeed=3 qc:V=3 |
| NWS obs | russian_river | T-10d (6h window) | 200 | 0 | EMPTY |
| NWS obs | russian_river | T-14d (6h window) | 200 | 0 | EMPTY |
| NWS | madera | nearest stations | 200 | 4 | KMAE@17.4km, KFAT@26.2km, MTACA@34.9km, PG425@39.1km |
| NWS obs | madera | T-1d (6h window) | 200 | 58 | temperature=58 dewpoint=58 relativeHumidity=58 windSpeed=49 qc:V=58 |
| NWS obs | madera | T-2d (6h window) | 200 | 57 | temperature=57 dewpoint=57 relativeHumidity=57 windSpeed=57 qc:V=57 |
| NWS obs | madera | T-3d (6h window) | 200 | 48 | temperature=48 dewpoint=48 relativeHumidity=48 windSpeed=45 qc:V=48 |
| NWS obs | madera | T-4d (6h window) | 200 | 54 | temperature=54 dewpoint=54 relativeHumidity=54 windSpeed=49 qc:V=54 |
| NWS obs | madera | T-5d (6h window) | 200 | 59 | temperature=59 windSpeed=56 qc:V=59 dewpoint=48 relativeHumidity=48 |
| NWS obs | madera | T-6d (6h window) | 200 | 61 | temperature=61 dewpoint=61 relativeHumidity=61 windSpeed=61 qc:V=61 |
| NWS obs | madera | T-7d (6h window) | 200 | 2 | temperature=2 dewpoint=2 relativeHumidity=2 windSpeed=2 qc:V=2 |
| NWS obs | madera | T-10d (6h window) | 200 | 0 | EMPTY |
| NWS obs | madera | T-14d (6h window) | 200 | 0 | EMPTY |
| NWS | monticello_va | nearest stations | 200 | 4 | KCHO@13.2km, KGVE@31.4km, KW13@41.2km, KLKU@44.7km |
| NWS obs | monticello_va | T-1d (6h window) | 200 | 79 | temperature=79 dewpoint=79 relativeHumidity=79 windSpeed=79 qc:V=79 |
| NWS obs | monticello_va | T-2d (6h window) | 200 | 80 | temperature=80 dewpoint=80 relativeHumidity=80 windSpeed=75 qc:V=80 |
| NWS obs | monticello_va | T-3d (6h window) | 200 | 78 | temperature=78 dewpoint=78 relativeHumidity=78 windSpeed=73 qc:V=78 |
| NWS obs | monticello_va | T-4d (6h window) | 200 | 78 | temperature=78 windSpeed=76 qc:V=78 dewpoint=74 relativeHumidity=74 |
| NWS obs | monticello_va | T-5d (6h window) | 200 | 80 | temperature=79 dewpoint=80 relativeHumidity=79 qc:V=79 precipitationLastHour=5 windSpeed=72 qc:Z=1 |
| NWS obs | monticello_va | T-6d (6h window) | 200 | 78 | temperature=78 dewpoint=78 relativeHumidity=78 windSpeed=74 qc:V=78 |
| NWS obs | monticello_va | T-7d (6h window) | 200 | 3 | temperature=3 dewpoint=3 relativeHumidity=3 windSpeed=3 qc:V=3 precipitationLastHour=1 |
| NWS obs | monticello_va | T-10d (6h window) | 200 | 0 | EMPTY |
| NWS obs | monticello_va | T-14d (6h window) | 200 | 0 | EMPTY |
| NCEI ISD | - | station-history inventory | 200 | 29662 | inventory downloaded — identifier mapping is now RESOLVED, not guessed |
| NCEI ISD | stoney_hill | 72511354786 (KDYL) 2024-06 week | 200 | 242 | TMP=234 DEW=234 WND=232 precip=196 qc=[TMP:5\|TMP:9\|WND:5\|WND:9] |
| NCEI ISD | russian_river | 72495723213 (KSTS) 2024-06 week | 200 | 213 | TMP=204 DEW=204 WND=204 precip=200 qc=[TMP:5\|TMP:9\|WND:5\|WND:9] |
| NCEI ISD | madera | 74504693242 (KMAE) 2024-06 week | 200 | 208 | TMP=199 DEW=199 WND=198 precip=200 qc=[TMP:5\|TMP:9\|WND:5\|WND:9] |
| NCEI ISD | paro | 43399099999 (VQPR) 2024-06 week | 200 | 186 | TMP=186 DEW=186 WND=185 precip=0 qc=[TMP:1\|TMP:5\|WND:1\|WND:9] |
| NCEI ISD | monticello_va | 99999903759 (CHARLOTTESVILLE 2 SSE) 2024-06 week | 200 | 2313 | TMP=2304 DEW=0 WND=192 precip=200 qc=[TMP:1\|TMP:9\|WND:1\|WND:9] |
| NCEI ISD | stoney_hill | 72511354786 FULL 2021 season (Apr 1–Oct 31) | 200 | 6834 | TMP=6610 DEW=6610 WND=6555 · 1.33× hourly density |
| IEM ASOS | stoney_hill | DYL 2024-06 week | 200 | 206 | tmpf=206 dwpf=206 relh=206 sknt=204 p01i=206 |
| IEM ASOS | russian_river | STS 2024-06 week | 200 | 174 | tmpf=174 dwpf=174 relh=174 sknt=174 p01i=174 |
| IEM ASOS | madera | MAE 2024-06 week | 200 | 174 | tmpf=174 dwpf=174 relh=174 sknt=173 p01i=174 |
| IEM ASOS | monticello_va | CHO 2024-06 week | 200 | 186 | tmpf=186 dwpf=186 relh=186 sknt=186 p01i=186 |
| IEM ASOS | stoney_hill | DYL depth check 2021-07-01..03 | 200 | 95 | has data |
| IEM ASOS | stoney_hill | DYL depth check 2015-07-01..03 | 200 | 59 | has data |
| IEM ASOS | stoney_hill | DYL depth check 2005-07-01..03 | 200 | 96 | has data |
| IEM ASOS | stoney_hill | DYL depth check 1998-07-01..03 | 200 | 0 | EMPTY |

Full URLs are in the machine-readable sidecar `s0-observed-backfill.json`.

---

_NWS requests carry a User-Agent per provider policy. A 404 is treated as a coverage signal and is
never retried._
