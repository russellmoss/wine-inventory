"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { adminAction, ActionError } from "@/lib/actions";
import {
  canAssignRole,
  canManageDeveloperTarget,
  canChangeOwnRole,
  isAssignableRole,
  type AssignableRole,
} from "@/lib/access";
import { ensureDeveloperHomeMembership } from "@/lib/users/ensure-developer-membership";
import { hashPassword } from "@/lib/password";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { sendEmail, welcomeEmailHtml, passwordResetByAdminEmailHtml } from "@/lib/email";

const PATH = "/users";

// Best-effort: never let an email failure roll back account creation. The admin
// still sees the temp password in the UI as a fallback. Returns whether it sent.
async function trySend(to: string, subject: string, html: string): Promise<boolean> {
  try {
    await sendEmail({ to, subject, html });
    return true;
  } catch {
    return false;
  }
}

function tempPassword(): string {
  return "Bwc-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function cleanEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ActionError("Enter a valid email address.");
  return email;
}

function cleanRole(raw: unknown): AssignableRole {
  const role = String(raw ?? "user");
  if (!isAssignableRole(role)) throw new ActionError("Role must be user, admin, or developer.");
  return role;
}

/** Create a user with a generated temporary password. Returns it ONCE for the admin. */
export const createUser = adminAction(async ({ actor, user: me }, formData: FormData): Promise<{ email: string; tempPassword: string; emailed: boolean }> => {
  const email = cleanEmail(formData.get("email"));
  const name = String(formData.get("name") ?? "").trim() || email.split("@")[0];
  const role = cleanRole(formData.get("role"));
  // Only an existing developer may mint a developer (adminAction lets any admin in here).
  if (!canAssignRole(me, role)) throw new ActionError("Only a developer can create a developer user.", "FORBIDDEN");
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new ActionError("A user with that email already exists.", "CONFLICT");
  }
  const temp = tempPassword();
  const hash = await hashPassword(temp);
  const now = new Date();

  await runInTenantTx(async (tx) => {
    const user = await tx.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        name,
        emailVerified: true,
        role,
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    await tx.account.create({
      data: { id: crypto.randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: hash, createdAt: now, updatedAt: now },
    });
    // A developer must be a member of the Demo Winery home org to have a working session.
    if (role === "developer") await ensureDeveloperHomeMembership(tx, user.id);
    await writeAudit(tx, {
      ...actor,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      changes: diff(null, { email, name, role }),
      summary: summarize("USER_CREATED", "User", { label: email }),
    });
  });
  const emailed = await trySend(email, "Welcome to Cellarhand", welcomeEmailHtml({ name, email, tempPassword: temp }));
  revalidatePath(PATH);
  return { email, tempPassword: temp, emailed };
});

/** Reset a user's password to a fresh temporary one (forces change on next login). */
export const resetUserPassword = adminAction(async ({ actor }, userId: string): Promise<{ email: string; tempPassword: string; emailed: boolean }> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ActionError("User not found.");
  const temp = tempPassword();
  const hash = await hashPassword(temp);

  await runInTenantTx(async (tx) => {
    const account = await tx.account.findFirst({ where: { userId, providerId: "credential" } });
    if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash, updatedAt: new Date() } });
    else await tx.account.create({ data: { id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: hash, createdAt: new Date(), updatedAt: new Date() } });
    await tx.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId } }); // revoke active sessions
    await writeAudit(tx, { ...actor, action: "PASSWORD_RESET", entityType: "User", entityId: userId, summary: summarize("PASSWORD_RESET", "User", { label: user.email }) });
  });
  const emailed = await trySend(user.email, "Your Cellarhand password was reset", passwordResetByAdminEmailHtml({ name: user.name, email: user.email, tempPassword: temp }));
  revalidatePath(PATH);
  return { email: user.email, tempPassword: temp, emailed };
});

