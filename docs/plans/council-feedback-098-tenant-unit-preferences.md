# Council Feedback — Plan 098: Tenant unit display preferences

**Date**: 2026-07-26
**Plan**: `docs/plans/2026-07-26-098-feat-tenant-unit-preferences-plan.md`
**Reviewers**: Codex gpt-5.4 (types + data layer), Gemini 3.1 Pro (product logic + domain + UX)
**Adjudicated by**: Claude (each finding verified against the codebase before acceptance)

## Verdict summary

Both reviewers endorse the overall shape (tenant pref on AppSettings, display-edge only,
timeZone seam). Two findings kill parts of the plan as written; several tighten it.
Two headline "CRITICAL"s were **rejected on verification** (details below) — one was
factually stale, one mathematically wrong.

## Critical Issues (accepted — plan must change)

### C1 — The backfill-to-NULL of the two per-vineyard columns is destructive and unproven (Codex C1 + Gemini SF3, converged)
Both per-vineyard columns are *user-writable today*: the weather toggle writes
`VineyardWeatherConfig.unitSystem` (`src/lib/weather/actions.ts:414-423`), and
`VineyardDetail.defaultUnit` is editable in `VineyardModal.tsx:60,76` **and by the
assistant** (`src/lib/assistant/entities.ts:390`). Provenance (geo-seeded vs chosen)
cannot be proven from the data, and `UPDATE … SET NULL` is not reversible.
**Fix (Gemini's hoist pattern + Codex's phase split):**
1. Migration A (additive only): the 7 new AppSettings columns. Ships alone.
2. Readers/writers become null-safe (code, no data change).
3. Migration B (separate, audited): per tenant, if ALL vineyards share one value,
   hoist it to the tenant master `unitSystem` and NULL only the rows matching the
   hoisted value; rows that differ are preserved as genuine explicit overrides.
   With one live tenant + demo this is a small, checkable script.

### C2 — "Resolved-only" reads can't represent Auto (Codex C2)
`ClimateSummary` has one `unitSystem` field (`read-core.ts:64-65,229`); if it carries
only the resolved value, the weather card can't know whether the vineyard is on
explicit-override or Auto, and the 3-state toggle can't render its state. Same for
geometry editors and the assistant's binary `defaultUnit` enum.
**Fix:** carry BOTH: `unitSystemOverride: UnitSystem | null` + resolved
`unitSystem: UnitSystem` on `ClimateSummary` and the vineyard serialization;
`setVineyardUnitSystem` accepts null (Auto); the `VineyardModal` unit toggle and the
assistant `defaultUnit` entity field gain an explicit "Auto / winery default" option.

### C3 — Don't rename the lowercase unions; bridge them (Codex C3)
`vineyard/units.ts` `"imperial"|"metric"` and the assistant entity enum are *input
contracts* with many construction sites and tests. Renaming them is a churn-heavy
type-safety regression disguised as cleanup.
**Fix:** the new display-pref layer owns the canonical uppercase types;
`normalizeUnitSystem`-style bridges convert at the boundary; legacy enums stay put.
(Plan's "canonical type everywhere" decision is softened to "canonical type in the
new layer + bridges".)

### C4 — U11 under-specifies the assistant seam mechanics (Codex C4)
`ToolContext` (`registry.ts:15-29`), the `run.ts:179` construction site, and the
DB-free test constructions (`test/assistant-run-loop*.test.ts`) must all change in
the SAME unit, with `units` optional so intermediate states compile.
`query-climate`'s direct settings read is legitimate (tools may read the DB; only the
loop may not) but must resolve through the same chain as the web card.
**Fix:** U11 explicitly lists these files; `units?: UnitPrefs` optional on the seam.

### C5 — Input round-trip drift on volume entry (Gemini C1, narrowed)
1000 gal → 3785.41 L (Decimal 10,2) → naive `fromCanonical` renders 999.9995.
Gemini's proposed schema change (store raw + unit + canonical) is **rejected** —
storage stays canonical (D8) — but the display hazard is real.
**Fix in U9:** unit-appropriate rounding on form hydration (the spacing round-trip
already does this); convert ONLY user-touched fields on submit (dirty check — an
untouched field never re-saves a re-converted value); round-trip tests
(1000 gal → L → "1,000 gal") in the display-module suite. TTB is unaffected — it
reads canonical litres through its own legally-exact `compliance/gallons.ts`.

