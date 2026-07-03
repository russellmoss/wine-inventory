// Pure available-to-promise (ATP) math for work-order reservations (Phase 9 Unit 5). No DB, no I/O —
// unit-tested in test/work-order-atp.test.ts. The rule (WORKORDER-2): reservations are ADVISORY. ATP =
// on-hand/capacity − Σ(other ACTIVE holds); if a demand exceeds ATP we WARN (return an advisory), never
// throw. The hard guarantee stays at commit (vessel capacity in writeLotOperation; SupplyLot decrement).

const EPS = 1e-6;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export type ReservationKind = "LOT_VOLUME" | "VESSEL_CAPACITY" | "MATERIAL_QTY";

/** One demand to test against supply. `supply` is the raw on-hand (material) or capacity (vessel) or
 * current lot volume (lot); `alreadyReserved` is the sum of OTHER active holds against the same target. */
export type AtpDemand = {
  kind: ReservationKind;
  targetLabel: string; // human label for the warning ("Tank 3", "KMBS", "Lot ABC")
  supply: number;
  alreadyReserved: number;
  requested: number;
  unit?: string;
};

export type AtpAdvisory = {
  kind: ReservationKind;
  targetLabel: string;
  available: number; // supply − alreadyReserved (never negative in the message, but can be < requested)
  requested: number;
  short: number; // how much the request exceeds ATP (0 when it fits)
  ok: boolean;
  unit?: string;
};

/** Evaluate one demand. Pure. `ok` = the request fits within ATP; `short` = the deficit when it doesn't. */
export function evaluateAtp(d: AtpDemand): AtpAdvisory {
  const available = round6(d.supply - d.alreadyReserved);
  const short = round6(Math.max(0, d.requested - available));
  return {
    kind: d.kind,
    targetLabel: d.targetLabel,
    available,
    requested: round6(d.requested),
    short,
    ok: short <= EPS,
    unit: d.unit,
  };
}

/** A friendly one-line warning for a short advisory (null when the demand fits). */
export function advisoryWarning(a: AtpAdvisory): string | null {
  if (a.ok) return null;
  const u = a.unit ? ` ${a.unit}` : "";
  switch (a.kind) {
    case "VESSEL_CAPACITY":
      return `${a.targetLabel} may overfill: needs ${a.requested}${u} but only ${a.available}${u} of headroom is uncommitted (short ${a.short}${u}).`;
    case "LOT_VOLUME":
      return `${a.targetLabel} may be short: needs ${a.requested}${u} but only ${a.available}${u} is uncommitted (short ${a.short}${u}).`;
    case "MATERIAL_QTY":
      return `${a.targetLabel} may be short on stock: needs ${a.requested}${u} but only ${a.available}${u} is on hand and uncommitted (short ${a.short}${u}).`;
  }
}

/** Evaluate a batch of demands, returning the advisories and just the warning strings. */
export function evaluateDemands(demands: AtpDemand[]): { advisories: AtpAdvisory[]; warnings: string[] } {
  const advisories = demands.map(evaluateAtp);
  const warnings = advisories.map(advisoryWarning).filter((w): w is string => w !== null);
  return { advisories, warnings };
}
