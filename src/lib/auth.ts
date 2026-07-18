import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import { DEVELOPER_HOME_ORG_ID, clearsPasswordChangeGate } from "./access";
import { hashPassword, verifyPassword } from "./password";
import { sendEmail, resetPasswordEmailHtml } from "./email";

/**
 * Google "Sign in with Google" (login only — non-sensitive email/profile scopes, no Gmail access).
 * Env-gated like the other optional integrations: unset creds → we register NO provider, so the
 * feature is simply off (the login page hides its button behind NEXT_PUBLIC_GOOGLE_AUTH_ENABLED).
 *
 * `disableSignUp: true` is the load-bearing choice — Google login NEVER creates a user. It only
 * links to an EXISTING account (see `account.accountLinking` below), so a Google sign-in whose email
 * doesn't match an admin-created user is refused. This mirrors `emailAndPassword.disableSignUp` and
 * keeps the "admins provision users" model intact: a linked user already has its org membership, so
 * it never lands in the fail-closed tenant layer with no tenant.
 */
function googleSocialProviders() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return {};
  return { google: { clientId, clientSecret, disableSignUp: true } };
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: googleSocialProviders(),
  account: {
    // Link a Google identity to the EXISTING user with the same email. We keep google OUT of
    // `trustedProviders` on purpose: trusting the provider would SUPPRESS Better Auth's check on the
    // INCOMING Google email (link-account.mjs), letting a Google-asserted-UNVERIFIED email link. Left
    // untrusted, linking still requires Google to assert the incoming email is verified (real Gmail
    // always is). `requireLocalEmailVerified: false` is a deliberate robustness margin: today
    // admin-created users are already emailVerified:true (users/actions.ts, seed.ts), so it's
    // belt-and-braces, but it also lets any legacy/edge user whose LOCAL flag is false still adopt
    // Google. `allowDifferentEmails` stays default (false): the Google email must equal the account email.
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: false,
    },
  },
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
    account: {
      create: {
        // When a Google account links to a user: (1) clear the change-password gate — an SSO user has
        // no password to change and would otherwise be stranded on /change-password (accessDecision's
        // `mustChangePassword` branch); (2) if they were STILL on the admin-issued temp password
        // (mustChangePassword was true), retire it by nulling the `credential` account's password, so
        // an emailed temp can't linger forever as an alternate credential. A user who was already on
        // their own chosen password (gate already cleared) keeps it. User/Account are global/RLS-exempt
        // tables, so no tenant context is needed. Never block login on this — mirror the session.after
        // audit swallow.
        after: async (account) => {
          if (!clearsPasswordChangeGate(account.providerId)) return;
          try {
            const user = await prisma.user.findUnique({
              where: { id: account.userId },
              select: { mustChangePassword: true },
            });
            await prisma.user.update({
              where: { id: account.userId },
              data: { mustChangePassword: false, passwordChangedAt: new Date() },
            });
            // Only retire a still-unchanged admin temp password — never a password the user chose.
            if (user?.mustChangePassword) {
              await prisma.account.updateMany({
                where: { userId: account.userId, providerId: "credential" },
                data: { password: null },
              });
            }
          } catch {
            // swallow — the gate is a convenience, not a security boundary
          }
        },
      },
    },
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
