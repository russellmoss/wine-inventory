export const BOTTLE_L = 0.75; // 750ml
export const CASE_SIZE = 12;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Suggested bottle count from available liters (floor — can't bottle a partial). */
export function suggestBottles(availableL: number): number {
  return Math.max(0, Math.floor(availableL / BOTTLE_L));
}

/** Liters consumed by a bottle count (simple model: consumed = bottles * 0.75). */
export function consumedForBottles(bottles: number): number {
  return round2(bottles * BOTTLE_L);
}

/** Split a bottle count into full 12-bottle cases + loose bottles (for display). */
export function casesAndLoose(totalBottles: number): { cases: number; loose: number } {
  return { cases: Math.floor(totalBottles / CASE_SIZE), loose: totalBottles % CASE_SIZE };
}

export type DrawInput = { id: string; volumeL: number };
export type DrawResult = { id: string; deduct: number; remaining: number };

/**
 * Proportionally deduct `consumedL` across a vessel's components by volume share.
 * Computed in integer centiliters with largest-remainder distribution, so:
 *   - sum(deduct) === consumedL EXACTLY (asserted), and
 *   - no deduct ever exceeds its component (remaining >= 0).
 * Throws if consumedL exceeds the total. (cL granularity matches Decimal(10,2).)
 */
export function computeProportionalDraw(components: DrawInput[], consumedL: number): DrawResult[] {
  if (consumedL < 0) throw new Error("consumed must be >= 0");
  const cl = (l: number) => Math.round(l * 100); // liters -> integer centiliters

  const units = components.map((c) => cl(c.volumeL));
  const totalUnits = units.reduce((a, u) => a + u, 0);
  const consumedUnits = cl(consumedL);

  if (consumedUnits > totalUnits) throw new Error("draw exceeds available volume");
  if (components.length === 0 || consumedUnits === 0) {
    return components.map((c) => ({ id: c.id, deduct: 0, remaining: round2(c.volumeL) }));
  }

  // base = floor(share); track fractional remainder for largest-remainder rounding.
  const base = units.map((u) => Math.floor((u * consumedUnits) / totalUnits));
  const rem = units.map((u) => (u * consumedUnits) % totalUnits);
  let leftover = consumedUnits - base.reduce((a, b) => a + b, 0); // 0 <= leftover < n

  // Distribute the leftover units to the largest fractional remainders.
  const order = base.map((_, i) => i).sort((a, b) => rem[b] - rem[a]);
  for (let k = 0; k < order.length && leftover > 0; k++) {
    const i = order[k];
    if (base[i] < units[i]) {
      base[i] += 1;
      leftover -= 1;
    }
  }

  const deductUnits = base;
  const sum = deductUnits.reduce((a, b) => a + b, 0);
  if (sum !== consumedUnits) {
    throw new Error(`proportional draw invariant broken: ${sum} != ${consumedUnits}`);
  }

  return components.map((c, i) => ({
    id: c.id,
    deduct: deductUnits[i] / 100,
    remaining: (units[i] - deductUnits[i]) / 100,
  }));
}
