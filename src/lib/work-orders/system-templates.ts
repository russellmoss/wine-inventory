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
    code: "SYS-DELESTAGE",
    name: "Délestage (rack & return)",
    description: "Drain a red ferment into a holding vessel, then return it over the cap. Two racks: out (origin → holding) and back (holding → origin). Pick the origin + holding vessel at issue.",
    category: "Ferment",
    spec: {
      tasks: [
        { taskType: "RACK", title: "Rack out (origin → holding)", defaults: { rackType: "délestage", lossL: 0 }, instructions: "Drain the fermenting tank into the empty holding vessel, leaving the heavy seeds/solids behind." },
        { taskType: "RACK", title: "Return (holding → origin)", defaults: { rackType: "délestage", lossL: 0 }, instructions: "Pump the wine back over the cap into the origin tank. Complete this AFTER the rack-out." },
      ],
    },
  },
  {
    code: "SYS-COLD-STAB",
    name: "Cold stabilization",
    description: "Chill a wine to stabilize tartrates, then record any real loss, filtration, or material addition separately.",
    category: "Cellar",
    spec: {
      tasks: [
        { taskType: "TEMP_SETPOINT", title: "Set cold-stab temperature", defaults: { targetUnit: "°C" }, instructions: "Set the target cold-stabilization temperature." },
        { taskType: "NOTE", title: "Confirm stability / next step", instructions: "Record observations. If wine is filtered, racked, or lost, complete that as its own cellar operation." },
      ],
    },
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
    code: "SYS-CAP-MGMT",
    name: "Cap management (pumpover / punchdown)",
    description: "Work the cap on a red ferment — pumpover, punchdown, cold-soak, maceration, or pulse-air. Issue across many fermenters; complete tank-by-tank or in a batch. Volume-neutral.",
    category: "Ferment",
    spec: { tasks: [{ taskType: "CAP_MGMT", title: "Work the cap", defaults: { technique: "PUNCHDOWN" }, instructions: "Pick the technique (pumpover / punchdown / …) and optionally how long. Records against every lot in the vessel; no volume change." }] },
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
  // ── Barrel maintenance (plan 044): the barrel-shed jobs. All lotless MAINTENANCE except bâtonnage,
  // which stirs the wine's lees and rides CAP_MGMT for a per-lot record. Supplies drain as overhead. ──
  {
    code: "SYS-BARREL-WASH",
    name: "Hot-water wash (barrel)",
    description: "Rinse a barrel with hot water. Leave the agent blank for a plain hot-water wash, or record a cleaning agent + amount (drains as overhead).",
    category: "Maintenance",
    spec: { tasks: [{ taskType: "CLEAN", title: "Hot-water wash the barrel", instructions: "Hot-water rinse. For a plain wash leave the cleaning agent blank; otherwise pick the agent + amount used." }] },
  },
  {
    code: "SYS-OZONE",
    name: "Ozone treatment (barrel)",
    description: "Sanitize a barrel with ozonated water or ozone gas; record the contact time.",
    category: "Maintenance",
    spec: { tasks: [{ taskType: "OZONE", title: "Ozone the barrel", instructions: "Sanitize with ozonated water / ozone gas; record the contact time (min) in Duration." }] },
  },
  {
    code: "SYS-SO2-BARREL",
    name: "SO₂ treatment (strip / ring / gas)",
    description: "SO₂ a barrel — burn a sulfur strip/ring or gas it. Optionally record strips/discs used (drains as overhead).",
    category: "Maintenance",
    spec: { tasks: [{ taskType: "SO2", title: "SO₂ the barrel", defaults: { so2Method: "Burned sulfur strip" }, instructions: "Pick the method (burned strip/ring or SO₂ gas). If you burned strips/discs, record the material + count used." }] },
  },
  {
    code: "SYS-BARREL-STORAGE",
    name: "Wet-storage solution change (citric + SO₂)",
    description: "Drain and replace the citric+SO₂ storage solution in a wet-stored empty barrel. Records each reagent (KMBS + citric) drawn as overhead.",
    category: "Maintenance",
    spec: {
      tasks: [
        { taskType: "WET_STORAGE", title: "Add KMBS (potassium metabisulfite)", instructions: "After draining the old solution, refill with fresh water; record the KMBS material + amount added (overhead)." },
        { taskType: "WET_STORAGE", title: "Add citric acid", instructions: "Record the citric acid material + amount added to the storage solution (overhead)." },
      ],
    },
  },
  {
    code: "SYS-BARREL-PREP",
    name: "Barrel prep (wash → steam → SO₂)",
    description: "Full barrel prep in order: hot-water wash, steam, then SO₂. Three blocks, completed in sequence.",
    category: "Maintenance",
    spec: {
      tasks: [
        { taskType: "CLEAN", title: "Hot-water wash", instructions: "Hot-water rinse the barrel. Leave the agent blank for a plain wash, or record an agent + amount." },
        { taskType: "STEAM", title: "Steam", instructions: "Steam the clean barrel; note the duration." },
        { taskType: "SO2", title: "SO₂ the barrel", defaults: { so2Method: "Burned sulfur strip" }, instructions: "SO₂ the prepped barrel — burned strip/ring or gas. Record strips/discs used if any." },
      ],
    },
  },
  {
    code: "SYS-BATONNAGE",
    name: "Stir the lees (bâtonnage)",
    description: "Stir the lees in a barrel. Volume-neutral treatment recorded against every lot in the vessel; no volume change.",
    category: "Cellar",
    spec: { tasks: [{ taskType: "CAP_MGMT", title: "Stir the lees", defaults: { technique: "BATONNAGE" }, instructions: "Stir the barrel's lees. Records a bâtonnage treatment on every lot in the vessel; complete barrel-by-barrel or in a batch." }] },
  },
  // ── Vineyard (plan 039): the "weigh the fruit" stage. The weigh-in logs a HarvestPick to the block's
  // current-vintage record; the NOTE block prompts for fruit condition + MOG. Block + weight + Brix/pH/TA
  // are run-time inputs (entered on the execute sub-form), not template defaults. ──
  {
    code: "SYS-HARVEST-WEIGH-IN",
    name: "Fruit intake / weigh-in",
    description: "Weigh in fruit off a vineyard block (weight + optional Brix/pH/TA) and record fruit condition + MOG.",
    category: "Vineyard",
    spec: {
      tasks: [
        { taskType: "HARVEST_WEIGH_IN", title: "Weigh in fruit", instructions: "Pick the block; record the fruit weight (kg/lb) and, if measured, Brix / pH / TA. Logs a harvest pick — no cellar ledger op." },
        { taskType: "NOTE", title: "Fruit condition & MOG", instructions: "Note MOG (material other than grapes: leaves, stems, dirt), any rot / mold, sunburn / raisining, and overall fruit condition." },
      ],
    },
  },
];
