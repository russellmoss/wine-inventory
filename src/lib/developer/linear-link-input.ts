import { ActionError } from "@/lib/action-error";

export type ParsedLinkFeedbackToLinearInput = {
  tenantId: string;
  sourceType: "ASSISTANT_FEEDBACK" | "FEEDBACK_TICKET";
  id: string;
  linearUrl: string;
  expectedVersion?: number;
  replace: boolean;
  confirmFanIn: boolean;
};

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function opaqueId(value: unknown, max: number, message: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new ActionError(message, "VALIDATION");
  }
  return value;
}

/** Parse the untrusted React Server Action payload without assuming an object shape. */
export function parseLinkFeedbackToLinearInput(
  value: unknown,
): ParsedLinkFeedbackToLinearInput {
  if (!plainRecord(value)) {
    throw new ActionError("Invalid Linear handoff request.", "VALIDATION");
  }
  const tenantId = opaqueId(value.tenantId, 160, "Invalid tenant.");
  const id = opaqueId(value.id, 191, "Invalid feedback item.");
  if (
    value.sourceType !== "ASSISTANT_FEEDBACK" &&
    value.sourceType !== "FEEDBACK_TICKET"
  ) {
    throw new ActionError("Invalid feedback source.", "VALIDATION");
  }
  if (
    typeof value.linearUrl !== "string" ||
    value.linearUrl.length === 0 ||
    value.linearUrl.length > 2_048
  ) {
    throw new ActionError("Invalid Linear issue URL.", "VALIDATION");
  }
  if (value.replace !== undefined && typeof value.replace !== "boolean") {
    throw new ActionError("Invalid replacement request.", "VALIDATION");
  }
  if (value.confirmFanIn !== undefined && typeof value.confirmFanIn !== "boolean") {
    throw new ActionError("Invalid fan-in confirmation.", "VALIDATION");
  }
  if (
    value.expectedVersion !== undefined &&
    (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1)
  ) {
    throw new ActionError("Invalid link version.", "VALIDATION");
  }

  return {
    tenantId,
    sourceType: value.sourceType,
    id,
    linearUrl: value.linearUrl,
    expectedVersion: value.expectedVersion as number | undefined,
    replace: value.replace === true,
    confirmFanIn: value.confirmFanIn === true,
  };
}
