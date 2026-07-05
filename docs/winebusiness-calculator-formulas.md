# WineBusiness.com Winemaking Calculators — Formula Reference

Reverse-engineered from the client-side JavaScript at `winebusiness.com/calculator/winemaking/`
(calculations "powered by VinoEnology.com"). All 37 calculators across 8 sections are covered.
Every formula below is the *actual* code logic; every unit constant is the *verbatim* value from the
page dropdowns. Where the site's constant differs from textbook chemistry, it's flagged.

**How the calculators are built:** each is a small jQuery module. Numeric inputs have ids like
`xxx_1`, `xxx_2`; unit dropdowns are `xxx_c1`, `xxx_c2`, `xxx_c3`; the result field is the last one.
The dropdown "value" attributes are conversion multipliers, not labels — that's where the real
constants live. There is no server round-trip; all math runs in the browser.

---

## Shared unit-factor tables

These same option sets recur across nearly every calculator.

**Volume → liters** (used as `volumec`, multiply input by this to get liters):

| Unit | Factor |
|---|---|
| Liters | 1 |
| Gallons (US) | 3.7854 (one calc uses 3.79) |
| hL | 100 |
| UK Gallons | 4.546 |

**Concentration / rate factor** (`ratec` — see the divide-vs-multiply note below):

| Unit | Factor |
|---|---|
| g/L | 1 |
| g/hL | 100 |
| mg/L | 1000 |
| ppm | 1000 |
| g/100ml | 0.1 |
| lbs/1000 gal. | 0.12 ← sentinel (see note) |

**Mass output factor** (`sumc` — divide grams by this to get the chosen unit):

| Unit | Factor |
|---|---|
| grams | 1 |
| kg | 1000 |
| oz | 28.34–28.35 |
| lbs | 454 |

**Liquid-volume output factor** (for solution dosing, result in that unit):

| Unit | Factor |
|---|---|
| mL | 1 |
| liters | 1000 |
| Gallons | 3785.40 |
| UK Gallons | 4546 |

### The `0.12` sentinel trick

Throughout the code you'll see `if (ratec === 0.12) { multiply } else { divide }`. The value `0.12`
is not a real conversion factor — it's a flag meaning "the user picked lbs/1000 gal." Because that
unit needs a different arithmetic path (multiply instead of divide by the rate factor), the authors
reused the factor slot as a mode switch. If you port these calcs, replicate the branch exactly or
lbs/1000 gal results will be wrong.

---

## Section 1 — Conversions

Six unit converters (volume, temperature, mass, pressure, area, distance). All except temperature
use the same engine: convert the input to a base unit via its factor, then divide out every other
unit's factor to fill all fields simultaneously.

`result_in_unit_i = (input × factor[current]) / factor[i]`

**Volume** base = liters:
mL 0.001 · L 1 · hL 100 · m³ 1000 · fl oz 0.0295735296 · cup 0.2365882 · pint 0.473176473 ·
quart 0.946352946 · tbsp 0.0147867648 · tsp 0.00492892159 · in³ 0.016387064 · gal 3.78541178

**Mass** base = grams:
mg 0.001 · g 1 · kg 1000 · metric ton 1,000,000 · oz 28.3495231 · lb 453.59237 · ton 907148.74

**Pressure** base = pascals:
Pa 1 · atm 101325 · mbar 100 · bar 100000 · psi 6894.757 · lb/ft² 47.88026 · kg/mm² 9806650 ·
kg/cm² 98066.5 · kg/m² 9.80665 · torr 133.3224 · cmHg 1333.224 · cmH₂O 98.0665 · ftHg 40636.66 ·
ftH₂O 2989.067 · inHg 3386.389 · inH₂O 249.0889 · mmHg 133.3224 · mmH₂O 9.80665

**Area** base = m²:
m² 1 · acre 4046.85642 · hectare 10000 · ft² 0.09290304 · in² 0.00064516 · mi² 2589988.11 · yd² 0.83612736

**Distance** base = meters:
m 1 · cm 0.01 · km 1000 · mm 0.001 · micron 1e-6 · in 0.0254 · ft 0.3048 · yd 0.9144 · mi 1609.344 ·
nautical mi 1852

**Temperature** (special-cased, not factor-based):
- °F = °C × 9/5 + 32
- °C = (°F − 32) × 5/9

---

## Section 2 — SO₂ Additions

### SO₂ Addition as Liquid Solution (H₂SO₃ / sulfurous solution)

