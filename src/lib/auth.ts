import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./password";

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
  // nextCookies() MUST be last so Set-Cookie is handled in server actions.
  plugins: [admin(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
