"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  FeedbackAutomationMode,
  FeedbackAutomationSource,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDeveloper } from "@/lib/dal";
import { ActionError } from "@/lib/action-error";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import {
  SUPPORT_TENANT_COOKIE,
  SUPPORT_TENANT_TTL_MS,
  createSupportTenantToken,
} from "@/lib/developer/support-context";
import {
  approveAutomationRun,
  dispatchApprovedRun,
  retryApprovedAutomationRun,
} from "@/lib/feedback/automation";
import { parseLinearIssueUrl } from "@/lib/developer/linear-links";
import { linkFeedbackToLinearCore } from "@/lib/developer/linear-link-actions";
import { parseLinkFeedbackToLinearInput } from "@/lib/developer/linear-link-input";
import {
  closeFeedbackItemCore,
  updateFeedbackItemCore,
} from "@/lib/developer/feedback-item-actions";
import { parseFeedbackItemUpdate } from "@/lib/developer/feedback-item-input";

function asMode(value: string): FeedbackAutomationMode {
  if (
    value === FeedbackAutomationMode.REPORT_ONLY ||
    value === FeedbackAutomationMode.PLAN_MODE ||
    value === FeedbackAutomationMode.AGENTIC_FIX
  ) {
    return value;
  }
  throw new ActionError("Invalid automation mode.", "VALIDATION");
}

function assertTenantId(tenantId: string): string {
  if (!tenantId || tenantId.length > 160) throw new ActionError("Invalid tenant.", "VALIDATION");
  return tenantId;
}

function assertFeedbackSource(value: string): FeedbackAutomationSource {
  if (
    value === FeedbackAutomationSource.ASSISTANT_FEEDBACK ||
    value === FeedbackAutomationSource.FEEDBACK_TICKET
  ) {
    return value;
  }
  throw new ActionError("Invalid feedback source.", "VALIDATION");
}

export async function linkFeedbackToLinear(value: unknown) {
  const developer = await requireDeveloper();
  const input = parseLinkFeedbackToLinearInput(value);
  const tenantId = input.tenantId;
  const sourceType = assertFeedbackSource(input.sourceType);
  const id = input.id;
  const parsed = parseLinearIssueUrl(input.linearUrl);
  if (!parsed.ok) throw new ActionError(parsed.error.message, "VALIDATION");

  const result = await linkFeedbackToLinearCore(
    { id: developer.id, email: developer.email },
    {
      tenantId,
      sourceType,
      id,
      linearIssueKey: parsed.linearIssueKey,
      normalizedUrl: parsed.normalizedUrl,
      replace: input.replace,
      expectedVersion: input.expectedVersion,
      confirmFanIn: input.confirmFanIn,
    },
  );
  if (result.ok) revalidatePath("/developer");
  return result;
}

export async function enterSupportTenant(tenantId: string) {
  const developer = await requireDeveloper();
  const tenant = await prisma.organization.findUnique({
    where: { id: assertTenantId(tenantId) },
    select: { id: true, name: true },
  });
  if (!tenant) throw new ActionError("Tenant not found.", "VALIDATION");

  const token = createSupportTenantToken({
    developerUserId: developer.id,
    tenantId: tenant.id,
    tenantName: tenant.name,
  });
  (await cookies()).set(SUPPORT_TENANT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SUPPORT_TENANT_TTL_MS / 1000),
  });

  await runAsTenant(tenant.id, () =>
    runInTenantTx((tx) =>
      writeAudit(tx, {
        actorUserId: developer.id,
        actorEmail: developer.email,
        tenantId: tenant.id,
        action: "IMPERSONATE",
        entityType: "Organization",
        entityId: tenant.id,
        summary: `Developer entered support view for ${tenant.name}`,
      }),
    ),
  );
  revalidatePath("/", "layout");
}

export async function exitSupportTenant() {
  const developer = await requireDeveloper();
  const tenantId = developer.supportOrganizationId;
  const tenantName = developer.supportOrganizationName;
  if (tenantId) {
    await runAsTenant(tenantId, () =>
      runInTenantTx((tx) =>
        writeAudit(tx, {
          actorUserId: developer.id,
          actorEmail: developer.email,
          tenantId,
          action: "IMPERSONATE",
          entityType: "Organization",
          entityId: tenantId,
          summary: `Developer exited support view for ${tenantName ?? tenantId}`,
        }),
      ),
    );
  }
  (await cookies()).delete(SUPPORT_TENANT_COOKIE);
  revalidatePath("/", "layout");
}