```
result = (((volume × volumec) / ratec) × ((rate / concentration) × 100)) / sumc
```
- `volume` × `volumec` → liters of wine
- `rate` = desired SO₂ addition, `ratec` = its unit factor (ppm=1000, so ppm→g/L)
- `concentration` = strength of the SO₂ stock solution, in % (w/v)
- result = volume of stock solution to add, in the chosen liquid unit (`sumc`)

Verified: 1000 US gal, +50 ppm, 6% solution → **3154.5 mL** (matches 3785.4 L × 50 mg/L ÷ 60 g/L).

### SO₂ Addition as Potassium Metabisulfite (KMBS, K₂S₂O₅)

```
result = ((volume × volumec) / targetc) × (target / 0.576) / sumc
```
- **0.576 = fraction of SO₂ by mass in KMBS (57.6%)**. Grams of SO₂ needed ÷ 0.576 = grams KMBS.
- result = mass of KMBS in the chosen unit.

Verified: 1000 US gal, +50 ppm → **328.59 g KMBS** (189.27 g SO₂ ÷ 0.576).

### SO₂ Reduction (how much wine to blend off, or dilution to lower SO₂)

```
tmp    = actual × actualc × (target × 1000) / targetc × 0.0014
result = 35 / concentration × tmp / concentrationc
```
This one is idiosyncratic — `35` and `0.0014` are baked-in scaling constants specific to the site's
reduction model (peroxide-style calculation). Treat the numeric output as the site's convention
rather than a clean textbook identity; if you reimplement, validate against their UI with sample
inputs before trusting it.

### Molecular SO₂

```
free_SO2_needed = molecular_target × (10^(pH − 1.81) + 1)
```
- Henderson–Hasselbalch for sulfurous acid. **1.81 = pKa₁ of H₂SO₃** used by the site.
- Given a desired molecular SO₂ (typically 0.5–0.8 ppm) and wine pH, returns the free SO₂ (ppm) to target.
- Inverse of the usual "molecular = free / (1 + 10^(pH−pKa))" form.

Example: 0.8 ppm molecular target at pH 3.4 → **31.9 ppm free SO₂**.

### Connection between pH and effectiveness of SO₂ (calc 21)

Static reference table (no JS math / no input dropdowns) — shows molecular SO₂ % at varying pH.
Same underlying pKa 1.81 relationship as above.

### Strength of SO₂ solution (calc 23)

Static reference/instructional page — no computational JS captured (no dropdown factors).
Describes how to prepare and titrate SO₂ stock solutions.

---

## Section 3 — Fermentation & Sugar

### Brix → Alcohol Conversion

```
potential_alcohol = Brix × factor
```
- `factor` is a user-entered conversion coefficient (the second input), typically **0.55–0.60**.
- Deliberately open: the winemaker supplies the Brix-to-alcohol factor they trust (0.55 conservative,
  0.59 common, up to ~0.64). No constant is hard-coded.

### Brix → Specific Gravity

```
SG          = 261.3 / (261.3 − Brix)
sugar_g/L   = Brix × SG × 10
```
**261.3 = the standard refractometric SG constant.**

### Specific Gravity → Sugar Conversions (calc 43)

From an SG input (`A3`), computes five scales at once:

| Output | Formula |
|---|---|
| Brix | 261.3 × (1 − 1/SG) |
| Baumé | 145 − 145/SG |
| Oechsle | 1000 × (SG − 1) |
| (alt sugar scale) | 259 − 259/SG |
| sugar g/L | Brix × Brix_SG × 10 |

### Specific Gravity — Temperature Correction

Corrects a hydrometer reading to reference temperature via a quadratic:

```
f(T) = 0.00000359·T² + 0.00006971·T − 0.00151687
corrected_SG = measured_SG + f(T)
```
- If the sample temp is entered in °C, it's first converted: °C = (°F − 32)/1.8 internally, and the
  quadratic is applied to the appropriate temperature. Dropdown `sgcs_1`: 1 = °C, 2 = °F.

### Fermentation / Yeast  &  Fermentation / Nutrients

Both use the universal dosing formula with the 0.12 sentinel:

```
if (ratec === 0.12)  result = ((vol × volc) × rate × 0.12) / sumc      // lbs/1000gal
else                 result = ((vol × volc) × rate / ratec) / sumc
```
- vol × volc → liters; rate = dose (e.g. g/L or g/hL); result = mass in chosen unit.
- Yeast typical dose 0.2–0.4 g/L; nutrients per product label.

### Yeast Assimilable Nitrogen (YAN)

```
result = (((vol × volunit / src) / target_unit) × dose) / mass_unit
```
- `src` = **product-specific N-contribution factor** (grams product per mg/L YAN), from a dropdown:

| Product | Factor | Type |
|---|---|---|
| DAP (diammonium phosphate) | 0.2127 | inorganic |
| Thiazote | 0.208 | inorganic |
| Nutristart | 0.15 | — |
| Nutristart Arom | 0.14 | — |
| Fermaid-A | 0.12 | inorganic |
| Nutriferm Advance | 0.116 | — |
| Fermaid-K / Superfood / Nutristart Org. | 0.10 | mixed |
| Dynastart | 0.07 | organic |
| Fermaid-O | 0.04 | organic |
| Go-Ferm / Go-Ferm Protect | 0.033 | organic |
| SIY33 | 0.032 | organic |
| Fortiferm | 0.03 | organic |
| Nutrient Vit End | 0.028 | organic |

- Enter juice volume + desired YAN increase (mg/L), pick the product, get the mass to add.
- DAP at 0.2127 reflects DAP being ~21% N by the site's accounting.

---

## Section 4 — Chaptalization & Water Dilution

### Chaptalization (sugar addition to raise potential alcohol)

```
result = (volume × volc × (target_brix − current_brix) / (sugar_purity_or_denominator − target)) / out_volc
```
In code: `(A3 × B3 × (E3−D3)/(F3−E3)) / c2`, where A3=volume, B3=volume factor, D3=current sugar,
E3=target sugar, F3=a reference term. Result is sugar to add. Both volume dropdowns use the standard
volume table.

### Water Dilution (to lower Brix/sugar before ferment)

```
sugar_conc_start = 261.3 / (261.3 − current_brix)     // SG of must now
sugar_conc_end   = 261.3 / (261.3 − target_brix)      // SG at target
tmp4  = volume × volc × sugar_conc_start
tmp2  = current_brix × tmp4 / 100
tmp11 = tmp2 × 100 / target_brix
tmp10 = tmp4 − tmp2
tmp8  = tmp11 − tmp2
result_water = (tmp8 − tmp10) / out_volc
```
Mass-balances sugar before/after to output the volume of water to add. Uses the same 261.3 constant.

---

## Section 5 — Acid Addition & Deacidification

### Acid Addition