## Rejected findings (verified false or out of scope)

- **Gemini "CRITICAL 2" (GDD can't convert at the display edge): WRONG.** GDD
  base-conversion has no offset term (base 50 °F ≡ 10 °C), so daily clamping commutes
  exactly with the scaling: `max(0, 1.8·x) = 1.8·max(0, x)`. Summed over a season the
  ×1.8 edge conversion is exact, which is why `gddCToF`/`C_TO_F_GDD` already work this
  way and the Winkler normals are °F-native. No change.
- **Codex "speech.ts missing °F TTS rule": STALE.** Verified `src/lib/voice/speech.ts:77`
  already maps `°F` → "degrees Fahrenheit". Task removed from U11.
- **Gemini C4 (restructure audit storage into structured events rendered at
  view-time): OUT OF SCOPE.** Append-only prose audit is a deliberate invariant
  (correction-as-event moat); re-architecting it is its own feature. The no-touch
  stance stands; a "render audit amounts in display units" follow-up goes to TODOS.md.
- **Codex "use Prisma enums": REJECTED per repo precedent.** `coverageState` and
  `unitSystem` comments say "NOT a Prisma enum" deliberately (Windows enum-migration
  rule). Mitigation adopted instead: `getUnitPrefs()` is the ONLY reader and parses
  raw strings into precise unions (read-side permissive, write-side strict), so
  nothing downstream ever sees `string | null`.

## Suggested Improvements (accepted)

1. **Per-unit verification gates, not back-loaded QA** (Codex): U1 gains a
   tenant-data audit gate before Migration B; U6/U7 gain override-vs-Auto resolver
   tests; U8/U9 gain a residual-`" L"` grep gate + round-trip tests; U11 gains an
   auto-inherit golden case alongside the imperial-tenant case.
2. **Unit adornment inside the input box** (Gemini SF2): volume/spacing inputs get an
   inline non-editable unit suffix, not just a hint line below — misreading the unit
   on a transfer overflows a real tank.
3. **Namespace the raw metric keys in tool payloads** (Gemini SF4, adapted): keep raw
   values for evals/back-compat but nested under a `metric` subobject, with the
   display strings as the primary fields the prompt tells the model to use verbatim —
   reduces "25 °F" hallucinations from a °C field.
4. **Gemini's cache question is already answered** by the timeZone precedent:
   `revalidatePath("/", "layout")` on save busts the server-component cache; the plan
   keeps it.
5. **Cost-per-volume rounding** (Gemini DQ3): `formatCostPerVolume` is display-only
   (CostPanel is informational); all reconciliation math stays canonical $/L. Show
   converted rate at 3 significant decimals to avoid implying false precision.

## Design Questions (need the user's answer before /work)

1. **Hectoliters.** Gemini: EU/SA/AU bulk convention is hL, not L ("15,000 hL" vs
   "1,500,000 L"). Add `HL` as a third volume option (`L | HL | GAL`), or keep the
   binary and roll litres up to hL automatically above a threshold for metric
   tenants? (Weight already rolls up kg→t and lb→short tons, so Gemini's short-ton
   objection was already covered by the plan.)
2. **Cellar-floor dosing rates.** Gemini's sharpest domain point: US work orders say
   "2 lbs / 1000 gal", and forcing a cellarhand to mental-math 239 mg/L while holding
   a 50 lb sack is a real over-addition risk. Keep dosing fully metric in v1 (plan's
   stance) or add a *work-order-execution-view-only* dual display (mg/L primary,
   lbs/1000 gal secondary) as part of this plan / a fast follow?
3. **Is U9 (entry in preferred units) a MUST?** Codex: shipping gallon *readouts*
   while entry forms stay litres is a split-brain UI. Promote U9 to MUST, or accept
   the split for v1?
4. **Weather-card toggle granularity.** The card's 3-state toggle sets one
   per-vineyard `unitSystem` that overrides *both* temp and precip. A Canadian tenant
   with °C + inches at the tenant level would find the card override coarse. Accept
   coarse per-vineyard override (recommended — it's a rare edge and the tenant
   setting handles the common case), or make the card override per-dimension too?

---

## Raw Response — Codex

**CRITICAL**
- U1's blanket `SET NULL` backfill is unsafe on the live tenant and not reversible. Both legacy columns are already real user-editable settings, not just seed defaults: weather override writes exist in `src/lib/weather/actions.ts:414-423`, vineyard geometry unit is user-facing in `src/app/(app)/reference/VineyardModal.tsx:60,76`, and the assistant can edit `defaultUnit` in `src/lib/assistant/entities.ts:390-397`. Fix: do not null-backfill blindly. Either preserve existing values as explicit overrides, or do a one-off audited migration on the single prod tenant that only clears rows proven auto-seeded. If you cannot prove provenance, the migration is forward-only and should be described that way.
- The plan cannot represent or clear `Auto` correctly because it keeps only the resolved value on reads. `ClimateSummary` exposes one `unitSystem` field today (`src/lib/weather/read-core.ts:64-65,229`), `ForecastDayModal` consumes one field (`src/app/(app)/vineyards/weather/ForecastDayModal.tsx:75`), and the weather setter is still binary/non-null (`src/lib/weather/actions.ts:414-423`). The same problem exists for vineyard geometry: `VineyardModal` is binary (`src/app/(app)/reference/VineyardModal.tsx:60,76`) and the assistant `defaultUnit` enum is binary (`src/lib/assistant/entities.ts:390`). Fix: split raw override from resolved value everywhere: e.g. `unitSystemOverride: UnitSystem | null` plus `resolvedUnitSystem: UnitSystem`. If `defaultUnit` becomes nullable, its editors need an explicit `Auto` path too.
- "Use `METRIC | IMPERIAL` everywhere" is the wrong type-safety move if applied literally. Weather uses uppercase display prefs (`src/lib/weather/units-core.ts:11-15`), but vineyard math and assistant input contracts intentionally use lowercase input/display units (`src/lib/vineyard/units.ts:10`, `src/lib/assistant/entities.ts:191,383,390`). Those are different APIs. Fix: introduce a new typed AppSettings/display-pref layer and bridge functions. Do not rename vineyard/assistant input enums unless you are prepared to update every construction site and test.
- U11 under-specifies the assistant seam. `ToolContext` only carries `timeZone` today (`src/lib/assistant/registry.ts:15-29`), `runAssistant` only constructs `{ user, lastUserMessage, timeZone }` (`src/lib/assistant/run.ts:179`), and the loop tests instantiate `runAssistant` directly (`test/assistant-run-loop.test.ts:84-89`, `test/assistant-run-loop-draft.test.ts:62-67,153-158`). Also, `query-climate` still imports settings directly (`src/lib/assistant/tools/query-climate.ts:5,50-54`). Fix: add `units` to the seam in the same unit as the tests, make the new field optional until all call sites are updated, and remove direct settings resolution from tools if you want the seam to be real.

**SHOULD FIX**
- "No enums" is a type-safety regression unless you add a hard parser layer. Seven new nullable `TEXT` columns on `AppSettings` means Prisma gives you `string | null` everywhere, which recreates the exact drift problem that already exists in weather. Fix: prefer Prisma enums for the finite pref domains. If you refuse enums, then `getUnitPrefs()` must be the only reader and must parse raw DB strings into precise unions before anything else sees them.
- `getUnitPrefs()` needs read-side validation, not just write-side validation, mirroring `getWineryTimeZone()` in `src/lib/settings/data.ts:68-71`. Otherwise one bad stored value poisons layout render, assistant prompt construction, or client providers. Fix: unknown values fall back per-dimension/master/default, never propagate as raw strings.
- U6 does not enumerate all nullable weather construction sites. It is not just `WeatherCard`. There are server actions and DTOs that currently assume a concrete unit string or coalesce it ad hoc, e.g. `src/lib/weather/actions.ts:335,414-423` and `src/app/(app)/vineyards/weather/ForecastDayModal.tsx:75`. Fix: explicitly list every accept/return contract that changes when `VineyardWeatherConfig.unitSystem` becomes nullable.
- The plan has at least one stale bug claim: `speech.ts` already has the Fahrenheit TTS rule in `src/lib/voice/speech.ts:76-77`. Fix: remove that task from U11 or replace it with the actual failing voice case and a test.
- Validation is too back-loaded. U12 is not enough for a 12-unit refactor. Fix: add gates after U1 (live-tenant data audit or prod-snapshot dry run), after U6/U7 (override-vs-resolved tests, null/auto tests), after U8/U9 (grep residual hardcoded `L`, round-trip input tests, `$ / volume` conversion tests), and after U11 (assistant seam compile coverage plus `query_climate` goldens for tenant-imperial and auto-inherit cases).
- Split migration phases. Adding nullable AppSettings columns is additive; null-rewriting legacy columns is semantic data surgery. Doing both in one migration raises rollback and deployment-order risk on the live tenant. Fix: ship additive columns first, then null-safe readers/writers, then only do any legacy-column rewrite after tenant audit.

**DESIGN QUESTIONS**
- Do you actually want per-vineyard geometry override to survive? Right now `defaultUnit` is still editable in both the reference UI and the assistant (`src/app/(app)/reference/VineyardModal.tsx:41,60,76`, `src/lib/assistant/entities.ts:390`). If inheritance is the new model, either add `Auto` everywhere or remove this override surface entirely.
- Is U9 really optional? Shipping gallons/feet readouts while leaving core volume-entry forms in liters creates a split-brain UI. If that is acceptable for v1, say it plainly. If not, move U9 into MUST.
- How are "master system" semantics defined when some dimensions can override but wind speed and shoot length follow master? You need one explicit resolver contract for "what unit does this dimension use" or the implementation will drift across weather, phenology, and assistant formatting.

## Raw Response — Gemini

### CRITICAL (Will cause data corruption, compliance failures, or user revolt)

**1. Floating-Point Drift on Input Round-Trips (Data Quality & Compliance)**
* **What's wrong:** The plan states: *"vessel capacity + transfer fields accept preferred unit, convert to canonical L on submit"*. Converting Gallons to Liters (×3.78541) on write, and back to Gallons on read, introduces floating-point drift. A user inputs `1000` gallons for a tank capacity. It saves as `3785.41` L. On the next edit, or on a TTB compliance report (which demands exact gallons), it displays as `999.9` or `1000.1` gallons depending on your format rounding.
* **The fix:** For exact physical capacities and compliance-critical volumes, you cannot use lossy edge-conversion. You must store the user's explicit input alongside the canonical value (e.g., `volume_raw`, `volume_unit`, `volume_l`), OR use exact rational math libraries and store a high-precision decimal (e.g., 6-8 decimal places for Liters) to guarantee a flawless round-trip to the exact whole gallon.

**2. GDD Clamping Math is Mathematically Invalid if Deferred to Display (Domain Correctness)**
* **What's wrong:** GDD (Growing Degree Days) cannot be accurately converted from a metric accumulation to an imperial accumulation at the edge. GDD requires zeroing out negative daily accumulations (if T_mean < Base). Base 10°C and Base 50°F are exactly equivalent (50°F = 10°C), but rounding differences in daily sensor readings mean clamping at daily boundaries diverges between systems over a 200-day season.
* **The fix:** The display formatter cannot just take a metric GDD integer and multiply by 1.8. The `formatGdd` utility must either fetch raw daily temps and integrate them in the target scale, or the DB must pre-calculate and store both Base-10°C and Base-50°F arrays natively.

**3. Cellar Dosing Reality vs Lab Purity (Domain Correctness)**
* **What's wrong:** The plan explicitly excludes dosing, keeping it strictly `mg/L` or `g/hL` as an "international standard". This is true for the *lab*, but false for the *cellar floor*. US winemakers routinely write work orders as "add 2 lbs / 1000 gal" (e.g., for DAP or Bentonite). Forcing a US cellarhand to read "239 mg/L" on a work order tablet and do mental math while holding a 50 lb sack is a massive physical risk (over-addition ruins wine).
* **The fix:** Split dosing display into "Lab/Concentration" (keep metric/canonical) and "Cellar/Addition Rate" (must respect `unitWeight` per `unitVolume` overrides on work order views).

**4. Persisted Audit/Timeline Prose Hardcoded to Liters (Pattern Consistency)**
* **What's wrong:** Skipping audit prose means a US tenant's history will read: *"User racked 3785 L to Tank B."* A US winemaker doesn't think in liters; this renders the audit log mentally inaccessible.
* **The fix:** Stop persisting formatted strings in the audit log. Persist structured events (`{ action: "RACK", amount: 3785.41, unit: "L" }`) and render the prose dynamically at view-time using the user's current display preferences.

### SHOULD FIX (UX friction and domain blindspots)

**1. Missing "Short Tons" and "Hectoliters" (Domain Correctness)**
* **What's wrong:** The plan maps `unitWeight (KG|LB)` and `unitVolume (L|GAL)`.
  * *Weight:* The US wine industry tracks harvest fruit in *Short Tons* (2000 lbs), not pounds. A 50-ton pick displaying as "100,000 lbs" is absurd.
  * *Volume:* European, AU, and SA wineries track bulk volume in *Hectoliters (hL)*, not Liters. 15,000 hL displaying as "1,500,000 L" is visually noisy and non-standard.
* **The fix:** Expand enums: `unitWeight (KG | LB | SHORT_TON | TONNE)` and `unitVolume (L | HL | GAL)`.

**2. Input Field "Hint Lines" are Dangerous (UX)**
* **What's wrong:** Showing a hint line *under* the field ("= 3785 L") is not enough affordance for destructive cellar actions like transfers. If a US user temporarily works in a Canadian winery (mixed units) and types "1000" into a volume field thinking it's Gallons but the tenant preference is Liters, a tank overflows.
* **The fix:** The input field itself *must* have an inline, uneditable suffix (adornment) inside the bounding box of the input (e.g., `[ 1000       gal ]`).

**3. Destructive Backfill of Geometry Units (Data Quality)**
* **What's wrong:** Backfilling `VineyardDetail.defaultUnit` to `NULL` assumes current values are just "creation defaults." If even 5% of users actively toggled this to match their specific mapping data, you are destroying user intent.
* **The fix:** Run a migration script: if all vineyards for a tenant share the same `defaultUnit`, hoist that value to the new tenant-level master preference. Only `NULL` out the vineyard-level override if it matches the newly hoisted tenant default.

**4. AI Assistant Hallucinations on Mixed Tool Returns (Pattern Consistency)**
* **What's wrong:** Returning *both* raw metric and display-formatted strings from the Climate Tool to the LLM invites hallucination (e.g., "The temperature is 25°F" when it read the 25 from the °C field).
* **The fix:** Do not give the LLM both. The API route wrapping the tool should intercept the tool's metric output, apply the tenant's preference conversion, and *only* feed the formatted target-unit string to the LLM context.

### DESIGN QUESTIONS (Requires architectural clarity before coding)

**1. How does the Weather Card 3-State Toggle work with granular overrides?**
* The plan proposes a toggle: `°F/in · °C/mm · Auto`. If a Canadian user's tenant-level overrides are set to `°C` (Temperature) and `in` (Precipitation), what does the "Auto" toggle actually display? If they click `°F/in`, does it just override the card locally? This UX conflicts with the 6-dimension settings granularity.

**2. How are you busting Next.js Client Caches?**
* When a user changes their preference in the Settings page and navigates back to the Dashboard, Next.js's aggressive client-side router cache will likely render the previously cached metric components. `UnitsProvider` in React Context only helps client components. How are you invalidating the Server Components (`revalidatePath`? `revalidateTag`?) so they immediately fetch and render the new unit preference?

**3. What is the rounding rule for Cost-per-Volume?**
* Converting `$/L` to `$/gal` requires multiplying the rate by 3.78541. If you round this converted rate to standard currency (2 decimal places), bulk wine contracts will fail reconciliation. (e.g., $1.23/L = $4.656/gal. Rounding to $4.66/gal on a 10,000 gallon bulk transfer creates a $40 discrepancy). How many decimal places will `formatCostPerVolume` enforce?
