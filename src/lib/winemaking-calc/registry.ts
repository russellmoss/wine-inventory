// Section registry — the single declarative catalog of every calculator. The page renders
// generically from these descriptors, and (PR2) the assistant tool schemas are generated from
// the same FieldSpec[]. No formula lives twice.
//
// LOCKED registry rule: discriminated union `kind: "calc" | "static"`; NO React/JSX in here
// (static reference *content* is mapped by id at the page layer). `compute` is a plain function
// (server-importable). Pure — tested in test/winemaking-calc-registry.test.ts.
//
// PR2 (deferred PR1 /review items folded in here since PR2 modifies this file):
//   1. `doseDescriptor()` factory — the 5 structurally-identical dosing descriptors
//      (yeast / nutrient / acid / fining / oak) share one factory (DRY), mirroring the existing
//      `conversionDescriptor()`.
//   2. Typed unit readers — enum reads route through `requireOneOf` (→ DomainError) instead of a
//      silent `as` cast. The page's <select>s constrain units, but PR2's assistant tools dispatch
//      to these SAME compute functions with model-supplied units, so a bad unit must fail loudly.

import {
  VOLUME_UNITS, VOLUME_UNIT_LABEL, RATE_UNITS, RateUnitId, MASS_UNITS, MASS_UNIT_LABEL,
  LIQUID_UNITS, LIQUID_UNIT_LABEL, VolumeUnit, MassUnit, LiquidUnit, round,
} from "./units";
import { requireOneOf } from "./validate";
import { convertAll, convertTemp, unitsFor, ConvertibleDimension } from "./conversions";
import { so2AsKmbs, so2AsLiquidSolution, freeSO2ForMolecularTarget, so2Reduction, so2AdditionPlan } from "./so2";
import {
  brixToAlcohol, brixToSG, brixToSugarGL, sgToScales, sgTemperatureCorrection, yeastNutrientDose, yanDose, YAN_PRODUCTS,
} from "./sugar";
import { chaptalization, waterDilution } from "./dilution";
import { acidAddition, deacidification } from "./acid";
import { finingDose, oakDose, copperAsSulfate, copperAsSulfateSolution } from "./additions";
import { fortificationPearson, sweetSpotLadder } from "./fortification";
import { blendWeightedAverage, blendPH, wineCost } from "./blending";

export type CalcSection =
  | "Conversions" | "SO₂ Additions" | "Fermentation & Sugar" | "Chaptalization & Dilution"
  | "Acid & Deacidification" | "Oak, Fining & Copper" | "Fortification" | "Blending & Cost";

export type FieldOption = { value: string; label: string };
export type FieldSpec = {
  name: string;
  label: string;
  kind: "number" | "select";
  options?: FieldOption[];
  default: number | string;
};

export type ResultValue = { label: string; value: number; unit?: string };
export type CalcResult = { values: ResultValue[]; formula: string; warning?: string };

export type CalcDescriptor = {
  kind: "calc";
  id: string;
  section: CalcSection;
  name: string;
  description: string;
  fields: FieldSpec[];
  advisory?: boolean;
  danger?: boolean;
  compute: (input: Record<string, string | number>) => CalcResult;
};

export type StaticDescriptor = {
  kind: "static";
  id: string;
  section: CalcSection;
  name: string;
  description: string;
};

export type Descriptor = CalcDescriptor | StaticDescriptor;

// ── Reusable field-option sets ──
const volOpts: FieldOption[] = VOLUME_UNITS.map((u) => ({ value: u, label: VOLUME_UNIT_LABEL[u] }));
const rateOpts: FieldOption[] = (Object.keys(RATE_UNITS) as RateUnitId[]).map((u) => ({ value: u, label: RATE_UNITS[u].label }));
const massOpts: FieldOption[] = MASS_UNITS.map((u) => ({ value: u, label: MASS_UNIT_LABEL[u] }));
const liqOpts: FieldOption[] = LIQUID_UNITS.map((u) => ({ value: u, label: LIQUID_UNIT_LABEL[u] }));

// input readers (values arrive as strings from form fields OR from the assistant's model output)
const n = (input: Record<string, string | number>, k: string) => Number(input[k]);
const s = (input: Record<string, string | number>, k: string) => String(input[k]);

