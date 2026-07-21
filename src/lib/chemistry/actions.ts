"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { searchTastingNotes, type TastingSearchRow } from "@/lib/lot/data";
import { listVesselAnalyses, type VesselAnalyses } from "@/lib/chemistry/data";
import {
  recordMeasurementsCore,
  recordVesselReadingCore,
  voidPanelCore,
  type RecordMeasurementsInput,
  type RecordMeasurementsResult,
  type RecordVesselReadingInput,
  type RecordVesselReadingResult,
} from "@/lib/chemistry/measurements";
import {
  recordTastingNoteCore,
  voidTastingNoteCore,
  type RecordTastingNoteInput,
} from "@/lib/chemistry/tasting";
import {
  attachSampleResultsCore,
  cancelSampleCore,
  markSampleSentCore,
  pullSampleCore,
  type AttachSampleResultsInput,
  type PullSampleInput,
  type SampleResult,
} from "@/lib/chemistry/samples";

// "use server" wrappers for the Phase 4 chemistry / tasting / sample cores. Each authorizes a
// ready user (via action()), calls the script-safe core with the audit actor, then revalidates
// the capture + record surfaces. These are STANDALONE records — none route through the ledger.

function revalidateRecordSurfaces() {
  revalidatePath("/bulk");
  revalidatePath("/lots");
  revalidatePath("/lots/[id]", "page");
  revalidatePath("/samples");
}

// ── Analysis panels ──

export const recordMeasurementsAction = action(
  async ({ actor }, input: RecordMeasurementsInput): Promise<RecordMeasurementsResult> => {
    const res = await recordMeasurementsCore(actor, input);
    revalidateRecordSurfaces();
    return res;
  },
);

/** Record ONE reading against a whole vessel. (Plan 060 fanned this out to every co-resident lot; a
 *  vessel holds one wine now, LEDGER-12, so it writes the single panel it always should have.) */
export const recordVesselReadingAction = action(
  async ({ actor }, input: RecordVesselReadingInput): Promise<RecordVesselReadingResult> => {
    const res = await recordVesselReadingCore(actor, input);
    revalidateRecordSurfaces();
    return res;
  },
);

/** Soft-delete a panel (the toast Undo + the lot-timeline Edit mode call this). */
export const voidPanelAction = action(async ({ actor }, panelId: string): Promise<{ panelId: string; voidedPanelIds: string[] }> => {
  const res = await voidPanelCore(actor, { panelId });
  revalidateRecordSurfaces();
  return res;
});

// ── Tasting notes ──

export const recordTastingNoteAction = action(
  async ({ actor }, input: RecordTastingNoteInput): Promise<{ tastingNoteId: string; lotId: string }> => {
    const res = await recordTastingNoteCore(actor, input);
    revalidateRecordSurfaces();
    return res;
  },
);

export const voidTastingNoteAction = action(
  async ({ actor }, tastingNoteId: string): Promise<{ tastingNoteId: string }> => {
    const res = await voidTastingNoteCore(actor, { tastingNoteId });
    revalidateRecordSurfaces();
    return res;
  },
);

// ── Sample lifecycle ──

export const pullSampleAction = action(async ({ actor }, input: PullSampleInput): Promise<SampleResult> => {
  const res = await pullSampleCore(actor, input);
  revalidateRecordSurfaces();
  return res;
});

export const markSampleSentAction = action(
  async ({ actor }, input: { sampleId: string; lab?: string; expectedAt?: Date | string | null }): Promise<SampleResult> => {
    const res = await markSampleSentCore(actor, input);
    revalidateRecordSurfaces();
    return res;
  },
);

export const attachSampleResultsAction = action(
  async ({ actor }, input: AttachSampleResultsInput): Promise<{ sampleId: string; panelId: string; lotId: string; status: SampleResult["status"] }> => {
    const res = await attachSampleResultsCore(actor, input);
    revalidateRecordSurfaces();
    return res;
  },
);

/** Cancel a sample (the toast Undo for a pull + the samples-page cancel). */
export const cancelSampleAction = action(async ({ actor }, sampleId: string): Promise<SampleResult> => {
  const res = await cancelSampleCore(actor, { sampleId });
  revalidateRecordSurfaces();
  return res;
});

// ── Tasting search (NICE) ──

/** Free-text tasting-note search (gated read; used by the lots-list search box). */
export const searchTastingNotesAction = action(async (_ctx, q: string): Promise<TastingSearchRow[]> => {
  return searchTastingNotes(q);
});

/** A vessel's analysis history (gated read; used by the /bulk per-vessel trends modal). */
export const vesselAnalysesAction = action(async (_ctx, vesselId: string): Promise<VesselAnalyses> => {
  return listVesselAnalyses(vesselId);
});