export async function saveTenantFeedbackModes(input: {
  tenantId: string;
  assistantFeedbackMode: string;
  bugReportMode: string;
  featureRequestMode: string;
}) {
  const developer = await requireDeveloper();
  const tenantId = assertTenantId(input.tenantId);
  const assistantFeedbackMode = asMode(input.assistantFeedbackMode);
  const bugReportMode = asMode(input.bugReportMode);
  const featureRequestMode = asMode(input.featureRequestMode);
  if (featureRequestMode === FeedbackAutomationMode.AGENTIC_FIX) {
    throw new ActionError("Feature requests cannot use agentic fix mode.", "VALIDATION");
  }
  await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      await tx.appSettings.upsert({
        where: { tenantId },
        update: { assistantFeedbackMode, bugReportMode, featureRequestMode },
        create: { assistantFeedbackMode, bugReportMode, featureRequestMode },
      });
      await writeAudit(tx, {
        actorUserId: developer.id,
        actorEmail: developer.email,
        tenantId,
        action: "UPDATE",
        entityType: "AppSettings",
        entityId: tenantId,
        summary: "Feedback automation modes updated",
      });
    }),
  );
  revalidatePath("/developer");
}

export async function updateFeedbackItem(value: unknown) {
  const developer = await requireDeveloper();
  const input = parseFeedbackItemUpdate(value);
  await updateFeedbackItemCore(
    { id: developer.id, email: developer.email },
    input,
  );
  revalidatePath("/developer");
}

export async function closeFeedbackItem(input: {
  tenantId: string;
  sourceType: "ASSISTANT_FEEDBACK" | "FEEDBACK_TICKET";
  id: string;
  status: "RESOLVED" | "DISMISSED";
  outcome: string;
  expectedNotesVersion: number;
}) {
  const developer = await requireDeveloper();
  await closeFeedbackItemCore(
    { id: developer.id, email: developer.email },
    {
      tenantId: assertTenantId(input.tenantId),
      sourceType: assertFeedbackSource(input.sourceType),
      id: input.id,
      status: input.status,
      outcome: input.outcome,
      expectedNotesVersion: input.expectedNotesVersion,
    },
  );
  revalidatePath("/developer");
}

export async function approveFeedbackAutomation(input: { tenantId: string; runId: string }) {
  const developer = await requireDeveloper();
  const tenantId = assertTenantId(input.tenantId);
  const run = await approveAutomationRun({
    tenantId,
    runId: input.runId,
    approverUserId: developer.id,
    onApproved: (tx) =>
      writeAudit(tx, {
        actorUserId: developer.id,
        actorEmail: developer.email,
        tenantId,
        action: "UPDATE",
        entityType: "AutomationRun",
        entityId: input.runId,
        summary: "Developer approved feedback automation",
      }),
  });
  if (!run) throw new ActionError("Automation run is not awaiting approval.", "VALIDATION");
  const dispatched = await dispatchApprovedRun(input.runId, tenantId);
  revalidatePath("/developer");
  return dispatched
    ? { ok: true as const }
    : {
        ok: false as const,
        message: "Automation was approved but GitHub dispatch did not start. Review the stored error before retrying.",
      };
}

export async function retryFeedbackAutomation(input: { tenantId: string; runId: string }) {
  const developer = await requireDeveloper();
  const tenantId = assertTenantId(input.tenantId);
  const run = await retryApprovedAutomationRun({
    tenantId,
    runId: input.runId,
    onRetried: (tx) =>
      writeAudit(tx, {
        actorUserId: developer.id,
        actorEmail: developer.email,
        tenantId,
        action: "UPDATE",
        entityType: "AutomationRun",
        entityId: input.runId,
        summary: "Developer retried feedback automation dispatch",
      }),
  });
  if (!run) {
    return {
      ok: false as const,
      message: "This run is not eligible for a safe dispatch retry. Reload and review its state.",
    };
  }
  const dispatched = await dispatchApprovedRun(input.runId, tenantId);
  revalidatePath("/developer");
  return dispatched
    ? { ok: true as const }
    : {
        ok: false as const,
        message: "GitHub dispatch still did not start. Review the updated error before retrying again.",
      };
}
