// Plan 056 — packaging bill-of-materials math. PURE + client-safe (no prisma/React), unit-tested
// directly. The consumption model (council D1): crews don't hand-count 2,400 corks — they know
// "100 cases = 1,200 bottles". Each BoM line carries a per-bottle OR per-case FACTOR; theoretical
// consumption is derived from the bottle count, and the crew edits only the variance (breakage).

export type PackagingUnit = "bottle" | "case";

/** A planned packaging BoM line authored on a BOTTLE work-order task. `qty` is the derived planned
 * consumption (in eaches) the reservation holds — computed from `factor` × planned bottles/cases. */
export type PackagingPlanLine = {
  materialId: string;
  per: PackagingUnit;
  factor: number;
  qty?: number;
};

export const BOTTLES_PER_CASE = 12;

/** Cases a bottle count fills (partial case rounds up — you open a fresh box for the 1,201st bottle). */
export function casesFor(bottles: number): number {
  return bottles > 0 ? Math.ceil(bottles / BOTTLES_PER_CASE) : 0;
}

/**
 * Theoretical consumption (eaches) for one BoM line at a given bottle count: bottles × factor for a
 * per-bottle line, cases × factor for a per-case line. Eaches are whole units (rounded). Zero/invalid
 * inputs → 0.
 */
export function theoreticalConsumption(line: { per: PackagingUnit; factor: number }, bottles: number): number {
  if (!(bottles > 0) || !(line.factor > 0)) return 0;
  const base = line.per === "case" ? casesFor(bottles) : bottles;
  return Math.round(base * line.factor);
}

/**
 * Auto-fill the per-line factor from the picked material's name/kind (the adoption lever — a factor is
 * rarely typed). Case boxes/cartons/dividers are per-case (1 each); everything else (glass, cork,
 * capsule, closure, screwcap, label, foil) is per-bottle (1 each). The crew overrides for 2-label runs.
 */
export function guessPackagingFactor(name?: string | null, kind?: string | null): { per: PackagingUnit; factor: number } {
  const s = `${name ?? ""} ${kind ?? ""}`.toLowerCase();
  if (/\b(case|box|carton|shipper|6-?pack|12-?pack|divider|insert|mailer)\b/.test(s)) return { per: "case", factor: 1 };
  return { per: "bottle", factor: 1 };
}

// ---------------------------------------------------------------------------
// Mandatory packaging components. Every bottling run must consume, at minimum, a BOTTLE (glass), a
// CLOSURE (cork/screwcap/crown), and a LABEL — a run cannot ship without all three. The three roles
// below are classified from the material's name/kind (packaging materials are all one PACKAGING kind,
// so the role is inferred by name, mirroring guessPackagingFactor). PURE + client-safe; enforced both
// in the UI (BottlingClient / BottlingTaskForm) AND server-side in runBottlingTx (the true guard —
// covers the standalone flow, the work-order BOTTLE task, and any assistant/crafted submit).
// ---------------------------------------------------------------------------

/** A mandatory packaging role a bottling run must include. */
export type PackagingRole = "bottle" | "closure" | "label";

/** The mandatory roles, in display order, with a human label for the "missing X" message. */
export const REQUIRED_PACKAGING_ROLES: { role: PackagingRole; label: string }[] = [
  { role: "bottle", label: "a bottle" },
  { role: "closure", label: "a closure (e.g. cork)" },
  { role: "label", label: "a label" },
];

/**
 * Classify a packaging material into one of the mandatory roles (or null when it's some other dry good,
 * e.g. a case box or capsule). By name/kind only — packaging materials share one kind, so the role is
 * inferred from the name the same way the factor is guessed. Closure covers cork/screwcap/crown/stelvin;
 * a capsule/foil is deliberately NOT a closure (the `\bcap\b` alternative won't match "capsule").
 */
export function classifyPackagingRole(name?: string | null, kind?: string | null): PackagingRole | null {
  const s = `${name ?? ""} ${kind ?? ""}`.toLowerCase();
  if (/\blabel(s|led|ling)?\b/.test(s)) return "label";
  if (/\b(cork|screw ?cap|screwcap|stelvin|crown ?cap|crown|zork|closure|cap)\b/.test(s)) return "closure";
  if (/\b(bottle|glass|flute|magnum|split)\b/.test(s)) return "bottle";
  return null;
}

/**
 * Given the roles present on a run's packaging lines (those with a positive derived quantity), return
 * the mandatory roles that are still MISSING, in display order. Empty ⇒ the run has all three.
 */
export function missingRequiredPackaging(presentRoles: Iterable<PackagingRole>): { role: PackagingRole; label: string }[] {
  const present = new Set(presentRoles);
  return REQUIRED_PACKAGING_ROLES.filter((r) => !present.has(r.role));
}

/**
 * Server-side convenience: given the actual packaging materials consumed on a run (name/kind of each
 * line with a positive quantity), return the mandatory roles still MISSING. PURE — the caller resolves
 * the display name/kind from the DB; this classifies + diffs against the required set. Empty ⇒ all three
 * present. This is the backstop runBottlingTx enforces so no path can bottle without a closure.
 */
export function missingRolesForMaterials(materials: { name?: string | null; kind?: string | null }[]): { role: PackagingRole; label: string }[] {
  const present = new Set<PackagingRole>();
  for (const m of materials) {
    const role = classifyPackagingRole(m.name, m.kind);
    if (role) present.add(role);
  }
  return missingRequiredPackaging(present);
}
