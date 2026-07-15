import "server-only";

import { FeedbackAutomationSource, Prisma } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { withWriteRetry } from "@/lib/db/write-retry";
import { parseLinearIssueUrl, promotionEligibility } from "@/lib/developer/linear-links";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";

export type FeedbackLinearLinkView = {
  id: string;
  linearIssueKey: string;
  linearIssueUrl: string;
  linkedAt: string;
  version: number;
};

export type LinkFeedbackToLinearResult =
  | {
      ok: true;
      link: FeedbackLinearLinkView;
      idempotent: boolean;
      replaced: boolean;
      tenantLinearKeySourceCount: number;
    }
  | {
      ok: false;
      reason: "FAN_IN_CONFIRMATION_REQUIRED";
      linearIssueKey: string;
      tenantLinearKeySourceCount: number;
    }
  | {
      ok: false;
      reason: "DIFFERENT_LINK" | "STALE_VERSION";
      currentLink: FeedbackLinearLinkView;
    };

export type LinkFeedbackToLinearCoreInput = {
  tenantId: string;
  sourceType: FeedbackAutomationSource;
  id: string;
  linearIssueKey: string;
  normalizedUrl: string;
  replace: boolean;
  expectedVersion?: number;
  confirmFanIn: boolean;
};

export type FeedbackLinkActor = {
  id: string;
  email: string;
};

export type LinkFeedbackToLinearTestHooks = {
  /** Verification-only barrier used to force two transactions past the initial read. */
  afterExistingLinkRead?: () => Promise<void>;
};

type StoredLink = {
  id: string;
  linearIssueKey: string;
  linearIssueUrl: string;
  linkedAt: Date;
  version: number;
};

const LINEAR_NOTE_LIMIT = 5_000;
const ENTRY_SEPARATOR = "\n\n---\n";

function linkView(link: StoredLink): FeedbackLinearLinkView {
  return {
    id: link.id,
    linearIssueKey: link.linearIssueKey,
    linearIssueUrl: link.linearIssueUrl,
    linkedAt: link.linkedAt.toISOString(),
    version: link.version,
  };
}

export function prependLinearHistoryNote(input: {
  existing: string | null;
  at: Date;
  actorEmail: string;
  oldKey?: string;
  newKey: string;
  url: string;
}): string {
  const event = input.oldKey
    ? `Replaced Linear link ${input.oldKey} -> ${input.newKey}`
    : `Promoted to Linear ${input.newKey}`;
  const stamp = `[developer ${input.at.toISOString()}] ${event} by ${input.actorEmail} — ${input.url}`;
  return (input.existing ? `${stamp}${ENTRY_SEPARATOR}${input.existing}` : stamp).slice(
    0,
    LINEAR_NOTE_LIMIT,
  );
}

