"use server";

import { action } from "@/lib/actions";
import { calcById } from "@/lib/winemaking-calc/registry";
import { logCalculation, queryCalculationHistory, type CalcHistoryRow } from "@/lib/winemaking-calc/log";

export type LogCalcPayload = {
  calculatorId: string;
  inputs: Record<string, string | number>;
  output: unknown;
};

/**
 * Page front door for calculation logging (source PAGE). Wrapped in `action()`, so it runs inside
 * the verified tenant context (K9) and rejects a user with no active org. The calculator's section
 * + advisory/danger flags are derived SERVER-SIDE from the registry (never trusted from the client);
 * an unknown calculatorId simply skips the log. Logging is best-effort; we always return the fresh
 * history so the panel reflects the row (or its absence, if the write silently failed).
 */
export const logCalculationAction = action(
  async ({ user, actor }, payload: LogCalcPayload): Promise<CalcHistoryRow[]> => {
    const descriptor = calcById(payload.calculatorId);
    if (descriptor) {
      await logCalculation({
        tenantId: actor.tenantId,
        userId: user.id,
        userEmail: user.email,
        calculatorId: descriptor.id,
        section: descriptor.section,
        inputs: payload.inputs,
        output: payload.output,
        unitsUsed: pickUnits(payload.inputs, descriptor),
        source: "PAGE",
        advisory: descriptor.advisory,
        danger: descriptor.danger,
      });
    }
    return queryCalculationHistory(user, { limit: 20 });
  },
);

/** The subset of inputs that are unit selections (the descriptor's select fields), kept explicit. */
function pickUnits(
  inputs: Record<string, string | number>,
  descriptor: NonNullable<ReturnType<typeof calcById>>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of descriptor.fields) {
    if (f.kind === "select" && inputs[f.name] != null) out[f.name] = inputs[f.name];
  }
  return out;
}
