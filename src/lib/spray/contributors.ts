// Spray Intelligence — the contributor barrel (runbook §5). The S9 composition core imports THIS
// file; each model lane (S5a/S5b, S6, S7a, S7b, S8) appends exactly ONE line registering its own
// contributor module. Treat like schema: one-line appends only, serialized across lanes.
//
// A contributor turns its lane's stored state into one section of the inspectable decision record
// (brief §9). Risk and confidence stay paired (rule §3.4); "cannot determine safely" is a
// first-class output, not an error (rule §3.3).

export interface SprayContributor {
  /** Stable key naming the section this lane contributes (e.g. "legality", "residual", "powdery"). */
  key: string;
  /** The phase that owns it (e.g. "S7a") — for provenance in the composed record. */
  phase: string;
}

/** Appended one line per lane. Empty until the first Wave-2 lane lands. */
export const SPRAY_CONTRIBUTORS: SprayContributor[] = [];
