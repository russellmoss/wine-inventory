import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "crypto";

// A write tool returns a signed, short-TTL proposal token instead of mutating.
// The token is integrity-protected (HMAC over the payload) and single-use (the
// nonce is burned in the DB on confirm — see commit.ts). TTL bounds replay; the
// nonce guarantees exactly-once.

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export type ProposalPayload = {
  tool: string;
  args: Record<string, unknown>;
  exp: number; // epoch ms
  nonce: string;
};

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set; cannot sign assistant confirmations.");
  return s;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Build a signed proposal token for a pending write. Does NOT mutate anything. */
export function signProposal(
  tool: string,
  args: Record<string, unknown>,
  ttlMs: number = TTL_MS,
): string {
  const payload: ProposalPayload = { tool, args, exp: Date.now() + ttlMs, nonce: randomUUID() };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Verify signature + expiry and return the payload. Throws on any problem. */
export function verifyProposal(token: string): ProposalPayload {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) throw new Error("Malformed confirmation token.");
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid confirmation token.");
  }

  let payload: ProposalPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ProposalPayload;
  } catch {
    throw new Error("Corrupt confirmation token.");
  }

  if (
    typeof payload.tool !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.args !== "object" ||
    payload.args === null
  ) {
    throw new Error("Corrupt confirmation token.");
  }
  if (Date.now() > payload.exp) {
    throw new Error("This confirmation has expired. Please ask again.");
  }
  return payload;
}