export const setUserRole = adminAction(async ({ actor, user: me }, userId: string, role: AssignableRole) => {
  const r = cleanRole(role);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ActionError("User not found.");
  // Only a developer may grant the developer role, or touch an account that already IS a developer.
  if (!canAssignRole(me, r)) throw new ActionError("Only a developer can assign the developer role.", "FORBIDDEN");
  if (!canManageDeveloperTarget(me, user.role)) throw new ActionError("Only a developer can change a developer's role.", "FORBIDDEN");
  // No self-downgrade — a developer/admin can't strip their own privilege (last-developer lockout).
  if (!canChangeOwnRole(me.role, r, userId === me.id)) throw new ActionError("You can't lower your own role.");
  await runInTenantTx(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: r } });
    if (r === "developer") await ensureDeveloperHomeMembership(tx, userId);
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "User", entityId: userId, changes: diff({ role: user.role }, { role: r }), summary: summarize("UPDATE", "User", { label: user.email, changes: diff({ role: user.role }, { role: r }) }) });
  });
  revalidatePath(PATH);
});

/** Replace a manager's vineyard MEMBERSHIP set (D9). Passing [] clears all memberships. */
export const setUserVineyards = adminAction(async ({ actor }, userId: string, vineyardIds: string[]) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, vineyardMemberships: { select: { vineyardId: true } } },
  });
  if (!user) throw new ActionError("User not found.");

  // De-dupe + validate every requested vineyard exists.
  const want = Array.from(new Set(vineyardIds));
  if (want.length > 0) {
    const found = await prisma.vineyard.count({ where: { id: { in: want } } });
    if (found !== want.length) throw new ActionError("One or more vineyards not found.");
  }
  const before = user.vineyardMemberships.map((m) => m.vineyardId).sort();
  const after = [...want].sort();

  await runInTenantTx(async (tx) => {
    await tx.userVineyard.deleteMany({ where: { userId } });
    if (want.length > 0) {
      await tx.userVineyard.createMany({
        data: want.map((vineyardId) => ({ userId, vineyardId })),
        skipDuplicates: true,
      });
    }
    await writeAudit(tx, {
      ...actor,
      action: "USER_VINEYARD_ASSIGNED",
      entityType: "User",
      entityId: userId,
      changes: diff({ vineyardIds: before }, { vineyardIds: after }),
      summary:
        after.length > 0
          ? `Set user "${user.email}" vineyards to ${after.length} vineyard(s)`
          : `Cleared all vineyard memberships for user "${user.email}"`,
    });
  });
  revalidatePath(PATH);
});

/**
 * plan-027 Unit 6 — opt a user in/out of TTB filing-deadline reminder emails. Admin-managed (who on
 * the team should get the 1-week / 2-day / day-of nudges). findFirst-then-write avoids naming the
 * composite [tenantId,userId] unique (tenantId is auto-injected on create by the tenant extension).
 */
export const setComplianceReminderPref = adminAction(async ({ actor }, userId: string, enabled: boolean) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) throw new ActionError("User not found.");
  await runInTenantTx(async (tx) => {
    const existing = await tx.complianceReminderPreference.findFirst({ where: { userId }, select: { id: true, remindersEnabled: true } });
    if (existing) {
      if (existing.remindersEnabled === enabled) return; // no-op, no audit noise
      await tx.complianceReminderPreference.update({ where: { id: existing.id }, data: { remindersEnabled: enabled } });
    } else {
      await tx.complianceReminderPreference.create({ data: { userId, remindersEnabled: enabled } });
    }
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "User",
      entityId: userId,
      changes: diff({ reminderEmails: existing?.remindersEnabled ?? false }, { reminderEmails: enabled }),
      summary: `${enabled ? "Enabled" : "Disabled"} filing-deadline reminder emails for "${user.email}"`,
    });
  });
  revalidatePath(PATH);
});

/** Soft-delete: ban (or reinstate) a user. Banning revokes their sessions. */
export const setUserBanned = adminAction(async ({ actor, user: me }, userId: string, banned: boolean) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ActionError("User not found.");
  if (userId === me.id && banned) throw new ActionError("You can't deactivate your own account.");
  if (!canManageDeveloperTarget(me, user.role)) throw new ActionError("Only a developer can deactivate a developer account.", "FORBIDDEN");
  await runInTenantTx(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { banned, banReason: banned ? "Deactivated by admin" : null } });
    if (banned) await tx.session.deleteMany({ where: { userId } });
    await writeAudit(tx, {
      ...actor,
      action: banned ? "USER_DELETED" : "UPDATE",
      entityType: "User",
      entityId: userId,
      changes: diff({ banned: user.banned }, { banned }),
      summary: banned ? `Deactivated user "${user.email}"` : `Reactivated user "${user.email}"`,
    });
  });
  revalidatePath(PATH);
});
