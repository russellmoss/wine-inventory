// Derived molecular SO₂ (Phase 4). Molecular SO₂ is the antimicrobially active fraction
// of free SO₂; no instrument measures it directly — it is ALWAYS a pure function of the
// SAME sample's free SO₂ + pH. We DERIVE it read-only and NEVER store it (storing risks a
// stale-pH pairing). Pair strictly within ONE AnalysisPanel — never across panels/dates.
//
//   molecular = free / (1 + 10^(pH − pKa)),  pKa ≈ 1.81 at 20 °C (industry standard).
//
// Targets ≈ 0.5 mg/L (red) / 0.8 mg/L (white). No prisma, no server imports — pure,
// unit-tested in test/chemistry-so2.test.ts. Plain display math (not ledger Decimal).

/** First dissociation constant of sulfurous acid; the industry-standard constant. */
export const SO2_PKA = 1.81;

export type MolecularSO2 = {
  /** Molecular (active) SO₂ in mg/L. */
  molecularSO2: number;
  /** The pKa used (surfaced alongside the result so the assumption is visible). */
  pKa: number;
  /** Echo of the inputs the derivation used (same-panel free + pH). */
  freeSO2: number;
  pH: number;
};

/**
 * Molecular SO₂ from a single panel's free SO₂ + pH. Returns `null` when either input is
 * missing or non-finite (the UI then hides the line) — never throws, never guesses.
 */
export function molecularSO2(input: {
  freeSO2?: number | null;
  pH?: number | null;
  pKa?: number;
}): MolecularSO2 | null {
  const { freeSO2, pH } = input;
  const pKa = input.pKa ?? SO2_PKA;
  if (freeSO2 == null || pH == null) return null;
  if (!Number.isFinite(freeSO2) || !Number.isFinite(pH) || !Number.isFinite(pKa)) return null;
  if (freeSO2 < 0) return null;
  const molecular = freeSO2 / (1 + Math.pow(10, pH - pKa));
  return { molecularSO2: molecular, pKa, freeSO2, pH };
}
