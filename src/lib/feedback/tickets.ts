import "server-only";
import {
  FeedbackAutomationMode,
  FeedbackAutomationSource,
  FeedbackTicketKind,
  type Prisma,
} from "@prisma/client";
import { getFeedbackAutomationModes } from "@/lib/settings/data";
import { clampDebugContext } from "@/lib/feedback/debug-context";
import { recordAutomationGate } from "@/lib/feedback/automation";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";

const MAX_TITLE = 160;
const MAX_BODY = 6000;

export type CreateFeedbackTicketInput = {
  tenantId: string;
  kind: FeedbackTicketKind;
  title: string;
  body: string;
  pageUrl?: string | null;
  userAgent?: string | null;
  debugContext?: Prisma.InputJsonValue | null;
  actorUserId?: string | null;
  actorEmail: string;
};

export async function createFeedbackTicket(input: CreateFeedbackTicketInput) {
  const title = input.title.trim().slice(0, MAX_TITLE);
  const body = input.body.trim().slice(0, MAX_BODY);
  if (!title) throw new ActionError("Title is required.", "VALIDATION");
  if (!body) throw new ActionError("Details are required.", "VALIDATION");

  return runAsTenant(input.tenantId, async () => {
    const modes = await getFeedbackAutomationModes();
    const modeAtSubmission =
      input.kind === FeedbackTicketKind.BUG_REPORT ? modes.bugReportMode : modes.featureRequestMode;
    if (input.kind === FeedbackTicketKind.FEATURE_REQUEST && modeAtSubmission === FeedbackAutomationMode.AGENTIC_FIX) {
      throw new ActionError("Feature requests cannot use agentic fix mode.", "VALIDATION");
    }

    return runInTenantTx(async (tx) => {
      const ticket = await tx.feedbackTicket.create({
        data: {
          kind: input.kind,
          title,
          body,
          pageUrl: input.pageUrl?.slice(0, 1000) || null,
          userAgent: input.userAgent?.slice(0, 1000) || null,
          // Defensive re-clamp (route already clamps for the HTTP path; this guards
          // any other caller — e.g. the assistant file_feedback committer).
          debugContext: clampDebugContext(input.debugContext) ?? undefined,
          actorUserId: input.actorUserId ?? null,
          actorEmail: input.actorEmail,
          modeAtSubmission,
        },
        select: { id: true, modeAtSubmission: true },
      });
      await recordAutomationGate(tx, {
        tenantId: input.tenantId,
        sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
        sourceId: ticket.id,
        ticketKind: input.kind,
        mode: ticket.modeAtSubmission,
      });
      return ticket;
    });
  });
}
