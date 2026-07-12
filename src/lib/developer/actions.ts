"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  FeedbackAutomationMode,
  FeedbackItemStatus,
  FeedbackSeverity,
  FeedbackTriageClass,
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
import { approveAutomationRun, dispatchApprovedRun } from "@/lib/feedback/automation";

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

export async function updateFeedbackItem(input: {
  tenantId: string;
  sourceType: "ASSISTANT_FEEDBACK" | "FEEDBACK_TICKET";
  id: string;
  severity?: "P0" | "P1" | "P2" | "";
  triageClass?: string; // "" clears to untriaged; a valid enum value sets the disposition
  status?: string;
  developerNotes?: string;
}) {
  const developer = await requireDeveloper();
  const tenantId = assertTenantId(input.tenantId);
  const severity = input.severity ? (input.severity as FeedbackSeverity) : null;
  const triageClass =
    input.triageClass && input.triageClass in FeedbackTriageClass
      ? (input.triageClass as FeedbackTriageClass)
      : null;
  const notes = typeof input.developerNotes === "string" ? input.developerNotes.slice(0, 5000) : undefined;

  await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      if (input.sourceType === "ASSISTANT_FEEDBACK") {
        await tx.assistantFeedback.update({
          where: { id: input.id },
          data: {
            severity,
            triageClass,
            developerNotes: notes,
            status: input.status && input.status !== "IN_PROGRESS" ? input.status : undefined,
            resolvedAt: input.status === "RESOLVED" ? new Date() : undefined,
            resolvedByUserId: input.status === "RESOLVED" ? developer.id : undefined,
          },
        });
      } else {
        const status = input.status ? (input.status as FeedbackItemStatus) : undefined;
        await tx.feedbackTicket.update({
          where: { id: input.id },
          data: {
            severity,
            triageClass,
            developerNotes: notes,
            status,
            resolvedAt: status === FeedbackItemStatus.RESOLVED ? new Date() : undefined,
            resolvedByUserId: status === FeedbackItemStatus.RESOLVED ? developer.id : undefined,
          },
        });
      }
      await writeAudit(tx, {
        actorUserId: developer.id,
        actorEmail: developer.email,
        tenantId,
        action: "UPDATE",
        entityType: input.sourceType,
        entityId: input.id,
        summary: "Developer updated feedback item",
      });
    }),
  );
  revalidatePath("/developer");
}

export async function approveFeedbackAutomation(input: { tenantId: string; runId: string }) {
  const developer = await requireDeveloper();
  const tenantId = assertTenantId(input.tenantId);
  const run = await approveAutomationRun({ tenantId, runId: input.runId, approverUserId: developer.id });
  if (!run) throw new ActionError("Automation run is not awaiting approval.", "VALIDATION");
  await runAsTenant(tenantId, () =>
    runInTenantTx((tx) =>
      writeAudit(tx, {
        actorUserId: developer.id,
        actorEmail: developer.email,
        tenantId,
        action: "UPDATE",
        entityType: "AutomationRun",
        entityId: input.runId,
        summary: "Developer approved feedback automation",
      }),
    ),
  );
  await dispatchApprovedRun(input.runId, tenantId);
  revalidatePath("/developer");
}