function isP2002(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

async function findSourceLink(input: LinkFeedbackToLinearCoreInput): Promise<StoredLink | null> {
  return runAsTenant(input.tenantId, async () =>
    await prisma.feedbackLinearLink.findFirst({
      where:
        input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? { tenantId: input.tenantId, assistantFeedbackId: input.id }
          : { tenantId: input.tenantId, ticketId: input.id },
      select: {
        id: true,
        linearIssueKey: true,
        linearIssueUrl: true,
        linkedAt: true,
        version: true,
      },
    }),
  );
}

async function countTenantLinks(tenantId: string, linearIssueKey: string): Promise<number> {
  return runAsTenant(tenantId, async () =>
    await prisma.feedbackLinearLink.count({ where: { tenantId, linearIssueKey } }),
  );
}

/**
 * Tenant-scoped transactional core for a developer-authenticated Linear handoff.
 * The caller must validate the developer before supplying the actor snapshot.
 */
export async function linkFeedbackToLinearCore(
  actor: FeedbackLinkActor,
  input: LinkFeedbackToLinearCoreInput,
  testHooks: LinkFeedbackToLinearTestHooks = {},
): Promise<LinkFeedbackToLinearResult> {
  if (
    input.sourceType !== FeedbackAutomationSource.ASSISTANT_FEEDBACK &&
    input.sourceType !== FeedbackAutomationSource.FEEDBACK_TICKET
  ) {
    throw new ActionError("Invalid feedback source.", "VALIDATION");
  }
  if (
    !input.tenantId ||
    input.tenantId.length > 160 ||
    !input.id ||
    input.id.length > 191 ||
    !actor.id ||
    actor.id.length > 191 ||
    !actor.email ||
    actor.email.length > 320
  ) {
    throw new ActionError("Invalid Linear handoff input.", "VALIDATION");
  }
  const parsedLink = parseLinearIssueUrl(input.normalizedUrl);
  if (
    !parsedLink.ok ||
    parsedLink.normalizedUrl !== input.normalizedUrl ||
    parsedLink.linearIssueKey !== input.linearIssueKey
  ) {
    throw new ActionError("Invalid normalized Linear issue URL.", "VALIDATION");
  }
  try {
    return await runAsTenant(input.tenantId, () =>
      withWriteRetry(
        () =>
          runInTenantTx(
            async (tx) => {
              const sourceSelect = {
                id: true,
                status: true,
                triageClass: true,
                automationStatus: true,
                githubIssueUrl: true,
                prUrl: true,
                developerNotes: true,
                developerNotesVersion: true,
              } as const;
              const source =
                input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
                  ? await tx.assistantFeedback.findFirst({
                      where: { tenantId: input.tenantId, id: input.id },
                      select: sourceSelect,
                    })
                  : await tx.feedbackTicket.findFirst({
                      where: { tenantId: input.tenantId, id: input.id },
                      select: sourceSelect,
                    });
              if (!source) {
                throw new ActionError("Feedback item not found.", "VALIDATION");
              }

              const sourceWhere =
                input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
                  ? { tenantId: input.tenantId, assistantFeedbackId: input.id }
                  : { tenantId: input.tenantId, ticketId: input.id };
              const existing = await tx.feedbackLinearLink.findFirst({
                where: sourceWhere,
                select: {
                  id: true,
                  linearIssueKey: true,
                  linearIssueUrl: true,
                  linkedAt: true,
                  version: true,
                },
              });
              await testHooks.afterExistingLinkRead?.();

              if (existing?.linearIssueUrl === input.normalizedUrl) {
                const tenantLinearKeySourceCount = await tx.feedbackLinearLink.count({
                  where: { tenantId: input.tenantId, linearIssueKey: existing.linearIssueKey },
                });
                return {
                  ok: true as const,
                  link: linkView(existing),
                  idempotent: true,
                  replaced: false,
                  tenantLinearKeySourceCount,
                };
              }
              const eligibility = promotionEligibility({
                sourceType: input.sourceType,
                id: source.id,
                status: source.status,
                triageClass: source.triageClass,
                automationStatus: source.automationStatus,
              });
              if (!eligibility.allowed) {
                throw new ActionError(eligibility.reason, "VALIDATION");
              }
              if (existing && !input.replace) {
                return {
                  ok: false as const,
                  reason: "DIFFERENT_LINK" as const,
                  currentLink: linkView(existing),
                };
              }
              if (existing && (!Number.isInteger(input.expectedVersion) || input.expectedVersion! < 1)) {
                throw new ActionError(
                  "A positive integer link version is required to replace this link.",
                  "VALIDATION",
                );
              }
              if (!existing && input.replace) {
                throw new ActionError("The link no longer exists. Reload and try again.", "CONFLICT");
              }

              const matchingOtherLinks = await tx.feedbackLinearLink.count({
                where: {
                  tenantId: input.tenantId,
                  linearIssueKey: input.linearIssueKey,
                  ...(existing ? { id: { not: existing.id } } : {}),
                },
              });
              if (matchingOtherLinks > 0 && !input.confirmFanIn) {
                return {
                  ok: false as const,
                  reason: "FAN_IN_CONFIRMATION_REQUIRED" as const,
                  linearIssueKey: input.linearIssueKey,
                  tenantLinearKeySourceCount: matchingOtherLinks,
                };
              }

              const linkedAt = new Date();
              let saved: StoredLink;
              if (existing) {
                const updated = await tx.feedbackLinearLink.updateMany({
                  where: {
                    tenantId: input.tenantId,
                    id: existing.id,
                    version: input.expectedVersion,
                  },
                  data: {
                    linearIssueKey: input.linearIssueKey,
                    linearIssueUrl: input.normalizedUrl,
                    linkedByUserId: actor.id,
                    linkedAt,
                    version: { increment: 1 },
                  },
                });
                if (updated.count !== 1) {
                  const current = await tx.feedbackLinearLink.findFirstOrThrow({
                    where: { tenantId: input.tenantId, id: existing.id },
                    select: {
                      id: true,
                      linearIssueKey: true,
                      linearIssueUrl: true,
                      linkedAt: true,
                      version: true,
                    },
                  });
                  return {
                    ok: false as const,
                    reason: "STALE_VERSION" as const,
                    currentLink: linkView(current),
                  };
                }
                saved = await tx.feedbackLinearLink.findFirstOrThrow({
                  where: { tenantId: input.tenantId, id: existing.id },
                  select: {
                    id: true,
                    linearIssueKey: true,
                    linearIssueUrl: true,
                    linkedAt: true,
                    version: true,
                  },
                });
              } else {
                saved = await tx.feedbackLinearLink.create({
                  data: {
                    tenantId: input.tenantId,
                    ticketId:
                      input.sourceType === FeedbackAutomationSource.FEEDBACK_TICKET
                        ? input.id
                        : null,
                    assistantFeedbackId:
                      input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
                        ? input.id
                        : null,
                    linearIssueKey: input.linearIssueKey,
                    linearIssueUrl: input.normalizedUrl,
                    linkedByUserId: actor.id,
                    linkedAt,
                  },
                  select: {
                    id: true,
                    linearIssueKey: true,
                    linearIssueUrl: true,
                    linkedAt: true,
                    version: true,
                  },
                });
              }

              const developerNotes = prependLinearHistoryNote({
                existing: source.developerNotes,
                at: linkedAt,
                actorEmail: actor.email,
                oldKey: existing?.linearIssueKey,
                newKey: input.linearIssueKey,
                url: input.normalizedUrl,
              });
              const sourceData = {
                developerNotes,
                developerNotesVersion: { increment: 1 },
                ...(source.status === "NEW" ? { status: "TRIAGED" as const } : {}),
              };
              let sourceUpdated: { count: number };
              if (input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK) {
                sourceUpdated = await tx.assistantFeedback.updateMany({
                  where: {
                    tenantId: input.tenantId,
                    id: source.id,
                    developerNotesVersion: source.developerNotesVersion,
                  },
                  data: sourceData,
                });
              } else {
                sourceUpdated = await tx.feedbackTicket.updateMany({
                  where: {
                    tenantId: input.tenantId,
                    id: source.id,
                    developerNotesVersion: source.developerNotesVersion,
                  },
                  data: sourceData,
                });
              }
              if (sourceUpdated.count !== 1) {
                throw new ActionError(
                  "This feedback item's notes changed during the Linear handoff. Retry the handoff.",
                  "CONFLICT",
                );
              }

              await writeAudit(tx, {
                actorUserId: actor.id,
                actorEmail: actor.email,
                tenantId: input.tenantId,
                action: existing ? "UPDATE" : "CREATE",
                entityType: "FeedbackLinearLink",
                entityId: saved.id,
                changes: {
                  linearIssueKey: {
                    from: existing?.linearIssueKey ?? null,
                    to: saved.linearIssueKey,
                  },
                  linearIssueUrl: {
                    from: existing?.linearIssueUrl ?? null,
                    to: saved.linearIssueUrl,
                  },
                  source: {
                    from: null,
                    to: `${input.sourceType}:${input.id}`,
                  },
                },
                summary: existing
                  ? `Replaced Linear handoff ${existing.linearIssueKey} with ${saved.linearIssueKey}`
                  : `Promoted feedback to Linear ${saved.linearIssueKey}`,
              });

              const tenantLinearKeySourceCount = matchingOtherLinks + 1;
              return {
                ok: true as const,
                link: linkView(saved),
                idempotent: false,
                replaced: Boolean(existing),
                tenantLinearKeySourceCount,
              };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        5,
        "feedback-linear-link",
      ),
    );
  } catch (error) {
    if (!isP2002(error)) throw error;
    // A uniqueness race aborts the transaction. Read the source winner in a fresh tenant context.
    const winner = await findSourceLink(input);
    if (!winner) throw error;
    if (winner.linearIssueUrl === input.normalizedUrl) {
      return {
        ok: true,
        link: linkView(winner),
        idempotent: true,
        replaced: false,
        tenantLinearKeySourceCount: await countTenantLinks(
          input.tenantId,
          winner.linearIssueKey,
        ),
      };
    }
    return { ok: false, reason: "DIFFERENT_LINK", currentLink: linkView(winner) };
  }
}