// Typed unit readers (deferred /review item 2): validate enum membership, throw DomainError on a
// bad unit — never a silent `as` cast that would compute NaN downstream. Used by every compute.
const RATE_UNIT_IDS = Object.keys(RATE_UNITS) as RateUnitId[];
const vu = (input: Record<string, string | number>, k: string): VolumeUnit => requireOneOf(s(input, k), VOLUME_UNITS, "Volume unit");
const mu = (input: Record<string, string | number>, k: string): MassUnit => requireOneOf(s(input, k), MASS_UNITS, "Output unit");
const lu = (input: Record<string, string | number>, k: string): LiquidUnit => requireOneOf(s(input, k), LIQUID_UNITS, "Output unit");
const rateU = (input: Record<string, string | number>, k: string): RateUnitId => requireOneOf(s(input, k), RATE_UNIT_IDS, "Rate unit");
const tempU = (input: Record<string, string | number>, k: string): "C" | "F" => requireOneOf(s(input, k), ["C", "F"] as const, "Temperature unit");

const volField = (def: VolumeUnit = "L"): FieldSpec => ({ name: "volumeUnit", label: "Volume unit", kind: "select", options: volOpts, default: def });
const rateField = (name: string, label: string, def: RateUnitId = "ppm"): FieldSpec => ({ name, label, kind: "select", options: rateOpts, default: def });
const massField = (def: MassUnit = "g"): FieldSpec => ({ name: "outUnit", label: "Output unit", kind: "select", options: massOpts, default: def });

const CONVERSION_DIMS: ConvertibleDimension[] = ["volume", "mass", "pressure", "area", "distance"];

function conversionDescriptor(dim: ConvertibleDimension): CalcDescriptor {
  const units = unitsFor(dim);
  const opts = units.map((u) => ({ value: u, label: u }));
  return {
    kind: "calc",
    id: `convert-${dim}`,
    section: "Conversions",
    name: `${dim[0].toUpperCase()}${dim.slice(1)} converter`,
    description: `Convert a ${dim} value across every ${dim} unit at once.`,
    fields: [
      { name: "value", label: "Value", kind: "number", default: 1 },
      { name: "from", label: "From unit", kind: "select", options: opts, default: units[0] },
    ],
    compute: (input) => {
      const all = convertAll(dim, n(input, "value"), s(input, "from"));
      return {
        values: Object.entries(all).map(([unit, value]) => ({ label: unit, value: round(value, 6), unit })),
        formula: "result[to] = value × factor[from] / factor[to]",
      };
    },
  };
}

/**
 * Factory for the structurally-identical mass-dosing calculators (yeast / nutrient / acid / fining
 * / oak): volume + rate + rate-unit + output-unit → a single mass, via the family's engine fn
 * (each keeps its own guard messages). Mirrors `conversionDescriptor()`. Deferred /review item 1.
 */
function doseDescriptor(cfg: {
  id: string;
  section: CalcSection;
  name: string;
  description: string;
  volumeLabel: string;
  rateLabel: string;
  rateDefault: number;
  resultLabel: string;
  formula: string;
  fn: (i: { volume: number; volumeUnit: VolumeUnit; rate: number; rateUnit: RateUnitId; outUnit: MassUnit }) => number;
}): CalcDescriptor {
  return {
    kind: "calc",
    id: cfg.id,
    section: cfg.section,
    name: cfg.name,
    description: cfg.description,
    fields: [
      { name: "volume", label: cfg.volumeLabel, kind: "number", default: 1000 }, volField(),
      { name: "rate", label: cfg.rateLabel, kind: "number", default: cfg.rateDefault }, rateField("rateUnit", "Rate unit", "g_L"), massField(),
    ],
    compute: (input) => ({
      values: [{
        label: cfg.resultLabel,
        value: round(cfg.fn({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), rate: n(input, "rate"), rateUnit: rateU(input, "rateUnit"), outUnit: mu(input, "outUnit") }), 2),
        unit: s(input, "outUnit"),
      }],
      formula: cfg.formula,
    }),
  };
}

