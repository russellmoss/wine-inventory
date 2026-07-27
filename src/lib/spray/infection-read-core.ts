// Spray Intelligence S5a — the pure composition for "what is incubating on this block right now".
// No Prisma, no clock: rows and `today` come from infection-read.ts, exactly as
// weather/read-core.ts is fed by its own seam.
//
// This is the phase's ASSISTANT-FACING capability, so `composeInfectionStatusCore` carries the
// `Core` suffix deliberately and is reachable from `query_spray_decision`. The write path
// (infection-ledger-core.ts) does NOT — see its header.
//
// WHAT THIS DELIBERATELY DOES NOT DO: report powdery-mildew RISK. The S5a Unit 0 probe measured
// Gubler-Thomas on reconstructed hourly temperature against genuine station METAR and every site
// failed the pre-committed gate (docs/spray_assistant/phases/S5a-diurnal-fidelity-probe.md), so
// there is no index to read. A ledger entry is a RECORD OF SOMETHING SOMEBODY OBSERVED, not a
// model output, and this core must never let the two be confused.

import type { InfectionEventStatus, InfectionHostOrgan, InfectionPathogen, InfectionProjectionKind, InfectionResolutionKind } from "@prisma/client";
import { isInfectious } from "./infection-resolution";

/** One current-state row: the latest append per logical stream, already reduced by the seam. */
export interface InfectionEventRow {
  logicalEventId: string;
  blockId: string;
  blockLabel: string | null;
  pathogen: InfectionPathogen;
  hostOrgan: InfectionHostOrgan;
  status: InfectionEventStatus;
  resolutionKind: InfectionResolutionKind;
  infectionOccurredOn: string;
  symptomExpectedAt: string | null;
  symptomProjectionKind: InfectionProjectionKind;
  infectiousExpectedAt: string | null;
  infectiousProjectionKind: InfectionProjectionKind;
  expiresOn: string | null;
  evidenceSource: string;
}

export interface InfectionEventView extends InfectionEventRow {
  /**
   * null is a first-class answer, NOT a synonym for false. `false` reads as "this block is safe";
   * null means the transition was never projected and we do not know (rule §3.6).
   */
  infectious: boolean | null;
  /** Plain-English, renderable verbatim — the assistant must not paraphrase a safety statement. */
  plainState: string;
}

export interface InfectionBlockView {
  blockId: string;
  blockLabel: string | null;
  openEvents: InfectionEventView[];
  /** How many open events we could NOT decide infectiousness for. Surfaced, never hidden. */
  undeterminedCount: number;
}

export interface InfectionStatusDTO {
  vineyardId: string;
  today: string;
  blocks: InfectionBlockView[];
  totalOpen: number;
  /**
   * The "what we don't know" block, in the weather/read-core.ts:95-100 shape. Non-empty BY
   * CONSTRUCTION (SAFE-11) — the powderyIndexAvailable line always renders, because the single most
   * important thing to say about this surface is what it is not.
   */
  honesty: {
    powderyIndexAvailable: false;
    powderyIndexReason: string;
    scoutingCannotClear: string;
    latentBoundsAreAnInterval: string;
    notes: string[];
  };
}

export const POWDERY_INDEX_UNAVAILABLE_REASON =
  "No powdery-mildew risk index is available. Gubler-Thomas needs real hourly temperature, and the S5a Unit 0 " +
  "measurement showed that reconstructing hours from daily highs and lows cannot resolve its 6-consecutive-hour " +
  "rule — the reconstruction is off by 2 to 3 hours on a 6-hour threshold, and it under-called real epidemic " +
  "conditions at six of eight sites. Hourly weather (S1) is required before any index can be shown.";

export const SCOUTING_CANNOT_CLEAR_REASON =
  "A clean scouting pass does not clear an incubating infection. During the latent period there is nothing to " +
  "see, so 'nobody saw anything' is not 'there is nothing there'.";

export const LATENT_INTERVAL_REASON =
  "The powdery latent period is reported between about 5 and 14 days depending on the study. We use the SHORT " +
  "end to say when an infection may become infectious, and the LONG end to decide when to stop tracking it — " +
  "so neither answer is optimistic.";

function describe(row: InfectionEventRow, infectious: boolean | null): string {
  const organ = row.hostOrgan.toLowerCase();
  if (row.status !== "OPEN") return `A ${row.pathogen.replace(/_/g, " ").toLowerCase()} event on ${organ} tissue, no longer being tracked.`;
  if (infectious === null) {
    return `A ${row.pathogen.replace(/_/g, " ").toLowerCase()} infection recorded on ${organ} tissue on ${row.infectionOccurredOn}. We cannot say whether it has become infectious — that was never projected for this event.`;
  }
  if (infectious) {
    return `A ${row.pathogen.replace(/_/g, " ").toLowerCase()} infection recorded on ${organ} tissue on ${row.infectionOccurredOn} may now be producing spores (expected from ${row.infectiousExpectedAt}). Treat this block as a possible source of inoculum${row.expiresOn ? ` until at least ${row.expiresOn}` : ""}.`;
  }
  return `A ${row.pathogen.replace(/_/g, " ").toLowerCase()} infection recorded on ${organ} tissue on ${row.infectionOccurredOn} is still incubating${row.infectiousExpectedAt ? `; it may become infectious from ${row.infectiousExpectedAt}` : ""}.`;
}

export function composeInfectionStatusCore(input: {
  vineyardId: string;
  today: string;
  rows: InfectionEventRow[];
  /** Extra honesty lines the seam wants to add (e.g. "this vineyard has no blocks"). */
  notes?: string[];
}): InfectionStatusDTO {
  const byBlock = new Map<string, InfectionBlockView>();

  for (const row of input.rows) {
    if (row.status !== "OPEN") continue; // CLOSED and VOID are history, not current state
    const infectious = isInfectious({
      infectiousExpectedAt: row.infectiousExpectedAt,
      infectiousProjectionKind: row.infectiousProjectionKind,
      status: row.status,
      today: input.today,
    });
    let block = byBlock.get(row.blockId);
    if (!block) {
      block = { blockId: row.blockId, blockLabel: row.blockLabel, openEvents: [], undeterminedCount: 0 };
      byBlock.set(row.blockId, block);
    }
    block.openEvents.push({ ...row, infectious, plainState: describe(row, infectious) });
    if (infectious === null) block.undeterminedCount += 1;
  }

  const blocks = [...byBlock.values()].sort((a, b) => (a.blockLabel ?? a.blockId).localeCompare(b.blockLabel ?? b.blockId));

  return {
    vineyardId: input.vineyardId,
    today: input.today,
    blocks,
    totalOpen: blocks.reduce((n, b) => n + b.openEvents.length, 0),
    honesty: {
      powderyIndexAvailable: false,
      powderyIndexReason: POWDERY_INDEX_UNAVAILABLE_REASON,
      scoutingCannotClear: SCOUTING_CANNOT_CLEAR_REASON,
      latentBoundsAreAnInterval: LATENT_INTERVAL_REASON,
      notes: input.notes ?? [],
    },
  };
}
