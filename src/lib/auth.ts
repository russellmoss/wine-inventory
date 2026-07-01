import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./password";
import { sendEmail, resetPasswordEmailHtml } from "./email";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // No self-service signup: admins create users (Milestone E).
    disableSignUp: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    // Self-service reset: emails a one-hour link. `url` is built from BETTER_AUTH_URL.
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your BWC Operating System password",
        html: resetPasswordEmailHtml(user.name, url),
      });
    },
  },
  user: {
    additionalFields: {
      // Set true when an admin creates a user or resets a password.
      // Authoritatively gated in the DAL + every server action (Unit 5/13).
      mustChangePassword: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
      passwordChangedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  session: {
    // DB sessions: each login is a session row (login ledger) and is revocable.
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  databaseHooks: {
    session: {
      create: {
        // Multi-tenancy (K2/K13): stamp the active organization onto the session at login so
        // the tenant is resolvable from the verified session. One active org per session for now
        // (multi-org switcher UI is the deferred slice) — pick the user's earliest membership.
        before: async (session) => {
          const membership = await prisma.member.findFirst({
            where: { userId: session.userId },
            select: { organizationId: true },
            orderBy: { createdAt: "asc" },
          });
          if (!membership) return; // no membership → no active org (denied downstream)
          return { data: { ...session, activeOrganizationId: membership.organizationId } };
        },
        after: async (session) => {
          // Login event ledger. Never block login on an audit failure.
          try {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { email: true },
            });
            await prisma.auditLog.create({
              data: {
                actorUserId: session.userId,
                actorEmail: user?.email ?? "unknown",
                action: "LOGIN",
                entityType: "Session",
                entityId: session.id,
                summary: "Signed in",
                ipAddress: session.ipAddress ?? null,
                userAgent: session.userAgent ?? null,
              },
            });
          } catch {
            // swallow
          }
        },
      },
    },
  },
  // admin() = admin/user roles + createUser/setRole/setPassword/ban/remove.
  // organization() = tenant model (K2): organization/member/invitation tables + active-org in
  // session. We adopt the tables now; the end-user org flows (signup/invites/switcher UI) are the
  // deferred Phase 12 second slice. nextCookies() MUST be last so Set-Cookie is handled in actions.
  plugins: [admin(), organization(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
