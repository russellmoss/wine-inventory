import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SUPPORT_TENANT_COOKIE = "support_tenant";
export const SUPPORT_TENANT_TTL_MS = 30 * 60 * 1000;

export type SupportTenantContext = {
  tenantId: string;
  tenantName: string;
  developerUserId: string;
  expiresAt: string;
};

function secret(): string | null {
  return process.env.SUPPORT_TENANT_SECRET || process.env.BETTER_AUTH_SECRET || null;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string): string {
  const key = secret();
  if (!key) throw new Error("SUPPORT_TENANT_SECRET or BETTER_AUTH_SECRET is required.");
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createSupportTenantToken(input: {
  developerUserId: string;
  tenantId: string;
  tenantName: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const payload = b64url(
    JSON.stringify({
      sub: input.developerUserId,
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      exp: now.getTime() + SUPPORT_TENANT_TTL_MS,
    }),
  );
  return `${payload}.${sign(payload)}`;
}

export function verifySupportTenantToken(token: string, developerUserId: string): SupportTenantContext | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  if (!safeEqual(sig, expected)) return null;
  let data: unknown;
  try {
    data = JSON.parse(fromB64url(payload));
  } catch {
    return null;
  }
  const rec = data as { sub?: unknown; tenantId?: unknown; tenantName?: unknown; exp?: unknown };
  if (rec.sub !== developerUserId) return null;
  if (typeof rec.tenantId !== "string" || !rec.tenantId) return null;
  if (typeof rec.tenantName !== "string" || !rec.tenantName) return null;
  if (typeof rec.exp !== "number" || rec.exp <= Date.now()) return null;
  return {
    tenantId: rec.tenantId,
    tenantName: rec.tenantName,
    developerUserId,
    expiresAt: new Date(rec.exp).toISOString(),
  };
}

export async function readSupportTenantContext(user: {
  id: string;
  role: string | null;
}): Promise<SupportTenantContext | null> {
  if (user.role !== "developer") return null;
  try {
    const token = (await cookies()).get(SUPPORT_TENANT_COOKIE)?.value;
    return token ? verifySupportTenantToken(token, user.id) : null;
  } catch {
    return null;
  }
}