```
result = ((volume × volc × rate) / ratec) / sumc
```
Straight dosing formula. rate = g/L (or chosen unit) of acid to add; result = mass in chosen unit.
(No 0.12 branch here — this calc's rate dropdown has no lbs/1000gal option.)

### Deacidification

Computes reagent mass for **three** deacidifying agents at once from the TA drop you want:

```
delta = (current_TA / TAc) − (target_TA / TAc2)
CaCO3        = (delta × (vol × volc × 0.67 )) / mass_unit
KHCO3        = (delta × (vol × volc × 0.673)) / mass_unit
K-bicarb alt = (delta × (vol × volc × 0.62 )) / mass_unit
```
- **Reagent factors: 0.67 (calcium carbonate), 0.673 (potassium bicarbonate), 0.62 (third variant).**
- Note: the source shows the authors *revised* these — older values `0.6669`, `1.334`, `0.9208` are
  commented out and replaced by `0.67 / 0.673 / 0.62`. Use the current (uncommented) trio.
- TA dropdowns use the concentration factor table; deacid volume uses the standard volume table.

---

## Section 6 — Oak, Fining & Copper

### Fining

```
if (ratec === 0.12)  result = ((vol × volc) × (rate × 0.12)) / sumc     // lbs/1000gal
else                 result = ((vol × volc) × (rate / ratec)) / sumc
```
Same dosing engine + 0.12 sentinel. Works for any fining agent; the winemaker supplies the rate.

### Oak Addition

Identical structure to Fining (with the 0.12 branch). vol × volc → liters, rate = g/L (or lbs/1000gal),
result = oak mass in chosen unit.

### Copper Addition as Copper Sulfate (CuSO₄, anhydrous)

```
result = volume × volc × (rate × 3.93) / ratec / sumc
```
- **3.93 = conversion from desired elemental Cu to mass of copper sulfate.** rate is the target Cu
  addition (e.g. mg/L Cu); ×3.93 gives the CuSO₄ salt mass.

### Copper Addition as Copper Sulfate Solution (CuSO₄·5H₂O solution)

```
result = (((vol × rate) / volumec) × (((concentration × 3.93) / ratec) × 100)) / sumc
```
- Same 3.93 factor, but arranged like the SO₂-liquid-solution formula because you're dosing from a
  stock solution of known % strength. result = volume of Cu solution to add.

### Summary of Fining Agent Use (calc 51)

Static reference table (recommended dose ranges per fining agent) — no computational JS.

---

## Section 7 — Fortification

### Fortification (Pearson's Square)

```
init_alc, actual_alc, target_alc are entered as %, divided by 100 internally
spirit_volume = volume × volc × (target_alc − actual_alc) / (init_alc − target_alc) / out_volc
```
- Classic Pearson's square: how much high-proof spirit to add to raise wine from `actual_alc` to
  `target_alc`, given spirit strength `init_alc`. Both volume dropdowns use the standard table.

### Alcohol Adjustment Sensory Trial Tool ("Sweet Spot") (calc 2113 / blending-alcohol-adjustment.js)

Builds a **bench-trial dilution table**. Inputs: q1 = spirit/high-alc %, q2 = low-alc/water %,
q3 = starting blend alc %, q4 = target, q5 = batch volume.

```
row1_high = q3
ss = q5 × ((q3 − q2) / (q1 − q2))     // parts of high-alc component
dd = q5 − ss                          // parts of low component
```
Then it steps `alc` down by 0.10% per row for ~29 rows, recomputing the two component volumes at each
step, so you can taste across a ladder of alcohol levels and pick the sweet spot. It's a sensory tool,
not a single-answer calc.

---

## Section 8 — Blending & Cost

### Expanded Blending Calculator (up to 6 components)

Computes blend properties as **volume-weighted averages**, with one important correctness detail:

```
For each component i: volume Bi
Total volume  B8 = ΣBi
Volume %      Ci = Bi / B8 × 100

Simple weighted average (alcohol, TA, ppm SO₂, etc.):
  blend_value = Σ(Bi × valuei) / B8

pH — blended in hydrogen-ion space (correct, not linear):
  Hi        = 10^(−pHi) × Bi
  H_total   = ΣHi
  H_avg     = H_total / B8 × 10000
  blend_pH  = −log10(H_avg × 10^−4)
```
- **This is the standout formula.** Most blending tools average pH linearly, which is wrong because
  pH is logarithmic. This one converts each component to [H⁺], volume-weights, then converts back —
  chemically correct. Worth replicating exactly in Cellarhand.
- The same volume-weighting is applied across four attribute groupings (varietal, appellation,
  vintage tiers) so you get a full blend spec sheet, not just one number.

### Wine Cost Calculator

```
Total cost/gal    B9 = B3 + B4 + B5 + B6 + B7 + B8       // sum of 6 cost categories
% of total        Ci = Bi / B9 × 100
Weighted metric   D9 = Σ(Bi × Di) / B9
Composite         E9 = (E3 × 2.38) + (E4 + E5 + E6 + E7 × 12) + E8 + (D9 × 2.38)
Total cases       = B9 / 2.38
```
- **2.38 = gallons per standard 12-bottle case** (12 × 750 mL ≈ 9 L ≈ 2.38 US gal). Appears twice as
  the case-conversion factor. The `× 12` on E7 converts a per-bottle cost to per-case.
- Cost categories B3–B8 are user-labeled buckets (fruit, production, packaging, overhead, etc.).

---

## Constants worth lifting into Cellarhand

| Constant | Meaning | Where |
|---|---|---|
| 0.576 | SO₂ mass fraction in KMBS | KMBS addition |
| 1.81 | pKa₁ of sulfurous acid (H₂SO₃) | Molecular SO₂ |
| 261.3 | refractometric Brix↔SG constant | Brix/SG, water dilution, chaptalization |
| 145 | Baumé scale constant | SG→sugar |
| 259 | alt sugar-scale constant | SG→sugar |
| 3.93 | elemental Cu → copper sulfate mass | copper additions |
| 0.67 / 0.673 / 0.62 | CaCO₃ / KHCO₃ / K-bicarb deacid factors (revised) | Deacidification |
| 2.38 | US gallons per 12-bottle case | Wine cost |
| 0.12 | sentinel flag for "lbs/1000 gal" mode | every dosing calc |
| DAP 0.2127, Fermaid-K 0.10, etc. | per-product YAN factors | YAN calc |
| quadratic 3.59e-6 / 6.971e-5 / −1.51687e-3 | hydrometer temp correction | SG temp correction |

## Caveats / verify-before-trusting
- **SO₂ Reduction** (35 and 0.0014 constants) is the one formula whose derivation isn't a clean
  textbook identity — validate against the live UI before relying on it.
- **Brix→Alcohol** intentionally has no baked-in factor; you choose it (0.55–0.60 typical).
- Calcs 21, 23, 51 are static reference tables, not computational.
- oz factor wobbles between 28.34 and 28.35 across calcs, and US gal between 3.7854 and 3.79 — trivial
  rounding, but pick one canonical value if you port these.