export const CALCULATORS: Descriptor[] = [
  // ── Section 1: Conversions ──
  ...CONVERSION_DIMS.map(conversionDescriptor),
  {
    kind: "calc", id: "convert-temperature", section: "Conversions", name: "Temperature converter",
    description: "Convert between °C and °F.",
    fields: [
      { name: "value", label: "Value", kind: "number", default: 20 },
      { name: "from", label: "From", kind: "select", options: [{ value: "C", label: "°C" }, { value: "F", label: "°F" }], default: "C" },
    ],
    compute: (input) => {
      const from = tempU(input, "from");
      const to = from === "C" ? "F" : "C";
      return { values: [{ label: `°${to}`, value: round(convertTemp(n(input, "value"), from, to), 4), unit: `°${to}` }], formula: "°F = °C×9/5+32 · °C = (°F−32)×5/9" };
    },
  },

  // ── Section 2: SO₂ ──
  {
    kind: "calc", id: "so2-addition-plan", section: "SO₂ Additions", name: "SO₂ addition planner",
    description: "The full workflow: from a molecular target + pH + the free SO₂ you already have, get the free-SO₂ target, the addition needed, and the dose both as KMBS and as a % stock solution.",
    fields: [
      { name: "volume", label: "Wine volume", kind: "number", default: 1000 }, volField("GAL_US"),
      { name: "molecularTarget", label: "Molecular SO₂ target (mg/L)", kind: "number", default: 0.8 },
      { name: "pH", label: "Wine pH", kind: "number", default: 3.4 },
      { name: "currentFree", label: "Current free SO₂ (ppm)", kind: "number", default: 0 },
      { name: "concentrationPct", label: "Solution strength (% w/v)", kind: "number", default: 10 },
      massField(),
    ],
    compute: (input) => {
      const p = so2AdditionPlan({
        volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"),
        molecularTarget: n(input, "molecularTarget"), pH: n(input, "pH"), currentFree: n(input, "currentFree"),
        concentrationPct: n(input, "concentrationPct"), outUnit: mu(input, "outUnit"),
      });
      return {
        values: [
          { label: "Free SO₂ target", value: round(p.freeTarget, 1), unit: "ppm" },
          { label: "Addition needed", value: round(p.additionNeeded, 1), unit: "ppm" },
          { label: "KMBS", value: round(p.kmbsMass, 2), unit: s(input, "outUnit") },
          { label: "Solution", value: round(p.solutionVolume, 1), unit: "mL" },
        ],
        formula: "free target = molecular × (10^(pH−1.81)+1); addition = target − current; then KMBS (÷0.576) & % solution",
        ...(p.warning ? { warning: p.warning } : {}),
      };
    },
  },
  {
    kind: "calc", id: "so2-kmbs", section: "SO₂ Additions", name: "SO₂ addition as KMBS",
    description: "Grams of potassium metabisulfite to reach a target free-SO₂ addition.",
    fields: [
      { name: "volume", label: "Wine volume", kind: "number", default: 1000 }, volField("GAL_US"),
      { name: "target", label: "SO₂ addition", kind: "number", default: 50 }, rateField("targetUnit", "SO₂ unit"),
      massField(),
    ],
    compute: (input) => ({
      values: [{ label: "KMBS", value: round(so2AsKmbs({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), target: n(input, "target"), targetUnit: rateU(input, "targetUnit"), outUnit: mu(input, "outUnit") }), 2), unit: s(input, "outUnit") }],
      formula: "grams SO₂ = liters × target/factor; KMBS = ÷ 0.576",
    }),
  },
  {
    kind: "calc", id: "so2-solution", section: "SO₂ Additions", name: "SO₂ as liquid solution",
    description: "Volume of a % sulfurous stock solution to dose a target SO₂ addition.",
    fields: [
      { name: "volume", label: "Wine volume", kind: "number", default: 1000 }, volField("GAL_US"),
      { name: "rate", label: "SO₂ addition", kind: "number", default: 50 }, rateField("rateUnit", "SO₂ unit"),
      { name: "concentrationPct", label: "Solution strength (% w/v)", kind: "number", default: 10 },
      { name: "outUnit", label: "Output unit", kind: "select", options: liqOpts, default: "mL" },
    ],
    compute: (input) => ({
      values: [{ label: "Solution", value: round(so2AsLiquidSolution({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), rate: n(input, "rate"), rateUnit: rateU(input, "rateUnit"), concentrationPct: n(input, "concentrationPct"), outUnit: lu(input, "outUnit") }), 2), unit: s(input, "outUnit") }],
      formula: "((liters/factor) × ((rate/conc)×100)) / liquidFactor",
    }),
  },
  {
    kind: "calc", id: "so2-molecular", section: "SO₂ Additions", name: "Free SO₂ for a molecular target",
    description: "Free SO₂ (ppm) to hit a desired molecular SO₂ at the wine's pH.",
    fields: [
      { name: "molecularTarget", label: "Molecular SO₂ target (mg/L)", kind: "number", default: 0.8 },
      { name: "pH", label: "Wine pH", kind: "number", default: 3.4 },
    ],
    compute: (input) => {
      const r = freeSO2ForMolecularTarget({ molecularTarget: n(input, "molecularTarget"), pH: n(input, "pH") });
      return { values: [{ label: "Free SO₂ to target", value: round(r.freeSO2, 1), unit: "ppm" }], formula: "free = molecular × (10^(pH − 1.81) + 1)", ...(r.warning ? { warning: r.warning } : {}) };
    },
  },
  {
    kind: "calc", id: "so2-reduction", section: "SO₂ Additions", name: "SO₂ reduction (peroxide)",
    description: "Peroxide-style SO₂ reduction. Advisory — validate against the source and bench-trial.",
    advisory: true, danger: true,
    fields: [
      { name: "actual", label: "Current SO₂", kind: "number", default: 60 }, rateField("actualUnit", "Current unit"),
      { name: "target", label: "Target SO₂", kind: "number", default: 30 }, rateField("targetUnit", "Target unit"),
      { name: "concentration", label: "Peroxide strength", kind: "number", default: 3 }, rateField("concentrationUnit", "Peroxide unit", "g_L"),
    ],
    compute: (input) => ({
      values: [{ label: "Reduction dose", value: round(so2Reduction({ actual: n(input, "actual"), actualUnit: rateU(input, "actualUnit"), target: n(input, "target"), targetUnit: rateU(input, "targetUnit"), concentration: n(input, "concentration"), concentrationUnit: rateU(input, "concentrationUnit") }), 3) }],
      formula: "35/conc × (actual×factor × (target×1000)/factor × 0.0014) / factor",
    }),
  },
  { kind: "static", id: "so2-ph-effectiveness", section: "SO₂ Additions", name: "pH ↔ SO₂ effectiveness (reference)", description: "Reference table: molecular SO₂ % at varying pH (pKa 1.81)." },
  { kind: "static", id: "so2-solution-strength", section: "SO₂ Additions", name: "SO₂ solution strength (reference)", description: "How to prepare and titrate SO₂ stock solutions." },

  // ── Section 3: Fermentation & Sugar ──
  {
    kind: "calc", id: "brix-alcohol", section: "Fermentation & Sugar", name: "Brix → potential alcohol",
    description: "Potential alcohol from Brix, using your conversion factor (0.55–0.60 typical).",
    fields: [
      { name: "brix", label: "Brix (°Bx)", kind: "number", default: 24 },
      { name: "factor", label: "Conversion factor", kind: "number", default: 0.59 },
    ],
    compute: (input) => ({ values: [{ label: "Potential alcohol", value: round(brixToAlcohol(n(input, "brix"), n(input, "factor")), 2), unit: "%" }], formula: "potential alcohol = Brix × factor" }),
  },
  {
    kind: "calc", id: "brix-sg", section: "Fermentation & Sugar", name: "Brix → specific gravity",
    description: "Specific gravity and sugar g/L from Brix (261.3 model).",
    fields: [{ name: "brix", label: "Brix (°Bx)", kind: "number", default: 24 }],
    compute: (input) => {
      const b = n(input, "brix");
      return { values: [{ label: "Specific gravity", value: round(brixToSG(b), 4) }, { label: "Sugar", value: round(brixToSugarGL(b), 1), unit: "g/L" }], formula: "SG = 261.3/(261.3−Brix); sugar g/L = Brix×SG×10" };
    },
  },
  {
    kind: "calc", id: "sg-scales", section: "Fermentation & Sugar", name: "Specific gravity → sugar scales",
    description: "Brix, Baumé, Oechsle, alt scale, and sugar g/L from a specific gravity.",
    fields: [{ name: "sg", label: "Specific gravity", kind: "number", default: 1.09 }],
    compute: (input) => {
      const sc = sgToScales(n(input, "sg"));
      return { values: [{ label: "Brix", value: round(sc.brix, 2), unit: "°Bx" }, { label: "Baumé", value: round(sc.baume, 2), unit: "°Bé" }, { label: "Oechsle", value: round(sc.oechsle, 1) }, { label: "Alt scale", value: round(sc.altScale, 2) }, { label: "Sugar", value: round(sc.sugarGL, 1), unit: "g/L" }], formula: "Brix=261.3×(1−1/SG); Baumé=145−145/SG; Oechsle=1000×(SG−1)" };
    },
  },
  {
    kind: "calc", id: "sg-temp-correction", section: "Fermentation & Sugar", name: "SG temperature correction",
    description: "Correct a hydrometer reading to reference temperature.",
    fields: [
      { name: "measuredSG", label: "Measured SG", kind: "number", default: 1.09 },
      { name: "temp", label: "Sample temp", kind: "number", default: 25 },
      { name: "tempUnit", label: "Temp unit", kind: "select", options: [{ value: "C", label: "°C" }, { value: "F", label: "°F" }], default: "C" },
    ],
    compute: (input) => ({ values: [{ label: "Corrected SG", value: round(sgTemperatureCorrection({ measuredSG: n(input, "measuredSG"), temp: n(input, "temp"), tempUnit: tempU(input, "tempUnit") }), 4) }], formula: "corrected = measured + (3.59e-6·T² + 6.971e-5·T − 1.51687e-3), T in °F" }),
  },
  doseDescriptor({
    id: "yeast-dose", section: "Fermentation & Sugar", name: "Yeast dosing",
    description: "Mass of yeast to add at a target rate.", volumeLabel: "Juice volume",
    rateLabel: "Dose rate", rateDefault: 0.3, resultLabel: "Yeast", fn: yeastNutrientDose,
    formula: "mass = liters × rate/factor (or × factor for lbs/1000gal)",
  }),
  doseDescriptor({
    id: "nutrient-dose", section: "Fermentation & Sugar", name: "Nutrient dosing",
    description: "Mass of fermentation nutrient at a target rate.", volumeLabel: "Juice volume",
    rateLabel: "Dose rate", rateDefault: 0.25, resultLabel: "Nutrient", fn: yeastNutrientDose,
    formula: "mass = liters × rate/factor",
  }),
  {
    kind: "calc", id: "yan-dose", section: "Fermentation & Sugar", name: "YAN (nitrogen) dosing",
    description: "Mass of a nitrogen product to raise YAN by a target amount.",
    fields: [
      { name: "volume", label: "Juice volume", kind: "number", default: 1000 }, volField(),
      { name: "yanIncrease", label: "YAN increase", kind: "number", default: 100 }, rateField("yanUnit", "YAN unit", "mg_L"),
      { name: "product", label: "Product", kind: "select", options: Object.keys(YAN_PRODUCTS).map((p) => ({ value: p, label: p })), default: "DAP" },
      massField(),
    ],
    compute: (input) => ({ values: [{ label: s(input, "product"), value: round(yanDose({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), yanIncrease: n(input, "yanIncrease"), yanUnit: rateU(input, "yanUnit"), product: s(input, "product"), outUnit: mu(input, "outUnit") }), 2), unit: s(input, "outUnit") }], formula: "grams = (liters / src / factor) × YAN increase" }),
  },

  // ── Section 4: Chaptalization & Dilution ──
  {
    kind: "calc", id: "chaptalization", section: "Chaptalization & Dilution", name: "Chaptalization (sugar to add)",
    description: "Sugar to add to raise Brix.",
    fields: [
      { name: "volume", label: "Must volume", kind: "number", default: 1000 }, volField(),
      { name: "currentBrix", label: "Current Brix", kind: "number", default: 20 },
      { name: "targetBrix", label: "Target Brix", kind: "number", default: 23 },
      { name: "denom", label: "Reference term", kind: "number", default: 100 },
      { name: "outUnit", label: "Output unit", kind: "select", options: volOpts, default: "L" },
    ],
    compute: (input) => ({ values: [{ label: "Sugar to add", value: round(chaptalization({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), currentBrix: n(input, "currentBrix"), targetBrix: n(input, "targetBrix"), denom: n(input, "denom"), outUnit: vu(input, "outUnit") }), 2) }], formula: "liters × (target−current)/(denom−target)" }),
  },
  {
    kind: "calc", id: "water-dilution", section: "Chaptalization & Dilution", name: "Water dilution (Brix down)",
    description: "Water to add to lower Brix (sugar mass-balance).",
    fields: [
      { name: "volume", label: "Must volume", kind: "number", default: 1000 }, volField(),
      { name: "currentBrix", label: "Current Brix", kind: "number", default: 25 },
      { name: "targetBrix", label: "Target Brix", kind: "number", default: 22 },
      { name: "outUnit", label: "Output unit", kind: "select", options: volOpts, default: "L" },
    ],
    compute: (input) => ({ values: [{ label: "Water to add", value: round(waterDilution({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), currentBrix: n(input, "currentBrix"), targetBrix: n(input, "targetBrix"), outUnit: vu(input, "outUnit") }), 2) }], formula: "sugar mass-balance on 261.3 SGs → water volume" }),
  },

  // ── Section 5: Acid & Deacidification ──
  doseDescriptor({
    id: "acid-addition", section: "Acid & Deacidification", name: "Acid addition",
    description: "Mass of acid to add at a target rate.", volumeLabel: "Wine volume",
    rateLabel: "Acid rate", rateDefault: 1, resultLabel: "Acid", fn: acidAddition,
    formula: "mass = liters × rate/factor",
  }),
  {
    kind: "calc", id: "deacidification", section: "Acid & Deacidification", name: "Deacidification (3 reagents)",
    description: "Reagent mass for CaCO₃ / KHCO₃ / K-bicarb from a TA drop. Advisory — verify by bench trial.",
    advisory: true,
    fields: [
      { name: "volume", label: "Wine volume", kind: "number", default: 1000 }, volField(),
      { name: "currentTA", label: "Current TA", kind: "number", default: 8 }, rateField("currentTAUnit", "Current unit", "g_L"),
      { name: "targetTA", label: "Target TA", kind: "number", default: 6 }, rateField("targetTAUnit", "Target unit", "g_L"), massField(),
    ],
    compute: (input) => {
      const r = deacidification({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), currentTA: n(input, "currentTA"), currentTAUnit: rateU(input, "currentTAUnit"), targetTA: n(input, "targetTA"), targetTAUnit: rateU(input, "targetTAUnit"), outUnit: mu(input, "outUnit") });
      const u = s(input, "outUnit");
      return { values: [{ label: "Calcium carbonate", value: round(r.caco3, 2), unit: u }, { label: "Potassium bicarbonate", value: round(r.khco3, 2), unit: u }, { label: "K-bicarb (alt)", value: round(r.kbicarbAlt, 2), unit: u }], formula: "delta × liters × k (k = 0.67 / 0.673 / 0.62)" };
    },
  },

  // ── Section 6: Oak, Fining & Copper ──
  doseDescriptor({
    id: "fining", section: "Oak, Fining & Copper", name: "Fining agent dosing",
    description: "Mass of fining agent at a target rate.", volumeLabel: "Wine volume",
    rateLabel: "Dose rate", rateDefault: 0.5, resultLabel: "Fining agent", fn: finingDose,
    formula: "mass = liters × rate/factor (or × factor for lbs/1000gal)",
  }),
  doseDescriptor({
    id: "oak", section: "Oak, Fining & Copper", name: "Oak addition",
    description: "Mass of oak at a target rate.", volumeLabel: "Wine volume",
    rateLabel: "Dose rate", rateDefault: 2, resultLabel: "Oak", fn: oakDose,
    formula: "mass = liters × rate/factor",
  }),
  {
    kind: "calc", id: "copper-anhydrous", section: "Oak, Fining & Copper", name: "Copper sulfate (anhydrous)",
    description: "Mass of copper sulfate for a target elemental Cu. Regulated — TTB caps residual Cu at 0.5 mg/L.",
    danger: true,
    fields: [
      { name: "volume", label: "Wine volume", kind: "number", default: 1000 }, volField(),
      { name: "rate", label: "Target Cu", kind: "number", default: 0.3 }, rateField("rateUnit", "Cu unit", "mg_L"), massField(),
    ],
    compute: (input) => {
      const r = copperAsSulfate({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), rate: n(input, "rate"), rateUnit: rateU(input, "rateUnit"), outUnit: mu(input, "outUnit") });
      return { values: [{ label: "Copper sulfate", value: round(r.mass, 3), unit: s(input, "outUnit") }], formula: "liters × (Cu × 3.93)/factor", ...(r.ttbWarning ? { warning: r.ttbWarning } : {}) };
    },
  },
  {
    kind: "calc", id: "copper-solution", section: "Oak, Fining & Copper", name: "Copper sulfate solution",
    description: "Volume of a % copper sulfate stock for a target elemental Cu. Regulated (TTB 0.5 mg/L).",
    danger: true,
    fields: [
      { name: "volume", label: "Wine volume", kind: "number", default: 1000 }, volField(),
      { name: "rate", label: "Target Cu", kind: "number", default: 0.3 }, rateField("rateUnit", "Cu unit", "mg_L"),
      { name: "concentrationPct", label: "Solution strength (%)", kind: "number", default: 1 },
      { name: "outUnit", label: "Output unit", kind: "select", options: liqOpts, default: "mL" },
    ],
    compute: (input) => {
      const r = copperAsSulfateSolution({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), rate: n(input, "rate"), rateUnit: rateU(input, "rateUnit"), concentrationPct: n(input, "concentrationPct"), outUnit: lu(input, "outUnit") });
      return { values: [{ label: "Cu solution", value: round(r.mass, 2), unit: s(input, "outUnit") }], formula: "((liters/factor) × (((Cu×3.93)/conc)×100)) / liquidFactor", ...(r.ttbWarning ? { warning: r.ttbWarning } : {}) };
    },
  },
  { kind: "static", id: "fining-summary", section: "Oak, Fining & Copper", name: "Fining agent use (reference)", description: "Recommended dose ranges per fining agent." },

  // ── Section 7: Fortification ──
  {
    kind: "calc", id: "fortification-pearson", section: "Fortification", name: "Fortification (Pearson's square)",
    description: "Volume of high-proof spirit to raise wine to a target alcohol.",
    fields: [
      { name: "volume", label: "Wine volume", kind: "number", default: 1000 }, volField(),
      { name: "actualAlc", label: "Wine alcohol (%)", kind: "number", default: 12 },
      { name: "targetAlc", label: "Target alcohol (%)", kind: "number", default: 18 },
      { name: "initAlc", label: "Spirit alcohol (%)", kind: "number", default: 96 },
      { name: "outUnit", label: "Output unit", kind: "select", options: volOpts, default: "L" },
    ],
    compute: (input) => ({ values: [{ label: "Spirit to add", value: round(fortificationPearson({ volume: n(input, "volume"), volumeUnit: vu(input, "volumeUnit"), initAlc: n(input, "initAlc"), actualAlc: n(input, "actualAlc"), targetAlc: n(input, "targetAlc"), outUnit: vu(input, "outUnit") }), 2) }], formula: "liters × (target−actual)/(spirit−target)" }),
  },
  {
    kind: "calc", id: "sweet-spot", section: "Fortification", name: "Alcohol sweet-spot ladder",
    description: "Bench-trial ladder of component volumes across a range of alcohol levels.",
    fields: [
      { name: "highAlc", label: "High-alc component (%)", kind: "number", default: 20 },
      { name: "lowAlc", label: "Low-alc component (%)", kind: "number", default: 10 },
      { name: "startAlc", label: "Starting blend (%)", kind: "number", default: 15 },
      { name: "targetAlc", label: "Target (%)", kind: "number", default: 14 },
      { name: "batchVolume", label: "Batch volume", kind: "number", default: 100 },
    ],
    compute: (input) => {
      const rows = sweetSpotLadder({ highAlc: n(input, "highAlc"), lowAlc: n(input, "lowAlc"), startAlc: n(input, "startAlc"), targetAlc: n(input, "targetAlc"), batchVolume: n(input, "batchVolume") });
      const first = rows[0];
      return { values: [{ label: `Rows in ladder`, value: rows.length }, { label: `Top row (${first.alc}%) high`, value: round(first.highComponent, 2) }, { label: `Top row low`, value: round(first.lowComponent, 2) }], formula: "high = batch × (alc−low)/(high−low); stepped 0.1%/row" };
    },
  },

  // ── Section 8: Blending & Cost ──
  {
    kind: "calc", id: "blend-two", section: "Blending & Cost", name: "Two-component blend (pH + attribute)",
    description: "Volume-weighted attribute + chemically-correct pH blend (estimate — bench-trial pH).",
    fields: [
      { name: "volumeA", label: "Component A volume", kind: "number", default: 100 },
      { name: "phA", label: "A pH", kind: "number", default: 3.2 },
      { name: "valueA", label: "A attribute (e.g. alcohol %)", kind: "number", default: 13 },
      { name: "volumeB", label: "Component B volume", kind: "number", default: 100 },
      { name: "phB", label: "B pH", kind: "number", default: 3.6 },
      { name: "valueB", label: "B attribute", kind: "number", default: 14 },
    ],
    compute: (input) => {
      const comps = [{ volume: n(input, "volumeA"), pH: n(input, "phA"), value: n(input, "valueA") }, { volume: n(input, "volumeB"), pH: n(input, "phB"), value: n(input, "valueB") }];
      const ph = blendPH(comps);
      return { values: [{ label: "Blend pH (estimate)", value: round(ph.blendPH, 2) }, { label: "Blend attribute", value: round(blendWeightedAverage(comps.map((c) => ({ volume: c.volume, value: c.value }))), 3) }], formula: "pH via H⁺ space; attribute = Σ(Bi×vi)/ΣBi" };
    },
  },
  {
    kind: "calc", id: "wine-cost", section: "Blending & Cost", name: "Wine cost per case",
    description: "Total cost per gallon and cases from six per-gallon cost buckets (2.38 gal/case).",
    fields: [
      { name: "c1", label: "Fruit $/gal", kind: "number", default: 5 },
      { name: "c2", label: "Production $/gal", kind: "number", default: 3 },
      { name: "c3", label: "Packaging $/gal", kind: "number", default: 4 },
      { name: "c4", label: "Overhead $/gal", kind: "number", default: 2 },
      { name: "c5", label: "Labor $/gal", kind: "number", default: 3 },
      { name: "c6", label: "Other $/gal", kind: "number", default: 1 },
    ],
    compute: (input) => {
      const r = wineCost([n(input, "c1"), n(input, "c2"), n(input, "c3"), n(input, "c4"), n(input, "c5"), n(input, "c6")]);
      return { values: [{ label: "Total cost/gal", value: round(r.totalCostPerGal, 2), unit: "$" }, { label: "Cases (per gal)", value: round(r.totalCases, 3) }], formula: "total = Σ buckets; cases = total / 2.38" };
    },
  },
];

/** Type guard: is this descriptor a computational calculator (vs a static reference)? */
export function isCalc(d: Descriptor): d is CalcDescriptor {
  return d.kind === "calc";
}
/** All calculator descriptors (the computational ones). */
export const CALC_DESCRIPTORS = CALCULATORS.filter(isCalc);
/** Look up a computational descriptor by id (used by the page + the assistant calc tools). */
export function calcById(id: string): CalcDescriptor | undefined {
  return CALC_DESCRIPTORS.find((d) => d.id === id);
}
/** Default input record for a descriptor (field name → default value). */
export function defaultInput(d: CalcDescriptor): Record<string, string | number> {
  return Object.fromEntries(d.fields.map((f) => [f.name, f.default]));
}
export const SECTIONS: CalcSection[] = [
  "Conversions", "SO₂ Additions", "Fermentation & Sugar", "Chaptalization & Dilution",
  "Acid & Deacidification", "Oak, Fining & Copper", "Fortification", "Blending & Cost",
];
