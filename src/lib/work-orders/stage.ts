/**
 * Production stage, DERIVED (v2 §B24).
 *
 * Six segments: Harvest · Ferment · Press · Age · Blend · Bottle.
 *
 * ## Derived, never stored — and this is not a style preference
 * A stored `stage` column is a second source of truth that drifts from the
 * ledger the moment anything is corrected. This repo's whole moat is an
 * append-only correction-as-event ledger; a denormalised stage would quietly
 * un-do that, because a `CORRECTION` would fix the ops and leave the column
 * lying. So the stage is computed from what actually happened.
 *
 * It is also explicitly NOT `AlcoholicFermState`. That is one of three real
 * vectors (`form` + `afState` + `mlfState`); this is a coarse progress READ-OUT
 * for a queue row. Conflating them is how you end up back at InnoVint's linear
 * `Stage` enum, which data_model_coalescence.md records as a deliberate
 * divergence.
 */

export const STAGES = ["harvest", "ferment", "press", "age", "blend", "bottle"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  harvest: "Harvest",
  ferment: "Ferment",
  press: "Press",
  age: "Age",
  blend: "Blend",
  bottle: "Bottle",
};

/** Which stage an operation type evidences. Unknown ops contribute nothing. */
const OP_STAGE: Record<string, Stage> = {
  HARVEST_INTAKE: "harvest",
  WEIGH_TAG: "harvest",
  DESTEM: "ferment",
  CRUSH: "ferment",
  SEED: "ferment",
  ADDITION: "ferment",
  CAP_MGMT: "ferment",
  PRESS: "press",
  SAIGNEE: "press",
  RACK: "age",
  TOPPING: "age",
  FINING: "age",
  FILTRATION: "age",
  BLEND: "blend",
  BOTTLE: "bottle",
};

export interface StageState {
  stage: Stage;
  /** `done` — evidenced by a recorded operation. */
  recorded: boolean;
  /** `current` — the furthest stage with evidence. */
  current: boolean;
}

/**
 * Derive the six segments from recorded operation types.
 *
 * A stage is `recorded` when at least one op evidences it. The `current` stage is
 * the FURTHEST recorded one, not the most recent: a topping (age) logged after a
 * blend must not drag the lot backwards, because in a cellar you top a blended
 * wine all the time.
 */
export function deriveStages(opTypes: readonly string[]): StageState[] {
  const seen = new Set<Stage>();
  for (const t of opTypes) {
    const stage = OP_STAGE[t];
    if (stage) seen.add(stage);
  }
  let furthest = -1;
  STAGES.forEach((s, i) => {
    if (seen.has(s)) furthest = i;
  });
  return STAGES.map((stage, i) => ({
    stage,
    recorded: seen.has(stage),
    current: i === furthest,
  }));
}

/**
 * The text alternative. Never colour-only, and never shape-only either — a
 * screen reader gets the same sentence a sighted user reads off the segments.
 */
export function stageSummary(states: StageState[]): string {
  const current = states.find((s) => s.current);
  const done = states.filter((s) => s.recorded).length;
  if (!current) return "No production stage recorded yet.";
  return `${STAGE_LABEL[current.stage]} — ${done} of ${STAGES.length} stages recorded.`;
}
