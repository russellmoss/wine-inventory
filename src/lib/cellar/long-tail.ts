import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@prisma/client";
import { recordLossCore, type RecordLossInput } from "@/lib/cellar/loss";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import {
  LONG_TAIL_DECISIONS,
  normalizeOperationLabel,
  withLongTailMetadata,
  type LongTailCandidate,
  type LongTailDecision,
} from "@/lib/cellar/long-tail-metadata";

export type LongTailOperationInput =
  | {
      candidate: "DRAIN";
      drainIntent: "WASTE";
      vesselId: string;
      volumeL: number;
      label?: string | null;
      note?: string;
      captureMethod?: CaptureMethod;
    }
  | {
      candidate: "CUSTOM";
      shape: "LOSS";
      customLabel: string;
      vesselId: string;
      volumeL: number;
      note?: string;
      captureMethod?: CaptureMethod;
    };

export type LongTailOperationResult = {
  operationId: number;
  message: string;
  candidate: LongTailCandidate;
  route: "LOSS";
  label: string;
};

export function longTailDecision(candidate: LongTailCandidate): LongTailDecision {
  const decision = LONG_TAIL_DECISIONS.find((row) => row.candidate === candidate);
  if (!decision) throw new ActionError("Unsupported long-tail operation.");
  return decision;
}

function buildLossInput(input: LongTailOperationInput, label: string, decisionText: string): RecordLossInput {
  const base = {
    vesselId: input.vesselId,
    lossL: input.volumeL,
    note: input.note,
    captureMethod: input.captureMethod,
  };
  return {
    ...base,
    metadata: withLongTailMetadata(null, {
      candidate: input.candidate,
      route: "LOSS",
      label,
      lineShape: "LOSS",
      decision: decisionText,
    }) as Prisma.InputJsonValue,
  };
}

export async function recordLongTailOperationCore(actor: LedgerActor, input: LongTailOperationInput): Promise<LongTailOperationResult> {
  if (input.candidate === "DRAIN") {
    if (input.drainIntent !== "WASTE") throw new ActionError("Only drain-to-waste is recorded here. Use Rack for drain-to-move or Deplete/removal for drain-to-remove.");
    const decision = longTailDecision("DRAIN");
    const label = input.label?.trim() ? normalizeOperationLabel(input.label, "Drain label") : "Drain to waste";
    const res = await recordLossCore(actor, buildLossInput(input, label, decision.decision));
    return { operationId: res.operationId, message: res.message, candidate: "DRAIN", route: "LOSS", label };
  }

  if (input.candidate === "CUSTOM") {
    if (input.shape !== "LOSS") throw new ActionError("Custom v1 supports the LOSS line shape only.");
    const decision = longTailDecision("CUSTOM");
    const label = normalizeOperationLabel(input.customLabel, "Custom operation label");
    const res = await recordLossCore(actor, buildLossInput(input, label, decision.decision));
    return { operationId: res.operationId, message: res.message, candidate: "CUSTOM", route: "LOSS", label };
  }

  throw new ActionError("Unsupported long-tail operation.");
}
