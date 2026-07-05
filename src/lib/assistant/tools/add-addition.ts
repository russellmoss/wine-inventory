import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import { resolveVessel, resolveVesselContents, type ResolvedVessel } from "../scope";
import { resolveOneOrChoice } from "./resolve";
import { round2 } from "@/lib/bottling/draw";
import { listMaterials, materialDisplayName } from "@/lib/cellar/materials";
import { isDoseableCategory, categoryOf, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { computeDoseTotal, isRateUnit, resolveDoseUnit, type RateBasis } from "@/lib/cellar/additions-math";
import { addAdditionAction, addFiningAction } from "@/lib/cellar/actions";
import type { AddAdditionInput } from "@/lib/cellar/addition";

// Plan 035-follow / assistant-coverage Wave 1 #1 — record an ADDITION or FINING (a material dose) to a
// vessel by chat. A pure WRAPPER over addAdditionCore / addFiningCore (via their server actions) — it
// re-implements no dosing math and never touches Prisma for the write. Design decisions (interview
// 2026-07-05): dosing is WHOLE-VESSEL (an addition physically hits all wine in the tank → lotId omitted
// = all resident lots, the core default); material resolves ADDITIVE-SCOPED (isDoseableCategory) and a
// non-additive material is a HARD REFUSAL (packaging/cleaning are never dosed — WORKORDER-3); any
// authenticated user can do it, behind the confirm-nonce gate.
//
// Boundary vs the calculator: this RECORDS a concrete product dose. A TARGET question ("get to 0.8
// molecular SO₂…") is compute → route to calc_so2, not here. Enforced by the fleet eval, not this file.

const DOSE_UNITS = ["g/hL", "g/L", "mg/L", "mL/L", "g", "kg", "mL", "L"] as const;
const CAT_LABEL: Record<string, string> = {
  CLEANING_SANITIZING: "cleaning / sanitizing",
  PACKAGING: "packaging",
  ADDITIVE: "additive",
  OTHER: "other",
};

type AddAdditionRawInput = { vessel?: string; material?: string; amount?: number; unit?: string; fining?: boolean; note?: string };

const label = (v: { type: string; code: string }) => (v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`);
const totalL = (v: ResolvedVessel) => round2(v.components.reduce((a, c) => a + Number(c.volumeL), 0));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const catOf = (m: { category?: string | null; kind: string }) => (m.category ?? categoryOf(m.kind)) as MaterialCategory;
/** Winemakers say "ppm"; for wine that's mg/L. Everything else passes through as-is. */
const normUnit = (u: string): string => (/^ppm$/i.test(u.trim()) ? "mg/L" : u.trim());

export const addAdditionTool: AssistantTool = {
  name: "add_addition",
  description:
    "Record an ADDITION or FINING — a material dose (SO₂/KMBS, nutrients, acid, tannin, bentonite, etc.) into a vessel. Use when the user says they ADDED / DOSED / are adding a concrete amount of a product to a tank or barrel. The dose goes into ALL wine in the vessel. Set fining:true for a fining agent. This is NOT a calculator: a 'how much do I add to hit X' question is compute — use calc_so2 for SO₂ targets. Does NOT save immediately — returns a preview the user must confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "Vessel to dose, e.g. 'tank 5' or 'barrel 12'. The addition goes into all wine in it." },
      material: { type: "string", description: "The additive by name/brand, e.g. 'KMBS', 'Fermaid-O', 'tartaric', 'bentonite'. Must be an additive — packaging or cleaning/sanitizing materials are refused." },
      amount: { type: "number", description: "How much to add (the number)." },
      unit: { type: "string", enum: DOSE_UNITS, description: "Dose unit. A per-volume unit (g/hL, g/L, mg/L, mL/L) is a RATE against the vessel's volume; an absolute unit (g, kg, mL, L) is the exact total. 'ppm' is treated as mg/L." },
      fining: { type: "boolean", description: "Set true for a fining agent (bentonite, etc.) — records a fining (its loss realizes at the next racking). Default false = a plain addition." },
      note: { type: "string", description: "Optional note about the addition." },
    },
    required: ["vessel", "material", "amount", "unit"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as AddAdditionRawInput;
    if (!input.vessel || typeof input.vessel !== "string") throw new Error("Which vessel are you dosing?");
    if (!input.material || typeof input.material !== "string") throw new Error("Which material are you adding?");
    if (typeof input.amount !== "number" || !(input.amount > 0)) throw new Error("How much are you adding? Give a positive amount.");
    const unit = normUnit(String(input.unit ?? ""));
    if (!(DOSE_UNITS as readonly string[]).includes(unit)) throw new Error(`Unit must be one of: ${DOSE_UNITS.join(", ")} (or ppm).`);
    const fining = input.fining === true;
    // The standalone addition action doses by RATE (rateValue + rateBasis). Absolute totals (g/kg/mL/L)
    // have no standalone path yet — only the WO tx seam takes an amount — so reject them with guidance
    // rather than silently no-op'ing (which is the "dose rate > 0" failure this whole fix chases down).
    const dose = resolveDoseUnit(unit);
    if (!dose || dose.kind !== "rate") {
      throw new Error(
        `I can log a dose RATE — g/hL, ppm (mg/L), g/L, or mL/L. For an exact total like "${input.amount} ${unit}", enter it on the cellar addition form for now.`,
      );
    }

    // Resolve the vessel (refuse inactive / empty — no-vessel throws a clear message from resolveVessel).
    const v = await resolveVessel(input.vessel);
    if (!v.isActive) throw new Error(`${label(v)} is inactive.`);
    const vol = totalL(v);
    if (vol <= 0) throw new Error(`${label(v)} is empty — there's no wine to dose.`);

    // Resolve the material ADDITIVE-SCOPED. A name that matches ONLY a non-additive (packaging/cleaning)
    // is a hard refusal, not a "no match" — the winemaker named a real product that simply can't be dosed.
    const all = await listMaterials(); // active catalog

    // A picker tap re-sends the command with the material pinned by id ("#<uuid>"). Resolve that exactly,
    // bypassing name matching — the whole point is that identical names pick cleanly by identity.
    const rawMat = input.material.trim();
    const idToken = rawMat.match(/#\s*([0-9a-z-]{8,})/i)?.[1] ?? rawMat;
    const byId = idToken.replace(/-/g, "").toLowerCase();
    let material = all.find((m) => m.id.replace(/-/g, "").toLowerCase() === byId);
    if (rawMat.startsWith("#") && !material) {
      throw new Error("That product isn't in the active catalog anymore — pick it again.");
    }
    if (material) {
      if (!isDoseableCategory(catOf(material))) {
        throw new Error(`"${materialDisplayName(material)}" is a ${CAT_LABEL[catOf(material)] ?? "non-additive"} material — it can't be dosed as an addition.`);
      }
    } else {
      const needle = norm(input.material);
      const nameNorms = (m: (typeof all)[number]) => [materialDisplayName(m), m.name, m.genericName, m.brandName, m.brand].filter(Boolean).map((x) => norm(String(x)));
      // Prefer an EXACT normalized-name match: a fully-specified name must win, even though shorter
      // near-duplicate names ("Potassium Metabisulfite" vs "…KMBS (SO2)") also fuzzy-match. Fuzzy contains
      // is the fallback for a partial name like "KMBS".
      const exact = all.filter((m) => nameNorms(m).includes(needle));
      const fuzzy = all.filter((m) => nameNorms(m).some((h) => h !== "" && (h.includes(needle) || needle.includes(h))));
      const matches = exact.length > 0 ? exact : fuzzy;
      const doseable = matches.filter((m) => isDoseableCategory(catOf(m)));
      if (matches.length > 0 && doseable.length === 0) {
        const m = matches[0];
        throw new Error(`"${materialDisplayName(m)}" is a ${CAT_LABEL[catOf(m)] ?? "non-additive"} material — it can't be dosed as an addition (cleaning/sanitizing is overhead; packaging is never dosed).`);
      }
      // Ambiguous (a partial name, or true name-duplicates) → hand back a clickable PICKER instead of a
      // text question that dead-loops when names collide. Each option pins the product by id, and the
      // sublabel carries a distinguishing field (+ a short ref) so even identical names are tell-apart-able.
      const res = resolveOneOrChoice(doseable, {
        prompt: `Which "${input.material}" do you mean?`,
        describe: (m) => materialDisplayName(m),
        detail: (m) => [m.kind, m.subcategory].filter(Boolean).join(" · ") + ` · ref ${m.id.replace(/-/g, "").slice(0, 6)}`,
        // Deterministic: tapping re-runs THIS tool with the material pinned by id (no model round-trip).
        resume: (m) => signResume("add_addition", { ...input, material: `#${m.id}`, unit }),
        noneMsg: `No additive matches "${input.material}". Add it to the expendables catalog first, or check the name.`,
      });
      if (res.kind === "choice") return res.choice;
      material = res.row;
    }

    // Preview: the computed total to weigh out (rate → amount × volume; absolute → the amount), + the
    // resident lots being dosed (transparency on a multi-lot tank — the dose hits all of them).
    const est = isRateUnit(unit) ? computeDoseTotal(input.amount, unit, vol) : null;
    const totalClause = est ? `≈ ${est.total.toLocaleString()} ${est.unit} to weigh out (at ${vol} L)` : `${input.amount} ${unit}`;
    const contents = await resolveVesselContents(input.vessel);
    const lotClause =
      contents.kind === "blend" ? ` — all ${contents.lots.length} resident lots (${contents.lots.map((l) => l.code).join(", ")})`
      : contents.kind === "single" ? ` — lot ${contents.lot.code}`
      : "";

    const preview = `${fining ? "Fine" : "Add"} ${input.amount} ${unit} ${materialDisplayName(material)} to ${label(v)}${lotClause}: ${totalClause}.`;
    const token = signProposal("add_addition", {
      vesselId: v.id,
      materialId: material.id,
      rateValue: input.amount,
      rateBasis: dose.basis,
      fining,
      ...(input.note ? { note: input.note } : {}),
      materialLabel: materialDisplayName(material),
      vesselLabel: label(v),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitAddAddition: Committer = async (_user, args) => {
  const input: AddAdditionInput = {
    vesselId: String(args.vesselId),
    materialId: String(args.materialId),
    rateValue: Number(args.rateValue),
    rateBasis: args.rateBasis as RateBasis,
    note: args.note == null ? undefined : String(args.note),
  };
  const res = args.fining === true ? await addFiningAction(input) : await addAdditionAction(input);
  return { message: res.message };
};
