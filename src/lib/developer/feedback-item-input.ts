import {
  FeedbackAutomationSource,
  FeedbackItemStatus,
  FeedbackSeverity,
  FeedbackTriageClass,
} from "@prisma/client";
import { ActionError } from "@/lib/action-error";

export type ParsedFeedbackItemUpdate = {
  tenantId: string;
  sourceType: FeedbackAutomationSource;
  id: string;
  severity: FeedbackSeverity | null;
  triageClass: FeedbackTriageClass | null;
  status?: FeedbackItemStatus;
  developerNotes?: string;
  expectedNotesVersion: number;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ActionError("Invalid feedback item update.", "VALIDATION");
  }
  return value as Record<string, unknown>;
}

function opaqueId(value: unknown, label: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > maxLength ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new ActionError(`Invalid ${label}.`, "VALIDATION");
  }
  return value;
}

export function assertFeedbackStatusForSource(
  sourceType: FeedbackAutomationSource,
  status: FeedbackItemStatus | undefined,
): void {
  if (
    sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK &&
    status === FeedbackItemStatus.IN_PROGRESS
  ) {
    throw new ActionError(
      "Assistant feedback does not support the in-progress status.",
      "VALIDATION",
    );
  }
}

export function parseFeedbackItemUpdate(value: unknown): ParsedFeedbackItemUpdate {
  const input = record(value);
  const tenantId = opaqueId(input.tenantId, "tenant", 160);
  const id = opaqueId(input.id, "feedback item", 191);
  const sourceType =
    input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK ||
    input.sourceType === FeedbackAutomationSource.FEEDBACK_TICKET
      ? input.sourceType
      : null;
  if (!sourceType) throw new ActionError("Invalid feedback source.", "VALIDATION");

  const severity =
    input.severity === ""
      ? null
      : Object.values(FeedbackSeverity).includes(input.severity as FeedbackSeverity)
        ? (input.severity as FeedbackSeverity)
        : undefined;
  if (severity === undefined) throw new ActionError("Invalid feedback severity.", "VALIDATION");

  const triageClass =
    input.triageClass === ""
      ? null
      : Object.values(FeedbackTriageClass).includes(input.triageClass as FeedbackTriageClass)
        ? (input.triageClass as FeedbackTriageClass)
        : undefined;
  if (triageClass === undefined) {
    throw new ActionError("Invalid feedback disposition.", "VALIDATION");
  }

  const status =
    input.status === undefined
      ? undefined
      : Object.values(FeedbackItemStatus).includes(input.status as FeedbackItemStatus)
        ? (input.status as FeedbackItemStatus)
        : null;
  if (status === null) throw new ActionError("Invalid feedback status.", "VALIDATION");
  assertFeedbackStatusForSource(sourceType, status);

  const developerNotes =
    input.developerNotes === undefined
      ? undefined
      : typeof input.developerNotes === "string" && input.developerNotes.length <= 5_000
        ? input.developerNotes
        : null;
  if (developerNotes === null) {
    throw new ActionError("Invalid developer notes.", "VALIDATION");
  }
  if (
    !Number.isInteger(input.expectedNotesVersion) ||
    (input.expectedNotesVersion as number) < 1
  ) {
    throw new ActionError("Reload this feedback item before saving.", "CONFLICT");
  }

  return {
    tenantId,
    sourceType,
    id,
    severity,
    triageClass,
    status,
    developerNotes,
    expectedNotesVersion: input.expectedNotesVersion as number,
  };
}
