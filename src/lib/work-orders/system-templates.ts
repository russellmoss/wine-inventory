import type { TemplateSpec } from "@/lib/work-orders/template-vocabulary";

// Phase 9.1 (Unit 7): the shipped system work-order templates (pure data, no side effects — importable by
// both the seed script and the vocabulary test). A small, flexible consolidated set: few templates with
// optional fields, NOT one per material. The generic Addition + material picker covers
// yeast/bentonite/acid/chitosan/nutrient/tannin/KHT/MLF; SO₂ stays as a convenience preset. Filtration, the
// temperature setpoint, and the maintenance lane (clean/sanitize/steam/gas) round out the winery's real day.

export type SystemTemplate = {
  code: string;
  name: string;
  description: string;
  category: string;
  recurringCadence?: string | null;
  spec: TemplateSpec;
};

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    code: "SYS-RACK",
    name: "Rack a tank",
    description: "Move wine from one vessel to another (off the lees).",
    category: "Cellar",
    spec: { tasks: [{ taskType: "RACK", title: "Rack tank to destination", defaults: { lossL: 0, rackType: "off gross lees" }, instructions: "Rack cleanly off the lees; pick the rack type." }] },
  },
  {
    code: "SYS-ADDITION",
    name: "Addition (any material)",
    description: "Dose any cellar material (yeast, nutrient, acid, tannin, bentonite, chitosan, MLF, KHT…) at a target rate.",
    category: "Cellar",
    spec: { tasks: [{ taskType: "ADDITION", title: "Add material", defaults: { doseUnit: "g/hL" }, instructions: "Pick the material; dose to the target rate against current volume." }] },
  },
  {
    code: "SYS-ADD-SO2",
    name: "SO₂ addition",
    description: "Add sulfur dioxide to a lot at a target rate.",
    category: "Cellar",
    recurringCadence: "MONTHLY",
    spec: { tasks: [{ taskType: "ADDITION", title: "Add SO₂", defaults: { doseUnit: "mg/L" }, instructions: "Dose to the target free-SO₂ rate; stir gently." }] },
  },
  {
    code: "SYS-FINING",
    name: "Fining",
    description: "Add a fining agent (gelatin, bentonite, chitosan, isinglass…) at a target rate.",
    category: "Cellar",
    spec: { tasks: [{ taskType: "FINING", title: "Fine the wine", defaults: { doseUnit: "g/hL" }, instructions: "Pick the fining agent; dose to the trial rate." }] },
  },
  {
    code: "SYS-FILTRATION",
    name: "Filtration",
    description: "Filter a vessel; pick the filter type and record the actual output volume.",
    category: "Cellar",
    spec: { tasks: [{ taskType: "FILTRATION", title: "Filter the wine", instructions: "Select the filter type + micron; record the actual output volume (loss = starting − output)." }] },
  },
  {
    code: "SYS-TOP",
    name: "Top the barrels",
    description: "Top a vessel from a source to eliminate headspace.",
    category: "Cellar",
    recurringCadence: "WEEKLY",
    spec: { tasks: [{ taskType: "TOPPING", title: "Top vessel from source", instructions: "Pick the source vessel; top to the bung and log the volume added." }] },
  },
  {
    code: "SYS-FERMENT-MONITOR",
    name: "Ferment monitor",
    description: "Log a Brix reading during active fermentation.",
    category: "Ferment",
    recurringCadence: "WEEKLY",
    spec: { tasks: [{ taskType: "BRIX", title: "Log Brix", instructions: "Read Brix at cap; note temperature." }] },
  },
  {
    code: "SYS-TEMP-SETPOINT",
    name: "Temperature setpoint",
    description: "Set a vessel to a target temperature — cold-settle, warm to start, or cool to arrest fermentation.",
    category: "Cellar",
    spec: { tasks: [{ taskType: "TEMP_SETPOINT", title: "Set vessel temperature", defaults: { targetUnit: "°C" }, instructions: "Set the target temp; capture the current actual temp when you complete it." }] },
  },
  {
    code: "SYS-CLEAN",
    name: "Tank / barrel cleaning",
    description: "Clean a vessel; record the cleaning agent + amount (depletes stock as overhead).",
    category: "Maintenance",
    spec: { tasks: [{ taskType: "CLEAN", title: "Clean the vessel", instructions: "Pick the cleaning agent (e.g. proxycarb) + amount used." }] },
  },
  {
    code: "SYS-SANITIZE",
    name: "Sanitize",
    description: "Sanitize a vessel; record the sanitizer + amount (depletes stock as overhead).",
    category: "Maintenance",
    spec: { tasks: [{ taskType: "SANITIZE", title: "Sanitize the vessel", instructions: "Pick the sanitizer (e.g. PAA) + amount used." }] },
  },
  {
    code: "SYS-STEAM",
    name: "Barrel / tank steaming",
    description: "Steam a barrel or tank (no supply consumed).",
    category: "Maintenance",
    spec: { tasks: [{ taskType: "STEAM", title: "Steam the vessel", instructions: "Steam to sanitize; note duration in the note." }] },
  },
  {
    code: "SYS-GAS",
    name: "Gas / blanket",
    description: "Blanket a vessel's headspace with inert gas (Ar / N₂ / CO₂ / dry ice).",
    category: "Maintenance",
    spec: { tasks: [{ taskType: "GAS", title: "Gas the headspace", defaults: { gasType: "Argon" }, instructions: "Pick the gas; optionally record a depletable supply (e.g. dry ice)." }] },
  },
];
