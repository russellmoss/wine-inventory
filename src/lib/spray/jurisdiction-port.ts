// Spray Intelligence S2b Unit 1 — the jurisdiction PORT (KD-9). Same seam shape as
// product-facts-port.ts: the write core never imports src/lib/pesticide/ directly, S2b's real
// resolver is registered at the composition root (src/lib/spray/actions.ts), and the null default
// is what makes "no confirmed jurisdiction resolves to unknown, never a clearance" the current,
// tested behavior rather than a promise about future code.
//
// Batched (resolveMany, not resolve) for the same reason as the facts port — a pass can span
// several vineyards (council C3), and a per-line resolve() would hide an N+1.

export interface JurisdictionResult {
  country: string;
  state: string | null;
}

export interface JurisdictionResolver {
  /** One entry per requested vineyardId. `null` = no confirmed jurisdiction (unset or a GPS
   * proposal nobody confirmed) — never resolves to a clearance. */
  resolveMany(vineyardIds: string[]): Promise<Record<string, JurisdictionResult | null>>;
}

/** The pre-S2b default: every vineyard resolves to no confirmed jurisdiction. */
export const NullJurisdictionResolver: JurisdictionResolver = {
  async resolveMany(vineyardIds: string[]): Promise<Record<string, JurisdictionResult | null>> {
    const out: Record<string, JurisdictionResult | null> = {};
    for (const id of vineyardIds) out[id] = null;
    return out;
  },
};
