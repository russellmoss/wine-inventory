# S2 QA report — registration + resistance master

**Phase:** S2 (Wave 1, lane B) · **Date:** 2026-07-26 · **Branch:** `claude/s2-spray-intelligence-pesticide-9a83f3`
**Plan:** [S2-registration-resistance-master-plan.md](../phases/S2-registration-resistance-master-plan.md)
**Protocol:** [QA-PROTOCOL.md](QA-PROTOCOL.md) — standing gate, not waivable by parallelism.
**Tenant:** Demo Winery (`org_demo_winery`). Bhutan untouched.

> **Read this first.** S2's only browser-visible surface is the Settings knowledge-sources card.
> Everything else it ships is a data layer with no render yet — S9 owns the risk visual vocabulary.
> Per the plan, **every case that could not be exercised is written down as skipped with its reason.
> A blank row reads as a pass, and that is how a safety regression ships.**

---

## 1. Program-wide safety cases

| Case | Status | Evidence |
|---|---|---|
| **SAFE-14** — source disabled → not-enabled path | ✅ **PASS (service layer)** | `verify:pesticide`: with the `epa-pesticide` subscription OFF, the **real** `lookup.ts` returns `{ok:false, reason:"source-not-enabled"}` and **no pesticide query runs** (asserted on a mocked prisma in `test/pesticide-entitlement.test.ts`). `verify:kb-subscriptions` proves the generic toggle and proves nothing about this lane (council C7) — hence the dedicated case. |
| **SAFE-14** — browser half (card shows the source, default OFF) | ⚠️ **DATA PROVEN, BROWSER DEFERRED** | The card's own loader returns `{"key":"epa-pesticide","defaultEnabled":false,"enabled":false,"docCount":0}` for Demo Winery — the exact row the card renders. **The click-through is deferred:** the protocol requires the dev server from the MAIN checkout, which is currently on a sibling lane's branch with uncommitted work, and requires **the user to log in** (Claude never types a password). Run it at merge. |
| **SAFE-3 / SAFE-4** — gap vs no-code-exists | ✅ **PASS (data layer only — by design)** | Tri-state is a **schema property**: `chk_pra_coded_has_codes` makes `CODED ⟺ non-empty codes` uninsertable otherwise. `verify:pesticide`: 361/361 AIs classified, **zero unclassified**; buckets `{CODED:35, NO_CODE_EXISTS:1, GAP:325}` — `GAP` is a real, populated bucket. K13 premix rollup asserted in `test/pesticide-entitlement.test.ts`. **No rendering exists; S9 owns the visual vocabulary and S2 deliberately did not invent one.** |
| **SAFE-19** — a non-US tenant does not brick | ✅ **PASS (partially exercisable, as planned)** | `verify:pesticide`: `jurisdiction: {country:"BT"}` returns `{ok:false, reason:"jurisdiction-unsupported"}` — **returned, never thrown**. With the source off, entitlement correctly wins first (`source-not-enabled`). S2b builds the manual non-US path. |
| SAFE-1, 2, 5–13, 15–18, 20–23 | ⏭ **NOT YET APPLICABLE** | The surfaces do not exist. Mapping: spray-record cases → **S3a**; rate/PHI/REI and the tenant override → **S2b**; rotation and legality UI → **S7a**; risk rendering + colour vocabulary → **S9**; the assistant tool and its goldens → **S11**. |

## 2. S2's own functional cases

| Case | Status | Evidence |
|---|---|---|
| Gavel 75DF registered on grapes in CA | ✅ PASS | `verify:pesticide` — `10163-6414` → `ok`, CA `REGISTERED` on site codes 1014/1501/29141/29143 (incl. 29143 `GRAPES, WINE`). |
| Fusilade DX registered on grapes in CA | ✅ PASS | `100-1070` → `ok`. Note the LIVE prodno 62562, **not** the 2004-dead 30117 whose site rows still read `A` — the status trap plan 086 hit once. |
| Non-CA US jurisdiction never returns `ok` | ✅ PASS | NY → `state-registration-unknown`, federal fact shown but not as a clearance (⚑ G2). |
| Non-bearing-only never registered for a bearing block | ✅ PASS | Snapshot 2.5 TG (`62719-175`, CA-registered, only `Grapes (Nonbearing)` sites) → `non-bearing-only` for BEARING, `ok` for NON_BEARING (⚑ G1). |
| Malformed reg number never fuzzy-matches | ✅ PASS | U+2011 hyphen → `malformed-reg-number`; **no query runs**. Guard `test/pesticide-boundaries.test.ts` fails CI on any `contains`/`insensitive`/`similarity` in the lane. |
| CA-state-only / 25(b) is `unsupported-format`, not malformed | ✅ PASS | `40989-50001-AA` → `unsupported-registration-format` (⚑ G4 — a legally-required tank adjuvant stays loggable for S3a). |
| Switch → 9 **and** 12 | ✅ PASS | `100-953` → `CODED ["9","12"]`. The K4 CHECK makes the naive AI-keyed join uninsertable. |
| Pristine → 7, 11 · captan `M 04` + `siteType MULTI` | ✅ PASS | `7969-199` → `["7","11"]`; `70506-454` → `["M 04"]` / `MULTI`. |
| Withdrawn product stops answering "registered" | ✅ PASS | Fixture run with one product removed → exactly **1** `WITHDRAWN_FROM_SOURCE`; full re-run → 1 reactivation. |
| A FAILED ingest publishes nothing | ✅ PASS | Exercised for real: the first two ingest runs hit duplicate-canonical rows, ended `FAILED`, and published no revision. |
| Toggle flips and persists | ✅ PASS (script) | `verify:pesticide` flips the subscription on and off through the real tables and restores prior state. Browser click-through deferred with SAFE-14 above. |
| `verify:naming` green before AND after | ✅ PASS | 25/25 assertions, NAMING-1/NAMING-2 hold. |

