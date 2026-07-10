import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import { DEVELOPER_HOME_ORG_ID } from "./access";
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
        subject: "Reset your Cellarhand password",
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
        // (multi-org switcher UI is the deferred slice) — pick the user's earliest membership,
        // EXCEPT developers, who default into the Demo Winery sandbox (never a real tenant) when
        // they're a member of it. Keeps mirror with resolveActiveOrg's developer preference.
        before: async (session) => {
          const memberships = await prisma.member.findMany({
            where: { userId: session.userId },
            select: { organizationId: true },
            orderBy: { createdAt: "asc" },
          });
          if (memberships.length === 0) return; // no membership → no active org (denied downstream)
          const orgIds = memberships.map((m) => m.organizationId);
          const actor = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
          const activeOrganizationId =
            actor?.role === "developer" && orgIds.includes(DEVELOPER_HOME_ORG_ID) ? DEVELOPER_HOME_ORG_ID : orgIds[0];
          return { data: { ...session, activeOrganizationId } };
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
  plugins: [
    admin(),
    organization({
      organizationHooks: {
        // Phase 9.1 (Unit 1): when a new tenant/org is created, seed its starter material catalog so
        // the work-order picker resolves from day one. The org id IS the tenantId; seedStarterMaterials
        // wraps its own runAsTenant. Idempotent, so a retried creation is safe. Never block org creation
        // on a seed failure (mirror the session.after audit swallow) — the seed path/script backstops it.
        afterCreateOrganization: async ({ organization: org }) => {
          try {
            const { seedStarterMaterials } = await import("./onboarding/seed-starter-materials");
            await seedStarterMaterials(org.id);
          } catch (e) {
            console.error("afterCreateOrganization: starter-material seed failed (non-fatal)", e);
          }
        },
      },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
