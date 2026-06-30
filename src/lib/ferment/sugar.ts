// Phase 6 Unit 8: sugar-unit display + fat-finger guards for the Round grid (council S11/S12).
// Brix is the CANONICAL stored analyte (the Phase 4 registry); SG / Baumé / potential-alcohol
// are DISPLAY conversions only (winery-level preference). Approximations, documented as such —
// good enough for an at-a-glance ferment readout, not lab-grade.

export const SUGAR_UNITS = ["BRIX", "SG", "BAUME", "POTENTIAL_ALC"] as const;
export type SugarUnit = (typeof SUGAR_UNITS)[number];

export const SUGAR_UNIT_LABEL: Record<SugarUnit, string> = {
  BRIX: "°Bx",
  SG: "SG",
  BAUME: "°Bé",
  POTENTIAL_ALC: "PA %",
};

/** Brix → specific gravity (standard cubic approximation). */
export function brixToSG(brix: number): number {
  return 1.00001 + 0.0038661 * brix + 1.2154e-5 * brix * brix + 6.287e-7 * brix * brix * brix;
}

/** Brix → Baumé (via SG; Bé = 145 − 145/SG). */
export function brixToBaume(brix: number): number {
  const sg = brixToSG(brix);
  return 145 - 145 / sg;
}

/** Brix → potential alcohol % (≈ 0.59 × Brix, a common cellar rule of thumb). */
export function brixToPotentialAlcohol(brix: number): number {
  return brix * 0.59;
}

/** Display a canonical Brix value in the winery's chosen unit. Below 0 °Bx, SG is the natural
 * read (council S12: auto-prefer density past dryness), so a BRIX preference still falls back to
 * SG there. Returns a pre-rounded number + the unit label actually used. */
export function displaySugar(brix: number, unit: SugarUnit): { value: number; label: string } {
  if (unit === "BRIX") {
    if (brix < 0) return { value: round(brixToSG(brix), 4), label: SUGAR_UNIT_LABEL.SG };
    return { value: round(brix, 1), label: SUGAR_UNIT_LABEL.BRIX };
  }
  if (unit === "SG") return { value: round(brixToSG(brix), 4), label: SUGAR_UNIT_LABEL.SG };
  if (unit === "BAUME") return { value: round(brixToBaume(brix), 2), label: SUGAR_UNIT_LABEL.BAUME };
  return { value: round(brixToPotentialAlcohol(brix), 1), label: SUGAR_UNIT_LABEL.POTENTIAL_ALC };
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// ── Fat-finger guards (offline-local, council S11) ──

export const BRIX_HARD_MIN = -5;
export const BRIX_HARD_MAX = 45;
export const TEMP_HARD_MIN = 0;
export const TEMP_HARD_MAX = 45;

export type GuardResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

/** Hard-reject absurd Brix; soft-warn if Brix ROSE since the previous reading (mid-ferment Brix
 * should fall — a rise usually means a fat-finger or a probe error). */
export function checkBrix(value: number, previous?: number | null): GuardResult {
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a Brix value." };
  if (value < BRIX_HARD_MIN || value > BRIX_HARD_MAX) {
    return { ok: false, error: `Brix must be between ${BRIX_HARD_MIN} and ${BRIX_HARD_MAX} °Bx.` };
  }
  if (previous != null && value > previous + 0.05) {
    return { ok: true, warning: `Brix went up (${previous} → ${value} °Bx)? Confirm if that's right.` };
  }
  return { ok: true };
}

export function checkTemp(value: number): GuardResult {
  if (!Number.isFinite(value)) return { ok: false, error: "Enter a temperature." };
  if (value < TEMP_HARD_MIN || value > TEMP_HARD_MAX) {
    return { ok: false, error: `Temp must be between ${TEMP_HARD_MIN} and ${TEMP_HARD_MAX} °C.` };
  }
  return { ok: true };
}
