"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/dal";
import { writeAudit, summarize } from "@/lib/audit";

export type ChangePasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireSession();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirm) {
    return { error: "New password and confirmation do not match." };
  }
  if (newPassword === currentPassword) {
    return { error: "New password must be different from the current one." };
  }

  try {
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch {
    return { error: "Current password is incorrect." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await writeAudit(tx, {
      actorUserId: user.id,
      actorEmail: user.email,
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: user.id,
      summary: summarize("PASSWORD_CHANGE", "User"),
    });
  });

  return { ok: true };
}
