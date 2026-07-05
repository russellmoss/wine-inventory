import type { AppUser } from "@/lib/access";
import type { LogCalculationInput } from "@/lib/winemaking-calc/log";
import {
  calcById, defaultInput, DomainError, type CalcDescriptor, type ResultValue,
} from "@/lib/winemaking-calc";

// Plan 040 PR2 Unit 14 — shared plumbing for the ~6 PURE, read-only assistant calc tools.
//
// The tools do NOT touch Prisma (contract: read tools never write). They dispatch to the SAME
// registry compute functions the page uses — so a formula lives once, and the registry's typed unit
// readers (requireOneOf → DomainError) guard the model-supplied units. Logging is NOT done here; the
// run loop calls logCalculation after a successful calc-* result (LOCKED #11).

/** Every calc tool result carries the formula + assumptions + advisory flags so the model can be
 *  honest about it, and the run-loop hook can log it. */
export type CalcToolResult = {
  operation: string;
  calculator: string;
  section: string;
  inputs: Record<string, string | number>;
  unitsUsed: Record<string, string | number>;
  result: ResultValue[];
  formula: string;
  warning?: string;
  advisory: boolean;
  danger: boolean;
  note: string;
};

const ADVISORY_NOTE =
  "Advisory bench calculation. State the formula and the values assumed (e.g. '0.8 mg/L molecular'). " +
  "Not a substitute for lab measurement or a bench trial.";

/**
 * Build a tool `inputSchema` FROM the registry FieldSpec[] of the given calculators (LOCKED registry
 * rule — generated, never hand-authored). One `operation` enum + the union of the calculators' fields
 * (all optional; the run merges in each calc's defaults). Colliding select fields union their options;
 * the per-descriptor typed readers still validate the actual unit at compute time.
 */
export function buildCalcInputSchema(ids: string[]): Record<string, unknown> {
  const descriptors = ids.map(calcById).filter((d): d is CalcDescriptor => !!d);
  const properties: Record<string, unknown> = {
    operation: {
      type: "string",
      enum: ids,
      description: "Which calculation to run: " + descriptors.map((d) => `${d.id} — ${d.name}`).join("; "),
    },
  };
  const selectOptions = new Map<string, Set<string>>();
  for (const d of descriptors) {
    for (const f of d.fields) {
      if (f.kind === "select") {
        const set = selectOptions.get(f.name) ?? new Set<string>();
        for (const o of f.options ?? []) set.add(o.value);
        selectOptions.set(f.name, set);
        properties[f.name] = { type: "string", enum: [...set], description: `${f.label} (default ${f.default})` };
      } else if (!properties[f.name]) {
        properties[f.name] = { type: "number", description: `${f.label} (default ${f.default})` };
      }
    }
  }
  return { type: "object", properties, required: ["operation"] };
}

/**
 * Dispatch a calc tool call: pick the operation, merge model-supplied fields over the calculator's
 * defaults, run its compute (may throw DomainError on a bad unit/value → surfaced by the run loop as
 * text), and return the structured, self-describing result. PURE — no Prisma.
 */
export function runCalcTool(ids: string[], rawInput: unknown): CalcToolResult {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  const operation = String(input.operation ?? "");
  if (!ids.includes(operation)) {
    throw new DomainError(`Unknown operation. Choose one of: ${ids.join(", ")}.`);
  }
  const descriptor = calcById(operation);
  if (!descriptor) throw new DomainError(`Unknown operation: ${operation}.`);

  const merged: Record<string, string | number> = defaultInput(descriptor);
  const unitsUsed: Record<string, string | number> = {};
  for (const f of descriptor.fields) {
    const v = input[f.name];
    if (v !== undefined && v !== null && v !== "") {
      merged[f.name] = f.kind === "number" ? Number(v) : String(v);
    }
    if (f.kind === "select") unitsUsed[f.name] = merged[f.name];
  }

  const result = descriptor.compute(merged);
  return {
    operation: descriptor.id,
    calculator: descriptor.name,
    section: descriptor.section,
    inputs: merged,
    unitsUsed,
    result: result.values,
    formula: result.formula,
    ...(result.warning ? { warning: result.warning } : {}),
    advisory: descriptor.advisory ?? false,
    danger: descriptor.danger ?? false,
    note: ADVISORY_NOTE,
  };
}

/** Duck-type guard: is a tool result a CalcToolResult (so the run loop should log it)? */
export function isCalcToolResult(out: unknown): out is CalcToolResult {
  return (
    !!out && typeof out === "object" &&
    typeof (out as CalcToolResult).operation === "string" &&
    Array.isArray((out as CalcToolResult).result)
  );
}

/**
 * Build the best-effort ASSISTANT log payload from a calc tool result (LOCKED #8/#11). The run loop
 * calls this after a successful calc-* result, then hands it to logCalculation (which no-ops on a
 * null tenant + swallows write errors). Kept here (pure) so the mapping is unit-testable without the
 * Anthropic loop.
 */
export function buildAssistantLogPayload(user: AppUser, out: CalcToolResult): LogCalculationInput {
  return {
    tenantId: user.activeOrganizationId, // the assistant request has no ALS tenant context (LOCKED #8)
    userId: user.id,
    userEmail: user.email,
    calculatorId: out.operation,
    section: out.section,
    inputs: out.inputs,
    output: out.result,
    unitsUsed: out.unitsUsed,
    source: "ASSISTANT",
    advisory: out.advisory,
    danger: out.danger,
  };
}
