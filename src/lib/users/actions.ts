"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { adminAction, ActionError } from "@/lib/actions";
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

function cleanRole(raw: unknown): "admin" | "user" {
  const role = String(raw ?? "user");
  if (role !== "admin" && role !== "user") throw new ActionError("Role must be admin or user.");
  return role;
}

/** Create a user with a generated temporary password. Returns it ONCE for the admin. */
export const createUser = adminAction(async ({ actor }, formData: FormData): Promise<{ email: string; tempPassword: string; emailed: boolean }> => {
  const email = cleanEmail(formData.get("email"));
  const name = String(formData.get("name") ?? "").trim() || email.split("@")[0];
  const role = cleanRole(formData.get("role"));
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new ActionError("A user with that email already exists.", "CONFLICT");
  }
  const temp = tempPassword();
  const hash = await hashPassword(temp);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
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
    await writeAudit(tx, {
      ...actor,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      changes: diff(null, { email, name, role }),
      summary: summarize("USER_CREATED", "User", { label: email }),
    });
  });
  const emailed = await trySend(email, "Welcome to BWC Operating System", welcomeEmailHtml({ name, email, tempPassword: temp }));
  revalidatePath(PATH);
  return { email, tempPassword: temp, emailed };
});

/** Reset a user's password to a fresh temporary one (forces change on next login). */
export const resetUserPassword = adminAction(async ({ actor }, userId: string): Promise<{ email: string; tempPassword: string; emailed: boolean }> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ActionError("User not found.");
  const temp = tempPassword();
  const hash = await hashPassword(temp);

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findFirst({ where: { userId, providerId: "credential" } });
    if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash, updatedAt: new Date() } });
    else await tx.account.create({ data: { id: crypto.randomUUID(), accountId: userId, providerId: "credential", userId, password: hash, createdAt: new Date(), updatedAt: new Date() } });
    await tx.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId } }); // revoke active sessions
    await writeAudit(tx, { ...actor, action: "PASSWORD_RESET", entityType: "User", entityId: userId, summary: summarize("PASSWORD_RESET", "User", { label: user.email }) });
  });
  const emailed = await trySend(user.email, "Your BWC Operating System password was reset", passwordResetByAdminEmailHtml({ name: user.name, email: user.email, tempPassword: temp }));
  revalidatePath(PATH);
  return { email: user.email, tempPassword: temp, emailed };
});

export const setUserRole = adminAction(async ({ actor, user: me }, userId: string, role: "admin" | "user") => {
  const r = cleanRole(role);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ActionError("User not found.");
  if (userId === me.id && r !== "admin") throw new ActionError("You can't remove your own admin role.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: r } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "User", entityId: userId, changes: diff({ role: user.role }, { role: r }), summary: summarize("UPDATE", "User", { label: user.email, changes: diff({ role: user.role }, { role: r }) }) });
  });
  revalidatePath(PATH);
});

/** Soft-delete: ban (or reinstate) a user. Banning revokes their sessions. */
export const setUserBanned = adminAction(async ({ actor, user: me }, userId: string, banned: boolean) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ActionError("User not found.");
  if (userId === me.id && banned) throw new ActionError("You can't deactivate your own account.");
  await prisma.$transaction(async (tx) => {
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