## 3. Coverage report (the Unit 9 deliverable, with actual numbers)

```json
{
  "totalAis": 361, "coded": 35, "noCodeExists": 1, "gap": 325, "unclassified": 0,
  "fungicideScoped": { "total": 153, "coded": 35, "noCodeExists": 1, "gap": 117, "biologicalsInGap": 30 },
  "biologicalsShareOfGap": 59, "normalizationRecovered": 10, "unattachedCitedSubjects": 3,
  "artifactSha256": "0e42696dec885b6741a7859c46ecd7cb22aa67553c6a95638a4c29e43d6245fc"
}
```

**How to read it.** `totalAis` is every AI on an active grape registration, including insecticides,
herbicides and PGRs that **no FRAC scheme covers** — so the headline `gap: 325` is dominated by
compounds FRAC was never going to code. `fungicideScoped` is the denominator a rotation question
actually depends on: **117 of 153 fungicide-borne AIs have no cited FRAC code from the free sources.**

- **`biologicalsShareOfGap: 59`** (30 within the fungicide scope) is the number that turns the
  Cornell guide from an opinion into a purchasing decision — plan 086 measured that Cornell's value
  concentrates exactly there (4 of its 6 measured misses were biologicals).
- **`normalizationRecovered: 10`** — the copper/mancozeb/strain tail that `ai-normalization.json`
  rescued from being false gaps. Each entry is cited and carries a stated reason.
- **`unattachedCitedSubjects: 3`** — cited codes we could not attach to any AI in our data.

## 4. Findings from this pass (real, and worth carrying forward)

1. **Zampro resolves `GAP`, not `45, 40`** — a plan Success Criterion that the free sources cannot
   meet. This is plan 086's own measured miss, and it is now **visible in the coverage report rather
   than silently wrong**. It is not a defect in the pipeline; it is the pipeline reporting honestly.
   Closing it needs the Cornell guide (a purchase) or a further free source.
2. **The plan's grape regex had a hole.** `/\bGrapes?\b(?!fruit)/` **matches "Grape-Ivy"** (the
   hyphen is a word boundary), an ornamental. Fixed with explicit rejections for Grape-Ivy,
   Grapefruit, Oregongrape and Grapevines (Ornamental); tested both ways.
3. **`exceljs` cannot read this dump at all** — not a memory problem, a hard failure on the zip's
   data-descriptor entries. The plan's fallback (unzip entry + SAX) became the primary path:
   366,591 rows in ~15 s at ~134 MB RSS. `sharedStrings.xml` is 138 bytes; the sheet uses inline strings.
4. **The corpus copy of the source table is lossy for derivation.** Chunking split a mode-of-action
   cell and cost iprodione its code. Deriving from the source page directly (same citation, same
   Tier-1 source) recovered **10 additional codes** — iprodione, mancozeb, sulfur, mefenoxam,
   myclobutanil, pyrimethanil, quinoxyfen, metrafenone, kresoxim-methyl, trifloxystrobin's siteType.
5. **Measured scale drifted from plan 086** (2,509 → **2,420** active grape registrations; 338 → **361**
   distinct AIs) between the 2026-07-15 and 2026-07-21 dumps. Headers unchanged, 0 parse errors —
   ordinary registration churn, not a shape change. Recorded rather than overwritten, per the plan.
6. **CDPR's status column trap is now a test, not a memory.** Liveness is `product.dat` PRODSTAT_IND;
   a product dead since 2004 still carries site-status `A`. 0 parse failures over 1.24M lines.

## 5. Deferred, with reasons

| Deferred | Reason | Owner |
|---|---|---|
| Browser click-through of the settings card | Needs the MAIN checkout (a sibling lane holds it) **and** a user login — Claude never types a password. | Run at merge |
| Any coverage-gap visual treatment | **S9 owns the risk visual vocabulary.** S2 must not invent a fifth colour. | S9 |
| Assistant tool + goldens | One composite tool for the whole program, not two. | S11 |
| PHI / REI / rainfast / product versioning / tenant override | Explicit S2b scope; S2 left schema room only. | S2b |
| NY / OR / WA state layers | No free bulk source (NYSPAD no export, PICOL 404). K12 makes the consequence explicit rather than silent: those tenants get `state-registration-unknown`. | Later — re-probe before S7a |
